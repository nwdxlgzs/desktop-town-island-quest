import './onboarding.css';

const steps=[
  {target:'#fullscreen',title:'先打开游戏全屏',text:'点击亮起来的全屏按钮，让小岛铺满窗口。以后再点一次，或按 Esc，就能退出全屏。',action:'试试游戏全屏'},
  {target:'#world-container',title:'走进工坊，动手试一试',text:'点击地面可以走路，点击工坊牌子或整个工作区可以前往练习。也可以用 WASD 或方向键移动，靠近工作区按 E 开始。按住 Shift 跑步，空格跳跃。',action:'记住了，下一步'},
  {target:'#island-route',title:'完成工坊，乘船去下一岛',text:'这里可以查看岛屿航线。完成本岛的全部工坊后，点击码头小船或靠近按 E 启航；解锁过的岛屿也可以乘船往返。',action:'下一步'},
  {target:'#quality-settings',title:'画质和帮助，随时都能找',text:'齿轮可以调整画质和查看 FPS。右上角的问号打开操作手册，也能重看这份按钮指引。探索进度会自动保存。',action:'出发，探索小岛'}
];

export function createOnboarding({isComplete,onComplete,isFullscreen}){
  let layer=null,index=0,controller=null,observer=null,frame=0,target=null,oldDescription=null;
  function clearTarget(){
    if(!target)return;
    if(oldDescription===null)target.removeAttribute('aria-describedby');else target.setAttribute('aria-describedby',oldDescription);
    target=null;
  }
  function finish(remember=true){
    if(!layer)return;
    clearTarget();controller.abort();observer.disconnect();cancelAnimationFrame(frame);frame=0;
    layer.remove();layer=null;if(remember)onComplete();document.querySelector('#world-container canvas')?.focus({preventScroll:true});
  }
  function next(){if(index===steps.length-1)finish();else{index++;render();}}
  function position(){
    if(!layer||!target)return;
    const w=window.innerWidth,h=window.innerHeight,r=target.getBoundingClientRect(),pad=6;
    const left=Math.min(w,Math.max(0,r.left-pad)),top=Math.min(h,Math.max(0,r.top-pad)),right=Math.max(0,Math.min(w,r.right+pad)),bottom=Math.max(0,Math.min(h,r.bottom+pad));
    const rects=[[0,0,w,top],[0,top,left,Math.max(0,bottom-top)],[right,top,w-right,Math.max(0,bottom-top)],[0,bottom,w,h-bottom]];
    layer.querySelectorAll('.onboarding-shade').forEach((el,i)=>{const [x,y,width,height]=rects[i];Object.assign(el.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px'});});
    Object.assign(layer.querySelector('.onboarding-ring').style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
    const card=layer.querySelector('.onboarding-card'),cw=card.offsetWidth,ch=card.offsetHeight;
    const x=Math.max(12,Math.min(w-cw-12,index===1?w-cw-24:right-cw));
    let y=bottom+18;if(y+ch>h-12)y=top-ch-18;if(y<12)y=Math.max(12,h-ch-20);
    Object.assign(card.style,{left:x+'px',top:y+'px'});
  }
  function schedulePosition(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;position();});}
  function render(){
    clearTarget();const step=steps[index];target=document.querySelector(step.target);
    if(!target){finish();return;}
    oldDescription=target.getAttribute('aria-describedby');target.setAttribute('aria-describedby','onboarding-text');
    layer.dataset.step=String(index);
    layer.querySelector('.onboarding-count').textContent=`启航前的小提示 · ${index+1} / ${steps.length}`;
    layer.querySelector('#onboarding-title').textContent=step.title;layer.querySelector('#onboarding-text').textContent=step.text;
    layer.querySelector('#onboarding-next').textContent=index===0&&isFullscreen()?'已经全屏，继续':step.action;
    layer.querySelector('#onboarding-back').hidden=index===0;
    layer.querySelectorAll('.onboarding-dot').forEach((el,i)=>el.classList.toggle('current',i===index));
    if(index===0)target.scrollIntoView({block:'nearest',inline:'nearest'});
    position();schedulePosition();
    (index===0?target:layer.querySelector('#onboarding-next')).focus({preventScroll:true});
  }
  function start(force=false){
    if(layer||!force&&isComplete())return false;
    index=0;controller=new AbortController();const options={signal:controller.signal};
    layer=document.createElement('div');layer.className='onboarding-layer';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-labelledby','onboarding-title');
    layer.innerHTML=`${'<div class="onboarding-shade"></div>'.repeat(4)}<div class="onboarding-ring" aria-hidden="true"></div><section class="onboarding-card"><div class="onboarding-top"><span class="onboarding-count"></span><button id="onboarding-skip">跳过指引</button></div><h2 id="onboarding-title"></h2><p id="onboarding-text"></p><div class="onboarding-bottom"><div class="onboarding-dots" aria-hidden="true">${'<i class="onboarding-dot"></i>'.repeat(steps.length)}</div><button id="onboarding-back">上一步</button><button class="primary" id="onboarding-next"></button></div></section>`;
    document.body.append(layer);
    layer.querySelector('#onboarding-skip').addEventListener('click',finish,options);
    layer.querySelector('#onboarding-back').addEventListener('click',()=>{index--;render();},options);
    layer.querySelector('#onboarding-next').addEventListener('click',()=>{
      if(index===0&&!isFullscreen())target.click();else next();
    },options);
    document.addEventListener('click',e=>{
      if(!target?.contains(e.target)||layer.contains(e.target))return;
      if(index===0)return;
      e.preventDefault();e.stopImmediatePropagation();
    },{...options,capture:true});
    // Observe after the real button handler has changed the layout. A
    // microtask in capture can run before that handler for native mouse input.
    document.addEventListener('click',e=>{if(index===0&&target?.contains(e.target)&&isFullscreen())next();},options);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish();return;}
      if(e.key!=='Tab')return;
      const controls=[...(index===0?[target]:[]),...layer.querySelectorAll('button:not([hidden])')],current=controls.indexOf(document.activeElement);
      e.preventDefault();e.stopImmediatePropagation();controls[(current+(e.shiftKey?-1:1)+controls.length)%controls.length].focus({preventScroll:true});
    },{...options,capture:true});
    window.addEventListener('resize',schedulePosition,options);document.addEventListener('scroll',schedulePosition,{...options,capture:true});
    observer=new ResizeObserver(schedulePosition);observer.observe(document.querySelector('#world-container'));
    render();return true;
  }
  return {start,dispose:()=>finish(false),get active(){return !!layer;}};
}
