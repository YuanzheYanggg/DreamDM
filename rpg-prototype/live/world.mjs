import {scenes,endings} from '../story.mjs';
export const STAGES=['market','crossing','raven','archive','bell','ending'];
export const CANON={world:'mistport-names.live.v1',rules:['名字可自愿借出，有归还期限。影子保留旧主人的记忆。','钟楼用借来的名字抵挡海雾，守钟人撕去了归还条款。此真相到档案馆后才能揭晓。','主角林照是旅人。NPC 只能依据亲眼所见或获告知的事实反应。','旧铜钥匙、绰号借据、无名旧信、影子暗门或商人信任可影响入馆方式。','有限短篇，约5–6次剧情选择。结局由玩家决定；失败可以走另一条路。'],hooks:['市集取得的信任、借据或暗门线索，在档案馆提供特殊入口。','收下渡鸦银羽，必须在钟顶让它看见月亮，然后归还。']};
const o=(id,text,effects={})=>({id,text,effects});
const routine=(stage,title,meta,good,cost={})=>({stage,title,meta,cost,kind:'routine',tiers:{good}});
const risk=(stage,title,meta,skill,tiers,cost={})=>({stage,title,meta,skill,cost,kind:'risk',tiers});
export const ACTIONS={
 lend_name:routine('market','借他一个小时候的绰号','留下借据 · 普通行动',[o('alias_receipt','你借出绰号「小满」。商人写下明早归还的借据，钟楼轻响一声。',{item:'receipt',flag:'alias',clue:'借据盖着钟楼的圆印，约定明早归还。'})]),
 ask_shadow:risk('market','向影子打听名字的去向','洞察 · 精力 −2 · 可能承受额外压力','洞察',{
  bad:[o('shadow_fades','影子缩回商人脚下。你没有得到回答，远处的钟声让你心头一紧。',{stress:1}),o('shadow_wait','影子始终不肯停下。你等了片刻，只能沿着人人看向的钟楼继续走。',{minutes:5})],
  mixed:[o('shadow_door','影子匆忙画出档案馆暗门的位置。钟响时它猛地消失，留下让人不安的凉意。',{flag:'shadow',stress:1,clue:'影子画出了钟楼档案馆的暗门。'}),o('shadow_tired','你追着影子走过一段湿冷石阶，终于辨出它指出的档案馆暗门。',{flag:'shadow',energy:-1,clue:'影子指出了档案馆的暗门。'})],
  good:[o('shadow_trust','影子在地上画出档案馆的暗门，又向你微微欠身。你终于有了明确的方向。',{flag:'shadow',stress:-1,clue:'影子的旧主人曾在档案馆工作，它记得暗门。'}),o('shadow_sketch','影子扶住你手记的一角，让你拓下完整的暗门图。辨认残缺线条的经验留在了指尖。',{flag:'shadow',ability:'洞察',clue:'手记收录了档案馆暗门图。'})]
 },{energy:2}),
 buy_letter:routine('market','买下那封没有收件人的旧信','铜币 −3 · 普通交易',[o('letter_bought','你付钱买下旧信。信角有档案馆的通行章，里面写着：名字被拿去抵债了。',{item:'letter',clue:'旧信提示名字被拿去抵债，通行章仍然有效。'})],{coins:3}),
 help_find:routine('market','陪商人找一个还记得他的人','关系 · 时间 +15 分钟',[o('merchant_friend','老妇人认出了商人修伞的手。他愿意陪你去钟楼，为你作证。',{flag:'friend',minutes:10,clue:'有人仍然记得商人，他愿意替你作证。'})]),
 read_bridge:risk('crossing','辨认桥栏上被磨去的字','洞察 · 可能错失完整拓印','洞察',{
 bad:[o('bridge_blur','雨水抹去了最后几个字。你只抄下“借用”二字，仍不知道它们原本要说什么。',{stress:1}),o('bridge_slip','潮湿的石沿让你的指节擦破了皮。你收起手记，决定去档案馆找答案。',{health:-1})],
 mixed:[o('bridge_fragment','你辨出“须有归期”四字，其他部分已经无法拓下。',{flag:'inscription',clue:'桥上残字提到借用必须有归期。'}),o('bridge_effort','你费了些力气拼出“须有归期”。它似乎和钟楼有关。',{energy:-1,flag:'inscription',clue:'旧桥写过借用必须有归期。'})],
 good:[o('bridge_full','你拓下被划掉的半句：借用须有归期。这道划痕，明显比碑文更新。',{flag:'inscription',ability:'洞察',clue:'归期条文被人后来划掉了。'}),o('bridge_pattern','你发现“归还”二字旁有一道钟形刻印，与远处钟楼的轮廓相似，记下这个可供核对的细节。',{flag:'inscription',stress:-1,clue:'旧桥归还条文有钟形刻印，与钟楼相关。'})]
 }),
 warm_soup:routine('crossing','买碗热汤，听听桥边传闻','铜币 −2 · 精力 +3',[o('soup_story','热汤驱走寒意。老妇人告诉你，过去人们等待钟声，是为了领回借出的名字。',{energy:3,clearCold:true,clue:'老妇人说过去钟声意味着归还名字。'})],{coins:2}),
 hurry:routine('crossing','沿桥去钟楼','普通行走 · 保留体力',[o('cross_bridge','你走到对岸。河面上有一只银眼渡鸦，正看着钟楼方向。')]),
 accept_raven:routine('raven','收下羽毛，答应它的小小请求','接受约定 · 意志 +1',[o('raven_promise','你答应把银羽带到钟里看月亮。羽毛在掌心微微发暖。',{item:'feather',flag:'raven',ability:'意志',clue:'渡鸦请你带银羽到钟顶看月亮。'})]),
 decline_raven:routine('raven','坦言今夜已经背负得够多了','拒绝约定 · 压力 −1',[o('raven_decline','渡鸦让开道路：“那就先保管好自己的名字。”',{stress:-1})]),
 pick_lock:risk('archive','用旧铜钥匙试着打开侧门','身手 · 精力 −2 · 失败可找值夜人协助','身手',{
 bad:[o('lock_cut','锁舌划伤了手指，门没有打开。你收起钥匙，准备换一种进入方式。',{health:-2,flag:'lockTried',stay:true}),o('lock_jam','钥匙被卡住。你小心将它拔出，决定不再冒险重复尝试。',{stress:1,flag:'lockTried',stay:true})],
 mixed:[o('lock_trace','门开了，但铜面留下新划痕。你找到借名簿，记下名字的去向和被撕掉的归还条款。',{flag:'trace',item:'ledger',clue:'钟楼用名字挡雾，守钟人撕掉了归还条款。'}),o('lock_strain','锁开了，你也耗尽了更多力气。馆内借名簿记着名字挡雾的用途，归还条款被撕去了。',{energy:-1,item:'ledger',clue:'借名簿表明，名字被用来挡雾而归还条款被隐藏。'})],
 good:[o('lock_quiet','旧铜钥匙与机关吻合。你安静入馆，抄下借名簿：名字用来抵挡海雾，归还条款被守钟人撕去。',{item:'ledger',clue:'你抄下了名字挡雾和被隐藏的归还条款。'}),o('lock_calm','你听准锁舌的节奏，平稳打开门。借名簿终于解释了海雾、名字和被撕去的归还条款。',{stress:-1,item:'ledger',clue:'借名簿记录名字挡雾，守钟人隐藏了归还条款。'})]
 },{energy:2}),
 use_evidence:routine('archive','拿出早先获得的线索或人情','前面的选择 · 安全进入',[o('evidence_entry','早先留下的线索或人情派上了用场。你顺利进馆，查到名字用于挡雾、归还条款被守钟人撕掉的记录。',{item:'ledger',clue:'馆内记录证实名字挡雾、归还条款被隐藏。',callback:true})]),
 ask_clerk:routine('archive','向值夜人说明来意，请求查阅','普通交涉 · 时间 +15 分钟',[o('clerk_entry','值夜人听完来意，陪你查阅借名簿。你抄下名字挡雾的记录，也发现被撕掉的归还条款。',{minutes:10,item:'ledger',clue:'值夜人协助你查到了名字挡雾与归还条款的记录。'})]),
 free_names:routine('bell','解除封条，让被借的名字回家','归还名字 · 接受海雾归来的代价',[o('ending_free','你解开拘束名字的封条。名字飞向城市，海雾也重新涌上岸。',{ending:'free_names',stress:-2})]),
 rewrite_pact:routine('bell','重订契约，写明自愿和归期','共同商议 · 保留挡雾的方法',[o('ending_pact','你要求新的借用必须自愿、有归期，并请城里人共同见证。',{ending:'rewrite_pact',stress:-2})]),
 keep_proof:routine('bell','带走副页，向城里人公开真相','公开证据 · 让城市共同决定',[o('ending_proof','你带着副页走下钟楼，让每个人都有机会知道真相并参与决定。',{ending:'keep_proof',stress:-2})])
};
export const ALL_OUTCOMES=Object.fromEntries(Object.values(ACTIONS).flatMap(a=>Object.values(a.tiers).flat()).map(o=>[o.id,o]));
export const BASE_PACK={title:'雾港手记',outline:'主角在雾港发现借名的秘密，由市集的线索进入档案馆，最后亲自决定名字与城市的未来。',scenes:Object.fromEntries(STAGES.filter(s=>s!=='ending').map(id=>[id,{title:scenes[id].title,paragraphs:scenes[id].paragraphs,choices:Object.fromEntries(Object.entries(ACTIONS).filter(([,a])=>a.stage===id).map(([k,a])=>[k,a.title]))}])),outcomes:Object.fromEntries(Object.values(ALL_OUTCOMES).map(o=>[o.id,o.text])),endings:Object.fromEntries(Object.entries(endings).map(([id,[title,body]])=>[id,{title,paragraphs:[body]}]))};
export function shapeSchema(value){
 if(typeof value==='string')return {type:'string'};
 if(Array.isArray(value))return {type:'array',items:{type:'string'}};
 return {type:'object',additionalProperties:false,required:Object.keys(value),properties:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,shapeSchema(v)]))};
}
export function validateShape(value,template=BASE_PACK,path='pack'){
 if(typeof template==='string'){if(typeof value!=='string'||!value.trim()||value.length>1600)throw Error(`主持输出文字不符合约束：${path}`);return;}
 if(Array.isArray(template)){if(!Array.isArray(value)||value.length<1||value.length>4)throw Error(`主持段落不符合约束：${path}`);value.forEach((v,i)=>validateShape(v,'',`${path}.${i}`));return;}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==Object.keys(template).sort().join())throw Error(`主持输出结构不符合约束：${path}`);
 for(const [k,v] of Object.entries(template))validateShape(value[k],v,`${path}.${k}`);
}
export function preparationPrompt(){return `你是中文奇幻互动小说编剧。直接返回 schema 指定 JSON，不使用工具，不读文件，不检索，不编程。为已获批准的有限剧本润写一整局可玩内容，所有场景和结果一次备好。世界真相、角色知识、每项效果和路线不得改变。文字轻巧克制，场景每段40–90字，结果30–90字；选项简明。不能在前期泄露钟楼挡雾真相；人物不能知道没有见证的事件。风险失败不能写成成功。scenes 的普通段落必须适用于所有到达路径，不假定物品/承诺；路径特定信息仅写在对应 outcome。借据、暗门、信任入口和渡鸦约定需要前后照应。最终三个结局由玩家选，不评价道德高低。\n世界约定：${JSON.stringify(CANON)}\n动作与不可变后果：${JSON.stringify(ACTIONS)}\n需输出的完整参考结构（文案可以改写，ID不能改）：${JSON.stringify(BASE_PACK)}`;}
export function preflightRequest(pack){const request={model:'jev-latest',state:{world:CANON,runtime_contract:{
 interpretation:'Each action has conditional alternative outcomes; exactly one is applied. Scene prose describes the next location after the previous action. Outcomes may reveal newly learned facts. Costs and effects are applied separately from narrative text.',
 entry_conditions:{use_evidence:'Only enabled when the player owns receipt or letter, or has shadow or friend flag; one qualifying fact is sufficient.',pick_lock:'Requires the copper key, sufficient energy, and no previous failed lock attempt.',ask_clerk:'Always available at archive with no money/item requirement.'},
 automatic_callbacks:['Entering bell with feather appends text that the feather sees the moon, fulfilling the first half of the promise.','Choosing any ending while holding feather returns it, removes its temporary will bonus, and appends a promise-fulfilled paragraph. Without feather none of these callbacks occur.'],
 transition:'market -> crossing -> raven -> archive -> bell -> ending; a failed lock attempt stays at archive, disables pick_lock, and leaves ask_clerk available. All successful archive entries give ledger before bell.',
 time_rule:'Every action advances five base minutes plus effects.minutes if present. Thus minutes:10 means ten additional minutes and fifteen total; the prose may describe the ten-minute search while the option metadata shows fifteen minutes including travel.',
 world_evidence:'The old letter says names were used to repay a debt; this is an in-world letter claim, not a new world law.'
 },review_contract:'Review only the named proposition in each question. Cite no unstated constraints. Do not treat mutually exclusive branches as simultaneous events.'},questions:Object.fromEntries([
 ['world_rules','Does the generated script preserve the stated fantasy laws about borrowed names, the clock tower and sea fog?'],
 ['archive_access','Are described archive entrances available under runtime_contract.entry_conditions, with every successful entrance obtaining the ledger?'],
 ['failure_route','After either bad pick_lock outcome, can the player still reach bell using ask_clerk as specified in runtime_contract?'],
 ['ending_agency','Do free_names, rewrite_pact and keep_proof each follow the corresponding player decision, without substituting another decision?']
 ].map(([id,instructions])=>[id,{type:'noul',instructions,criteria:{true:'The named proposition is supported by the supplied script and explicit runtime rules.',false:'The named proposition is contradicted by the supplied script or explicit runtime rules.'}}]))};
 const scopedEvidence={
  world_rules:pack,
  archive_access:{scene:pack.scenes.archive,outcomes:Object.fromEntries(Object.values(ACTIONS).filter(a=>a.stage==='archive').flatMap(a=>Object.values(a.tiers).flat()).map(o=>[o.id,{text:pack.outcomes[o.id],effects:o.effects}]))},
  failure_route:{bad:ACTIONS.pick_lock.tiers.bad.map(o=>({text:pack.outcomes[o.id],effects:o.effects})),fallback:{text:pack.outcomes.clerk_entry,effects:ACTIONS.ask_clerk.tiers.good[0].effects}},
  ending_agency:{choices:pack.scenes.bell.choices,endings:pack.endings,outcomes:Object.fromEntries(Object.values(ACTIONS).filter(a=>a.stage==='bell').flatMap(a=>Object.values(a.tiers).flat()).map(o=>[o.id,pack.outcomes[o.id]]))}
 };
 for(const [key,evidence] of Object.entries(scopedEvidence))request.questions[key].instructions={question:request.questions[key].instructions,evidence};
 const entryFacts={
  market:'开场，主角林照刚抵达市集，还未购买旧信或借出绰号；商人、影子、摊上的信是现场物件。',
  crossing:'主角经过市集后到旧桥。可能取得借据、旧信、暗门线索或商人信任，也可能全无；桥、汤摊、渡鸦是当前场景见闻，不代表玩家已调查它们。',
  raven:'主角已经过桥到对岸。可能辨字、喝汤或直接过桥；尚未接受渡鸦约定。渡鸦可以主动提出请求，提请求不等于玩家接受。',
  archive:'主角经过渡鸦后来到档案馆门外；可能接受或拒绝银羽，也可能持有或没有入口线索；开锁失败会再次留在此处。此处的对话只介绍查阅方式，介绍不等于玩家已执行。',
  bell:'所有抵达钟顶的合法路径，都已经进入档案馆、读过借名簿并取得副页 ledger，已知名字用于挡雾及归还条款被隐藏。银羽仅部分路径持有；持有时程序另加履约段落。'
 };
 for(const [id,entry] of Object.entries(entryFacts)){
  request.questions[`history_${id}`]={type:'noul',instructions:{question:'只审阅以下这一场景的普通正文：它能否与给定入场前提相容，而没有断言某个尚未确定的可选行动已发生？描述现场、介绍可选行为，不算玩家执行该行为。不要评判其他场景或 outcome。',entry_facts:entry,paragraphs:pack.scenes[id].paragraphs},criteria:{true:'本段正文与给定入场事实相容，不依赖一个未确定的玩家选择。',false:'正文明确断言玩家已经执行了某个入场前提未保证的可选行动。'}};
 }
 for(const id of ['market','crossing','raven'])request.questions[`secrecy_${id}`]={type:'noul',instructions:{question:'只看以下正文，它是否保留了“借来的名字被钟楼用于抵挡海雾”这一完整因果秘密，没有提前讲明？谈借名、归期、钟声或月亮可以是伏笔，不等于已揭露挡雾的用途。',paragraphs:pack.scenes[id].paragraphs},criteria:{true:'这段正文没有讲明借来的名字用于抵挡海雾。',false:'这段正文已经明确讲明借来的名字用于抵挡海雾。'}};
 for(const [id,a] of Object.entries(ACTIONS))for(const [tier,outcomes] of Object.entries(a.tiers))for(const o of outcomes)request.questions[`effect_${o.id}`]={type:'noul',instructions:{question:'只核对这一个候选后果：文字能否与它自己的程序效果相容？没有逐字写出数值不算矛盾；可以用更有把握描写能力提高。基础耗时五分钟和 cost 另行计算，不必逐字出现在叙事里。这里只审直接矛盾，不评其他候选。',action:id,cost:a.cost,tier,text:pack.outcomes[o.id],effects:o.effects},criteria:{true:'本条文字与自己的效果相容，没有声称相反的结果或额外的奖励。',false:'本条文字直接违反效果，例如门未打开却声称入馆，或失去的物品被写成获得。'}};
 for(const id of ['accept_raven','decline_raven'])request.questions[`promise_${id}`]={type:'noul',instructions:{question:'这一个选择的文字及程序效果，是否与所述银羽约定相容？',choice:pack.scenes.raven.choices[id],outcome:pack.outcomes[ACTIONS[id].tiers.good[0].id],effects:ACTIONS[id].tiers.good[0].effects,rules:id==='accept_raven'?'取得银羽和临时意志加成。入钟顶时程序描写银羽见月；结局时程序归还银羽并撤销加成。':'不取得银羽，不承担约定，也不执行银羽回调。'},criteria:{true:'这个选择与取得或不取得银羽、承担或不承担约定的效果相容。',false:'文字与这个选择的约定或物品效果直接冲突。'}};
 return request;
}
