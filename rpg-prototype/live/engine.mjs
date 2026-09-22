import {newGame,ITEMS,timeLabel} from '../game.mjs';
import {scenes} from '../story.mjs';
import {ACTIONS,ALL_OUTCOMES,STAGES,CANON} from './world.mjs';
export const TIER=['bad','mixed','good'];
export const ensure=(value,message)=>{if(!value)throw Error(message);};
export function weights(probabilities){
 ensure(Array.isArray(probabilities)&&probabilities.length===3&&probabilities.every(n=>Number.isFinite(n)&&n>=0&&n<=1),'概率分布不合法');
 const sum=probabilities.reduce((a,b)=>a+b);ensure(Math.abs(sum-1)<0.02&&sum>0,'概率总和不合法');
 const exact=probabilities.map(n=>n/sum*10000),w=exact.map(Math.floor);
 const order=exact.map((v,i)=>({i,frac:v-w[i]})).sort((a,b)=>b.frac-a.frac||a.i-b.i);
 for(let left=10000-w.reduce((a,b)=>a+b),i=0;left>0;left--,i++)w[order[i%3].i]++;
 return w;
}
export function luckResult(probabilities,luck,fortune){
 ensure(Number.isInteger(luck)&&luck>=0&&luck<=100&&Number.isInteger(fortune)&&fortune>=0&&fortune<10000,'幸运参数不合法');
 const w=weights(probabilities),shift=Math.max(-1000,Math.min(1000,20*(luck-50))),total=Math.max(0,Math.min(9999,fortune+shift));
 const indexFor=q=>q<w[0]?0:q<w[0]+w[1]?1:2;
 const counts=[0,0,0];for(let i=0;i<10000;i++)counts[indexFor(Math.max(0,Math.min(9999,i+shift)))]++;
 const index=indexFor(total);
 return {kind:'jev',base:w.map(v=>v/100),effective:counts.map(v=>v/100),fortune:fortune/100,luck,shift:shift/100,total:total/100,index,tier:TIER[index]};
}
export function createState(id,luck=75){const s=newGame(1);return {...s,mode:'live',sessionId:id,turn:0,character:{...s.character,luck},visited:['market']};}
export function available(s){return Object.entries(ACTIONS).filter(([,a])=>a.stage===s.scene).map(([id,a])=>{
 const missing=Object.entries(a.cost).find(([k,n])=>s.character[k]<n);
 const evidence=s.inventory.receipt||s.inventory.letter||s.flags.shadow||s.flags.friend;
 const reason=missing?'资源不足':a.stage==='bell'&&!s.inventory.ledger?'尚未取得借名簿':id==='use_evidence'&&!evidence?'尚无线索或人情':id==='pick_lock'&&(s.flags.lockTried||!s.inventory.key)?'这条开锁路线已不可用':'';
 return {id,...a,disabled:!!reason,disabledReason:reason};
});}
export function actionFor(s,id){const a=available(s).find(a=>a.id===id);ensure(a&&!a.disabled,a?.disabledReason||'选项已失效');return a;}
export function sceneData(s,pack){
 const base=s.scene==='ending'?pack.endings[s.flags.ending]:pack.scenes[s.scene];
 const paragraphs=[...base.paragraphs];
 if(s.scene==='bell'&&s.inventory.feather)paragraphs.push('银羽在你掌心睁开一只眼睛。渡鸦终于看见钟里的月亮，你没有忘记答应它的事。');
 if(s.scene==='ending'&&s.flags.ravenFulfilled)paragraphs.push('渡鸦收回银羽，在你的手记边缘留下一点月光。那个小小的约定完成了。');
 return {...base,paragraphs,place:scenes[s.scene].place,chapter:scenes[s.scene].chapter,arrival:s.arrival,ending:s.scene==='ending',choices:available(s).map(a=>({id:a.id,title:pack.scenes[s.scene].choices[a.id],meta:a.meta,callback:a.id==='use_evidence',disabled:a.disabled,disabledReason:a.disabledReason}))};
}
export function publicState(s,pack){return {...structuredClone(s),sceneData:sceneData(s,pack),objective:s.scene==='ending'?'这一夜的故事已经留下回声。':s.scene==='bell'?'根据借名簿，决定这座城如何面对真相。':'沿着线索抵达钟楼，查清名字的去向。'};}
// Coverage belongs to the authored chapter. Numerical extremes alone do not justify rewriting.
// This short chapter has free continuation routes, no upper resource ceiling and no required NPC.
function continuation(s){
 const availableRoutes=available(s).filter(a=>!a.disabled).map(a=>a.id),uncovered=[];
 if(s.scene!=='ending'){
  if(s.character.health===0||!availableRoutes.length)uncovered.push('resource_low');
  if(s.scene==='bell'&&!s.inventory.ledger)uncovered.push('missing_condition');
 }
 const {health,energy,stress,coins}=s.character;
 return {stage:s.scene,turn:s.turn,remainingSteps:Math.max(0,6-s.turn),availableRoutes,character:{health,energy,stress,coins},inventory:s.inventory,conditions:s.flags,coverage:{uncovered,minimumHealth:1,upperResourceLimit:null,requiredConditions:s.scene==='bell'?['ledger']:[],variationRequirements:[],fallback:s.scene==='archive'?'ask_clerk':null}};
}
export function jevRequest(s,a,pack){
 const {luck,...character}=s.character;
 const relevant=Object.values(a.tiers).flat();
 const state={world:CANON,scene:{id:s.scene,paragraphs:pack.scenes[s.scene].paragraphs},character,inventory:s.inventory,known_flags:s.flags,known_clues:s.clues,recent_history:s.journal.slice(-6).map(e=>({action:e.title,result:e.outcome})),action:{id:a.id,title:pack.scenes[s.scene].choices[a.id],kind:a.kind,skill:a.skill||null,cost:a.cost},allowed_outcomes:relevant.map(o=>({id:o.id,text:pack.outcomes[o.id],effects:o.effects}))};
 state.pacing={turnsTaken:s.turn,plannedChoices:6,stage:s.scene,hasEnding:true};
 state.runtime_contract={
  entry_evidence:{receipt:!!s.inventory.receipt,letter:!!s.inventory.letter,shadow:!!s.flags.shadow,friend:!!s.flags.friend},
  action_rule:a.id==='use_evidence'?'借据、旧信、影子暗门线索或商人信任，任一成立即可安全入馆。影子暗门路线不需要拿出纸质凭据。入馆成功后查阅借名簿，才得知挡雾真相。':a.stage==='archive'?'成功入馆时查阅并抄下借名簿，得知挡雾用途和隐藏的归还条款；开锁失败仍留门外。':a.stage==='bell'?'已从档案馆取得借名簿，三种结局按玩家选择兑现，不再判断道德或阻止选择。':'普通行为按固定条件执行；风险行为从互斥的后果中选择。',
  timing:'基础五分钟另加 effects.minutes，cost 和 effects 分别执行；无需在正文逐字写出数值。',
  callbacks:'如持有银羽，入钟顶时程序追加见月履约段；任一结局时归还银羽并撤销临时意志加成。没有银羽不执行这些回调。'
 };
 state.after_each_outcome=Object.fromEntries(relevant.map(o=>[o.id,continuation(applyResult(s,a,{outcomeId:o.id,roll:null},pack))]));
 const questions={};
 if(a.kind==='risk')questions.quality={type:'score',instructions:'Assess the likelihood of the selected action achieving its stated immediate goal, from the current ability, tools, environment and resource state. Ignore storytelling preferences, luck, desired tension, and hidden future plot. Use concrete tier definitions. Return your relative judgment distribution; the game applies a separate fortune exactly once.',criteria:TIER.map(t=>({tier:t,meaning:{bad:'The immediate goal fails and incurs the stated bounded setback.',mixed:'The goal is reached with the stated extra cost or incomplete result.',good:'The goal is reached cleanly with the stated normal cost.'}[t],outcomes:(a.tiers[t]||[]).map(o=>({id:o.id,text:pack.outcomes[o.id]}))}))};
 for(const [tier,options] of Object.entries(a.tiers)){
  questions[`result_${tier}`]={type:'choice',instructions:`Conditional on the selected action producing the ${tier} tier, choose the prepared consequence best suited to the environment and player state. All candidates have already been authored and reviewed by Astra. Do not review their prose or decide the tier. Do not invent rewards, punishments or consequences.`,criteria:Object.fromEntries(options.map(o=>[o.id,{narrative:pack.outcomes[o.id],effects:o.effects}]))};
  for(const o of options){
   questions[`mainline_need_${o.id}`]={type:'noul',instructions:`Only if ${o.id} occurs, does its projected state materially exceed the authored continuation coverage? Use state.after_each_outcome.${o.id}, remaining stage and available fallback routes. This is a future planning signal, never a veto on the current action. Astra owns story consistency. Low or high stats, a failure, good luck or optional missing clues do not by themselves require replanning. Never rebalance lucky players or invent a new random event.`,criteria:{true:'A required future condition is unmet and prepared continuations cannot handle it.',false:'Existing routes, callbacks or a free fallback can continue to an ending.'}};
   questions[`continuation_${o.id}`]={type:'choice',instructions:`Only if ${o.id} occurs, classify future continuation needs against its explicit coverage. Choose prepared unless a declared requirement is actually uncovered. Do not judge prose consistency.`,criteria:{prepared:'The authored routes already cover this state.',resource_low:'A required resource is below the authored minimum and no prepared fallback covers it.',resource_high:'A resource exceeds an explicit authored upper limit and existing variations do not cover it.',missing_condition:'An indispensable item, character or condition for future progression is missing.',variation_gap:'An explicitly required future variation is outside the available authored routes.'}};
  }
 }
 return {model:'jev-latest',state,questions};
}
function answerFor(response,request,key){const a=response?.answers?.[key],q=request.questions[key];ensure(a?.type===q.type,`Jev 缺少有效回答：${key}`);return a;}
function choiceAnswer(response,request,key){
 const a=answerFor(response,request,key),ids=Object.keys(request.questions[key].criteria);
 ensure(ids.includes(a.choice)&&a.probabilities&&Object.keys(a.probabilities).sort().join()===ids.sort().join(),'Jev 候选结果不合法');
 const p=Object.values(a.probabilities);ensure(p.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&Math.abs(p.reduce((x,y)=>x+y)-1)<.02,'Jev Choice 概率不合法');
 ensure(Number.isFinite(a.confidence)&&a.confidence>=0&&a.confidence<=1&&a.probabilities[a.choice]>=Math.max(...p)-1e-6,'Jev Choice 元数据不合法');return a.choice;
}
export function adjudicate(s,a,pack,response,fortune,jevMs=0){
 const request=jevRequest(s,a,pack);
 let roll=null,tier='good';
 if(a.kind==='risk'){
  const score=answerFor(response,request,'quality');ensure(score.probabilities&&Object.keys(score.probabilities).sort().join()==='0,1,2','Jev Score 概率不完整');
  const probabilities=[0,1,2].map(k=>score.probabilities[k]),w=weights(probabilities),mean=(w[1]+2*w[2])/10000;
  ensure(Number.isFinite(score.score)&&score.score>=0&&score.score<=2&&Math.abs(score.score-mean)<=.03&&Number.isFinite(score.confidence)&&score.confidence>=0&&score.confidence<=1&&score.legend&&Object.keys(score.legend).sort().join()==='0,1,2','Jev Score 元数据不一致');
  roll=luckResult(probabilities,s.character.luck,fortune);roll.jevMs=jevMs;tier=roll.tier;
 }
 // Validate every conditional answer, but commit only the selected branch.
 for(const t of Object.keys(a.tiers))choiceAnswer(response,request,`result_${t}`);
 const outcomeId=choiceAnswer(response,request,`result_${tier}`),projected=request.state.after_each_outcome[outcomeId];
 let replan={requested:false,status:'unavailable',reason:null};
 // Optional planning failures cannot rescind an otherwise valid outcome.
 try{
  const need=answerFor(response,request,`mainline_need_${outcomeId}`).noul;
  ensure(Number.isFinite(need)&&need>=0&&need<=1,'规划信号不合法');
  const reason=choiceAnswer(response,request,`continuation_${outcomeId}`);
  const requested=projected.stage!=='ending'&&need>=.85&&projected.coverage.uncovered.includes(reason);
  replan={requested,status:requested?'requested':reason!=='prepared'&&!projected.coverage.uncovered.includes(reason)?'covered_by_prepared':'not_needed',reason,need,targetStage:projected.stage};
 }catch{ /* Preserve the selected action; do not retry or invent a planning answer. */ }
 return {outcomeId,effort:replan.requested?'high':'none',replan,roll,model:response.model,jevMs};
}
export function applyResult(state,a,decision,pack){
 const o=ALL_OUTCOMES[decision.outcomeId];ensure(Object.values(a.tiers).flat().some(v=>v.id===o?.id),'后果不属于本次行动');
 const s=structuredClone(state);s.revision++;s.turn++;s.changes=[];s.lastRoll=decision.roll;
 const names={health:'生命',energy:'精力',stress:'压力',coins:'铜币'},max={health:24,energy:20,stress:10,coins:999};
 const delta=(key,n)=>{const old=s.character[key];s.character[key]=Math.max(0,Math.min(max[key],old+n));const actual=s.character[key]-old;if(actual)s.changes.push(`${names[key]} ${actual>0?'+':''}${actual}`);};
 for(const [k,v] of Object.entries(a.cost))delta(k,-v);
 for(const k of Object.keys(names))if(o.effects[k])delta(k,o.effects[k]);
 const e=o.effects;if(e.item){s.inventory[e.item]=(s.inventory[e.item]||0)+1;s.changes.push(`获得：${ITEMS[e.item].name}`);}
 if(e.flag)s.flags[e.flag]=true;
 if(e.ability){s.character.abilities[e.ability]++;s.changes.push(`${e.ability} +1`);}
 if(e.clearCold)s.character.effects=s.character.effects.filter(x=>x!=='雨中微寒');
 if(e.clue)s.clues.push({title:a.title,body:e.clue});
 if(e.callback)s.changes.push('早先的选择，打开了这扇门');
 s.minutes+=5+(e.minutes||0);s.arrival=pack.outcomes[o.id];
 s.scene=e.stay?state.scene:STAGES[STAGES.indexOf(state.scene)+1];
 if(e.ending){s.flags.ending=e.ending;s.minutes=Math.floor(s.minutes/1440)*1440+1800;
  if(s.inventory.feather){delete s.inventory.feather;s.character.abilities.意志--;s.flags.ravenFulfilled=true;s.changes.push('完成渡鸦的约定 · 归还银羽 · 意志 −1');}}
 if(!s.visited.includes(s.scene))s.visited.push(s.scene);
 const sideBranches=[];
 if(e.flag==='raven')sideBranches.push({id:'raven_promise',status:'opened'});
 if(!state.flags.ravenFulfilled&&s.flags.ravenFulfilled)sideBranches.push({id:'raven_promise',status:'completed'});
 s.lastImpact={statusChanges:[...s.changes],sideBranches,conditionsAdded:Object.keys(s.flags).filter(k=>s.flags[k]===true&&!state.flags[k]).concat(e.item?[`item:${e.item}`]:[]),mainline:decision.replan||null};
 s.journal.push({revision:s.revision,time:timeLabel(state),place:scenes[state.scene].place,title:pack.scenes[state.scene].choices[a.id],outcome:s.arrival,changes:[...s.changes],callback:!!e.callback,roll:s.lastRoll});
 return s;
}
