import { icon,escapeHTML } from './icons.js';
import { randomSource } from './random.js';
import { collectDiscovery,persist } from './state.js';

const sails=[{id:'cream',name:'启航白帆',need:0,color:'#fff7df'},{id:'rose',name:'樱花帆',need:1,color:'#eeadc8'},{id:'aurora',name:'极光帆',need:3,color:'#8ad4cb'},{id:'star',name:'星夜帆',need:6,color:'#b6a9ea'}];

export function createExplorationUI({state,getLevels,getLayout,getWorld,completed,showModal,closeModal,setCleanup,toast,confetti,beep}){
  const progress=()=>state.exploration;
  const shards=()=>getLayout().exploration.filter(d=>d.type==='shard'&&progress().shards.includes(d.id)).length;
  const powered=()=>getLayout().workshops.some(w=>w.tasks.every(completed));
  function sync(){
    getWorld()?.syncExploration(progress());const l=getLayout(),done=progress().restored.includes(l.level.id),n=shards();
    document.querySelector('#explore-objective').innerHTML=`<span>${icon(done?'star':'sparkles',15)} ${escapeHTML(l.level.biome?.name||'自然小岛')}</span><b>${done?'星灯已点亮':`星图 ${n}/3 · 工坊能量 ${powered()?'✓':'0/1'}`}</b>`;
    document.querySelector('#explore-next').textContent=done?'查看收藏':n===3?'前往星灯':'寻找星图';
  }
  function next(){
    if(progress().restored.includes(getLayout().level.id)){journal();return;}
    const l=getLayout(),type=l.exploration.some(d=>d.type==='shard'&&!progress().shards.includes(d.id))?'shard':'beacon';
    getWorld()?.exploreNearest(type,progress().shards);
  }
  function journal(){
    const n=progress().restored.length,visited=getLevels().slice(0,state.unlocked+1),biomes=[...new Map(visited.map(l=>[l.biome?.id,l.biome])).values()].filter(Boolean);
    showModal(`<div class="standard-modal-header"><div><span class="modal-icon">${icon('book',24)}</span><h2 id="modal-title">航海收藏册</h2></div><button class="icon-button" data-close aria-label="返回岛屿">${icon('close',21)}</button></div><div class="journal-body"><p>探索闪光的星图，完成一个工坊获得能量，再挑战星灯记忆。支线可以随时离开，乘船继续上课。</p><div class="journal-stats"><b>${n}<small>座星灯点亮</small></b><b>${biomes.length}<small>种景观到访</small></b><b>${progress().species.length}<small>种生灵观察</small></b></div><h3>给小船换一面帆</h3><div class="sail-choices">${sails.map(s=>`<button data-sail="${s.id}" ${n<s.need?'disabled':''} aria-pressed="${s.id===progress().sail}"><span style="--sail:${s.color}"></span><b>${s.name}</b><small>${n<s.need?`${s.need} 枚星灯印章解锁`:s.id===progress().sail?'正在使用':'已解锁 · 点击换装'}</small></button>`).join('')}</div><h3>沿途印章</h3><div class="stamp-grid">${visited.map(l=>`<span class="${progress().restored.includes(l.id)?'lit':''}">${icon(progress().restored.includes(l.id)?'star':'flag',22)}<b>${escapeHTML(l.name)}</b><small>${escapeHTML(l.biome?.name||'小岛')} · ${progress().restored.includes(l.id)?'星灯已亮':'等待探索'}</small></span>`).join('')}</div><h3>生灵图鉴</h3><p>${progress().species.length?progress().species.map(escapeHTML).join('　·　'):'靠近动物或机器按 E，留下第一次观察记录。每岛最多 4 只。'}</p><p class="journal-note">下一份外观奖励：${sails.find(s=>s.need>n)?.name||'全部船帆已解锁'}${sails.find(s=>s.need>n)?`，再点亮 ${sails.find(s=>s.need>n).need-n} 座星灯。`:'，继续收集各岛印章吧。'}</p></div>`,'journal-modal');
    document.querySelectorAll('[data-sail]').forEach(el=>el.addEventListener('click',()=>{const s=sails.find(s=>s.id===el.dataset.sail);if(n<s.need)return;progress().sail=s.id;persist();sync();journal();}));
  }
  function memory(){
    const l=getLayout(),random=randomSource(l.seed^0xA54FF53A),length=4+Math.min(2,progress().restored.length),sequence=Array.from({length},()=>Math.floor(random()*6));
    showModal(`<div class="standard-modal-header"><div><span class="modal-icon">${icon('sparkles',24)}</span><h2 id="modal-title">唤醒古老星灯</h2></div><button class="icon-button" data-close aria-label="稍后再来">${icon('close',21)}</button></div><div class="star-game"><span class="star-game-eyebrow">${escapeHTML(l.level.biome?.name||'群岛')} · 星灯记忆</span><p>看星光依次亮起，然后按相同顺序触碰星星。也可以按数字键 1–6。没有时间限制，随时重看。</p><div class="constellation">${['#edc985','#e7adc3','#94bfdc','#a9ce9b','#bca5db','#8fd4cc'].map((color,i)=>`<button data-star="${i}" style="--star:${color};--x:${[20,52,83,72,40,13][i]}%;--y:${[28,15,32,74,85,66][i]}%" aria-label="星星 ${i+1}" disabled>${icon('star',28)}<small>${i+1}</small></button>`).join('')}<div class="star-core">${icon('sparkles',30)}</div></div><div id="star-status" role="status" aria-live="polite">准备好了吗？</div><div class="star-game-actions"><button class="secondary" id="star-replay">开始 / 重看星光</button><button class="text-button" id="star-later">稍后再来</button></div></div>`,'star-modal');
    const buttons=[...document.querySelectorAll('[data-star]')],status=document.querySelector('#star-status'),replay=document.querySelector('#star-replay'),controller=new AbortController();
    let accepting=false,index=0,timers=[];
    function later(fn,ms){const timer=setTimeout(fn,ms);timers.push(timer);}
    function clear(){timers.forEach(clearTimeout);timers=[];buttons.forEach(b=>b.classList.remove('glowing'));}
    function play(){clear();accepting=false;index=0;replay.disabled=true;buttons.forEach(b=>b.disabled=true);status.textContent='留意星光的顺序…';sequence.forEach((n,i)=>{later(()=>{buttons[n].classList.add('glowing');status.textContent=`第 ${i+1} 束星光 · 星星 ${n+1}`;beep();},500+i*800);later(()=>buttons[n].classList.remove('glowing'),1000+i*800);});later(()=>{accepting=true;replay.disabled=false;buttons.forEach(b=>b.disabled=false);status.textContent=`轮到你了 · 0 / ${length}`;},600+length*800);}
    function choose(n){if(!accepting)return;buttons[n].classList.add('glowing');later(()=>buttons[n].classList.remove('glowing'),220);
      if(sequence[index]!==n){accepting=false;status.textContent='星光的顺序有点不同，重看一次就好。';buttons.forEach(b=>b.disabled=true);return;}
      beep();index++;status.textContent=`星光已连接 · ${index} / ${length}`;
      if(index===length){accepting=false;buttons.forEach(b=>b.disabled=true);if(!progress().restored.includes(l.level.id)){progress().restored.push(l.level.id);persist();}sync();confetti();status.textContent='星灯点亮！印章已放进收藏册。';replay.textContent='查看印章与新船帆';replay.replaceWith(replay.cloneNode(true));document.querySelector('#star-replay').addEventListener('click',journal);}
    }
    buttons.forEach((b,i)=>b.addEventListener('click',()=>choose(i)));replay.addEventListener('click',play);document.querySelector('#star-later').addEventListener('click',closeModal);
    document.addEventListener('keydown',e=>{if(/^[1-6]$/.test(e.key)&&!e.repeat){e.preventDefault();choose(Number(e.key)-1);}},{signal:controller.signal});setCleanup(()=>{clear();controller.abort();});
  }
  function interact(item){
    if(item.type==='shard'){if(collectDiscovery(item)){beep('success');toast(`找到一块星图！本岛 ${shards()}/3。`);}sync();return;}
    if(item.type==='animal'){const first=collectDiscovery(item);toast(first?`新发现：${item.species}！已记入航海图鉴。`:`${item.species}朝你打了个招呼。`);sync();return;}
    if(progress().restored.includes(getLayout().level.id)){journal();return;}
    if(shards()<3){toast(`星灯缺少 ${3-shards()} 块星图，找找岛上闪光的碎片。`);return;}
    if(!powered()){toast('星图已经齐了！完成任意一个工坊，为星灯供能。');return;}
    memory();
  }
  return {sync,next,journal,interact};
}
