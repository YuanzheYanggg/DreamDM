import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createState,actionFor,jevRequest} from './engine.mjs';
import {BASE_PACK,preflightRequest} from './world.mjs';

const {BudgetLedger,DEFAULT_POLICY}=await import('./budget.mjs').catch(error=>error.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(error));
function database(filename=':memory:'){
 const db=new DatabaseSync(filename);
 db.exec(`CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY,kind TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,record TEXT NOT NULL);`);
 return db;
}
function ledger(db,options){assert.equal(typeof BudgetLedger,'function','BudgetLedger must provide durable call reservations');return new BudgetLedger(db,options);}
function policy(){return {version:'test-v1',plannedChoices:2,models:{jev:{limit:3,buckets:{preflight:1,action:2,checkpoint:1,recovery:1}},codex:{limit:3,buckets:{opening:1,director_low:1,director_medium:1,director_high:1,repair:1}}}};}
function insert(db,id,kind,record,status='done'){db.prepare('INSERT INTO calls VALUES(?,?,?,?,?)').run(id,kind,status,'2026-09-22T00:00:00.000Z',JSON.stringify(record));}
function record(db,id){return JSON.parse(db.prepare('SELECT record FROM calls WHERE id=?').get(id).record);}
function finish(db,id,status,extra={}){db.prepare('UPDATE calls SET status=?,record=? WHERE id=?').run(status,JSON.stringify({...record(db,id),...extra}),id);}
function bucket(snapshot,kind,id){return snapshot.models[kind].buckets.find(item=>item.id===id);}

test('default snapshot exposes the whole-game limits and labels',t=>{
 const db=database();t.after(()=>db.close());const budget=ledger(db),snapshot=budget.snapshot();
 assert.equal(snapshot.id,budget.activeId());assert.equal(snapshot.version,'session-v1');assert.equal(snapshot.plannedChoices,100);
 assert.deepEqual(Object.fromEntries(snapshot.models.jev.buckets.map(item=>[item.id,item.limit])),{preflight:6,action:100,checkpoint:4,recovery:20});
 assert.deepEqual(Object.fromEntries(snapshot.models.codex.buckets.map(item=>[item.id,item.limit])),{opening:4,director_low:6,director_medium:4,director_high:2,repair:2});
 assert.equal(snapshot.models.jev.limit,130);assert.equal(snapshot.models.codex.limit,18);
 assert.equal(snapshot.models.jev.remaining,130);assert.equal(snapshot.models.codex.used,0);
 assert.deepEqual(snapshot.models.jev.tokens,{input:0,output:0,unknownCalls:0});
 for(const model of Object.values(snapshot.models))for(const item of model.buckets)assert.match(item.label,/[\u4e00-\u9fff]/);
 assert.equal(DEFAULT_POLICY.version,'session-v1');
});

test('running and failed attempts exhaust a bucket without borrowing or deleting evidence',t=>{
 const db=database();t.after(()=>db.close());const budget=ledger(db,{policy:policy()});
 const payload={questions:{quality:{type:'score'}},state:{turn:1}};
 const first=budget.reserve({kind:'jev',payload}),second=budget.reserve({kind:'jev',payload});
 assert.deepEqual(first.budget,{id:budget.activeId(),bucket:'action'});
 assert.equal(db.prepare('SELECT status FROM calls WHERE id=?').get(first.id).status,'running');
 assert.deepEqual(record(db,first.id),{request:payload,budget:first.budget});assert.ok(Number.isFinite(Date.parse(first.created)));
 finish(db,first.id,'error',{error:'provider unavailable'});
 assert.throws(()=>budget.reserve({kind:'jev',payload}),error=>error.code==='BUDGET_EXHAUSTED');
 const snapshot=budget.snapshot();assert.equal(snapshot.models.jev.used,2);assert.equal(bucket(snapshot,'jev','action').remaining,0);
 assert.equal(bucket(snapshot,'jev','recovery').remaining,1);assert.equal(db.prepare('SELECT count(*) n FROM calls').get().n,2);
 assert.ok(record(db,second.id).budget);assert.equal(record(db,first.id).error,'provider unavailable');
 budget.reserve({kind:'codex',payload:{kind:'prepare'}});assert.equal(budget.snapshot().models.codex.used,1);
});

