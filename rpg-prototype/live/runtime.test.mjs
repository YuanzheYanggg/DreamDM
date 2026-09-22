import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BASE_PACK,ACTIONS} from './world.mjs';
import {hasEvidence} from './authoring.mjs';
import {responseFor,reviewFor} from './fixtures.mjs';
const defaultCodex=async input=>({result:input.kind==='author_review'?reviewFor(input):structuredClone(BASE_PACK),ms:1,model:'fixture'});
const {Runtime}=await import('./runtime.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('runtime persists fortune and rejects stale/duplicate submissions before billing',async()=>{
 assert.equal(typeof Runtime,'function');
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-test-'));let requests=0,fail=true;
 const options={path:path.join(dir,'db.sqlite'),fortune:()=>7800,codex:defaultCodex,jev:async req=>{if(req.questions.quality){requests++;if(fail)throw Error('fixture outage');}return {result:responseFor(req),ms:4};}};
 let rt=new Runtime(options);
 try{
  rt.start({requestId:'start',luck:75});await rt.idle();const initial=rt.snapshot();
  const cmd={sessionId:initial.sessionId,revision:0,choiceId:'ask_shadow',requestId:'action'};
  rt.choose(cmd);await rt.idle();assert.equal(rt.snapshot().job.status,'error');assert.equal(rt.snapshot().state.character.energy,18);assert.equal(requests,1);
  rt.choose(cmd);assert.equal(requests,1);rt.close();fail=false;rt=new Runtime(options);
  rt.retry({sessionId:initial.sessionId});await rt.idle();const done=rt.snapshot();
  assert.equal(done.state.lastRoll.fortune,78);assert.equal(done.state.revision,1);assert.equal(done.state.character.energy,16);assert.equal(requests,2);
  rt.choose(cmd);assert.equal(requests,2);assert.throws(()=>rt.choose({...cmd,requestId:'stale'}));
  const saved=rt.export();rt.import({save:saved});assert.equal(rt.snapshot().state.character.energy,16);
 }finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('background Codex cannot delay action settlement or overwrite a scene already shown',async()=>{
 assert.equal(typeof Runtime,'function');const dir=mkdtempSync(path.join(tmpdir(),'rpg-test-'));let release;
 const rt=new Runtime({path:path.join(dir,'db.sqlite'),fortune:()=>7800,codex:async input=>input.kind!=='director'?defaultCodex(input):await new Promise(resolve=>{release=()=>resolve({result:{title:'future change',paragraphs:['future only']},ms:1,model:'fixture'});}),jev:async req=>({result:responseFor(req),ms:2})});
 try{
  rt.start({requestId:'start'});await rt.idle();let view=rt.snapshot();
  rt.choose({sessionId:view.sessionId,revision:0,choiceId:'lend_name',requestId:'one'});await rt.idle();view=rt.snapshot();
  assert.equal(view.state.scene,'crossing');rt.director({sessionId:view.sessionId,revision:1,effort:'low'});assert.equal(rt.snapshot().director.status,'running');
  rt.choose({sessionId:view.sessionId,revision:1,choiceId:'hurry',requestId:'two'});await rt.idle();
  release();await rt.directorIdle();assert.equal(rt.snapshot().state.scene,'raven');assert.equal(rt.snapshot().director.status,'discarded');
 }finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('a completed future draft is reviewed and published atomically on first arrival',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-test-'));let reviewed=0;
 const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:async input=>{if(input.kind==='author_review'&&input.reviewContext.script.draft)reviewed++;return input.kind==='director'?{result:{title:'一份尚未答应的约定',paragraphs:['一只渡鸦停在路边，等待你的选择。']},ms:1}:defaultCodex(input);},jev:async req=>{assert.equal(req.questions.patch_consistent,undefined);return {result:responseFor(req),ms:1};}});
 try{
  rt.start({requestId:'start'});await rt.idle();let v=rt.snapshot();
  rt.choose({sessionId:v.sessionId,revision:0,choiceId:'lend_name',requestId:'one'});await rt.idle();v=rt.snapshot();
  rt.director({sessionId:v.sessionId,revision:1,effort:'low'});await rt.directorIdle();
  assert.equal(rt.snapshot().state.scene,'crossing');assert.equal(rt.get('draft').target,'raven');
  rt.choose({sessionId:v.sessionId,revision:1,choiceId:'hurry',requestId:'two'});await rt.idle();
  assert.equal(reviewed,1);assert.equal(rt.snapshot().state.sceneData.title,'一份尚未答应的约定');assert.equal(rt.get('draft'),null);
 }finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('retry never publishes a structurally rejected preparation packet',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-test-'));let jevCalls=0;const bad=structuredClone(BASE_PACK);bad.scenes.market.paragraphs=[];
 const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:async()=>({result:bad,ms:1}),jev:async req=>{jevCalls++;return {result:responseFor(req),ms:1};}});
 try{rt.start({requestId:'start'});await rt.idle();assert.equal(rt.snapshot().job.status,'error');rt.retry();await rt.idle();assert.equal(rt.snapshot().job.status,'error');assert.equal(jevCalls,0);assert.equal(rt.snapshot().state,null);}
 finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('a second runtime cannot steal a pending action or alter its recovery status',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-owner-test-'));let release;
 const options={path:path.join(dir,'db.sqlite'),codex:defaultCodex,jev:async req=>req.questions.quality?new Promise(resolve=>{release=()=>resolve({result:responseFor(req),ms:1});}):{result:responseFor(req),ms:1}};
 const rt=new Runtime(options);
 try{
  rt.start({requestId:'start'});await rt.idle();const v=rt.snapshot();rt.choose({sessionId:v.sessionId,revision:0,choiceId:'ask_shadow',requestId:'one'});
  assert.throws(()=>new Runtime(options),/正在使用/);assert.equal(rt.snapshot().job.status,'running');
  release();await rt.idle();assert.equal(rt.snapshot().state.revision,1);assert.equal(rt.snapshot().job.status,'done');
 }finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('failed database initialization releases ownership for a repaired database',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-corrupt-test-')),file=path.join(dir,'db.sqlite');
 try{writeFileSync(file,'invalid sqlite');assert.throws(()=>new Runtime({path:file}));assert.equal(existsSync(`${file}.lock`),false);unlinkSync(file);const rt=new Runtime({path:file});rt.close();}
 finally{rmSync(dir,{recursive:true,force:true});}
});
test('preparation is authored and reviewed by Astra without any Jev call',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-author-'));const kinds=[];let jevCalls=0;
 const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:async input=>{kinds.push(input.kind);return defaultCodex(input);},jev:async req=>{jevCalls++;return {result:responseFor(req),ms:1};}});
 try{rt.start({requestId:'start'});await rt.idle();assert.deepEqual(kinds,['prepare','author_review']);assert.equal(jevCalls,0);assert.equal(rt.snapshot().job.status,'done');assert.equal(rt.snapshot().budget.models.codex.buckets.find(x=>x.id==='opening').used,2);}
 finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('an editorial repair must pass a fresh Astra review; retries retain a rejected response',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-repair-test-'));let reviews=0,approve=false,jevCalls=0;
 const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:async input=>{const r=await defaultCodex(input);if(input.kind==='author_review'){reviews++;r.result.checks.world_rules.verdict=approve?'consistent':'contradiction';}return r;},jev:async()=>{jevCalls++;throw Error('Jev must not author-review');}});
 try{
  rt.start({requestId:'start'});await rt.idle();assert.equal(rt.snapshot().job.status,'error');assert.equal(rt.snapshot().state,null);
  rt.retry();await rt.idle();assert.equal(reviews,1);assert.equal(rt.snapshot().state,null);
  const pack=structuredClone(BASE_PACK);pack.scenes.market.title='修订过的开场';rt.set('repair_candidate',{sourceJobId:'start',createdAt:'test',pack});
  approve=true;rt.retry();await rt.idle();assert.equal(reviews,2);assert.equal(jevCalls,0);assert.equal(rt.snapshot().state.sceneData.title,'修订过的开场');
 }finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('fabricated author evidence cannot publish or trigger a paid reroll',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-review-cache-'));let reviews=0;
 const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:async input=>{const r=await defaultCodex(input);if(input.kind==='author_review'){reviews++;r.result.checks.world_rules.scriptQuote='虚构的剧本原文';}return r;}});
 try{rt.start({requestId:'start'});await rt.idle();rt.retry();await rt.idle();assert.equal(reviews,1);assert.equal(rt.snapshot().state,null);assert.match(rt.snapshot().job.error,/引文/);}
 finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('received invalid action result is retained rather than rerolled on retry',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-action-receipt-'));let calls=0;
 const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:defaultCodex,jev:async req=>{calls++;const r=responseFor(req);r.answers.result_good.choice='invented';return {result:r,ms:1};}});
 try{rt.start({requestId:'start'});await rt.idle();const v=rt.snapshot();rt.choose({sessionId:v.sessionId,revision:0,choiceId:'lend_name',requestId:'one'});await rt.idle();rt.retry({sessionId:v.sessionId});await rt.idle();assert.equal(calls,1);assert.equal(rt.snapshot().state.revision,0);assert.equal(rt.snapshot().job.status,'error');}
 finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('all player-chosen endings settle without a semantic score or special approval bypass',async()=>{
 for(const ending of ['free_names','rewrite_pact','keep_proof']){
  const dir=mkdtempSync(path.join(tmpdir(),'rpg-ending-'));let calls=0;
  const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:defaultCodex,jev:async req=>{calls++;assert.equal(req.questions.consistent,undefined);const r=responseFor(req);r.answers.consistent={type:'noul',noul:0};return {result:r,ms:1};}});
  try{
   rt.start({requestId:'start'});await rt.idle();let v=rt.snapshot();
   for(const [i,choiceId] of ['lend_name','hurry','accept_raven','use_evidence',ending].entries()){rt.choose({sessionId:v.sessionId,revision:i,choiceId,requestId:`step-${i}`});await rt.idle();assert.equal(rt.snapshot().job.status,'done');}
   v=rt.snapshot();assert.equal(v.state.scene,'ending');assert.equal(v.state.flags.ending,ending);assert.equal(v.state.flags.ravenFulfilled,true);assert.equal(v.state.inventory.feather,undefined);assert.equal(calls,5);assert.equal(rt.get('job').decision.endingAuthority,undefined);
  }finally{rt.close();rmSync(dir,{recursive:true,force:true});}
 }
});
test('an uncovered continuation asks Astra high for a separate plan after committing the action',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-mainline-'));let release,planningCalls=0;
 const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:async input=>{
  if(input.kind!=='mainline_plan')return defaultCodex(input);
  planningCalls++;assert.equal(input.effort,'high');return new Promise(resolve=>{release=()=>resolve({result:{summary:'规划恢复体力的过渡',requiredChanges:['新增一段有因果依据的休整'],preservedFacts:['借据仍在'],returnStage:'crossing'},ms:1});});
 },jev:async req=>({result:responseFor(req,{need:.99,continuation:'resource_low'}),ms:1})});
 try{
  rt.start({requestId:'start'});await rt.idle();const c=rt.current();c.state.character.health=0;rt.saveSession(c.state,c.pack);
  rt.choose({sessionId:c.id,revision:0,choiceId:'lend_name',requestId:'one'});await rt.idle();
  assert.equal(rt.snapshot().job.status,'done');assert.equal(rt.snapshot().state.scene,'crossing');assert.equal(planningCalls,1);assert.equal(rt.snapshot().director.status,'running');
  const committed=structuredClone(rt.current());release();await rt.directorIdle();
  assert.equal(rt.get('mainline_proposal').applied,false);assert.deepEqual(rt.current(),committed);assert.equal(rt.snapshot().budget.models.codex.buckets.find(x=>x.id==='director_high').used,1);
 }finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
