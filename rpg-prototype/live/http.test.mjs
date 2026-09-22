import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
test('HTTP serves the playable app while keeping state files private and rejecting cross-site mutations',async()=>{
 let writes=0;const server=createServer({snapshot:()=>({state:null}),start:()=>{writes++;return {ok:true};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(`${url}/health`)).status,200);
  const page=await fetch(url);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);
  for(const endpoint of ['/live/runtime.mjs','/live/providers.mjs','/runs/rpg-live/state.sqlite'])assert.equal((await fetch(url+endpoint)).status,404);
  const post=origin=>fetch(`${url}/api/live/start`,{method:'POST',headers:{'content-type':'application/json',origin},body:'{}'});
  assert.equal((await post('https://elsewhere.example')).status,403);assert.equal(writes,0);
  assert.equal((await post(url)).status,202);assert.equal(writes,1);
  assert.equal((await fetch(`${url}/api/live/start`,{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,405);assert.equal(writes,1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