test('model totals cap independently of available bucket allowance',t=>{
 const db=database();t.after(()=>db.close());const budget=ledger(db,{policy:policy()});
 for(const purpose of ['preflight','checkpoint','recovery'])budget.reserve({kind:'jev',bucket:purpose,payload:{}});
 assert.equal(bucket(budget.snapshot(),'jev','action').remaining,2);
 assert.throws(()=>budget.reserve({kind:'jev',bucket:'action',payload:{}}),error=>error.code==='BUDGET_EXHAUSTED');
 budget.reserve({kind:'codex',payload:{kind:'director',effort:'low'}});
 assert.equal(budget.snapshot().models.codex.remaining,2);assert.equal(budget.snapshot().models.jev.remaining,0);
});

test('restart keeps the active policy and attempts; explicit new game preserves earlier budgets',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-budget-')),filename=path.join(dir,'state.sqlite');let db=database(filename);
 t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 let budget=ledger(db,{policy:policy()});const original=budget.activeId(),running=budget.reserve({kind:'jev',payload:{}});
 db.close();db=database(filename);const nextPolicy=policy();nextPolicy.version='test-v2';nextPolicy.models.jev.limit=1;
 budget=ledger(db,{policy:nextPolicy});assert.equal(budget.activeId(),original);assert.equal(budget.snapshot().version,'test-v1');assert.equal(budget.snapshot().models.jev.limit,3);assert.equal(budget.snapshot().models.jev.used,1);
 const fresh=budget.newGame();assert.equal(fresh,budget.activeId());assert.notEqual(fresh,original);assert.equal(budget.snapshot().version,'test-v2');assert.equal(budget.snapshot().models.jev.limit,1);assert.equal(budget.snapshot().models.jev.used,0);
 budget.reserve({kind:'jev',bucket:'action',budgetId:original,payload:{questions:{quality:{}}}});
 finish(db,running.id,'done',{usage:{input_tokens:4,output_tokens:2}});
 assert.equal(budget.snapshot(original).models.jev.used,2);assert.equal(budget.snapshot().models.jev.used,0);
 assert.equal(db.prepare('SELECT count(*) n FROM calls').get().n,2);
 const reopened=ledger(db);assert.equal(reopened.activeId(),fresh);assert.equal(reopened.snapshot().version,'test-v2');
});

test('first bootstrap adopts all legacy attempts once while preserving their request and result',t=>{
 const db=database();t.after(()=>db.close());
 const cases=[['opening','codex',{kind:'prepare'}],['repair','codex',{kind:'editorial_repair'}],['director_low','codex',{kind:'director',effort:'low'}],['director_medium','codex',{kind:'director',effort:'medium'}],['director_high','codex',{kind:'director',effort:'high'}],['action','jev',{questions:{quality:{type:'score'}}}],['preflight','jev',{questions:{consistent:{type:'noul'}}}]];
 for(const [id,kind,request] of cases)insert(db,id,kind,{request,result:{sentinel:id},ms:7},id==='repair'?'error':'done');
 let budget=ledger(db),original=budget.activeId();
 for(const [id,,request] of cases)assert.deepEqual(record(db,id),{request,result:{sentinel:id},ms:7,budget:{id:original,bucket:id}});
 assert.equal(budget.snapshot().models.jev.used,2);assert.equal(budget.snapshot().models.codex.used,5);
 budget.newGame();const active=budget.activeId();budget=ledger(db);
 assert.equal(budget.activeId(),active);assert.equal(budget.snapshot().models.codex.used,0);assert.equal(budget.snapshot(original).models.codex.used,5);
});