test('a rejected or stale Astra draft never reaches player prose and is never sent to Jev for review',async()=>{
 for(const mode of ['rejected','state_changed']){
  const dir=mkdtempSync(path.join(tmpdir(),'rpg-future-'));
  const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:async input=>{
   if(input.kind==='director')return {result:{title:'未采用的草稿',paragraphs:['渡鸦等着旅人做决定。']},ms:1};
   const r=await defaultCodex(input);if(input.reviewContext?.script.draft&&mode==='rejected')r.result.checks.future_history.verdict='contradiction';return r;
  },jev:async req=>{assert.equal(req.state.future_patch,undefined);assert.equal(req.questions.patch_consistent,undefined);return {result:responseFor(req),ms:1};}});
  try{
   rt.start({requestId:'start'});await rt.idle();let v=rt.snapshot();rt.choose({sessionId:v.sessionId,revision:0,choiceId:'lend_name',requestId:'one'});await rt.idle();
   rt.director({sessionId:v.sessionId,revision:1,effort:'low'});await rt.directorIdle();
   if(mode==='rejected'){assert.equal(rt.get('draft'),null);assert.equal(rt.snapshot().director.status,'error');}
   rt.choose({sessionId:v.sessionId,revision:1,choiceId:mode==='state_changed'?'warm_soup':'hurry',requestId:'two'});await rt.idle();
   assert.equal(rt.snapshot().state.scene,'raven');assert.equal(rt.snapshot().state.sceneData.title,BASE_PACK.scenes.raven.title);assert.equal(rt.get('draft'),null);
   if(mode==='state_changed')assert.equal(rt.snapshot().director.status,'discarded');
  }finally{rt.close();rmSync(dir,{recursive:true,force:true});}
 }
});
test('a mainline need arising during optional writing is queued and processed afterwards',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-queued-plan-'));let release,plans=0;
 const rt=new Runtime({path:path.join(dir,'db.sqlite'),codex:async input=>{
  if(input.kind==='director')return new Promise(resolve=>{release=()=>resolve({result:{title:'将过期的文案',paragraphs:['渡鸦等待旅人。']},ms:1});});
  if(input.kind==='mainline_plan'){plans++;return {result:{summary:'补足后续条件',requiredChanges:['安排一次合理的休整'],preservedFacts:['已经过桥'],returnStage:'raven'},ms:1};}
  return defaultCodex(input);
 },jev:async req=>({result:responseFor(req,{need:.99,continuation:'resource_low'}),ms:1})});
 try{
  rt.start({requestId:'start'});await rt.idle();const id=rt.snapshot().sessionId;
  rt.choose({sessionId:id,revision:0,choiceId:'lend_name',requestId:'one'});await rt.idle();rt.director({sessionId:id,revision:1,effort:'low'});
  const c=rt.current();c.state.character.health=0;rt.saveSession(c.state,c.pack);
  rt.choose({sessionId:id,revision:1,choiceId:'hurry',requestId:'two'});await rt.idle();assert.equal(plans,0);assert.equal(rt.get('mainline_need').status,'queued');
  release();await rt.directorIdle();assert.equal(plans,1);assert.equal(rt.get('mainline_proposal').sourceRevision,2);
 }finally{rt.close();rmSync(dir,{recursive:true,force:true});}
});
