import {writeFileSync,readFileSync,linkSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

// Publish a complete owner record atomically. A second process must never
// interpret another live process's pending job as a crashed request.
export function databaseLock(filename){
 if(filename===':memory:')return ()=>{};
 const lock=`${filename}.lock`,recovery=`${lock}.recovery`;
 const record=JSON.stringify({pid:process.pid,token:randomUUID()}),temp=`${lock}.${randomUUID()}.tmp`;
 writeFileSync(temp,record,{flag:'wx',mode:0o600});
 const read=file=>{try{return readFileSync(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const removeOwn=file=>{if(read(file)===record)unlinkSync(file);};
 const ownerIsDead=raw=>{
  let owner;try{owner=JSON.parse(raw);}catch{return false;}
  if(!Number.isInteger(owner.pid)||owner.pid<=0)return false;
  try{process.kill(owner.pid,0);return false;}catch(e){return e.code==='ESRCH';}
 };
 const occupied=()=>Error('另一个游戏服务正在使用此数据库。请使用已打开的页面，或先停止原服务。');
 try{
  try{linkSync(temp,lock);}catch(error){
   if(error.code!=='EEXIST')throw error;
   // Serialize stale-owner recovery. An interrupted recovery fails closed.
   try{linkSync(temp,recovery);}catch(e){if(e.code==='EEXIST')throw occupied();throw e;}
   try{
    const previous=read(lock);
    if(previous!==null){if(!ownerIsDead(previous))throw occupied();unlinkSync(lock);}
    try{linkSync(temp,lock);}catch(e){if(e.code==='EEXIST')throw occupied();throw e;}
   }finally{removeOwn(recovery);}
  }
  return ()=>removeOwn(lock);
 }finally{unlinkSync(temp);}
}