test('legacy and default inference count routine actions without quality as action attempts',t=>{
 const db=database();t.after(()=>db.close());const state=createState('routine-budget',75);
 const routine=jevRequest(state,actionFor(state,'lend_name'),BASE_PACK);
 assert.equal(Object.hasOwn(routine.questions,'quality'),false);
 const requests=[routine,{state:{action:{id:'lend_name'}}},{questions:{result_good:{type:'choice'}}},{questions:{rewrite_lend_name:{type:'choice'}}}];
 requests.forEach((request,index)=>insert(db,`routine-${index}`,'jev',{request}));
 const budget=ledger(db);
 for(let index=0;index<requests.length;index++){
  assert.equal(record(db,`routine-${index}`).budget.bucket,'action');
  assert.equal(budget.reserve({kind:'jev',payload:requests[index]}).budget.bucket,'action');
 }
 assert.equal(bucket(budget.snapshot(),'jev','action').used,8);assert.equal(bucket(budget.snapshot(),'jev','preflight').used,0);
});

test('nested readiness actions and probe question prefixes remain preflight attempts',t=>{
 const db=database();t.after(()=>db.close());const state=createState('readiness-budget',75);
 const probe=jevRequest(state,actionFor(state,'ask_shadow'),BASE_PACK),request=preflightRequest(BASE_PACK);
 request.state.opening_probe=probe.state;
 for(const [key,question] of Object.entries(probe.questions))request.questions[`probe_${key}`]=question;
 assert.ok(request.questions.probe_quality);assert.ok(request.questions.probe_result_good);
 insert(db,'readiness','jev',{request});const budget=ledger(db);
 assert.equal(record(db,'readiness').budget.bucket,'preflight');assert.equal(budget.reserve({kind:'jev',payload:request}).budget.bucket,'preflight');
 assert.equal(bucket(budget.snapshot(),'jev','action').used,0);assert.equal(bucket(budget.snapshot(),'jev','preflight').used,2);
});

test('observed tokens sum once and missing or null usage remains explicitly unknown',t=>{
 const db=database();t.after(()=>db.close());const budget=ledger(db);
 const missing=budget.reserve({kind:'jev',payload:{}});
 assert.deepEqual(budget.snapshot().models.jev.tokens,{input:null,output:null,unknownCalls:1});
 finish(db,missing.id,'error',{usage:null});
 const complete=budget.reserve({kind:'jev',payload:{}});finish(db,complete.id,'done',{usage:{input_tokens:12,output_tokens:3},result:{usage:{input_tokens:900,output_tokens:900}}});
 const nested=budget.reserve({kind:'jev',payload:{}});finish(db,nested.id,'done',{result:{usage:{input_tokens:8,output_tokens:2}}});
 const partial=budget.reserve({kind:'jev',payload:{}});finish(db,partial.id,'done',{usage:{input_tokens:0,output_tokens:null}});
 assert.deepEqual(budget.snapshot().models.jev.tokens,{input:20,output:5,unknownCalls:2});
 const zero=budget.reserve({kind:'codex',payload:{kind:'prepare'}});finish(db,zero.id,'done',{usage:{input_tokens:0,output_tokens:0}});
 assert.deepEqual(budget.snapshot().models.codex.tokens,{input:0,output:0,unknownCalls:0});
});

test('invalid request purpose, model and budget cannot write a reservation',t=>{
 const db=database();t.after(()=>db.close());const budget=ledger(db);
 for(const request of [{kind:'unknown',payload:{}},{kind:'toString',payload:{}},{kind:'jev',bucket:'opening',payload:{}},{kind:'codex',bucket:'__proto__',payload:{}},{kind:'codex',payload:{kind:'director',effort:'max'}},{kind:'codex',payload:{kind:'unknown'}},{kind:'jev',budgetId:'missing',payload:{}}])assert.throws(()=>budget.reserve(request));
 const circular={};circular.self=circular;assert.throws(()=>budget.reserve({kind:'jev',payload:circular}));
 assert.equal(db.prepare('SELECT count(*) n FROM calls').get().n,0);
 budget.reserve({kind:'jev',payload:{}});assert.equal(budget.snapshot().models.jev.used,1);
 assert.throws(()=>budget.snapshot('missing'));
});

