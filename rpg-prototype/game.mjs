import { scenes, endings } from './story.mjs';
export const WORLD='mistport-names.v1';
export const ITEMS={
 key:{name:'旧铜钥匙',description:'有些生锈，仍能使用。为撬锁检定提供 +2 修正。',icon:'key'},
 ration:{name:'干粮',description:'油纸包好的麦饼。吃一份恢复 4 精力，上限为 20。',icon:'parcel',usable:true},
 notebook:{name:'旅行手记',description:'记录遇见的人与地方。旅程中的选择和线索，都保存在「旅程」中。',icon:'book'},
 receipt:{name:'绰号借据',description:'借出：「小满」。明天钟响前归还。背面盖着钟楼的圆印。',icon:'paper'},
 letter:{name:'无名旧信',description:'信里写着：名字没有消失，它们被拿去抵债了。信角盖着档案馆的夜间通行章。',icon:'mail'},
 feather:{name:'银色羽毛',description:'你答应渡鸦带它看钟里的月亮。羽毛使你的意志暂时提高 1。',icon:'feather'},
 ledger:{name:'借名簿副页',description:'记载着名字的去向，以及被撕去的归还条款。纸上每个名字都在呼吸。',icon:'paper'}
};
const STAGES=['market','crossing','raven','archive','bell','ending'];
const COSTS={buy_letter:{coins:3},warm_soup:{coins:2},wait_clerk:{coins:3},ask_shadow:{energy:2},hurry:{energy:2},pick_lock:{energy:2}};
const option=(id,title,meta,callback=false)=>({id,title,meta,callback});
export function newGame(seed){
 if(!Number.isInteger(seed))seed=crypto.getRandomValues(new Uint32Array(1))[0];
 return {schema:1,world:WORLD,revision:0,scene:'market',minutes:1120,rng:(seed>>>0)||1,
 character:{name:'林照',health:24,energy:18,stress:2,coins:12,abilities:{身手:3,洞察:4,交涉:3,意志:4},effects:['雨中微寒']},
 inventory:{key:1,ration:2,notebook:1},flags:{},clues:[],journal:[],changes:[],arrival:'',lastRoll:null};
}
export function timeLabel(s){return `第 ${1+Math.floor(s.minutes/1440)} 日 ${String(Math.floor(s.minutes%1440/60)).padStart(2,'0')}:${String(s.minutes%60).padStart(2,'0')}`;}
export function objectiveFor(s){return s.scene==='ending'?'这一夜的故事，已经有了回声。':s.flags.proof?'带着借名簿，决定钟楼的命运。':s.scene==='market'?'找到寄信给你的人。':'去钟楼档案馆，查明名字的去向。';}
export function sceneFor(s){
 const base=structuredClone(scenes[s.scene]);
 if(!base)throw new Error('无法识别的故事场景。');
 base.stage=STAGES.indexOf(s.scene);base.arrival=s.arrival;base.ending=s.scene==='ending';
 if(s.scene==='archive'){
 const extra=[];
 if(s.flags.alias)extra.push(option('use_alias','报出「小满」，让借据替你开门','早先的选择 · 绰号借据',true));
 if(s.flags.shadow)extra.push(option('use_shadow','沿着影子描述的暗门进入档案馆','早先的选择 · 影子的记忆',true));
 if(s.inventory.letter)extra.push(option('use_letter','把旧信的通行章，贴上门口的圆印','早先的选择 · 无名旧信',true));
 if(s.flags.friend)extra.push(option('use_friend','请商人向守门人介绍你','早先的选择 · 一个认得你的人',true));
 base.choices=[...extra,...base.choices];
 }
 if(s.scene==='bell'&&s.inventory.feather)base.paragraphs.push('你举起银羽。渡鸦的眼睛在羽毛里睁开，它终于看见了那轮月亮，也替你记住了借名簿上的每一个字。');
 if(s.scene==='ending'){
 const [title,body]=endings[s.flags.ending];base.title=title;
 base.paragraphs=[body,s.flags.alias?'商人把「小满」还给你。“这名字很好，”他说，“不过，我想起自己的了。”':s.flags.friend?'商人在桥头等你。他叫出了你的名字。这一次，他也能说出自己的。':s.flags.shadow?'商人的影子终于追上了他的脚步。走过桥时，它向你无声地点了点头。':'旧信末尾浮出新字：“谢谢你读到这里。”那个无名的寄信人，终于签上了自己的名字。',s.flags.ravenFulfilled?'渡鸦收回羽毛，把一枚真正的月光留在你的手记上。你完成了那个小小的约定。':'河面上的渡鸦看了你一眼，飞向正在退去的夜色。','这一夜到此结束。你可以回看旅程，保存这段经历，或从另一种选择重新出发。'];
 }
 base.choices=base.choices.map(c=>{
  const missing=Object.entries(COSTS[c.id]||{}).find(([key,n])=>s.character[key]<n);
  return {...c,disabled:!!missing,disabledReason:missing?`${missing[0]==='coins'?'铜币':'精力'}不足` : ''};
 });
 return base;
}
function change(s,key,delta){
 const max={health:24,energy:20,stress:10,coins:999},names={health:'生命',energy:'精力',stress:'压力',coins:'铜币'};
 const before=s.character[key];s.character[key]=Math.max(0,Math.min(max[key],before+delta));const diff=s.character[key]-before;
 if(diff)s.changes.push(`${names[key]} ${diff>0?'+':'−'}${Math.abs(diff)}`);
}
function add(s,id){s.inventory[id]=(s.inventory[id]||0)+1;s.changes.push(`获得：${ITEMS[id].name}`);}
function clue(s,title,body){if(!s.clues.some(c=>c.title===title))s.clues.push({title,body});}
function ability(s,key){s.character.abilities[key]++;s.changes.push(`${key} +1`);}
function roll(s){let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng%20+1;}
function checkRevision(s,r){if(s.revision!==r)throw new Error('这是旧回合的操作，请使用当前选项。');}
export function choose(state,id,revision){
 checkRevision(state,revision);const scene=sceneFor(state),selected=scene.choices.find(c=>c.id===id);
 if(!selected)throw new Error('这个选项当前不可用。');
 if(selected.disabled)throw new Error(selected.disabledReason);
 const s=structuredClone(state);s.revision++;s.changes=[];s.lastRoll=null;let outcome='',minutes=5;
 switch(id){
 case 'lend_name':s.flags.alias=true;add(s,'receipt');outcome='你把小时候的绰号「小满」借给了商人。远处的登记钟轻响一声。他写下借据：明天钟响前归还。';clue(s,'登记钟的一声轻响','借出绰号时，钟楼似乎也记下了这笔交易。');break;
 case 'ask_shadow':s.flags.shadow=true;change(s,'energy',-2);outcome='影子在地上描出档案馆的暗门。它的上一任主人，正是那里的抄写员。';clue(s,'影子的旧主人','影子记得档案馆的暗门，被借走的名字都送进了钟楼。');break;
 case 'buy_letter':change(s,'coins',-3);add(s,'letter');outcome='信封上浮出你的名字。里面写着：“名字没有消失，它们被拿去抵债了。”信角盖着档案馆的通行章。';clue(s,'寄给你的旧信','名字被拿去抵债了。信封上的通行章仍然有效。');break;
 case 'help_find':s.flags.friend=true;minutes=15;outcome='你陪商人走过三条街。老妇人仍认得他修伞的手。他愿意陪你去钟楼，替你作证。';s.changes.push('关系：商人信任你');clue(s,'有人认得的手','名字可以消失，相处过的记忆还在。');break;
 case 'read_bridge':ability(s,'洞察');minutes=10;s.flags.inscription=true;outcome='你拓下旧字，发现下面还有半句：借用须有归期。有人刻意划掉了它。';clue(s,'被划掉的归期','旧契约要求归还名字，有人隐瞒了这一条。');break;
 case 'warm_soup':change(s,'coins',-2);change(s,'energy',3);s.character.effects=s.character.effects.filter(e=>e!=='雨中微寒');s.changes.push('雨中微寒已解除');outcome='热汤让你缓过来。老妇人说，从前钟响是为了归还名字。现在，回来的人越来越少。';clue(s,'老妇人的传闻','过去，钟声意味着名字归还。');minutes=10;break;
 case 'hurry':change(s,'energy',-2);minutes=3;outcome='你在钟响前踏上对岸。余音里，有人在一遍遍喊一个不属于自己的名字。';break;
 case 'accept_raven':add(s,'feather');ability(s,'意志');s.flags.raven=true;s.character.effects.push('渡鸦的约定');outcome='你答应让羽毛看见钟里的月亮。温暖从掌心传来，一小部分恐惧安静了下去。';clue(s,'渡鸦的约定','把银羽带到钟楼，让渡鸦看见里面的月亮。');break;
 case 'decline_raven':change(s,'stress',-1);outcome='渡鸦没有生气。“那就先保管好自己的名字。”它让开了通往钟楼的路。';break;
 case 'use_alias':outcome='“小满。”你报出绰号。登记簿翻到刚写下的一行。原来市集上的钟声真的留下了记录，借据让铜门向你打开。';break;
 case 'use_shadow':outcome='你照着影子的记忆，在第三块铜砖上敲了两下。暗门后是抄写员的旧座位，桌上摊着借名簿。';break;
 case 'use_letter':outcome='旧信的圆印与铜门严丝合缝。值夜人认出通行章，将借名簿递到你手里。';break;
 case 'use_friend':outcome='商人把修伞的手伸进门缝。值夜人认出了他。“我记得你。”有人作证，比一个名字更管用。';break;
 case 'pick_lock':{
 change(s,'energy',-2);const die=roll(s),modifier=s.character.abilities.身手+(s.inventory.key?2:0);
 s.lastRoll={die,modifier,difficulty:12,success:die+modifier>=12};
 outcome=s.lastRoll.success?'旧铜钥匙转了半圈。你找到机关，悄悄进入档案馆。':'锁舌划伤了你的手，响动惊动值夜人。听完你的来意，他决定让你看看借名簿。';
 if(!s.lastRoll.success){change(s,'health',-2);s.character.effects.push('手部擦伤');}break;
 }
 case 'wait_clerk':change(s,'coins',-3);minutes=20;outcome='收工的抄写员收下三枚铜币，带你穿过值夜人身旁，交给你一页副本。';break;
 case 'free_names':case 'rewrite_pact':case 'keep_proof':
 s.flags.ending=id;change(s,'stress',-2);minutes=Math.floor(s.minutes/1440)*1440+1800-s.minutes;
 outcome={free_names:'你撕开封条。名字如飞鸟，从钟楼涌向街巷。',rewrite_pact:'你展开手记，写下第一条：每个名字，都有回家的日期。',keep_proof:'你抱着副页走下钟楼。真相应该先抵达每一个人。'}[id];
 if(s.inventory.feather){delete s.inventory.feather;s.character.abilities.意志--;s.changes.push('完成：渡鸦的约定','归还银羽 · 意志 −1');s.character.effects=s.character.effects.filter(e=>e!=='渡鸦的约定');s.flags.ravenFulfilled=true;}break;
 }
 if(state.scene==='archive'){s.flags.proof=true;add(s,'ledger');clue(s,'归还的一页被撕掉了','钟楼用名字抵挡海雾；守钟人撕去了契约中关于归还的约定。');if(selected.callback)s.changes.push('早先的选择，打开了这扇门');}
 s.minutes+=minutes;s.arrival=outcome;s.scene=STAGES[STAGES.indexOf(state.scene)+1];
 s.journal.push({revision:s.revision,time:timeLabel(state),place:scene.place,title:selected.title,outcome,changes:[...s.changes],callback:!!selected.callback,roll:s.lastRoll});return s;
}
export function useItem(state,id,revision){
 checkRevision(state,revision);if(!state.inventory[id])throw new Error('背包里已经没有这件物品。');
 if(id!=='ration')throw new Error('这件物品会在适合的故事选项中发挥作用。');
 if(state.scene==='ending')throw new Error('这一段旅程已经结束。');
 if(state.character.energy===20)throw new Error('精力已满，先留着这份干粮吧。');
 const s=structuredClone(state);s.revision++;s.changes=[];change(s,'energy',4);
 if(--s.inventory.ration===0)delete s.inventory.ration;s.changes.push('干粮 −1');
 s.journal.push({revision:s.revision,time:timeLabel(s),place:sceneFor(s).place,title:'吃一份干粮',outcome:'你掰开麦饼，慢慢恢复了力气。',changes:[...s.changes],callback:false,roll:null});return s;
}
export function serializeSave(s){return JSON.stringify({format:'earth-online-save',version:1,state:s},null,2);}
export function restoreSave(text){
 try{
 if(typeof text!=='string'||text.length>500000)throw Error();
 const doc=JSON.parse(text),s=doc.state,ok=v=>{if(!v)throw Error();};
 ok(doc.format==='earth-online-save'&&doc.version===1&&s?.schema===1&&s.world===WORLD);
 ok(STAGES.includes(s.scene)&&Number.isSafeInteger(s.revision)&&s.revision>=0&&s.revision<10000);
 ok(Number.isSafeInteger(s.minutes)&&s.minutes>=1120&&s.minutes<100000);ok(Number.isInteger(s.rng)&&s.rng>0&&s.rng<=4294967295);
 const c=s.character;ok(c?.name==='林照');
 for(const [k,max] of Object.entries({health:24,energy:20,stress:10,coins:999}))ok(Number.isInteger(c[k])&&c[k]>=0&&c[k]<=max);
 for(const k of ['身手','洞察','交涉','意志'])ok(Number.isInteger(c.abilities?.[k])&&c.abilities[k]>=0&&c.abilities[k]<=20);
 const str=(v,max=2000)=>typeof v==='string'&&v.length<=max;
 ok(Array.isArray(c.effects)&&c.effects.length<20&&c.effects.every(v=>str(v,100)));
 ok(s.inventory&&typeof s.inventory==='object'&&!Array.isArray(s.inventory));
 for(const [id,n] of Object.entries(s.inventory))ok(Object.hasOwn(ITEMS,id)&&Number.isInteger(n)&&n>0&&n<=99);
 ok(s.flags&&typeof s.flags==='object'&&!Array.isArray(s.flags));
 for(const [k,v] of Object.entries(s.flags))ok(['alias','shadow','friend','inscription','raven','proof','ravenFulfilled'].includes(k)?typeof v==='boolean':k==='ending'&&['free_names','rewrite_pact','keep_proof'].includes(v));
 ok(str(s.arrival));ok(Array.isArray(s.changes)&&s.changes.length<30&&s.changes.every(v=>str(v,200)));
 ok(Array.isArray(s.clues)&&s.clues.length<50&&s.clues.every(v=>v&&str(v.title,100)&&str(v.body)));
 const validRoll=r=>r===null||r&&Number.isInteger(r.die)&&r.die>=1&&r.die<=20&&Number.isInteger(r.modifier)&&r.modifier>=0&&r.modifier<=30&&r.difficulty===12&&r.success===(r.die+r.modifier>=12);
 ok(validRoll(s.lastRoll));
 ok(Array.isArray(s.journal)&&s.journal.length<=100&&s.journal.every((e,i)=>e&&e.revision===i+1&&str(e.time,100)&&str(e.place,100)&&str(e.title,200)&&str(e.outcome)&&typeof e.callback==='boolean'&&Array.isArray(e.changes)&&e.changes.length<30&&e.changes.every(v=>str(v,200))&&validRoll(e.roll)));
 ok(s.revision===s.journal.length);if(s.scene==='ending')ok(['free_names','rewrite_pact','keep_proof'].includes(s.flags.ending));
 return s;
 }catch{throw new Error('无法读取这个存档：格式、剧本版本或数据不符合要求。当前进度没有改变。');}
}
