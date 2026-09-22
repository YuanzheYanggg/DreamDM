import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {Runtime} from './live/runtime.mjs';
const root=new URL('./',import.meta.url);
const types={'index.html':'text/html; charset=utf-8','styles.css':'text/css; charset=utf-8','app.mjs':'text/javascript; charset=utf-8','game.mjs':'text/javascript; charset=utf-8','story.mjs':'text/javascript; charset=utf-8'};
const port=Number(process.env.RPG_PORT||4317);
export function createServer(runtime){
const owned=!runtime;
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const host=req.headers.host,expected=`127.0.0.1:${req.socket.localPort}`;
 if(host!==expected){send(403,{error:'仅允许本机同源访问。'});return;}
 if(req.headers.origin&&req.headers.origin!==`http://${expected}`){send(403,{error:'不允许跨站操作本地旅程。'});return;}
 if(path==='/health'&&req.method==='GET'){send(200,{ok:true,mode:'local-rpg-with-live-runtime'});return;}
 if(path.startsWith('/api/')){
  try{
   // Defer recovery until a request proves that this server owns its port.
   runtime??=new Runtime();
   if(req.method==='GET'&&path==='/api/live'){send(200,runtime.snapshot());return;}
   if(req.method==='GET'&&path==='/api/live/export'){send(200,runtime.export());return;}
   if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(405,{error:'请使用同源 JSON 请求。'});return;}
   let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>1_100_000){send(413,{error:'请求过大。'});return;}chunks.push(chunk);}
   const input=JSON.parse(Buffer.concat(chunks).toString());
   const handlers={'/api/live/start':'start','/api/live/choose':'choose','/api/live/retry':'retry','/api/live/item':'item','/api/live/director':'director','/api/live/import':'import'};
   const method=handlers[path];if(!method){send(404,{error:'接口不存在。'});return;}
   send(['start','choose','retry','director'].includes(method)?202:200,runtime[method](input));
  }catch(e){send(400,{error:e instanceof SyntaxError?'JSON 格式无效。':e.message});}return;
 }
 const name=path==='/'?'index.html':path.slice(1);
 if(!Object.hasOwn(types,name)||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
 try{const data=await readFile(new URL(name,root));res.writeHead(200,{'Content-Type':types[name],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:data);}
 catch{res.writeHead(500);res.end('Unable to load prototype');}
});
server.on('close',()=>{if(owned&&runtime)runtime.close();});
return server;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createServer();
 server.on('error',error=>{console.error(`Preview unavailable: ${error.message}`);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log(`Earth Online: http://127.0.0.1:${port}`));
}
