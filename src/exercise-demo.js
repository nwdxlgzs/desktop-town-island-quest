import { mountExercise } from './exercises.js';
import { tasks } from './curriculum.js';
import { demoActions } from './demo-actions.js';
import { icon,escapeHTML as esc } from './icons.js';
import {mountDemoInput} from './demo-input.js';

export function openExerciseDemo(taskId,{capture=()=>'',autoplay=true,timing=1}={}){
  const task=typeof taskId==='object'?taskId:tasks[taskId],actions=demoActions(task),previous=document.activeElement,layer=document.createElement('div'),previousRanges=[];
  const selection=window.getSelection();for(let i=0;i<(selection?.rangeCount||0);i++)previousRanges.push(selection.getRangeAt(i).cloneRange());
  const events=new AbortController(),options={signal:events.signal},delays=new Set(),resumes=new Set();
  let disposed=false,paused=!autoplay,automatic=autoplay,index=0,version=0,busy=false,cleanup=null,scheduled=0,completed=false,clipboard='',sample=null,pointed=null;
  layer.className='exercise-demo-layer';layer.dataset.kind=task.kind;layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','本题自动操作演示');
  layer.innerHTML=`<section class="exercise-demo"><header class="demo-header"><div><small>看演示，再自己做</small><h2>${esc(task.title)}</h2></div><button class="demo-close" aria-label="关闭演示，返回原题">${icon('close',22)}返回自己做</button></header><div class="demo-instruction" role="status" aria-live="polite"><b></b><span></span></div><div class="demo-controls"><button class="demo-pause">暂停演示</button><button class="demo-replay">${icon('reset',16)}从头重播</button><label>速度<select class="demo-speed"><option value="0.7">慢速</option><option value="1" selected>正常</option><option value="2">快速</option></select></label><span class="demo-boundary">演示区自动操作，原题进度保留</span><span class="demo-clipboard" hidden role="status"><b></b><span></span></span></div><div class="demo-viewport"><div class="demo-question"><p class="instruction">${esc(task.instruction)}</p><button class="text-button demo-hint-toggle" aria-expanded="false">${icon('help',17)}操作提示</button><div class="hint-box demo-question-hint" hidden><p>${esc(task.hint)}</p></div></div><div class="exercise demo-exercise"></div></div><footer class="demo-feedback" aria-live="polite"></footer><div class="demo-cursor" aria-hidden="true"><svg viewBox="0 0 32 40"><path d="M2 2v30l8-8 7 13 6-3-7-12h12z" fill="#fff4ae" stroke="#693c12" stroke-width="2"/></svg><span></span></div></section>`;
  document.body.append(layer);
  const inputDisplay=mountDemoInput(layer);
  const root=layer.querySelector('.demo-exercise'),viewport=layer.querySelector('.demo-viewport'),cursor=layer.querySelector('.demo-cursor'),message=layer.querySelector('.demo-feedback'),pauseButton=layer.querySelector('.demo-pause');
  const speed=()=>Number(layer.querySelector('.demo-speed').value);
  function moveCursor(x,y){cursor.style.left=x+'px';cursor.style.top=y+'px';cursor.dataset.labelSide=x>window.innerWidth/2?'left':'right';}
  function positionCursor(){
    if(!pointed?.isConnected||cursor.hidden)return;
    const r=pointed.getBoundingClientRect(),bounds=viewport.getBoundingClientRect();
    moveCursor(Math.max(bounds.left+4,Math.min(bounds.right-34,r.left+Math.min(r.width*.5,90))),Math.max(bounds.top+4,Math.min(bounds.bottom-42,r.top+r.height*.5)));
  }
  const check=v=>{if(disposed||v!==version)throw new DOMException('Demonstration stopped','AbortError');};
  async function gate(v){check(v);if(paused)await new Promise(resolve=>resumes.add(resolve));check(v);}
  async function wait(ms,v){
    await gate(v);if(timing===0)return;
    let remaining=ms*timing/speed();
    while(remaining>0){await gate(v);const portion=Math.min(50,remaining);await new Promise(resolve=>{const entry={resolve,id:0};entry.id=setTimeout(()=>{delays.delete(entry);resolve();},portion);delays.add(entry);});check(v);remaining-=portion;}
    await gate(v);
  }
  async function settle(ms,v){if(ms)await new Promise(resolve=>{const entry={resolve,id:0};entry.id=setTimeout(()=>{delays.delete(entry);resolve();},ms);delays.add(entry);});check(v);}
  function cancelWaits(){clearTimeout(scheduled);scheduled=0;for(const entry of delays){clearTimeout(entry.id);entry.resolve();}delays.clear();for(const resolve of resumes)resolve();resumes.clear();}
  function resolve(action){
    let el=viewport.querySelector(action.target);
    if(action.type==='tab')el=[...el.querySelectorAll('[data-browser-tab]')].find(button=>button.textContent===action.title);
    if(action.type==='filter'||action.type==='attachment')el=[...el.querySelectorAll('label')].find(label=>label.textContent.trim()===action.value)?.querySelector('input');
    if(!el)throw new Error('未找到演示控件：'+action.target);
    return el;
  }
  function event(el,type,extra={}){el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,...extra}));}
  function pointer(el,type,x,y,extra={}){el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,button:0,pointerId:1,clientX:x,clientY:y,...extra}));}
  function setValue(el,value){el.value=value;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));}
  function click(el,extra={}){el.focus({preventScroll:true});pointer(el,'pointerdown',0,0,extra);pointer(el,'pointerup',0,0,extra);event(el,'click',extra);}
  function keyboard(el,key,extra={}){
    el.focus({preventScroll:true});el.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}));
    if(extra.ctrlKey&&key==='a'&&el.select){el.select();el.dispatchEvent(new Event('select',{bubbles:true}));}
    if(extra.ctrlKey&&['c','x'].includes(key)){
      const selection=window.getSelection();
      clipboard=typeof el.value==='string'?el.value.slice(el.selectionStart,el.selectionEnd):el.contains(selection?.anchorNode)&&el.contains(selection?.focusNode)?selection.toString():'';
      const data=new DataTransfer();data.setData('text/plain',clipboard);el.dispatchEvent(new ClipboardEvent(key==='x'?'cut':'copy',{bubbles:true,cancelable:true,clipboardData:data}));
      if(key==='x'&&typeof el.value==='string'&&!el.readOnly)setValue(el,el.value.slice(0,el.selectionStart)+el.value.slice(el.selectionEnd));
    }
    if((key==='Home'||key==='End')&&el.setSelectionRange){const at=key==='Home'?0:el.value.length;el.setSelectionRange(at,at);}
    el.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true,...extra}));
  }
  function modifier(el,key,pressed,held){
    const name={Ctrl:'Control','⌘':'Meta',Win:'Meta'}[key]||key;
    (el.isConnected?el:root).dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{key:name,bubbles:true,cancelable:true,ctrlKey:held.includes('Ctrl')||held.includes('Control'),metaKey:held.includes('⌘')||held.includes('Win'),altKey:held.includes('Alt'),shiftKey:held.includes('Shift')}));
  }
  function inputLabel(){cursor.querySelector('span').textContent=inputDisplay.label;}
  async function point(el,label,v,at=null){
    viewport.querySelectorAll('.demo-target').forEach(node=>node.classList.remove('demo-target'));el.classList.add('demo-target');
    el.scrollIntoView({block:'nearest',inline:'nearest'});
    pointed=el;cursor.querySelector('span').textContent=label;cursor.hidden=false;positionCursor();
    await wait(650,v);
  }
  async function fill(el,value,v){
    el.focus({preventScroll:true});
    if(['date','time','number'].includes(el.type)){inputDisplay.type(value);setValue(el,value);el.dispatchEvent(new Event('change',{bubbles:true}));return;}
    setValue(el,'');const chars=[...value],chunk=Math.max(1,Math.ceil(chars.length/55));
    for(let i=chunk;i<chars.length+chunk;i+=chunk){await wait(70,v);inputDisplay.type(chars.slice(Math.max(0,i-chunk),i).join(''));setValue(el,chars.slice(0,i).join(''));}
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function clipboardStatus(label){
    const badge=layer.querySelector('.demo-clipboard');badge.hidden=false;badge.querySelector('b').textContent=label;badge.querySelector('span').textContent=clipboard;
    pointed?.scrollIntoView({block:'nearest',inline:'nearest'});positionCursor();
  }
  async function selectText(el,value,v){
    if(typeof el.value==='string'){
      const start=el.value.indexOf(value);if(start<0)throw new Error('草稿中未找到待选文字');
      el.focus({preventScroll:true});el.setSelectionRange(start,start+value.length);el.dispatchEvent(new Event('select',{bubbles:true}));await wait(550,v);return;
    }
    const start=el.textContent.indexOf(value);if(start<0||!value)throw new Error('资料中未找到要复制的文字');
    // Select text from the visible question/material, including wrapped lines and nested spans.
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];let node,offset=0;
    while((node=walker.nextNode())){nodes.push({node,start:offset,end:offset+node.length});offset+=node.length;}
    const boundary=at=>{const entry=nodes.find(item=>at>=item.start&&at<=item.end);return [entry.node,at-entry.start];};
    const range=document.createRange(),selection=window.getSelection();el.tabIndex=-1;el.focus({preventScroll:true});
    range.setStart(...boundary(start));range.collapse(true);selection.removeAllRanges();selection.addRange(range);
    const first=document.createRange();first.setStart(...boundary(start));first.setEnd(...boundary(start+1));const origin=first.getBoundingClientRect();moveCursor(origin.left,origin.top+origin.height/2);
    for(let i=1;i<=16;i++){
      await wait(55,v);const end=start+Math.max(1,Math.ceil(value.length*i/16));range.setEnd(...boundary(end));selection.removeAllRanges();selection.addRange(range);
      const rect=[...range.getClientRects()].at(-1);if(rect)moveCursor(rect.right,rect.top+rect.height/2);
    }
    document.dispatchEvent(new Event('selectionchange'));await wait(450,v);
  }
  function paste(el){
    keyboard(el,'v',{ctrlKey:true});
    const data=new DataTransfer();data.setData('text/plain',clipboard);
    if(el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))){
      el.setRangeText(clipboard,el.selectionStart,el.selectionEnd,'end');el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:clipboard}));
    }
    clipboardStatus('Ctrl+V · 已粘贴');
  }
  async function pointerDrag(el,start,end,v){
    // Synthetic demonstrations need no OS pointer capture; only this isolated
    // exercise instance uses these local no-op capture functions.
    el.setPointerCapture=()=>{};el.releasePointerCapture=()=>{};
    pointer(el,'pointerdown',start.x,start.y);
    for(let i=1;i<=16;i++){await wait(50,v);const x=start.x+(end.x-start.x)*i/16,y=start.y+(end.y-start.y)*i/16;moveCursor(x,y);pointer(el,'pointermove',x,y,{buttons:1});}
    pointer(el,'pointerup',end.x,end.y);
  }
  async function perform(action,el,v){
    const type=action.type;
    if(type==='click'||type==='tab')click(el,{ctrlKey:!!action.ctrlKey,shiftKey:!!action.shiftKey});
    else if(type==='double'){click(el);await wait(110,v);inputDisplay.release();await wait(80,v);inputDisplay.press();click(el);event(el,'dblclick',{detail:2});}
    else if(type==='context'){const r=el.getBoundingClientRect();event(el,'contextmenu',{button:2,clientX:r.left+20,clientY:r.top+20});}
    else if(type==='middle'){pointer(el,'pointerdown',0,0,{button:1});await wait(300,v);event(el,'auxclick',{button:1});}
    else if(type==='hover'){el.focus({preventScroll:true});pointer(el,'pointerenter',0,0);}
    else if(type==='fill')await fill(el,action.value,v);
    else if(type==='choose'){el.value=action.value;el.dispatchEvent(new Event('change',{bubbles:true}));}
    else if(['check','filter','attachment'].includes(type)){if(el.checked!==(action.checked??true))el.click();}
    else if(type==='key'){keyboard(el,action.key,action);if(action.to)root.querySelector(action.to)?.focus({preventScroll:true});}
    else if(type==='selectText')await selectText(el,action.value,v);
    else if(type==='copyText'){keyboard(el,'c',{ctrlKey:true});if(!clipboard)throw new Error('请先选中资料文字再复制');clipboardStatus('Ctrl+C · 已复制');await wait(600,v);}
    else if(type==='paste')paste(el);
    else if(type==='undo'){keyboard(el,'z',{ctrlKey:true});setValue(el,action.value);}
    else if(type==='insert'){const at=el.selectionStart;inputDisplay.type(action.value);setValue(el,el.value.slice(0,at)+action.value+el.value.slice(el.selectionEnd));el.setSelectionRange(at+action.value.length,at+action.value.length);}
    else if(type==='repair'){
      const at=action.at+1;el.setSelectionRange(at,at);keyboard(el,'Backspace');setValue(el,action.initial.slice(0,at-1)+action.initial.slice(at));
      if(el.value!==action.expected){await wait(420,v);await fill(el,action.expected,v);}
    }
    else if(type==='submit')el.requestSubmit();
    else if(type==='scroll'){el.dispatchEvent(new WheelEvent('wheel',{deltaY:400,bubbles:true}));const target=root.querySelector(action.to);target.scrollIntoView({block:'nearest'});}
    else if(type==='textSelection'){await selectText(el,el.textContent,v);pointer(el,'pointerup',0,0);}
    else if(type==='drag'){
      const destination=root.querySelector(action.to),data=new DataTransfer();el.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));
      const from=el.getBoundingClientRect();destination.scrollIntoView({block:'nearest'});const to=destination.getBoundingClientRect();
      for(let i=1;i<=16;i++){await wait(50,v);moveCursor(from.left+from.width/2+(to.left+to.width/2-from.left-from.width/2)*i/16,from.top+from.height/2+(to.top+to.height/2-from.top-from.height/2)*i/16);}
      destination.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));destination.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));el.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:data}));
    }
    else if(type==='pointerDrag'){
      const r=el.getBoundingClientRect(),s=action.rect;
      await pointerDrag(el,{x:r.left+s.x/action.width*r.width,y:r.top+s.y/action.height*r.height},{x:r.left+(s.x+s.w)/action.width*r.width,y:r.top+(s.y+s.h)/action.height*r.height},v);
    }
    else if(type==='moveWindow'||type==='resizeWindow'){
      const r=el.getBoundingClientRect(),stage=root.querySelector('.window-stage'),bounds=stage.getBoundingClientRect();
      const start={x:r.left+Math.min(35,r.width/2),y:r.top+Math.min(10,r.height/2)},end=type==='moveWindow'?{x:bounds.left+bounds.width*.32+35,y:start.y}:{x:start.x+90,y:start.y+65};
      await pointerDrag(el,start,end,v);
    }
    else if(type==='systemCapture'){
      const canvas=document.createElement('canvas');canvas.width=520;canvas.height=250;const ctx=canvas.getContext('2d');ctx.fillStyle='#e9f0df';ctx.fillRect(0,0,520,250);ctx.fillStyle='#396851';ctx.font='bold 26px sans-serif';ctx.fillText('信息科技学习图卡',40,85);ctx.font='20px sans-serif';ctx.fillText('只截需要的区域，避开个人信息',40,130);ctx.strokeStyle='#ce8b22';ctx.setLineDash([8,5]);ctx.lineWidth=4;ctx.strokeRect(20,25,480,190);
      const preview=document.createElement('section');preview.className='demo-system-shot';preview.innerHTML='<b>系统截图操作示意</b><p>Windows：Win+Shift+S · UOS：Ctrl+Alt+A · Mac：⌘+Control+Shift+4</p><small>实际练习时自行打开系统截图工具，这里使用示例图片展示框选与粘贴。</small>';preview.append(canvas);el.before(preview);
      sample=await new Promise(resolve=>canvas.toBlob(blob=>resolve(new File([blob],'教学示例截图.png',{type:'image/png'}))));await wait(1200,v);
    }
    else if(type==='imagePaste'){root.querySelector('.demo-system-shot')?.remove();el.focus({preventScroll:true});const data=new DataTransfer();data.items.add(sample);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));}
    else throw new Error('Unknown demonstration action: '+type);
    await settle(action.settle||0,v);
  }
  function status(){
    if(index===actions.length){layer.dataset.complete=String(completed);layer.querySelector('.demo-instruction b').textContent=completed?'演示完成，轮到你来试一试':'演示尚未通过，请从头重播';layer.querySelector('.demo-instruction span').textContent=completed?'点击右上角“返回自己做”，原题仍保留着你刚才的操作。':'可以重播查看操作过程。';cursor.hidden=true;pauseButton.disabled=true;}
  }
  function schedule(){if(automatic&&!paused&&!disposed&&index<actions.length)scheduled=setTimeout(()=>advance().catch(()=>{}),timing===0?0:500);}
  async function advance(){
    if(busy||disposed||index>=actions.length)return;const v=version;busy=true;
    try{
      await gate(v);const action=actions[index];layer.dataset.step=String(index);layer.querySelector('.demo-instruction b').textContent=`第 ${index+1} / ${actions.length} 步`;layer.querySelector('.demo-instruction span').textContent=action.label;
      inputDisplay.show(action);const el=resolve(action);await point(el,inputDisplay.label,v);
      const held=[];
      for(const key of inputDisplay.heldKeys){held.push(key);inputDisplay.holdKey(key);inputLabel();modifier(el,key,true,held);await wait(600,v);}
      inputDisplay.press();inputLabel();cursor.classList.toggle('demo-press',['left','right','middle'].includes(inputDisplay.mouse));await perform(action,el,v);await wait(420,v);
      inputDisplay.releaseAction();cursor.classList.remove('demo-press');inputLabel();
      if(held.length)await wait(280,v);
      while(held.length){const key=held.pop();inputDisplay.releaseKey(key);inputLabel();modifier(el,key,false,held);await wait(280,v);}
      inputDisplay.release();check(v);index++;status();
    }catch(error){if(error.name!=='AbortError'){inputDisplay.release();cursor.classList.remove('demo-press');layer.dataset.error=error.message;message.textContent='演示遇到问题，请从头重播。';paused=true;pauseButton.textContent='继续演示';layer.dataset.paused='true';}throw error;}
    finally{if(v===version){busy=false;schedule();}}
  }
  function reset(){
    version++;cancelWaits();cleanup?.();busy=false;index=0;completed=false;clipboard='';sample=null;delete layer.dataset.complete;delete layer.dataset.error;pauseButton.disabled=false;message.textContent='';
    inputDisplay.clear();cursor.classList.remove('demo-press');
    if(paused)layer.dataset.paused='true';else delete layer.dataset.paused;
    cleanup=mountExercise(taskId,root,{teaching:false,capture,sound(){},feedback(text){message.textContent=text;},success(){completed=true;return true;}});
    layer.querySelector('.demo-clipboard').hidden=true;layer.querySelector('.demo-question-hint').hidden=true;layer.querySelector('.demo-hint-toggle').setAttribute('aria-expanded','false');
    pauseButton.textContent=paused?'继续演示':'暂停演示';schedule();
  }
  function pause(){paused=true;clearTimeout(scheduled);pauseButton.textContent='继续演示';layer.dataset.paused='true';}
  function play(){paused=false;delete layer.dataset.paused;pauseButton.textContent='暂停演示';for(const resolve of resumes)resolve();resumes.clear();if(!busy)schedule();}
  function dispose(){if(disposed)return;disposed=true;version++;cancelWaits();cleanup?.();events.abort();layer.remove();if(previous?.isConnected)previous.focus({preventScroll:true});const selection=window.getSelection();for(const range of previousRanges)if(range.startContainer.isConnected&&range.endContainer.isConnected)selection?.addRange(range);}
  layer.querySelector('.demo-close').addEventListener('click',dispose,options);pauseButton.addEventListener('click',()=>paused?play():pause(),options);
  layer.querySelector('.demo-replay').addEventListener('click',()=>{paused=false;automatic=true;reset();},options);
  layer.querySelector('.demo-hint-toggle').addEventListener('click',()=>{const hint=layer.querySelector('.demo-question-hint');hint.hidden=!hint.hidden;layer.querySelector('.demo-hint-toggle').setAttribute('aria-expanded',String(!hint.hidden));},options);
  window.addEventListener('resize',()=>{if(pointed?.isConnected)pointed.scrollIntoView({block:'nearest',inline:'nearest'});positionCursor();},options);viewport.addEventListener('scroll',positionCursor,{...options,capture:true});
  // Learners watch this separate exercise; real input cannot alter its script.
  viewport.addEventListener('pointerdown',e=>{if(e.isTrusted){e.preventDefault();e.stopImmediatePropagation();}},{...options,capture:true});
  document.addEventListener('keydown',e=>{
    if(!e.isTrusted)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();dispose();return;}
    if(e.key==='Tab'){
      const controls=[...layer.querySelectorAll('.demo-header button,.demo-controls button:not(:disabled),.demo-controls select')],at=controls.indexOf(document.activeElement);e.preventDefault();e.stopImmediatePropagation();controls[(at+(e.shiftKey?-1:1)+controls.length)%controls.length].focus();return;
    }
    if(!layer.querySelector('.demo-header').contains(e.target)&&!layer.querySelector('.demo-controls').contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}
  },{...options,capture:true});
  reset();layer.querySelector('.demo-close').focus({preventScroll:true});
  return {dispose,pause,play,get completed(){return completed;},get step(){return index;},get count(){return actions.length;},async runAll(){automatic=false;play();while(index<actions.length&&!disposed)await advance();return completed;}};
}
