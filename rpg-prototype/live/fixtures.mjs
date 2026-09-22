// Local test fixture; never used by the production runtime as a model fallback.
export function responseFor(request,{quality=[.35,.45,.2],consistent=.99,need=.05,continuation='prepared'}={}){
 return {model:'fixture-only',answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>{
  if(q.type==='noul')return [key,{type:'noul',noul:key.startsWith('mainline_need_')?need:consistent}];
  if(q.type==='score')return [key,{type:'score',score:quality[1]+2*quality[2],probabilities:Object.fromEntries(quality.map((n,i)=>[i,n])),confidence:.4,legend:{0:'bad',1:'mixed',2:'good'}}];
  const ids=Object.keys(q.criteria),choice=key.startsWith('continuation_')?continuation:ids[0];
  return [key,{type:'choice',choice,probabilities:Object.fromEntries(ids.map(id=>[id,id===choice?1:0])),confidence:1}];
 })),usage:{input_tokens:0,output_tokens:0}};
}

// These deliberately simple assertions exercise transport/contracts, not creative correctness.
export function reviewFor({schema,reviewContext}){
 const script=reviewContext.script;
 return {checks:Object.fromEntries(Object.keys(schema.properties.checks.properties).map(key=>[key,{verdict:'consistent',scriptQuote:script.scenes?script.scenes.market.paragraphs[0]:script.draft.replacement.paragraphs[0],ruleQuote:reviewContext.rules.world.rules[0],reason:'Fixture: evidence is present; semantic review is not simulated.'}]))};
}
