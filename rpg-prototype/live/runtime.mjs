import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {codex,jev} from './providers.mjs';
import {BASE_PACK,CANON,ACTIONS,STAGES,shapeSchema,validateShape,preparationPrompt} from './world.mjs';
import {createState,publicState,actionFor,jevRequest,adjudicate,applyResult,ensure,luckResult} from './engine.mjs';
import {ITEMS,timeLabel} from '../game.mjs';
import {databaseLock} from './database-lock.mjs';
import {BudgetLedger} from './budget.mjs';
import {authorAudit} from './authoring.mjs';
const defaultPath=fileURLToPath(new URL('../../runs/rpg-live/state.sqlite',import.meta.url));
const json=JSON.stringify;
const digest=value=>createHash('sha256').update(json(value)).digest('hex');
const draftDependencies=s=>digest({character:s.character,inventory:s.inventory,flags:s.flags,clues:s.clues});
export class Runtime {
 constructor(options={}){
  const filename=options.path||defaultPath;mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
  this.releaseLock=databaseLock(filename);
  try{
  this.db=new DatabaseSync(filename);
  this.codex=options.codex||codex;this.jev=options.jev||jev;this.fortune=options.fortune||(()=>randomInt(10000));
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,state TEXT NOT NULL,pack TEXT NOT NULL,created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,session_id TEXT,kind TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS events(session_id TEXT NOT NULL,revision INTEGER NOT NULL,request_id TEXT UNIQUE NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(session_id,revision));
   CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY,kind TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,record TEXT NOT NULL);`);
  this.budget=new BudgetLedger(this.db);
  for(const key of ['job','director']){const task=this.get(key);if(task?.status==='running'){task.status='error';task.error='服务曾中断，未自动重试。';task.message=task.error;this.set(key,task);if(key==='job')this.saveAttempt(task);}}
  }catch(error){try{this.db?.close();}finally{this.releaseLock();}throw error;}
 }
 get(key){const r=this.db.prepare('SELECT value FROM kv WHERE key=?').get(key);return r?JSON.parse(r.value):null;}
 set(key,value){this.db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,json(value));}
 current(){const id=this.get('current');if(!id)return null;const r=this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);return r?{id,state:JSON.parse(r.state),pack:JSON.parse(r.pack)}:null;}
 saveSession(s,pack){this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,pack=excluded.pack').run(s.sessionId,json(s),json(pack),new Date().toISOString());}
 saveAttempt(job){this.db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload').run(job.id,job.sessionId||null,job.kind,job.status,json(job));}
 setJob(job){this.saveAttempt(job);this.set('job',job);}
 snapshot(){const current=this.current(),job=this.get('job'),director=this.get('director'),repair=this.get('repair_candidate');return {sessionId:current?.id||null,state:current?publicState(current.state,current.pack):null,job:job?{id:job.id,kind:job.kind,status:job.status,phase:job.phase,error:job.error||null,hasRepairDraft:repair?.sourceJobId===job.id}:null,director:director?{status:director.status,effort:director.effort,message:director.message,error:director.error||null}:null,usage:{codex:this.db.prepare("SELECT count(*) n FROM calls WHERE kind='codex'").get().n,jev:this.db.prepare("SELECT count(*) n FROM calls WHERE kind='jev'").get().n},budget:this.budget.snapshot(),cachedWorld:!!this.get('prepared')};}
 ensureIdle(){ensure(this.get('job')?.status!=='running','当前回合仍在处理中。');}
 match(sessionId,revision){const c=this.current();ensure(c&&c.id===sessionId,'这份旅程已切换，请刷新。');if(revision!==undefined)ensure(c.state.revision===revision,'这是旧回合，请刷新后重新选择。');return c;}
 async logged(kind,payload,fn,scope={}){
  const {onReserved,...allocation}=scope;
  const {id,budget}=this.budget.reserve({kind,payload,...allocation}),started=Date.now();
  try{onReserved?.();const result=await fn();this.db.prepare('UPDATE calls SET status=?,record=? WHERE id=?').run('done',json({request:payload,...result,budget}),id);return result;}
  catch(error){this.db.prepare('UPDATE calls SET status=?,record=? WHERE id=?').run('error',json({request:payload,ms:Date.now()-started,error:error.message,budget}),id);throw error;}
 }
 begin(job,fn){this.setJob(job);this.mainTask=(async()=>{try{await fn(job);}catch(error){job.status='error';job.error=error.message;this.setJob(job);}})();return this.snapshot();}
 start({luck=75,requestId=randomUUID()}={}){
  this.ensureIdle();ensure(Number.isInteger(luck)&&luck>=0&&luck<=100,'幸运应为 0 到 100 的整数。');
  const old=this.db.prepare('SELECT * FROM attempts WHERE id=?').get(requestId);if(old)return this.snapshot();
  const previous=this.get('job'),newJourney=this.current()&&!(previous?.kind==='prepare'&&previous.status!=='done');
  const budgetId=newJourney?this.budget.newGame():this.budget.activeId();
  return this.begin({id:requestId,kind:'prepare',status:'running',phase:'正在准备整段旅程',luck,budgetId},j=>this.prepare(j));
 }
 async prepare(job){
  let pack=this.get('prepared');
  if(!pack){
   if(!job.packet){const response=await this.logged('codex',{kind:'prepare',effort:'high'},()=>this.codex({kind:'prepare',prompt:preparationPrompt(),schema:shapeSchema(BASE_PACK),effort:'high'}),{budgetId:job.budgetId,bucket:'opening'});job.packet=response.result;validateShape(job.packet);this.setJob(job);}
   validateShape(job.packet);
   job.phase='Astra 正在审查剧本与所有分支';this.setJob(job);
   const audit=authorAudit(job.packet);
   if(job.authorReview?.signature!==audit.signature){
    const response=await this.logged('codex',{kind:'author_review',scope:'opening',effort:'high',signature:audit.signature},()=>this.codex({kind:'author_review',prompt:audit.prompt,schema:audit.schema,reviewContext:audit.evidence,effort:'high'}),{budgetId:job.budgetId,bucket:'opening'});
    // Cache received evidence before validation. Retrying the same rejected manuscript is not a reroll.
    job.authorReview={signature:audit.signature,...response};this.setJob(job);
   }
   audit.validate(job.authorReview.result);
   pack=job.packet;this.set('prepared',pack);
  }
  const s=createState(randomUUID(),job.luck);s.budgetId=job.budgetId;this.saveSession(s,pack);this.set('current',s.sessionId);this.set('director',null);this.set('draft',null);this.set('mainline_need',null);this.set('mainline_proposal',null);
  job.sessionId=s.sessionId;job.status='done';job.phase='整段旅程已备好';this.setJob(job);
 }
 choose(command){
  const {sessionId,revision,choiceId,requestId}=command;
  ensure(typeof requestId==='string'&&requestId.length>0&&requestId.length<=100,'缺少有效操作编号。');
  const old=this.db.prepare('SELECT payload FROM attempts WHERE id=?').get(requestId);
  if(old){const previous=JSON.parse(old.payload);ensure(previous.sessionId===sessionId&&previous.revision===revision&&previous.choiceId===choiceId,'操作编号已用于其他行动。');return this.snapshot();}
  this.ensureIdle();ensure(this.get('job')?.status!=='error','上一回合未完成，请重试或开启新旅程。');
  const c=this.match(sessionId,revision);actionFor(c.state,choiceId);
  const job={id:requestId,kind:'action',status:'running',phase:'Jev 正在裁定',sessionId,revision,choiceId,fortune:this.fortune(),budgetId:c.state.budgetId||this.budget.activeId()};
  return this.begin(job,j=>this.settle(j));
 }
 async settle(job){
  const c=this.match(job.sessionId,job.revision),a=actionFor(c.state,job.choiceId);
  if(!job.decision){
   const request=jevRequest(c.state,a,c.pack);
   const signature=json(request);
   if(job.response?.signature!==signature){const response=await this.logged('jev',request,()=>this.jev(request),{budgetId:job.budgetId,bucket:job.dispatched?'recovery':'action',onReserved:()=>{job.dispatched=(job.dispatched||0)+1;this.setJob(job);}});job.response={signature,...response};this.setJob(job);}
   const response=job.response;
   job.decision=adjudicate(c.state,a,c.pack,response.result,job.fortune,response.ms);this.setJob(job);
  }
  this.match(job.sessionId,job.revision);const next=applyResult(c.state,a,job.decision,c.pack),draft=this.get('draft');
  this.db.exec('BEGIN IMMEDIATE');try{
   if(draft?.sessionId===c.id){
    const applicable=draft.review?.version==='astra-author-audit-v1'&&draft.sourceRevision===c.state.revision&&next.scene===draft.target&&!c.state.visited.includes(draft.target)&&draftDependencies(next)===draft.dependencies&&digest(c.pack.scenes[draft.target])===draft.originalDigest;
    if(applicable)c.pack.scenes[draft.target]={...c.pack.scenes[draft.target],...draft.content};
    // A prepared draft is consumed or discarded at its first eligible transition, never kept stale.
    this.set('draft',null);const director=this.get('director');
    if(director?.id===draft.id){director.status=applicable?'done':'discarded';director.message=applicable?'Astra 已审核的后续场景已发布。':'后续条件已变化，保留原先备好的场景。';this.set('director',director);}
   }
   this.saveSession(next,c.pack);this.db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(c.id,next.revision,job.id,json({action:job.choiceId,fortune:job.fortune,decision:job.decision,changes:next.changes,impact:next.lastImpact}));
   job.status='done';job.phase='已保存';job.error=null;this.setJob(job);this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  if(job.decision.replan?.requested&&next.scene!=='ending')this.planMainline({sessionId:c.id,revision:next.revision,need:job.decision.replan});
 }
 retry({sessionId}={}){
  this.ensureIdle();const job=this.get('job');ensure(job?.status==='error','当前没有需要重试的回合。');
  job.budgetId??=this.budget.activeId();job.retries=(job.retries||0)+1;
  if(job.kind==='action')this.match(sessionId,job.revision);
  const repair=this.get('repair_candidate');
  if(job.kind==='prepare'&&repair?.sourceJobId===job.id){validateShape(repair.pack);job.packet=repair.pack;job.repairCreatedAt=repair.createdAt;}
  job.status='running';job.error=null;job.phase=job.kind==='prepare'?'正在准备整段旅程':'Jev 正在重试原回合';return this.begin(job,j=>job.kind==='prepare'?this.prepare(j):this.settle(j));
 }
 director({sessionId,revision,effort='medium'}){
  const c=this.match(sessionId,revision);ensure(['low','medium','high'].includes(effort),'导演档位不合法。');
  if(this.get('director')?.status==='running')return this.snapshot();
  const target=STAGES.slice(STAGES.indexOf(c.state.scene)+1).find(id=>id!=='ending'&&!c.state.visited.includes(id));
  if(!target)return this.snapshot();
  const dependencies=draftDependencies(c.state),sourceRevision=c.state.revision,originalDigest=digest(c.pack.scenes[target]);
  const history={character:c.state.character,inventory:c.state.inventory,flags:c.state.flags,clues:c.state.clues,history:c.state.journal.map(e=>({action:e.title,result:e.outcome}))};
  const template={title:c.pack.scenes[target].title,paragraphs:c.pack.scenes[target].paragraphs};
  const job={id:randomUUID(),sessionId,effort,target,sourceRevision,budgetId:c.state.budgetId||this.budget.activeId(),status:'running',message:'导演正在整理后续，当前故事可以继续'};this.set('director',job);
  const isFresh=()=>{const fresh=this.current();return fresh?.id===sessionId&&fresh.state.revision===sourceRevision&&!fresh.state.visited.includes(target)&&draftDependencies(fresh.state)===dependencies&&digest(fresh.pack.scenes[target])===originalDigest;};
  const discard=()=>{job.status='discarded';job.message='后续已发生变化，未覆盖已展示的故事。';};
  this.directorTask=(async()=>{try{
   const prompt=`你是中文奇幻故事导演。只返回 JSON，不用工具。改写一个尚未展示的未来场景，保留其所有物理事实、人物知识、可用选项和功能，不改变任何规则或承诺。每段40–90字。根据已发生事实做必要的呼应，但不要假设玩家在抵达之前将会选择什么；通用场景不能预支未知选择。\n世界：${json(CANON)}\n已发生：${json(history)}\n目标场景：${target}\n原文：${json(template)}\n该场景固定选项：${json(c.pack.scenes[target].choices)}`;
   const response=await this.logged('codex',{kind:'director',effort,target,sourceRevision},()=>this.codex({kind:'director',prompt,schema:shapeSchema(template),effort}),{budgetId:job.budgetId,bucket:`director_${effort}`});validateShape(response.result,template);
   if(!isFresh())discard();
   else{
    const audit=authorAudit(c.pack,{draft:{target,original:c.pack.scenes[target],replacement:response.result,choices:c.pack.scenes[target].choices},history});
    job.message='Astra 正在审查后续草稿，当前故事可以继续';if(this.get('director')?.id===job.id)this.set('director',job);
    const review=await this.logged('codex',{kind:'author_review',scope:'future',effort,target,sourceRevision,signature:audit.signature},()=>this.codex({kind:'author_review',prompt:audit.prompt,schema:audit.schema,reviewContext:audit.evidence,effort}),{budgetId:job.budgetId,bucket:`director_${effort}`});audit.validate(review.result);
    if(!isFresh())discard();
    else{this.set('draft',{id:job.id,sessionId,target,sourceRevision,dependencies,originalDigest,content:response.result,review:{version:'astra-author-audit-v1',signature:audit.signature,result:review.result}});job.status='done';job.message='Astra 已审好后续草稿，抵达时按条件发布。';}
   }
  }catch(e){job.status='error';job.error=e.message;job.message='导演暂未完成，已备好的故事仍可继续。';}
  if(this.get('director')?.id===job.id)this.set('director',job);
  this.drainMainline();
  })();return this.snapshot();
 }
 planMainline({sessionId,revision,need}){
  const c=this.match(sessionId,revision);
  // A prose rewrite cannot repair missing graph conditions. Keep a separate, unapplied proposal.
  this.set('mainline_need',{...need,sessionId,revision,status:'queued'});
  if(this.get('director')?.status==='running')return;
  this.set('mainline_need',{...need,sessionId,revision,status:'running'});
  const template={summary:'',requiredChanges:[''],preservedFacts:[''],returnStage:''};
  const job={id:randomUUID(),sessionId,effort:'high',sourceRevision:revision,status:'running',message:'Astra 正在规划未来主线，当前结果已保存'};this.set('director',job);
  this.directorTask=(async()=>{try{
   const prompt=`你是主导演 Astra。根据明确的路线覆盖缺口提出未来主线调整方案。只返回 JSON，不使用工具。不改世界大框架，不改写已发生事件，不撤销当前结果；优先恢复缺失的必要条件，并说明回到现有阶段的方式。requiredChanges 为最多四项需要编排的后续变化，preservedFacts 为最多四项必须保留的事实，returnStage 必须是剩余阶段之一。本次只产出建议，程序不会执行新节点或数值变化。\n世界：${json(CANON)}\n既定主线：${json(c.pack)}\n当前事实：${json(c.state)}\n需求：${json(need)}\n剩余阶段：${json(STAGES.slice(STAGES.indexOf(c.state.scene)))}`;
   const response=await this.logged('codex',{kind:'mainline_plan',effort:'high',sourceRevision:revision,need},()=>this.codex({kind:'mainline_plan',prompt,schema:shapeSchema(template),effort:'high'}),{budgetId:c.state.budgetId||this.budget.activeId(),bucket:'director_high'});validateShape(response.result,template);
   ensure(STAGES.slice(STAGES.indexOf(c.state.scene)).includes(response.result.returnStage),'主线建议返回了无效合流阶段。');
   const fresh=this.current();
   if(fresh?.id!==sessionId||fresh.state.revision!==revision){job.status='discarded';job.message='旅程已前进，未采用过期的主线建议。';}
   else{this.set('mainline_proposal',{sessionId,sourceRevision:revision,need,proposal:response.result,applied:false});job.status='done';job.message='主线建议已保存；当前原型尚不自动编译新的剧情节点。';}
  }catch(e){job.status='error';job.error=e.message;job.message='主线规划暂未完成，当前结果已保存。';}
  if(this.get('director')?.id===job.id)this.set('director',job);
  const currentNeed=this.get('mainline_need');
  if(currentNeed?.sessionId===sessionId&&currentNeed.revision===revision)this.set('mainline_need',{...currentNeed,status:job.status});
  this.drainMainline();
  })();
 }
 drainMainline(){
  const need=this.get('mainline_need'),c=this.current();
  if(need?.status!=='queued'||this.get('director')?.status==='running')return;
  if(c?.id!==need.sessionId||c.state.revision!==need.revision||c.state.scene==='ending'){this.set('mainline_need',{...need,status:'discarded'});return;}
  this.planMainline({sessionId:c.id,revision:c.state.revision,need});
 }

 item({sessionId,revision,itemId}){
  this.ensureIdle();ensure(this.get('job')?.status!=='error','请先完成待重试的回合。');const c=this.match(sessionId,revision),s=structuredClone(c.state);
  ensure(itemId==='ration'&&s.inventory.ration>0&&s.character.energy<20&&s.scene!=='ending','这件物品当前不能使用。');
  const gain=Math.min(4,20-s.character.energy);s.character.energy+=gain;if(--s.inventory.ration===0)delete s.inventory.ration;
  s.revision++;s.changes=[`精力 +${gain}`,'干粮 −1'];s.lastRoll=null;
  s.journal.push({revision:s.revision,time:timeLabel(s),place:publicState(s,c.pack).sceneData.place,title:'吃一份干粮',outcome:'你稍作休息，恢复了一些力气。',changes:[...s.changes],callback:false,roll:null});
  this.db.exec('BEGIN IMMEDIATE');try{this.saveSession(s,c.pack);this.db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(c.id,s.revision,randomUUID(),json({itemId,changes:s.changes}));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return this.snapshot();
 }
 export(){const c=this.current();ensure(c,'尚无 AI 旅程可导出。');return {format:'earth-online-live',version:1,payload:gzipSync(Buffer.from(json({state:c.state,pack:c.pack}))).toString('base64')};}
 import({save}){
  this.ensureIdle();ensure(save?.format==='earth-online-live'&&save.version===1&&typeof save.payload==='string'&&save.payload.length<1_000_000,'AI 存档格式不合法。');
  let parsed;try{parsed=JSON.parse(gunzipSync(Buffer.from(save.payload,'base64'),{maxOutputLength:2_000_000}).toString());}catch{throw Error('无法解码 AI 存档。');}
  validateShape(parsed.pack);const s=validateSavedState(parsed.state);s.sessionId=randomUUID();s.budgetId=this.budget.activeId();
  this.saveSession(s,parsed.pack);this.set('current',s.sessionId);this.set('job',null);this.set('director',null);this.set('draft',null);this.set('mainline_need',null);this.set('mainline_proposal',null);return this.snapshot();
 }
 async idle(){await this.mainTask;}
 async directorIdle(){let task;do{task=this.directorTask;await task;}while(task!==this.directorTask);}
 close(){try{this.db.close();}finally{this.releaseLock();}}
}
function validateSavedState(s){
 const str=(v,n=2000)=>typeof v==='string'&&v.length<=n;
 const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
 ensure(s?.mode==='live'&&s.world==='mistport-names.v1'&&STAGES.includes(s.scene),'AI 世界或场景不匹配。');
 ensure(integer(s.revision,0,200)&&integer(s.turn,0,10)&&integer(s.minutes,1120,10000),'AI 回合数据不合法。');
 const c=s.character;ensure(c?.name==='林照'&&integer(c.luck,0,100),'角色数据不合法。');
 for(const [k,max] of Object.entries({health:24,energy:20,stress:10,coins:999}))ensure(integer(c[k],0,max),'资源不合法。');
 ensure(Object.keys(c.abilities||{}).sort().join()==='交涉,意志,洞察,身手','能力字段不合法。');
 for(const v of Object.values(c.abilities))ensure(integer(v,0,20),'能力不合法。');
 ensure(Array.isArray(c.effects)&&c.effects.length<=20&&c.effects.every(x=>str(x,100)),'状态不合法。');
 ensure(s.inventory&&typeof s.inventory==='object'&&!Array.isArray(s.inventory),'背包不合法。');
 for(const [k,v] of Object.entries(s.inventory))ensure(Object.hasOwn(ITEMS,k)&&integer(v,1,99),'背包条目不合法。');
 ensure(s.flags&&typeof s.flags==='object'&&!Array.isArray(s.flags),'标志不合法。');
 for(const [k,v] of Object.entries(s.flags))ensure(k==='ending'?['free_names','rewrite_pact','keep_proof'].includes(v):['alias','shadow','friend','inscription','raven','lockTried','trace','ravenFulfilled'].includes(k)&&typeof v==='boolean','标志条目不合法。');
 if(s.scene==='ending')ensure(!!s.flags.ending,'结局记录缺失。');
 ensure(Array.isArray(s.visited)&&s.visited.includes(s.scene)&&s.visited.every(v=>STAGES.includes(v)),'场景历史不合法。');
 ensure(str(s.arrival)&&Array.isArray(s.changes)&&s.changes.length<=30&&s.changes.every(v=>str(v,200)),'反馈不合法。');
 ensure(Array.isArray(s.clues)&&s.clues.length<=50&&s.clues.every(v=>str(v.title,200)&&str(v.body)),'线索不合法。');
 const roll=r=>{if(r===null)return;ensure(r?.kind==='jev'&&Array.isArray(r.base)&&r.base.length===3,'判定记录不合法。');const expected=luckResult(r.base.map(v=>v/100),r.luck,Math.round(r.fortune*100));for(const k of ['effective','tier','shift','total'])ensure(json(r[k])===json(expected[k]),'幸运记录不一致。');ensure(Number.isFinite(r.jevMs)&&r.jevMs>=0,'判定耗时不合法。');};
 roll(s.lastRoll);ensure(Array.isArray(s.journal)&&s.journal.length===s.revision,'经历长度不合法。');
 s.journal.forEach((e,i)=>{ensure(e.revision===i+1&&str(e.time,100)&&str(e.place,100)&&str(e.title,200)&&str(e.outcome)&&typeof e.callback==='boolean'&&Array.isArray(e.changes)&&e.changes.length<=30&&e.changes.every(v=>str(v,200)),'经历记录不合法。');roll(e.roll);});
 const result=createState('imported',c.luck);for(const key of ['revision','turn','minutes','scene','character','inventory','flags','visited','arrival','changes','clues','lastRoll','journal'])result[key]=s[key];return result;
}
