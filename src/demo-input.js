import {escapeHTML as esc} from './icons.js';

const keyName=key=>({' ':'空格',Control:'Ctrl',Meta:'⌘',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Backspace:'Backspace',Enter:'Enter',Tab:'Tab'}[key]||(/^[a-z]$/.test(key)?key.toUpperCase():key));
const shortcut=keys=>({keys,heldKeys:keys.slice(0,-1),label:keys.length>1?`先按住 ${keys.slice(0,-1).join(' + ')}，再按 ${keys.at(-1)}`:'按下后松开'});
export function demoInput(action,platform=globalThis.navigator?.platform||''){
  const modifiers=[action.ctrlKey&&'Ctrl',action.metaKey&&'⌘',action.altKey&&'Alt',action.shiftKey&&'Shift'].filter(Boolean),type=action.type;
  if(type==='key')return shortcut([...modifiers,keyName(action.key)]);
  if(['copyText','paste','imagePaste','undo','repair'].includes(type))return shortcut(type==='repair'?['Backspace']:['Ctrl',({copyText:'C',paste:'V',imagePaste:'V',undo:'Z'})[type]]);
  if(type==='systemCapture')return shortcut(/Mac/i.test(platform)?['⌘','Control','Shift','4']:/Linux/i.test(platform)?['Ctrl','Alt','A']:['Win','Shift','S']);
  if(['fill','insert'].includes(type))return {keys:['输入文字'],label:'键盘输入，留意空格和标点'};
  if(type==='hover')return {keys:[],mouse:'hover',label:'停留，不按鼠标'};
  if(type==='scroll')return {keys:[],mouse:'wheel',label:'向下转动滚轮'};
  if(type==='context')return {keys:[],mouse:'right',label:'单击右键'};
  if(type==='middle')return {keys:[],mouse:'middle',label:'按下滚轮，再松开'};
  if(type==='double')return {keys:[],mouse:'left',label:'快速单击两次',double:true};
  if(['drag','pointerDrag','moveWindow','resizeWindow','selectText','textSelection'].includes(type))return {keys:modifiers,heldKeys:modifiers,mouse:'left',label:modifiers.length?`先按住 ${modifiers.join(' + ')}，再按住左键拖动`:'按住左键 → 拖动 → 松开',hold:true};
  return {keys:modifiers,heldKeys:modifiers,mouse:'left',label:modifiers.length?`先按住 ${modifiers.join(' + ')}，再单击左键`:type==='choose'?'左键选择选项':'单击左键'};
}

export function mountDemoInput(layer){
  const host=document.createElement('div');host.className='demo-input';host.setAttribute('aria-label','演示键鼠操作');
  host.innerHTML='<span class="demo-input-caption">键鼠操作</span><svg class="demo-mouse" viewBox="0 0 50 68" aria-hidden="true"><path class="demo-mouse-body" d="M4 28C4 11 11 4 25 4s21 7 21 24v15c0 15-7 21-21 21S4 58 4 43Z"/><path data-mouse="left" d="M6 28C6 12 12 6 23 6v24H6Z"/><path data-mouse="right" d="M27 6c11 0 17 6 17 22v2H27Z"/><rect data-mouse="middle" x="21" y="14" width="8" height="17" rx="4"/><path class="demo-wheel-arrow" d="M25 36v17m-5-5 5 5 5-5"/></svg><div class="demo-input-keys"></div><span class="demo-input-label" role="status"></span>';
  layer.querySelector('.demo-controls').after(host);const keys=host.querySelector('.demo-input-keys'),label=host.querySelector('.demo-input-label');let current;
  const keycaps=()=>[...keys.querySelectorAll('kbd')],held=()=>keycaps().filter(key=>key.dataset.pressed==='true'&&current?.heldKeys?.includes(key.dataset.key)).map(key=>key.dataset.key);
  function renderKeys(values){keys.innerHTML=values.map((key,i)=>`${i?'<span>+</span>':''}<kbd data-key="${esc(key)}" data-pressed="false"><span>${esc(key)}</span></kbd>`).join('');}
  function update(){host.dataset.pressed=String(host.dataset.mousePressed==='true'||keycaps().some(key=>key.dataset.pressed==='true'));}
  function setKey(name,pressed){const key=keycaps().find(key=>key.dataset.key===name);if(key)key.dataset.pressed=String(pressed);update();}
  const actionName=()=>current?.mouse==='left'?'左键':current?.keys.at(-1)||'按键';
  function show(action){
    current=demoInput(action);host.dataset.type=action.type;host.dataset.mouse=current.mouse||'';host.dataset.mousePressed='false';host.dataset.hold=String(!!current.hold);host.dataset.double=String(!!current.double);host.dataset.pressed='false';host.dataset.phase='ready';
    renderKeys(current.keys);label.textContent=current.label;
  }
  function release(){for(const key of keycaps())key.dataset.pressed='false';host.dataset.mousePressed='false';host.dataset.phase='released';update();}
  return {show,
    holdKey(name){setKey(name,true);host.dataset.phase='modifier-down';label.textContent=`按住 ${held().join(' + ')} 不松开`;},
    releaseKey(name){setKey(name,false);host.dataset.phase=held().length?'modifier-up':'released';label.textContent=`松开 ${name}${held().length?'，'+held().join(' + ')+' 仍按住':''}`;},
    press(){for(const key of keycaps())if(!current.heldKeys?.includes(key.dataset.key))key.dataset.pressed='true';host.dataset.mousePressed=String(['left','right','middle','wheel'].includes(current.mouse));host.dataset.phase='action-down';if(held().length)label.textContent=`保持 ${held().join(' + ')} 按住，${current.hold?'按住左键拖动':(current.mouse?'再单击':'按下 ')+actionName()}`;update();},
    releaseAction(){for(const key of keycaps())if(!current.heldKeys?.includes(key.dataset.key))key.dataset.pressed='false';host.dataset.mousePressed='false';host.dataset.phase='action-up';if(held().length)label.textContent=`松开 ${actionName()}，${held().join(' + ')} 仍按住`;update();},
    release,
    type(text){const value=text===' '?'空格':text==='\n'?'Enter':text==='\t'?'Tab':text;renderKeys([value]);keycaps()[0].dataset.pressed='true';host.dataset.phase='action-down';label.textContent='键盘输入，留意空格和标点';update();},
    clear(){release();keys.replaceChildren();host.dataset.mouse='';host.dataset.phase='ready';label.textContent='';},
    get heldKeys(){return current?.heldKeys||[];},get mouse(){return current?.mouse;},get label(){return label.textContent;}};
}
