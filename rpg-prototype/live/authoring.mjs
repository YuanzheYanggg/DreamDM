import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {CANON,ACTIONS,preflightRequest} from './world.mjs';

const json=JSON.stringify;
const digest=value=>createHash('sha256').update(json(value)).digest('hex');
const textLeaves=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(textLeaves):[];
const objectKeys=value=>value&&typeof value==='object'?Object.keys(value).concat(Object.values(value).flatMap(objectKeys)):[];

// Quotes must point to a real prose leaf or to a JSON fragment whose values occur together.
export function hasEvidence(source,quote){
 if(typeof quote!=='string'||quote.length<4)return false;
 if(objectKeys(source).includes(quote))return false;
 if(textLeaves(source).some(text=>text.includes(quote)))return true;
 let fragment;
 try{fragment=JSON.parse(quote);}catch{try{fragment=JSON.parse(`{${quote}}`);}catch{return false;}}
 if(!fragment||typeof fragment!=='object'||Array.isArray(fragment)||!Object.keys(fragment).length)return false;
 const matches=node=>node&&typeof node==='object'&&(Object.entries(fragment).every(([key,value])=>Object.hasOwn(node,key)&&isDeepStrictEqual(node[key],value))||Object.values(node).some(matches));
 return !!matches(source);
}

const findingTemplate=()=>({verdict:'',scriptQuote:'',ruleQuote:'',reason:''});
const draftChecks={
 future_history:'Does the future replacement follow only the supplied history and avoid assuming optional events that have not occurred?',
 fixed_rules:'Does the replacement preserve the supplied world laws and fixed runtime rules?',
 outcome_effects:'Does the replacement avoid changing the fixed choices, outcomes, costs, and effects?',
 failure_route:'Does the replacement preserve the stated route after a failure and avoid narrating a failure as success?',
 branch_reconvergence:'Can this prose fit every legal branch that may reach the target, without treating mutually exclusive branches as simultaneous?',
 player_agency:'Does the replacement leave the player-facing choices and endings to the player, without deciding them in advance?'
};

function rulesFor(pack){
 const request=preflightRequest(pack);
 return {world:CANON,mechanics:ACTIONS,runtime:request.state.runtime_contract};
}

function fullPropositions(pack){
 const legacy=preflightRequest(pack);
 return Object.fromEntries(Object.entries(legacy.questions).map(([key,question])=>{
  const {type,criteria,...review}=question;
  return [key,review];
 }));
}

function exactObject(value,keys,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==[...keys].sort().join())throw Error(`作者审查结果结构不符合约束：${label}`);
}

function validateReview(result,keys,evidence){
 exactObject(result,['checks'],'result');
 exactObject(result.checks,keys,'checks');
 for(const key of keys){
  const finding=result.checks[key];
  exactObject(finding,['verdict','scriptQuote','ruleQuote','reason'],`checks.${key}`);
  if(!['consistent','contradiction','uncertain'].includes(finding.verdict))throw Error(`作者审查结论不合法：${key}。`);
  if(typeof finding.reason!=='string'||!finding.reason.trim())throw Error(`作者审查理由缺失：${key}。`);
  if(!hasEvidence(evidence.script,finding.scriptQuote)||!hasEvidence(evidence.rules,finding.ruleQuote))throw Error(`作者审查缺少有效原文引文：${key}。`);
  if(finding.verdict!=='consistent')throw Error(`作者审查仍有疑点：${key}（${finding.verdict}）。`);
 }
 return result;
}

export function authorAudit(pack,{draft=null,history=null}={}){
 const rules=rulesFor(pack);
 const isDraft=draft!==null;
 const propositions=isDraft?draftChecks:fullPropositions(pack);
 const keys=Object.keys(propositions);
 const evidence=isDraft?{script:{draft,history},rules}:{script:pack,rules};
 const template={checks:Object.fromEntries(keys.map(key=>[key,findingTemplate()]))};
 const schema={type:'object',additionalProperties:false,required:['checks'],properties:{checks:{type:'object',additionalProperties:false,required:keys,properties:Object.fromEntries(keys.map(key=>[key,{type:'object',additionalProperties:false,required:['verdict','scriptQuote','ruleQuote','reason'],properties:{verdict:{type:'string',enum:['consistent','contradiction','uncertain']},scriptQuote:{type:'string'},ruleQuote:{type:'string'},reason:{type:'string'}}}]))}}};
 const scope=isDraft?'只审阅这份尚未展示的未来草稿；不得把整章当作审查对象。':'审阅整章剧本。';
 const prompt=`你是中文互动小说的主导演与一致性审稿人。${scope}直接返回指定 JSON；不使用工具、不调用外部服务、不改写剧本。每项逐一给出 verdict、scriptQuote、ruleQuote 与 reason。scriptQuote 和 ruleQuote 必须是下方证据里的连续原文，至少四个字符；也可使用与证据中完整结构值一致的 JSON 片段。不能只引用字段名、概括、改写或虚构引文。只有证据明确支持时才能填 consistent；直接冲突填 contradiction；证据不足填 uncertain。所有世界法律、已发生历史、固定效果、失败路线、分支重新汇合、结局和玩家选择权都必须保持一致。\n审查命题：${json(propositions)}\n剧本证据：${json(evidence.script)}\n固定规则证据：${json(evidence.rules)}\n输出结构：${json(template)}`;
 const signature=digest({version:'astra-author-audit-v1',pack,rules,draft,history,propositions,evidence});
 return {prompt,schema,signature,evidence,validate:result=>validateReview(result,keys,evidence)};
}
