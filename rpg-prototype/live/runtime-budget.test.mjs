import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Runtime} from './runtime.mjs';
import {BASE_PACK} from './world.mjs';
import {responseFor,reviewFor} from './fixtures.mjs';
const defaultCodex=async input=>({result:input.kind==='author_review'?reviewFor(input):structuredClone(BASE_PACK),ms:1});
const setup=()=>{const dir=mkdtempSync(path.join(tmpdir(),'rpg-session-budget-'));return {dir,path:path.join(dir,'state.sqlite')};};
test('preparation, failed choice and explicit recovery use their own persistent game allowances',async()=>{
 const fixture=setup();let fail=true,providerCalls=0;
 const options={path:fixture.path,codex:defaultCodex,jev:async req=>{providerCalls++;if(req.questions.quality&&fail)throw Error('test outage');return {result:responseFor(req),ms:1};}};
 let rt=new Runtime(options);
 try{
  rt.start({requestId:'start'});await rt.idle();const v=rt.snapshot();assert(v.budget);
  assert.equal(v.budget.models.codex.used,2);assert.equal(v.budget.models.jev.used,0);
  const cmd={sessionId:v.sessionId,revision:0,choiceId:'ask_shadow',requestId:'one'};
  rt.choose(cmd);await rt.idle();const budgetId=rt.snapshot().budget.id;rt.close();rt=new Runtime(options);assert.equal(rt.snapshot().budget.id,budgetId);
  fail=false;rt.retry({sessionId:v.sessionId});await rt.idle();let b=rt.snapshot().budget;
  assert.equal(b.models.jev.buckets.find(x=>x.id==='action').used,1);assert.equal(b.models.jev.buckets.find(x=>x.id==='recovery').used,1);
  rt.choose(cmd);assert.equal(providerCalls,2);const saved=rt.export();rt.import({save:saved});assert.equal(rt.snapshot().budget.id,budgetId);assert.equal(rt.snapshot().budget.models.jev.used,2);
  rt.start({requestId:'new'});await rt.idle();b=rt.snapshot().budget;assert.notEqual(b.id,budgetId);assert.equal(b.models.jev.used,0);assert.equal(rt.snapshot().usage.jev,2);
 }finally{rt.close();rmSync(fixture.dir,{recursive:true,force:true});}
});
test('exhausted optional writing does not turn a committed player action into a failure',async()=>{
 const fixture=setup();let directorCalls=0;
 const rt=new Runtime({path:fixture.path,codex:async input=>{if(input.kind==='director')directorCalls++;return defaultCodex(input);},jev:async req=>({result:responseFor(req),ms:1})});
 try{
  rt.start({requestId:'start'});await rt.idle();const v=rt.snapshot();
  for(let i=0;i<6;i++)await rt.logged('codex',{kind:'director',effort:'low'},async()=>({result:{},ms:1}));
  rt.choose({sessionId:v.sessionId,revision:0,choiceId:'lend_name',requestId:'one'});await rt.idle();rt.director({sessionId:v.sessionId,revision:1,effort:'low'});await rt.directorIdle();
  const done=rt.snapshot();assert.equal(done.job.status,'done');assert.equal(done.state.scene,'crossing');assert.equal(directorCalls,0);assert.equal(done.director.status,'error');assert.match(done.director.error,/预算/);
 }finally{rt.close();rmSync(fixture.dir,{recursive:true,force:true});}
});
test('a request denied before dispatch cannot borrow recovery allowance through retry',async()=>{
 const fixture=setup();let actionCalls=0;
 const rt=new Runtime({path:fixture.path,codex:defaultCodex,jev:async req=>{if(req.state.action)actionCalls++;return {result:responseFor(req),ms:1};}});
 try{
  rt.start({requestId:'start'});await rt.idle();const v=rt.snapshot();
  for(let i=0;i<100;i++)rt.budget.reserve({kind:'jev',bucket:'action',payload:{test:true}});
  rt.choose({sessionId:v.sessionId,revision:0,choiceId:'lend_name',requestId:'one'});await rt.idle();assert.equal(actionCalls,0);
  rt.retry({sessionId:v.sessionId});await rt.idle();assert.equal(actionCalls,0);assert.equal(rt.snapshot().state.revision,0);assert.equal(rt.snapshot().budget.models.jev.buckets.find(x=>x.id==='recovery').used,0);
 }finally{rt.close();rmSync(fixture.dir,{recursive:true,force:true});}
});
test('exhausted high planning allowance preserves the current action and records its need',async()=>{
 const fixture=setup();let planningCalls=0;
 const rt=new Runtime({path:fixture.path,codex:async input=>{if(input.kind==='mainline_plan')planningCalls++;return defaultCodex(input);},jev:async req=>({result:responseFor(req,{need:1,continuation:'resource_low'}),ms:1})});
 try{
  rt.start({requestId:'start'});await rt.idle();const c=rt.current();c.state.character.health=0;rt.saveSession(c.state,c.pack);
  for(let i=0;i<2;i++)rt.budget.reserve({kind:'codex',bucket:'director_high',payload:{kind:'mainline_plan'}});
  rt.choose({sessionId:c.id,revision:0,choiceId:'lend_name',requestId:'one'});await rt.idle();await rt.directorIdle();
  assert.equal(rt.snapshot().job.status,'done');assert.equal(rt.snapshot().state.revision,1);assert.equal(planningCalls,0);assert.match(rt.snapshot().director.error,/预算/);assert.equal(rt.get('mainline_need').requested,true);
 }finally{rt.close();rmSync(fixture.dir,{recursive:true,force:true});}
});
