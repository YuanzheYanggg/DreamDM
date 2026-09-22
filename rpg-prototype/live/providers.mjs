import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {provider} from './typesafe.mjs';
export async function jev(request){const started=Date.now();const result=await provider('systemone',request);return {result,ms:Date.now()-started};}
export async function codex({prompt,schema,effort='medium',timeoutMs=300000}){
 if(!['low','medium','high'].includes(effort))throw Error('不支持的导演推理档位');
 const dir=await mkdtemp(path.join(tmpdir(),'earth-online-dm-'));
 const schemaFile=path.join(dir,'response.schema.json'),output=path.join(dir,'response.json');
 await writeFile(schemaFile,JSON.stringify(schema),{mode:0o600});
 const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--cd',dir,'--model','gpt-6-astra','--color','never','--json','--output-schema',schemaFile,'--output-last-message',output,
  ...['shell_tool','unified_exec','apps','multi_agent','plugins','memories','browser_use','computer_use','image_generation','hooks'].flatMap(feature=>['--disable',feature]),
  '-c',`model_reasoning_effort="${effort}"`,'-c','project_doc_max_bytes=0','-c','web_search="disabled"',
  '-c','model_provider="rpg_openai"',
  '-c','model_providers.rpg_openai={name="OpenAI",requires_openai_auth=true,wire_api="responses",request_max_retries=0,stream_max_retries=0}',
  '-c','developer_instructions="You are a fiction director. Output only the required JSON. No tools, filesystem access, research, coding, or subprocesses. Use only the supplied game data."','-'];
 const env=Object.fromEntries(['PATH','HOME','CODEX_HOME','LANG','LC_ALL','HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY','https_proxy','http_proxy','all_proxy','no_proxy','TMPDIR'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
 const started=Date.now();let usage=null,model='gpt-6-astra',events=[],stderr='';
 try{
  await new Promise((resolve,reject)=>{
   const child=spawn(process.env.RPG_CODEX_BIN||'codex',args,{env,stdio:['pipe','pipe','pipe']});let buffer='',size=0,settled=false;
   const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
   const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('Codex 生成超时，未自动重试。'));},timeoutMs);
   child.on('error',()=>finish(Error('无法启动已登录的 Codex CLI。')));
   child.stdout.on('data',chunk=>{
    size+=chunk.length;if(size>2_000_000){child.kill('SIGKILL');finish(Error('Codex 输出超过本章上限。'));return;}
    buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop();
    for(const line of lines){try{const event=JSON.parse(line);if(event.type==='turn.completed')usage=event.usage;
     if(event.item&&['command_execution','mcp_tool_call','web_search','file_change'].includes(event.item.type)){child.kill('SIGKILL');finish(Error('主持生成尝试使用工具，任务已停止。'));return;}
     if(event.type==='error'||event.type==='turn.failed')events.push(event.type);
    }catch{ /* non-event diagnostics are not sent to the UI */ }}
   });
   child.stderr.on('data',chunk=>{if(stderr.length<4000)stderr+=chunk.toString();});
   child.on('close',code=>finish(code===0?null:Error(`Codex 生成未完成（退出码 ${code??'unknown'}），未自动重试。${events.length?'服务返回失败事件。':''}`)));
   child.stdin.on('error',()=>{});child.stdin.end(prompt);
  });
  let result;try{result=JSON.parse(await readFile(output,'utf8'));}catch{throw Error('Codex 没有返回有效的结构化剧本，未自动重试。');}
  return {result,ms:Date.now()-started,model,effort,usage};
 }finally{await rm(dir,{recursive:true,force:true});}
}