test('policies validate exact model and bucket keys with nonnegative safe integer limits',t=>{
 const invalid=[];
 for(const value of [-1,.5,NaN,Infinity,'3',Number.MAX_SAFE_INTEGER+1]){const p=policy();p.models.jev.limit=value;invalid.push(p);}
 const extra=policy();extra.models.other={limit:1,buckets:{}};invalid.push(extra);
 const missing=policy();delete missing.models.codex.buckets.repair;invalid.push(missing);
 const unknown=policy();unknown.models.jev.buckets.other=1;invalid.push(unknown);
 const badVersion=policy();badVersion.version='';invalid.push(badVersion);
 const badPlanned=policy();badPlanned.plannedChoices=-1;invalid.push(badPlanned);
 for(const p of invalid){const db=database();try{assert.throws(()=>ledger(db,{policy:p}));assert.equal(db.prepare('SELECT count(*) n FROM calls').get().n,0);}finally{db.close();}}
 const db=database();t.after(()=>db.close());const zero=policy();zero.plannedChoices=0;zero.models.jev.limit=0;zero.models.jev.buckets.action=0;
 const budget=ledger(db,{policy:zero});assert.equal(budget.snapshot().models.jev.remaining,0);assert.throws(()=>budget.reserve({kind:'jev',payload:{}}),error=>error.code==='BUDGET_EXHAUSTED');
});

test('separate database connections see pending reservations before taking the last allowance',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rpg-budget-shared-')),filename=path.join(dir,'state.sqlite');
 const firstDb=database(filename),secondDb=database(filename);
 t.after(()=>{firstDb.close();secondDb.close();rmSync(dir,{recursive:true,force:true});});
 const first=ledger(firstDb,{policy:policy()}),second=ledger(secondDb,{policy:policy()});
 assert.equal(first.activeId(),second.activeId());
 first.reserve({kind:'jev',bucket:'preflight',payload:{}});
 assert.throws(()=>second.reserve({kind:'jev',bucket:'preflight',payload:{}}),error=>error.code==='BUDGET_EXHAUSTED');
 assert.equal(second.snapshot().models.jev.used,1);
 const replacement=second.newGame();assert.equal(first.activeId(),replacement);
 assert.equal(first.snapshot().models.jev.used,0);
});

test('invalid legacy migration rolls back every adoption and does not create an empty replacement budget',t=>{
 const db=database();t.after(()=>db.close());
 const original={request:{kind:'prepare'},result:{untouched:true}};
 insert(db,'valid','codex',original);insert(db,'invalid','unknown',{request:{}},'error');
 assert.throws(()=>ledger(db),/预算模型/);
 assert.deepEqual(record(db,'valid'),original);assert.equal(db.prepare('SELECT count(*) n FROM kv').get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='budgets'").get().n,0);
});

test('legacy overages stay visible and exhausted instead of dropping records to fit the policy',t=>{
 const db=database();t.after(()=>db.close());
 for(let i=0;i<5;i++)insert(db,`legacy-${i}`,'jev',{request:{questions:{quality:{}}}},'error');
 const budget=ledger(db,{policy:policy()}),snapshot=budget.snapshot();
 assert.equal(snapshot.models.jev.used,5);assert.equal(snapshot.models.jev.remaining,0);
 assert.equal(bucket(snapshot,'jev','action').used,5);assert.equal(bucket(snapshot,'jev','action').remaining,0);
 assert.throws(()=>budget.reserve({kind:'jev',bucket:'recovery',payload:{}}),error=>error.code==='BUDGET_EXHAUSTED');
 assert.equal(db.prepare('SELECT count(*) n FROM calls').get().n,5);
});
