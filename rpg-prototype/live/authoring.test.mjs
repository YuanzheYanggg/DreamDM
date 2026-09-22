import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_PACK,ACTIONS,preflightRequest} from './world.mjs';
import {authorAudit,hasEvidence} from './authoring.mjs';

const clone=value=>structuredClone(value);
function compatibleResult(audit){
 const checks={};
 for(const key of Object.keys(audit.schema.properties.checks.properties))checks[key]={
  verdict:'consistent',scriptQuote:audit.evidence.script.scenes?audit.evidence.script.scenes.market.paragraphs[0]:audit.evidence.script.draft.replacement.paragraphs[0],
  ruleQuote:audit.evidence.rules.world.rules[0],
  reason:'The quoted future prose remains compatible with the fixed rule.'
 };
 return {checks};
}

test('full-chapter author audit exposes the legacy propositions without a Jev request contract',()=>{
 const audit=authorAudit(BASE_PACK);
 const legacy=preflightRequest(BASE_PACK);
 assert.deepEqual(Object.keys(audit.schema.properties.checks.properties),Object.keys(legacy.questions));
 assert.deepEqual(audit.evidence.script,BASE_PACK);
 assert.equal(audit.evidence.rules.world.rules[0],'名字可自愿借出，有归还期限。影子保留旧主人的记忆。');
 assert.match(audit.prompt,/世界法律/);
 assert.doesNotMatch(audit.prompt,/jev|noul|criteria|model/i);
 assert.equal(audit.prompt.includes(JSON.stringify(BASE_PACK)),true);
 assert.equal(audit.prompt.includes(JSON.stringify(audit.evidence.rules)),true);
 for(const proposition of Object.values(legacy.questions))assert.equal(audit.prompt.includes('"type"'),false);
});

test('draft author audit scopes evidence to the future replacement, history, and fixed rules',()=>{
 const draft={target:'raven',original:BASE_PACK.scenes.raven,replacement:{title:'月下的约定',paragraphs:['渡鸦停在河岸，等待旅人自己决定是否接过银羽。']},choices:BASE_PACK.scenes.raven.choices};
 const history={flags:{alias:true},journal:[{outcome:'商人写下借据。'}]};
 const audit=authorAudit(BASE_PACK,{draft,history});
 const keys=Object.keys(audit.schema.properties.checks.properties);
 assert.deepEqual(keys,['future_history','fixed_rules','outcome_effects','failure_route','branch_reconvergence','player_agency']);
 assert.deepEqual(audit.evidence.script,{draft,history});
 assert.equal(audit.prompt.includes(JSON.stringify(BASE_PACK.outcomes)),false);
 assert.equal(audit.prompt.includes(JSON.stringify(history)),true);
 assert.equal(audit.prompt.includes(JSON.stringify(draft)),true);
});

test('validation requires the exact keys, supported quotes, and every consistent verdict',()=>{
 const audit=authorAudit(BASE_PACK);
 const result=compatibleResult(audit);
 assert.deepEqual(audit.validate(result),result);
 const missing=clone(result);delete missing.checks.world_rules;assert.throws(()=>audit.validate(missing),/结构/);
 const uncertain=clone(result);uncertain.checks.world_rules.verdict='uncertain';assert.throws(()=>audit.validate(uncertain),/world_rules/);
 const invented=clone(result);invented.checks.world_rules.scriptQuote='虚构的剧本原文';assert.throws(()=>audit.validate(invented),/引文/);
 const keyOnly=clone(result);keyOnly.checks.world_rules.ruleQuote='world';assert.throws(()=>audit.validate(keyOnly),/引文/);
});

test('evidence accepts actual leaves or full matching JSON fragments but never keys or partial values',()=>{
 const effect=ACTIONS.use_evidence.tiers.good[0].effects;
 assert.equal(hasEvidence(ACTIONS,`"effects":${JSON.stringify(effect)}`),true);
 assert.equal(hasEvidence(ACTIONS,'"effects":{"item":"invented"}'),false);
 assert.equal(hasEvidence({world:'rules'},'world'),false);
 assert.equal(hasEvidence({world:'rules'},'"world"'),false);
 assert.equal(hasEvidence({world:'rules'},'rules'),true);
});

test('signature binds pack, fixed rules, draft, and history identity',()=>{
 const draft={target:'raven',original:BASE_PACK.scenes.raven,replacement:{title:'未来',paragraphs:['渡鸦等待选择。']},choices:BASE_PACK.scenes.raven.choices};
 const first=authorAudit(BASE_PACK,{draft,history:{flags:{alias:true}}});
 assert.equal(first.signature,authorAudit(BASE_PACK,{draft,history:{flags:{alias:true}}}).signature);
 const changedPack=clone(BASE_PACK);changedPack.title='另一段故事';assert.notEqual(first.signature,authorAudit(changedPack,{draft,history:{flags:{alias:true}}}).signature);
 assert.notEqual(first.signature,authorAudit(BASE_PACK,{draft,history:{flags:{alias:false}}}).signature);
 assert.notEqual(first.signature,authorAudit(BASE_PACK,{draft:{...draft,target:'archive'},history:{flags:{alias:true}}}).signature);
 const alteredDraft=clone(draft);alteredDraft.replacement.paragraphs[0]='渡鸦要求旅人归还羽毛。';
 assert.notEqual(first.signature,authorAudit(BASE_PACK,{draft:alteredDraft,history:{flags:{alias:true}}}).signature);
});
