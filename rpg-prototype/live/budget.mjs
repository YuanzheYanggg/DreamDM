import {randomUUID} from 'node:crypto';

const LABELS={
 jev:{preflight:'开局检查',action:'行动裁定',checkpoint:'阶段复核',recovery:'失败恢复'},
 codex:{opening:'开场准备',director_low:'轻量导演',director_medium:'常规导演',director_high:'深入导演',repair:'剧本修订'}
};
function freeze(value){for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);}
export const DEFAULT_POLICY=freeze({
 version:'session-v1',plannedChoices:100,
 models:{
  jev:{limit:130,buckets:{preflight:6,action:100,checkpoint:4,recovery:20}},
  codex:{limit:18,buckets:{opening:4,director_low:6,director_medium:4,director_high:2,repair:2}}
 }
});
const ACTIVE_KEY='budget.active',MIGRATED_KEY='budget.migrated';
const json=JSON.stringify;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
function ensure(condition,message){if(!condition)throw Error(message);}
function exactKeys(value,keys){return object(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');}
function validatePolicy(policy){
 ensure(exactKeys(policy,['version','plannedChoices','models']),'预算规则字段不合法。');
 ensure(typeof policy.version==='string'&&policy.version.trim().length>0&&policy.version.length<=100,'预算规则版本不合法。');
 ensure(integer(policy.plannedChoices),'预算计划行动数应为非负安全整数。');
 ensure(exactKeys(policy.models,Object.keys(LABELS)),'预算模型字段不合法。');
 for(const [kind,labels] of Object.entries(LABELS)){
  const model=policy.models[kind];
  ensure(exactKeys(model,['limit','buckets'])&&integer(model.limit),'预算模型上限应为非负安全整数。');
  ensure(exactKeys(model.buckets,Object.keys(labels)),'预算用途字段不合法。');
  for(const limit of Object.values(model.buckets))ensure(integer(limit),'预算用途上限应为非负安全整数。');
 }
 return structuredClone(policy);
}
function purpose(kind,bucket,payload){
 ensure(typeof kind==='string'&&Object.hasOwn(LABELS,kind),'预算模型不合法。');
 if(bucket===undefined){
  if(kind==='jev'){
   // Routine actions have no quality score. Only inspect the selected action
   // and top-level questions; readiness embeds opening_probe and probe_* keys.
   const hasAction=object(payload?.state)&&Object.hasOwn(payload.state,'action');
   const hasActionQuestion=object(payload?.questions)&&Object.keys(payload.questions).some(key=>key==='quality'||/^(result|rewrite)_.+/.test(key));
   bucket=hasAction||hasActionQuestion?'action':'preflight';
  }
  else if(payload?.kind==='prepare')bucket='opening';
  else if(payload?.kind==='editorial_repair')bucket='repair';
  else if(payload?.kind==='director')bucket=`director_${payload.effort}`;
 }
 ensure(typeof bucket==='string'&&Object.hasOwn(LABELS[kind],bucket),'预算用途不合法。');
 return bucket;
}
function tokenValue(usage,key){const value=usage?.[key];return integer(value)?value:null;}

// Reservation and evidence share one transaction, so in-flight calls already
// consume allowance before a provider can run. Finishing a call never refunds it.
export class BudgetLedger {
 #db;
 #nextPolicy;
 constructor(db,{policy=DEFAULT_POLICY}={}){
  this.#db=db;this.#nextPolicy=validatePolicy(policy);
  this.#transaction(()=>{
   db.exec('CREATE TABLE IF NOT EXISTS budgets(id TEXT PRIMARY KEY,policy TEXT NOT NULL,created TEXT NOT NULL)');
   const migrated=this.#get(MIGRATED_KEY);
   let id=this.#get(ACTIVE_KEY);
   if(id===null){ensure(migrated===null,'当前预算记录缺失，不能自动重置。');id=this.#create();}
   this.#policy(id);
   if(migrated===null){
    for(const row of db.prepare('SELECT id,kind,record FROM calls').all()){
     const record=JSON.parse(row.record);ensure(object(record),'历史预算调用记录不合法。');
     if(record.budget!=null)continue;
     record.budget={id,bucket:purpose(row.kind,undefined,record.request)};
     db.prepare('UPDATE calls SET record=? WHERE id=?').run(json(record),row.id);
    }
    this.#set(MIGRATED_KEY,true);
   }
  });
 }
 #transaction(fn){
  this.#db.exec('BEGIN IMMEDIATE');
  try{const result=fn();this.#db.exec('COMMIT');return result;}
  catch(error){this.#db.exec('ROLLBACK');throw error;}
 }
 #get(key){const row=this.#db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(row.value):null;}
 #set(key,value){this.#db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,json(value));}
 #policy(id){
  ensure(typeof id==='string'&&id.length>0,'预算编号不合法。');
  const row=this.#db.prepare('SELECT policy FROM budgets WHERE id=?').get(id);ensure(row,'找不到这份预算。');
  return validatePolicy(JSON.parse(row.policy));
 }
 #create(){
  const id=randomUUID();this.#db.prepare('INSERT INTO budgets(id,policy,created) VALUES(?,?,?)').run(id,json(this.#nextPolicy),new Date().toISOString());
  this.#set(ACTIVE_KEY,id);return id;
 }
 activeId(){const id=this.#get(ACTIVE_KEY);ensure(typeof id==='string'&&id.length>0,'当前预算记录缺失。');return id;}
 newGame(){return this.#transaction(()=>this.#create());}
 reserve({kind,bucket,budgetId,payload}){
  bucket=purpose(kind,bucket,payload);
  ensure(payload!==undefined,'预算调用缺少请求内容。');
  return this.#transaction(()=>{
   budgetId??=this.activeId();
   const snapshot=this.snapshot(budgetId),model=snapshot.models[kind],allocation=model.buckets.find(item=>item.id===bucket);
   if(model.remaining===0||allocation.remaining===0){
    const error=Error(`${kind==='jev'?'Jev':'Codex'} ${allocation.label}预算已用尽；本次请求未发出。`);
    error.code='BUDGET_EXHAUSTED';error.budgetId=budgetId;error.kind=kind;error.bucket=bucket;throw error;
   }
   const reservation={id:randomUUID(),created:new Date().toISOString(),budget:{id:budgetId,bucket}};
   this.#db.prepare('INSERT INTO calls(id,kind,status,created,record) VALUES(?,?,?,?,?)').run(reservation.id,kind,'running',reservation.created,json({request:payload,budget:reservation.budget}));
   return reservation;
  });
 }
 snapshot(budgetId=this.activeId()){
  const policy=this.#policy(budgetId),models={};
  for(const [kind,model] of Object.entries(policy.models))models[kind]={
   used:0,limit:model.limit,remaining:model.limit,
   buckets:Object.entries(model.buckets).map(([id,limit])=>({id,label:LABELS[kind][id],used:0,limit,remaining:limit})),
   tokens:{input:null,output:null,unknownCalls:0}
  };
  for(const row of this.#db.prepare('SELECT kind,record FROM calls').all()){
   const record=JSON.parse(row.record);
   if(record.budget?.id!==budgetId)continue;
   const bucket=purpose(row.kind,record.budget.bucket,record.request),model=models[row.kind],allocation=model.buckets.find(item=>item.id===bucket);
   model.used++;allocation.used++;
   const usage=record.usage??record.result?.usage,input=tokenValue(usage,'input_tokens'),output=tokenValue(usage,'output_tokens');
   if(input!==null)model.tokens.input=(model.tokens.input??0)+input;
   if(output!==null)model.tokens.output=(model.tokens.output??0)+output;
   if(input===null||output===null)model.tokens.unknownCalls++;
  }
  for(const model of Object.values(models)){
   model.remaining=Math.max(0,model.limit-model.used);
   for(const allocation of model.buckets)allocation.remaining=Math.max(0,allocation.limit-allocation.used);
   if(model.used===0)model.tokens={input:0,output:0,unknownCalls:0};
  }
  return {id:budgetId,version:policy.version,plannedChoices:policy.plannedChoices,models};
 }
}
