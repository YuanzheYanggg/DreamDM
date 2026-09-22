import {ITEMS,newGame,sceneFor,choose,useItem,timeLabel,objectiveFor,serializeSave,restoreSave} from './game.mjs';
const $=id=>document.getElementById(id);
const KEY='earth-online.mistport.save.v1';
const MODE_KEY='earth-online.preferred-mode.v1';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 arrow:'M4 12h16m-7-7 7 7-7 7',close:'M5 5l14 14M19 5 5 19',
 key:'M15 3a5 5 0 0 0-4 8l-8 8 3 3 2-2-1-1 2-2 2 1 3-4a5 5 0 1 0 1-11ZM16 6h.01',
 parcel:'M3 8l9-4 9 4v11l-9 4-9-4Zm0 0 9 4 9-4M12 12v11M12 4c-3-7-9-2-3 2m3-2c3-7 9-2 3 2',
 book:'M5 2h15v21H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3ZM5 2v17h15M2 20h4M8 6h8M8 9h8',
 paper:'M5 2h10l5 5v16H5Zm10 0v6h5M9 12h7M9 16h7M9 20h4',
 mail:'M2 5h20v15H2Zm0 0 10 9L22 5',
 feather:'M3 22l9-11M5 18C-1 6 16-2 20 2c4 5-2 17-12 16M12 11l1 6m0-9 6-1',
 purse:'M8 6 6 2h4l2 2 2-2h4l-2 4M8 6h8c0 5 6 6 6 13s-20 7-20 0 6-8 6-13Z'
};
const icon=name=>`<svg viewBox="0 0 24 26" aria-hidden="true"><path d="${paths[name]||paths.paper}"/></svg>`;
let state,tab='story',busy=false,storageOK=true,noticeTimer;
try{const saved=localStorage.getItem(KEY);state=saved?restoreSave(saved):newGame();}catch(e){state=newGame();storageOK=false;showNotice(`已有存档未被覆盖。${e.message}`);}
let demoState=state,mode='demo',preferredMode=null,live=null,requestBusy=false,directorRequestBusy=false,connectionIssue='',pollTimer,requestGeneration=0,exportText='',exportFilename='';
try{preferredMode=localStorage.getItem(MODE_KEY);}catch{}
const initialDescriptions={key:'有些生锈，但仍能使用。',ration:'压缩的粮食，能应付一段路。',notebook:'记录过一些人和地方。'};
function showNotice(text){clearTimeout(noticeTimer);$('notice').textContent=text;$('notice').hidden=false;}
function save(){
 if(mode==='live')return;
 demoState=state;
 if(!storageOK){$('save-status').textContent='当前进度仅在此页面 · 请导出存档';return;}
 try{localStorage.setItem(KEY,serializeSave(state));$('save-status').textContent='已自动保存 · 本地旅程';}
 catch{storageOK=false;$('save-status').textContent='当前进度仅在此页面 · 请导出存档';showNotice('浏览器未能保存进度。你仍可以游玩，请在关闭页面前通过「存档」导出。');}
}
function changes(list){return list.length?`<div class="changes">${list.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:'';}
function rollNote(roll){
 if(!roll)return '';
 if(roll.kind==='jev'){
  const percent=values=>values.map(v=>`${esc(v)}%`).join(' / '),tier={bad:'不利',mixed:'有得有失',good:'顺利'}[roll.tier]||'已裁定';
  return `<details class="roll-details"><summary>Jev 检定 · ${esc(tier)}</summary><dl><div><dt>基础分布 · 坏 / 中 / 好</dt><dd>${percent(roll.base)}</dd></div><div><dt>幸运后分布 · 坏 / 中 / 好</dt><dd>${percent(roll.effective)}</dd></div><div><dt>本次运势 / 角色幸运</dt><dd>${esc(roll.fortune)} / ${esc(roll.luck)}</dd></div><div><dt>幸运修正 / 最终值</dt><dd>${roll.shift>0?'+':''}${esc(roll.shift)} / ${esc(roll.total)}</dd></div><div><dt>本次 Jev 用时</dt><dd>${esc(roll.jevMs)} ms</dd></div></dl><p>用时来自这次裁定，不代表整段操作的响应时间。</p></details>`;
 }
 return `<p class="roll-note">身手检定：D20 ${esc(roll.die)} + 修正 ${esc(roll.modifier)} = ${esc(roll.die+roll.modifier)} / 难度 ${esc(roll.difficulty)} · ${roll.success?'成功':'失败，承担代价后继续'}</p>`;
}
function currentScene(){return mode==='live'?state.sceneData:sceneFor(state);}
function liveLocked(){return requestBusy||!!connectionIssue||['running','error'].includes(live?.job?.status);}
function liveStartLocked(){return requestBusy||!!connectionIssue||live?.job?.status==='running';}
function render(){renderMain();renderCharacter();renderMode();$('story-tab').classList.toggle('active',tab==='story');$('journey-tab').classList.toggle('active',tab==='journey');for(const t of ['story','journey']){if(t===tab)$(t+'-tab').setAttribute('aria-current','page');else $(t+'-tab').removeAttribute('aria-current');}}
function renderMain(){
 if(mode==='live'&&(!state||live?.job?.kind==='prepare'&&['running','error'].includes(live.job.status))){
  const preparing=requestBusy||!!live?.job;
  $('main').innerHTML=`<article class="scene preparation"><div class="location">AI 主持 · 六场景短篇试玩</div><h1 class="story-title">${live?.job?.status==='error'?'章节暂未准备好':preparing?'故事正在翻开':'这一夜，等你开始'}</h1><p class="chapter">先备好这一夜，再由你决定去向。</p><div class="prose"><p>Codex 准备人物、场景与可能的后果。完成后，每次选择交给 Jev 裁定。</p></div>${liveStatus()}${!preparing&&!connectionIssue?'<div class="dialog-buttons"><button class="solid-button" data-action="restart">开始 AI 旅程</button></div>':''}</article>`;
  return;
 }
 const scene=currentScene();
 if(tab==='journey'){
 $('main').innerHTML=`${liveStatus()}<div class="location">雾港 · 你的经历</div><h1 class="story-title">走过的路</h1><p class="journey-intro">有些选择当时很轻，后来却有了分量。</p>
 <section class="journey-section"><h2>旅程</h2>${state.journal.length?state.journal.map(e=>`<article class="journal-entry"><small>${esc(e.time)} · ${esc(e.place)}</small><h3>${esc(e.title)}</h3><p>${esc(e.outcome)}</p>${changes(e.changes)}${rollNote(e.roll)}${e.callback?'<span class="echo">回声 · 前面的选择在这里派上了用场</span>':''}</article>`).join(''):'<p class="empty">这一页还空着。去故事里，做出你的第一个选择。</p>'}</section>
 <section class="journey-section"><h2>已经知道的事</h2>${state.clues.length?state.clues.map(c=>`<article class="clue"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></article>`).join(''):'<p class="empty">发现的线索会留在这里。</p>'}</section><div class="dialog-buttons"><button class="outline-button" data-tab="story">回到故事</button></div>`;
 return;
 }
 $('main').innerHTML=`${liveStatus()}<article class="scene"><div class="location">雾港 · ${esc(scene.place)} · ${timeLabel(state)}</div><h1 class="story-title">${esc(scene.title)}</h1><p class="chapter">${esc(scene.chapter)}</p>
 ${scene.arrival?`<div class="arrival">${esc(scene.arrival)}${changes(state.changes)}${rollNote(state.lastRoll)}</div>`:state.changes.length?`<div class="arrival">你稍作整顿，继续眼前的故事。${changes(state.changes)}</div>`:''}
 <div class="prose">${scene.paragraphs.map(p=>`<p${p.startsWith('“')?' class="dialogue"':''}>${esc(p)}</p>`).join('')}</div>
 <section class="actions" aria-label="行动选择"><h2>${scene.ending?'这一页，留给你。':'你决定…'}</h2>
 ${scene.choices.map((c,i)=>`<button class="choice${c.callback?' callback':''}" data-choice="${esc(c.id)}" data-revision="${esc(state.revision)}" ${busy||mode==='live'&&liveLocked()||c.disabled?'disabled':''}><span class="choice-letter">${String.fromCharCode(65+i)}</span><span class="choice-copy"><strong>${esc(c.title)}</strong><small>${esc(c.disabled?c.disabledReason+' · '+c.meta:c.meta)}</small></span>${icon('arrow')}</button>`).join('')}
 ${scene.ending?'<div class="ending-actions"><button class="solid-button" data-tab="journey">回看这段旅程</button><button class="outline-button" data-action="save">保存这一夜</button><button class="outline-button" data-action="restart">另一种开始</button></div>':''}
 </section><p class="story-note">每个选择，都会在某处留下回声。</p></article>`;
}
function renderCharacter(){
 if(!state){$('character').innerHTML='<section class="character-section"><h3>旅人尚在路上</h3><p class="objective">章节准备完成后，角色与背包会出现在这里。</p></section>';$('mobile-status').innerHTML=`<span>AI 主持</span><span>${live?.job?.hasRepairDraft?'修订稿待复核':live?.job?.status==='error'?'章节暂未准备好':'正在准备旅程'}</span>`;return;}
 const c=state.character;
 $('mobile-status').innerHTML=`<span>林照</span><span>生命 ${c.health} · 精力 ${c.energy}</span><span>角色与背包 ↓</span>`;
 $('character').innerHTML=`<div class="identity"><div class="avatar" aria-hidden="true">林</div><div><h2>林照</h2><p>旅人 · ${state.scene==='market'?'初抵雾港':state.scene==='ending'?'留下回声':'行于雾港'}</p></div></div>
 <section class="character-section vitals"><h3>状态</h3>${[['health','生命',24],['energy','精力',20],['stress','压力',10]].map(([k,label,max])=>`<div class="stat-row"><span>${label}</span><div class="meter ${k}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${c[k]}"><span style="width:${c[k]/max*100}%"></span></div><output>${c[k]}/${max}</output></div>`).join('')}<div class="effects">${c.effects.map(e=>`<span class="effect">${esc(e)}</span>`).join('')||'<span class="effect">状态平稳</span>'}</div></section>
 <section class="character-section"><h3>能力</h3><div class="abilities">${Object.entries(c.abilities).map(([k,v])=>`<div class="ability"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}${mode==='live'?`<div class="ability luck"><span>幸运</span><span>${esc(c.luck)} / 100</span></div>`:''}</div></section>
 <section class="character-section wallet"><h3>钱袋</h3><div class="purse">${icon('purse')}<span>铜币&nbsp; ${c.coins}</span></div></section>
 <section class="character-section bag"><h3>背包</h3><div class="inventory">${Object.entries(state.inventory).map(([id,n])=>`<button class="item-row" data-item="${esc(id)}" aria-label="查看${esc(ITEMS[id].name)}，${esc(n)}件">${icon(ITEMS[id].icon)}<span><strong>${esc(ITEMS[id].name)}<span class="qty">× ${esc(n)}</span></strong><small>${esc(initialDescriptions[id]||ITEMS[id].description.slice(0,23)+'…')}</small></span></button>`).join('')}</div></section>
 <section class="character-section goal"><h3>已知的牵挂</h3><p class="objective">${esc(mode==='live'?state.objective:objectiveFor(state))}</p></section>`;
}
function commit(next){state=next;save();render();$('announcer').textContent=state.changes.join('，')||'故事已推进。';}
function checkOtherTab(){
 if(mode==='live')return;
 if(!storageOK)return;
 const raw=localStorage.getItem(KEY);if(!raw)return;
 const other=restoreSave(raw);
 if(JSON.stringify(other)!==JSON.stringify(state)){state=other;demoState=other;render();throw Error('另一页已更新这段旅程。已同步最新进度，请重新选择。');}
}
function setTab(next){tab=next;render();$('main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
function openDialog(title,body){$('dialog-content').innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2><button class="close-button" data-close aria-label="关闭">${icon('close')}</button></div>${body}`;if(!$('dialog').open)$('dialog').showModal();}
function openItem(id){
 const item=ITEMS[id];if(!item||!state?.inventory[id])return;
 const locked=mode==='live'&&liveLocked();
 const description=mode==='live'&&id==='key'?'有些生锈，仍可用来试探铜门的机关。主持会将持有的工具纳入风险评估。':item.description;
 openDialog(item.name,`<p class="dialog-body">${esc(description)}</p><p class="dialog-note">当前持有 ${state.inventory[id]} 件</p>${item.usable&&state.scene!=='ending'?`<div class="dialog-buttons"><button class="solid-button" data-use="${esc(id)}" ${locked||state.character.energy===20?'disabled':''}>${locked?'等待当前操作完成':state.character.energy===20?'精力已满':'吃一份 · 恢复精力'}</button></div>`:'<p class="dialog-note">在合适的情境里，它会成为你的行动选项。</p>'}`);
}
function renderMode(){
 $('mode-label').textContent=mode==='live'?'AI 主持':'示例剧本';
 $('ai-button').setAttribute('aria-label',mode==='live'?'AI 主持设置与存档':'开始或继续 AI 主持旅程');
 $('save-status').textContent=mode==='live'?'AI 旅程 · 保存在此电脑的服务中':storageOK?'示例旅程 · 已自动保存到浏览器':'示例旅程 · 仅在此页面，请导出';
 const director=live?.director,show=mode==='live'&&director;
 $('director-status').hidden=!show;
 if(show){
  const labels={running:'导演在后台检查后续',done:'导演已检查后续',error:'导演检查未完成',discarded:'导演结果未采用'};
  $('director-status').textContent=`${labels[director.status]||'导演待命'}${director.effort?` · ${director.effort}`:''}${director.message||director.error?` · ${director.message||director.error}`:''}`;
 }
}
function liveStatus(){
 if(mode!=='live')return '';
 if(connectionIssue)return `<section class="live-status" role="status"><strong>连接暂时中断，进度尚未确认</strong><p>${esc(connectionIssue)}</p><p>先刷新状态；不会重新提交刚才的行动。</p><button class="outline-button" data-action="refresh-live" ${requestBusy?'disabled':''}>刷新状态</button></section>`;
 const job=live?.job;
 if(job?.status==='error')return `<section class="live-status" role="status"><strong>${job.kind==='prepare'?'章节准备未完成':'这次行动尚未完成'}</strong><p>${esc((job.error||'服务未完成本次处理。').replace('optional_history','不同路线的场景承接').replace('outcome_effects','叙述与实际后果的一致性'))}</p><p>${job.hasRepairDraft?'导演修订稿已备好。Astra 将复核剧本、选项和后果，通过后进入游戏。调用计入本局开局预算。':job.kind==='action'?'重试会继续同一个行动，沿用已生成的运势值；可能再次调用模型。也可以结束这次尝试，另开一段旅程。':'若已取得章节，重试会继续处理同一份内容；否则可能重新调用 Codex。若章节本身未通过校验，可另开准备任务，重新生成。模型调用可能产生费用。'}</p><div class="dialog-buttons"><button class="outline-button" data-action="retry-live" ${requestBusy?'disabled':''}>${job.hasRepairDraft?'复核修订后的章节':'重试这一步'}</button><button class="outline-button" data-action="restart" ${liveStartLocked()?'disabled':''}>${job.kind==='prepare'?'重新生成 AI 章节':'开始新的 AI 旅程'}</button></div></section>`;
 if(job?.status==='running'||requestBusy)return `<section class="live-status" role="status" aria-live="polite"><strong>${job?.kind==='prepare'?esc(job.phase||'正在准备章节…'):'正在处理这一步…'}</strong><p>${job?.kind==='action'?'等待 Jev 裁定。完成后，故事与资源会一起更新。':job?.kind==='prepare'?'准备完成后会自动进入故事。刷新页面也能继续等待。':'正在确认服务中的进度。'}</p></section>`;
 return '';
}
function setMode(next){
 mode=next;preferredMode=next;
 try{localStorage.setItem(MODE_KEY,next);}catch{}
 state=mode==='live'?live?.state||null:demoState;
 tab='story';render();
}
function budgetDetails(){
 const b=live?.budget;if(!b)return '';
 const title={jev:'Jev',codex:'Codex / Astra'};
 return `<details class="dialog-section"><summary>本局调用预算 · Jev ${esc(b.models.jev.used)} / ${esc(b.models.jev.limit)} · Astra ${esc(b.models.codex.used)} / ${esc(b.models.codex.limit)}</summary><p class="dialog-note">按约 ${esc(b.plannedChoices)} 次剧情选择预留。当前是六场景短篇，按实际需要使用；失败尝试也计数，刷新和导入不补满。这是次数上限，实际费用以服务账户为准。</p>${Object.entries(b.models).map(([kind,m])=>`<h3 class="dialog-subtitle">${title[kind]} · 剩余 ${esc(m.remaining)} 次</h3><ul class="dialog-note">${m.buckets.map(x=>`<li>${esc(x.label)}：${esc(x.used)} / ${esc(x.limit)}</li>`).join('')}</ul>`).join('')}</details>`;
}
function openSave(){
 const isLive=mode==='live',locked=liveLocked(),scene=state?currentScene():null;
 openDialog('留住这段旅程',`<p class="dialog-body">${scene?`${esc(scene.title)}<br>${timeLabel(state)} · 已留下 ${state.journal.length} 段经历`:live?.job?.status==='error'?'章节暂未准备好':'AI 章节正在准备'}</p><p class="dialog-note">${isLive?'AI 进度保存在这台电脑的服务中。导出可保留完整章节与旅程，浏览器中的示例存档另行保留。':storageOK?'每次选择都会自动保存在这个浏览器里。导出一份存档，可以在下次或另一台设备上继续。':'当前浏览器未启用自动保存。请先导出存档，再关闭页面。'}</p>
 <div class="dialog-buttons"><button class="solid-button" data-action="export" ${!state?'disabled':''}>导出存档</button><button class="outline-button" data-action="import" ${isLive&&locked?'disabled':''}>导入存档</button><input type="file" accept="application/json,.json" id="import-file" hidden></div><p class="import-error" id="import-error" role="alert"></p>
 <details class="dialog-section"><summary>从存档文字恢复</summary><label class="sr-only" for="import-text">粘贴存档文字</label><textarea id="import-text" class="save-code" placeholder="示例与 AI 旅程均可在这里恢复"></textarea><button class="outline-button" data-action="import-text" ${isLive&&locked?'disabled':''}>预览这份存档</button></details>
 <section class="dialog-section"><h3 class="dialog-subtitle">游玩方式</h3><p class="dialog-note">${isLive?'当前：AI 主持 · 六场景短篇试玩':'当前：本地示例 · 无需调用模型'}</p><div class="dialog-buttons"><button class="outline-button" data-action="switch-demo" ${!isLive?'disabled':''}>本地示例</button><button class="outline-button" data-action="switch-live" ${isLive?'disabled':''}>${live?.sessionId||live?.job?'继续 AI 旅程':'开始 AI 旅程'}</button></div></section>
 ${isLive&&state?`<section class="dialog-section"><h3 class="dialog-subtitle">导演检查后续</h3><p class="dialog-note">Astra 在后台改写并审查尚未经历的场景，通常占用两次对应档位额度。你可以继续做选择。</p><label class="field-label" for="director-effort">思考强度</label><select id="director-effort" class="paper-input"><option value="low">低 · low</option><option value="medium" selected>中 · medium</option><option value="high">高 · high</option></select><div class="dialog-buttons"><button class="outline-button" data-action="director" ${locked||live?.director?.status==='running'||state.scene==='ending'?'disabled':''}>导演检查后续</button></div></section>`:''}
 ${isLive?budgetDetails():''}
 <div class="dialog-section"><button class="outline-button danger" data-action="restart" ${isLive&&liveStartLocked()?'disabled':''}>${isLive?'开始新的 AI 旅程':'重新开始示例'}</button></div>
 <p class="dialog-note">${isLive?'首次章节准备与导演检查使用 Codex；行动由 Jev 裁定。当前为六场景短篇试玩。':'《雾港手记》的本地示例用于试玩界面与规则，不调用模型服务。AI 主持是单独保存的旅程。'}</p>`);
}
function openStart(){
 const regeneration=live?.job?.kind==='prepare'&&live.job.status==='error'&&!live.cachedWorld;
 openDialog('让 AI 主持这一夜',`<p class="dialog-body">先准备一段六场景的短篇，再由你的选择推动故事。</p><p class="dialog-note">${regeneration?'将放弃本次未完成的章节，开启新的准备任务，真实调用 Astra 重新生成并审查整个章节。':live?.cachedWorld?'已有准备好的章节，将复用它开启新的旅程。':'首次开始会真实调用 Astra 准备并审查章节。'}故事中的每次选择会调用 Jev。模型服务可能产生费用；只有点击下面的开始按钮才会提交。</p><label class="field-label" for="live-luck">角色幸运 · 0–100</label><input class="paper-input" id="live-luck" type="number" min="0" max="100" step="1" value="75" inputmode="numeric"><p class="dialog-note">幸运会影响风险检定，默认 75。${live?.sessionId?'当前 AI 旅程将由服务归档。':''}浏览器里的示例旅程会保留。</p><p id="start-error" class="import-error" role="alert"></p><div class="dialog-buttons"><button class="solid-button" data-action="start-live" ${liveStartLocked()?'disabled':''}>${regeneration?'重新生成并开始':'开始 AI 旅程'}</button><button class="outline-button" data-close>暂时返回</button></div>${connectionIssue?'<div class="dialog-buttons"><button class="outline-button" data-action="refresh-live">刷新连接状态</button></div>':''}`);
}
function restartDialog(){
 if(mode==='live'){if(liveStartLocked())throw Error('请先等待当前步骤完成，或刷新连接状态。');openStart();return;}
 openDialog('翻开新的一页',`<p class="dialog-body">新的示例旅程会替换当前浏览器里的示例进度。可以先导出这一夜的存档。</p><div class="dialog-buttons"><button class="outline-button" data-action="export">先导出存档</button><button class="solid-button" data-action="confirm-restart">重新开始</button></div>`);
}
async function exportSave(){
 if(!state)throw Error('章节准备完成后才能导出。');
 const exportingMode=mode,revision=state.revision;
 const text=exportingMode==='live'?JSON.stringify(await api('/api/live/export'),null,2):serializeSave(state);
 exportText=text;exportFilename=`雾港手记-${exportingMode==='live'?'AI':'示例'}-第${revision}次记录.json`;
 openDialog('带走这段旅程',`<p class="dialog-body">下载存档文件，或复制下面的存档文字。在「存档」中可以用这两种方式恢复。</p><label class="sr-only" for="save-code">存档文字</label><textarea id="save-code" class="save-code" readonly>${esc(exportText)}</textarea><div class="dialog-buttons"><button class="solid-button" data-action="download-file">下载 JSON 文件</button><button class="outline-button" data-action="copy-save">复制存档文字</button></div><p id="export-status" class="dialog-note" role="status"></p>`);
}
function downloadSave(){
 const url=URL.createObjectURL(new Blob([exportText],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=exportFilename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);$('export-status').textContent='已请求浏览器下载。若没有出现文件，可复制存档文字保存。';
}
function previewImport(text){
 if(text.length>5000000)throw Error('存档过大，请选择本原型导出的 JSON 存档。');
 let doc;try{doc=JSON.parse(text);}catch{throw Error('无法读取 JSON 存档，当前进度没有改变。');}
 const isLive=doc?.format==='earth-online-live';
 if(isLive&&(doc.version!==1||typeof doc.payload!=='string'))throw Error('AI 存档格式或版本不符合要求。');
 const incoming=isLive?doc:restoreSave(text);
 if(isLive&&liveLocked())throw Error('请先完成或恢复当前 AI 步骤，再载入存档。');
 openDialog('继续这段旅程',`<p class="dialog-body">${isLive?'将由本机服务校验并载入这份 AI 旅程，替换当前 AI 进度。浏览器中的示例进度会保留。':`将载入示例「${esc(sceneFor(incoming).title)}」，共 ${incoming.journal.length} 段经历，并替换浏览器中的示例进度。`}</p><div class="dialog-buttons"><button class="outline-button" data-action="export" ${!state?'disabled':''}>先导出当前进度</button><button class="solid-button" id="confirm-import">载入这份存档</button></div><p class="import-error" id="import-error" role="alert"></p>`);
 $('confirm-import').addEventListener('click',async event=>{
  const button=event.currentTarget;if(button.disabled)return;button.disabled=true;
  try{
   if(isLive){
    if(liveLocked())throw Error('请先完成或恢复当前 AI 步骤。');
    await mutateLive('/api/live/import',{save:incoming});setMode('live');
   }else{storageOK=true;setMode('demo');commit(incoming);}
   tab='story';$('notice').hidden=true;$('dialog').close();render();window.scrollTo({top:0,behavior:'instant'});
  }catch(e){const target=$('import-error');if(target)target.textContent=e.message;else showNotice(e.message);button.disabled=false;}
 });
}
async function api(path,body){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{'Accept':'application/json'}:{'Accept':'application/json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
  let data;try{data=await response.json();}catch{throw Error('服务没有返回可读取的状态。');}
  if(!response.ok)throw Error(data.error||`服务返回 ${response.status}`);
  return data;
 }catch(e){if(e.name==='AbortError')throw Error('连接等待超时，请刷新状态确认结果。');throw e;}
 finally{clearTimeout(timeout);}
}
function acceptSnapshot(snapshot){
 const changed=JSON.stringify(live?.state)!==JSON.stringify(snapshot.state)||JSON.stringify(live?.job)!==JSON.stringify(snapshot.job)||!!connectionIssue;
 if(connectionIssue)$('notice').hidden=true;
 live=snapshot;connectionIssue='';
 if(mode==='live')state=snapshot.state||null;
 // Background director polling must not replace focused choices or open details.
 if(changed)render();else renderMode();
}
function schedulePoll(){
 clearTimeout(pollTimer);
 if(!connectionIssue&&(live?.job?.status==='running'||live?.director?.status==='running'))pollTimer=setTimeout(()=>refreshLive(),1200);
}
async function refreshLive({initial=false}={}){
 if(requestBusy)return;
 const generation=++requestGeneration;clearTimeout(pollTimer);
 try{
  const snapshot=await api('/api/live');if(generation!==requestGeneration)return;
  acceptSnapshot(snapshot);
  if(initial&&preferredMode!=='demo'&&(snapshot.sessionId||snapshot.job))setMode('live');
  schedulePoll();
 }catch(e){
  if(generation!==requestGeneration)return;
  connectionIssue=e.message;
  if(!initial||mode==='live'){render();showNotice('AI 服务状态未确认。请使用「刷新状态」，不会自动重提行动。');}
 }
}
async function mutateLive(path,body){
 if(requestBusy)throw Error('正在提交当前操作，请稍候。');
 requestBusy=true;const generation=++requestGeneration;clearTimeout(pollTimer);render();
 try{
  const snapshot=await api(path,body);if(generation!==requestGeneration)throw Error('状态已更新，请刷新后继续。');
  acceptSnapshot(snapshot);return snapshot;
 }catch(e){connectionIssue=e.message;throw e;}
 finally{requestBusy=false;render();schedulePoll();}
}
function requireLiveReady(){if(mode!=='live'||!state||liveLocked())throw Error('请先完成或恢复当前 AI 步骤。');}
async function submitDirector(effort){
 requireLiveReady();
 if(directorRequestBusy||live?.director?.status==='running')throw Error('导演正在检查，请等待完成。');
 directorRequestBusy=true;const sessionId=live.sessionId,revision=state.revision;
 try{
  const snapshot=await api('/api/live/director',{sessionId,revision,effort});
  // The director may answer after a choice has advanced. Only merge its status.
  if(live?.sessionId===sessionId){live.director=snapshot.director;live.usage=snapshot.usage;live.budget=snapshot.budget;renderMode();schedulePoll();}
 }finally{directorRequestBusy=false;}
}
async function enterLive(){
 await refreshLive();
 if(live?.sessionId||live?.job){setMode('live');$('dialog').close();}
 else openStart();
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 try{
  if(button.hasAttribute('data-close')){$('dialog').close();return;}
  if(button.dataset.tab){setTab(button.dataset.tab);return;}
  if(button.dataset.choice){
   if(mode==='live'){
    requireLiveReady();
    await mutateLive('/api/live/choose',{sessionId:live.sessionId,revision:Number(button.dataset.revision),choiceId:button.dataset.choice,requestId:crypto.randomUUID()});
   }else{
    if(busy)return;checkOtherTab();const next=choose(state,button.dataset.choice,Number(button.dataset.revision));busy=true;commit(next);setTimeout(()=>{busy=false;renderMain();},300);
   }
   $('main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});return;
  }
  if(button.dataset.item){openItem(button.dataset.item);return;}
  if(button.dataset.use){
   if(mode==='live'){requireLiveReady();await mutateLive('/api/live/item',{sessionId:live.sessionId,revision:state.revision,itemId:button.dataset.use});}
   else{checkOtherTab();commit(useItem(state,button.dataset.use,state.revision));}
   $('dialog').close();return;
  }
  switch(button.dataset.action){
   case 'save':openSave();break;
   case 'restart':restartDialog();break;
   case 'export':await exportSave();break;
   case 'download-file':downloadSave();break;
   case 'copy-save':try{await navigator.clipboard.writeText(exportText);if($('export-status'))$('export-status').textContent='存档文字已复制。下次可在「从存档文字恢复」中粘贴。';}catch{if($('save-code')){$('save-code').focus();$('save-code').select();$('export-status').textContent='存档文字已选中，请按 ⌘C 或 Ctrl+C 复制。';}}break;
   case 'import-text':try{previewImport($('import-text').value);}catch(e){$('import-error').textContent=e.message;}break;
   case 'import':$('import-file').click();break;
   case 'confirm-restart':storageOK=true;$('notice').hidden=true;$('dialog').close();setMode('demo');commit(newGame());window.scrollTo({top:0,behavior:'instant'});break;
   case 'switch-demo':setMode('demo');$('dialog').close();break;
   case 'switch-live':await enterLive();break;
   case 'start-live':{
    if(liveStartLocked())throw Error('请先等待当前步骤完成，或刷新连接状态。');
    const input=$('live-luck'),luck=Number(input.value);
    if(!input.value.trim()||!Number.isInteger(luck)||luck<0||luck>100){$('start-error').textContent='请输入 0 到 100 之间的整数。';input.focus();return;}
    setMode('live');$('dialog').close();await mutateLive('/api/live/start',{luck,requestId:crypto.randomUUID()});break;
   }
   case 'refresh-live':await refreshLive();if($('dialog').open&&$('live-luck'))openStart();break;
   case 'retry-live':if(requestBusy||live?.job?.status!=='error')return;await mutateLive('/api/live/retry',{sessionId:live.sessionId});break;
   case 'director':{
    const effort=$('director-effort').value;button.disabled=true;
    $('dialog').close();await submitDirector(effort);break;
   }
  }
 }catch(e){showNotice(e.message);}
});
document.addEventListener('change',async event=>{
 if(event.target.id!=='import-file')return;const file=event.target.files?.[0];if(!file)return;
 try{
  if(file.size>5000000)throw Error('存档过大，请选择本原型导出的 JSON 存档。');
  previewImport(await file.text());
 }catch(e){const target=$('import-error');if(target)target.textContent=e.message;else showNotice(e.message);event.target.value='';}
});
$('story-tab').addEventListener('click',()=>setTab('story'));
$('journey-tab').addEventListener('click',()=>setTab('journey'));
$('save-button').addEventListener('click',openSave);
$('ai-button').addEventListener('click',async()=>{try{if(mode==='live')openSave();else await enterLive();}catch(e){showNotice(e.message);}});
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
window.addEventListener('storage',event=>{
 if(event.key!==KEY||!event.newValue)return;
 try{
  demoState=restoreSave(event.newValue);
  if(mode==='live')return;
  state=demoState;if($('dialog').open)$('dialog').close();render();showNotice('已同步另一页的最新示例旅程。');
 }catch{if(mode==='demo')showNotice('另一页的存档无法读取，当前进度保留。');}
});
render();save();refreshLive({initial:true});
