import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_PACK,validateShape,preflightRequest,ACTIONS} from './world.mjs';
import {responseFor} from './fixtures.mjs';
const engine=await import('./engine.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('live engine exposes luck adjudication rather than legacy fixed D20',()=>assert.equal(typeof engine.luckResult,'function'));
test('luck preserves mass, improves tier monotonically and never enters a zero interval',()=>{
 assert.equal(typeof engine.luckResult,'function');
 for(const p of [[.35,.45,.2],[0,.6,.4],[.6,.4,0],[1,0,0],[0,1,0],[0,0,1]]){
  for(let f=0;f<10000;f+=37){
   const low=engine.luckResult(p,25,f),high=engine.luckResult(p,75,f);
   assert(high.index>=low.index);assert(p[high.index]>0);
   assert.equal(high.effective.reduce((a,b)=>a+b),100);
  }
 }
 assert.deepEqual(engine.luckResult([.35,.45,.2],75,7800).effective,[30,45,25]);
 assert.equal(engine.luckResult([.35,.45,.2],75,7800).tier,'good');
 assert.throws(()=>engine.luckResult([-.1,.9,.2],75,0));
});
test('Jev request excludes luck and does not mutate the frozen source state',()=>{
 const s=engine.createState('test',75),before=structuredClone(s),a=engine.actionFor(s,'ask_shadow');
 const request=engine.jevRequest(s,a,BASE_PACK);
 assert.equal('luck' in request.state.character,false);assert.equal('fortune' in request.state,false);
 assert.deepEqual(s,before);assert.deepEqual(new Set(Object.values(request.questions).map(q=>q.type)),new Set(['noul','score','choice']));
});
test('a consistent typed answer commits only the selected tier and retains earlier hooks',()=>{
 const s=engine.createState('test',75),a=engine.actionFor(s,'ask_shadow'),request=engine.jevRequest(s,a,BASE_PACK);
 const decision=engine.adjudicate(s,a,BASE_PACK,responseFor(request),7800,500);
 const next=engine.applyResult(s,a,decision,BASE_PACK);
 assert.equal(next.scene,'crossing');assert.equal(next.flags.shadow,true);assert.equal(next.character.energy,16);assert.equal(next.lastRoll.tier,'good');
 assert.equal(s.revision,0);assert.equal(next.journal.length,1);
 assert.equal(engine.publicState(next,BASE_PACK).sceneData.choices.length,3);
 assert.equal('outcomes' in engine.publicState(next,BASE_PACK),false);
});
test('fabricated provider outcomes never settle',()=>{
 const s=engine.createState('test'),a=engine.actionFor(s,'ask_shadow'),r=engine.jevRequest(s,a,BASE_PACK);
 const fake=responseFor(r);fake.answers.result_good.choice='invented';
 assert.throws(()=>engine.adjudicate(s,a,BASE_PACK,fake,7800));
 assert.equal(s.character.energy,18);
});
test('removing semantic review does not remove deterministic ending prerequisites',()=>{
 const s=engine.createState('missing-ledger');s.scene='bell';
 assert.throws(()=>engine.actionFor(s,'rewrite_pact'),/借名簿/);
 s.inventory.ledger=1;assert.equal(engine.actionFor(s,'rewrite_pact').disabled,false);
});
test('Jev no longer audits authored story consistency or vetoes legal choices on that score',()=>{
 const s=engine.createState('roles'),a=engine.actionFor(s,'lend_name'),r=engine.jevRequest(s,a,BASE_PACK),reply=responseFor(r);
 assert.equal(r.questions.consistent,undefined);assert.equal(r.questions.consistency_case,undefined);
 assert(!Object.keys(r.questions).some(key=>key.startsWith('rewrite_')));
 reply.answers.consistent={type:'noul',noul:0};
 const decision=engine.adjudicate(s,a,BASE_PACK,reply,100);
 assert.equal(engine.applyResult(s,a,decision,BASE_PACK).scene,'crossing');
});
test('future planning can use a prepared fallback and never rescinds the selected result',()=>{
 const s=engine.createState('fallback');s.scene='archive';s.character.energy=2;
 const a=engine.actionFor(s,'pick_lock'),r=engine.jevRequest(s,a,BASE_PACK),reply=responseFor(r,{quality:[1,0,0]});
 assert(r.state.after_each_outcome.lock_cut.availableRoutes.includes('ask_clerk'));
 const o=a.tiers.bad[0].id;reply.answers[`mainline_need_${o}`]={type:'noul',noul:1};
 const q=r.questions[`continuation_${o}`];reply.answers[`continuation_${o}`]={type:'choice',choice:'resource_low',confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k==='resource_low'?1:0]))};
 const d=engine.adjudicate(s,a,BASE_PACK,reply,0);assert.equal(d.effort,'none');assert.equal(d.replan.status,'covered_by_prepared');
 assert.equal(engine.applyResult(s,a,d,BASE_PACK).flags.lockTried,true);
});
test('a genuine uncovered state queues high planning only after the actual outcome',()=>{
 const s=engine.createState('gap');s.character.health=0;const a=engine.actionFor(s,'lend_name'),r=engine.jevRequest(s,a,BASE_PACK),reply=responseFor(r),o=a.tiers.good[0].id;
 reply.answers[`mainline_need_${o}`]={type:'noul',noul:.95};const q=r.questions[`continuation_${o}`];reply.answers[`continuation_${o}`]={type:'choice',choice:'resource_low',confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k==='resource_low'?1:0]))};
 const d=engine.adjudicate(s,a,BASE_PACK,reply,0);assert.equal(d.effort,'high');assert.equal(d.replan.requested,true);assert.equal(engine.applyResult(s,a,d,BASE_PACK).scene,'crossing');
});
test('one result can activate a side plot and record conditions alongside stats',()=>{
 const s=engine.createState('impact');s.scene='raven';const a=engine.actionFor(s,'accept_raven'),r=engine.jevRequest(s,a,BASE_PACK),d=engine.adjudicate(s,a,BASE_PACK,responseFor(r),0),next=engine.applyResult(s,a,d,BASE_PACK);
 assert.equal(next.character.abilities.意志,5);assert.equal(next.lastImpact.sideBranches[0].id,'raven_promise');assert(next.lastImpact.conditionsAdded.includes('raven'));assert(next.lastImpact.statusChanges.includes('意志 +1'));
});
test('missing planning answers and plans for an unrealized consequence cannot veto or schedule',()=>{
 const s=engine.createState('conditional'),a=engine.actionFor(s,'ask_shadow'),r=engine.jevRequest(s,a,BASE_PACK),reply=responseFor(r,{quality:[0,0,1]});
 reply.answers.mainline_need_shadow_fades={type:'noul',noul:1};
 delete reply.answers.mainline_need_shadow_trust;
 const d=engine.adjudicate(s,a,BASE_PACK,reply,0);
 assert.equal(d.outcomeId,'shadow_trust');assert.equal(d.effort,'none');assert.equal(d.replan.status,'unavailable');
 assert.equal(engine.applyResult(s,a,d,BASE_PACK).scene,'crossing');
});
test('a strong character is covered when the author specified no upper resource limit',()=>{
 const s=engine.createState('strong');s.character.coins=999;const a=engine.actionFor(s,'lend_name'),r=engine.jevRequest(s,a,BASE_PACK);
 const d=engine.adjudicate(s,a,BASE_PACK,responseFor(r,{need:1,continuation:'resource_high'}),0);
 assert.equal(d.effort,'none');assert.equal(d.replan.status,'covered_by_prepared');
});
test('contradictory Score metadata is rejected without changing the player',()=>{
 const s=engine.createState('test'),a=engine.actionFor(s,'ask_shadow'),r=engine.jevRequest(s,a,BASE_PACK),reply=responseFor(r);
 reply.answers.quality.score=0;assert.throws(()=>engine.adjudicate(s,a,BASE_PACK,reply,7800));
 assert.equal(s.revision,0);
});
test('failed archive lock preserves a free route and prevents repeated risky farming',()=>{
 const s=engine.createState('test');s.scene='archive';s.character.coins=0;
 const a=engine.actionFor(s,'pick_lock'),r=engine.jevRequest(s,a,BASE_PACK);
 const next=engine.applyResult(s,a,engine.adjudicate(s,a,BASE_PACK,responseFor(r,{quality:[1,0,0]}),0),BASE_PACK);
 assert.equal(next.scene,'archive');assert.throws(()=>engine.actionFor(next,'pick_lock'));
 const safe=engine.actionFor(next,'ask_clerk');assert.equal(safe.disabled,false);
 const done=engine.applyResult(next,safe,engine.adjudicate(next,safe,BASE_PACK,responseFor(engine.jevRequest(next,safe,BASE_PACK)),0),BASE_PACK);
 assert.equal(done.scene,'bell');assert.equal(done.inventory.ledger,1);
});
test('Astra packet has exact keys and bounds, preventing arbitrary new mechanics',()=>{
 validateShape(BASE_PACK);const bad=structuredClone(BASE_PACK);bad.outcomes.system_command='bad';assert.throws(()=>validateShape(bad));
});
test('chapter preflight identifies each scene history and each action effect independently',()=>{
 const r=preflightRequest(BASE_PACK);
 for(const scene of Object.keys(BASE_PACK.scenes))assert(r.questions[`history_${scene}`]);
 for(const action of Object.values(ACTIONS))for(const outcome of Object.values(action.tiers).flat())assert(r.questions[`effect_${outcome.id}`]);
 assert.equal(r.state.script,undefined,'unrelated scenes must not contaminate each bounded question');
 assert.equal(r.questions.optional_history,undefined);assert.equal(r.questions.outcome_effects,undefined);
});
test('action review includes actual route prerequisites and a finite ending horizon',()=>{
 const s=engine.createState('route');s.scene='archive';s.flags.shadow=true;
 const r=engine.jevRequest(s,engine.actionFor(s,'use_evidence'),BASE_PACK);
 assert.equal(r.state.runtime_contract.entry_evidence.shadow,true);
 assert.equal(r.state.runtime_contract.entry_evidence.receipt,false);
 assert.equal(r.state.pacing.hasEnding,true);
 assert.match(r.state.runtime_contract.action_rule,/暗门/);
});
test('every reachable legal outcome retains a finite route to a player-chosen ending',()=>{
 let endings=0,transitions=0;const visited=new Set();
 function walk(s){
  assert(s.turn<=6,'short chapter must finish within six choices');
  if(s.scene==='ending'){endings++;assert(s.flags.ending);return;}
  const key=JSON.stringify([s.scene,s.flags,s.inventory,s.character]);if(visited.has(key))return;visited.add(key);
  const choices=engine.available(s).filter(a=>!a.disabled);assert(choices.length>0,'no soft lock');
  for(const a of choices)for(const options of Object.values(a.tiers))for(const outcome of options){
   const next=engine.applyResult(s,a,{outcomeId:outcome.id,roll:null,effort:'none'},BASE_PACK);transitions++;
   assert(next.character.energy>=0);assert(next.character.health>0);assert(next.character.coins>=0);
   walk(next);
  }
 }
 walk(engine.createState('all-routes'));assert(endings>3);assert(transitions>100);
});
