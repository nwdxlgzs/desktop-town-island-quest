import { icon,escapeHTML as esc } from './icons.js';
import { createPracticeFiles } from './practice-files.js';

export function mountFileExercise(root,p,{on,finish,tell,shortcut,step}){
  const names=p.files||['查证清单.txt','临时草稿.tmp','素材来源表.xlsx','旧版通知.txt'],targets=p.targets||[0,2],folderName=p.folder||'查证资料',copy=p.operation==='copy';
  const selected=new Set();let fs=createPracticeFiles(names),current='root',clipboard=null,editing=null,multi=false,lastSelected=null,history=[],contextId=null,dragged=[],issue=null;
  root.innerHTML=`<div class="file-manager" aria-label="练习文件资源管理器"><div class="app-titlebar"><span>${icon('folder',17)} 文件资源管理器</span><small>本地练习资料</small></div><div class="app-brief fm-assignment"><b>${copy?'备份清单':'归档清单'}：</b>${targets.map(i=>esc(names[i])).join('、')} → <b>${esc(folderName)}</b>。${copy?'保留资料区中的原件。':'其他文件留在原处。'}</div><div class="fm-toolbar"><button id="new-folder">${icon('folder-plus',16)}新建文件夹</button><button data-fm-action="cut">${icon('scissors',16)}剪切</button><button data-fm-action="copy">${icon('copy',16)}复制</button><button data-fm-action="paste">${icon('clipboard',16)}粘贴</button><button data-fm-action="rename">${icon('type',16)}重命名</button><button id="fm-check">${icon('check',16)}检查整理结果</button></div><div class="fm-navigation"><button id="fm-back" aria-label="后退">${icon('previous',17)}</button><button id="fm-up" aria-label="上一级">${icon('up',17)}</button><nav id="fm-address" aria-label="当前位置"></nav></div><div class="fm-workspace"><aside id="fm-tree" aria-label="文件夹导航"></aside><div class="fm-main"><div class="fm-columns"><span>名称</span><span>类型</span><span>大小</span></div><div id="fm-items" role="listbox" aria-label="文件与文件夹" aria-multiselectable="true" tabindex="0"></div><div class="fm-file-preview" id="fm-preview" hidden></div></div></div><div id="fm-status" role="status"></div><div class="fm-context" id="fm-context" role="menu" hidden></div></div>`;
  const manager=root.querySelector('.file-manager'),items=root.querySelector('#fm-items'),menu=root.querySelector('#fm-context'),status=root.querySelector('#fm-status'),preview=root.querySelector('#fm-preview');
  const removeButton=document.createElement('button');removeButton.dataset.fmAction='delete';removeButton.textContent='删除';removeButton.title='删除选中的练习文件或文件夹（Delete）';
  manager.querySelector('.fm-toolbar').insertBefore(removeButton,root.querySelector('#fm-check'));
  const recovery=document.createElement('div');recovery.className='exercise-recovery';recovery.hidden=true;recovery.setAttribute('role','alert');
  recovery.innerHTML='<p></p><button type="button" id="fm-reset">重置本题</button>';
  manager.querySelector('.fm-workspace').before(recovery);
  const visible=()=>fs.list(current);
  function closeMenu(){menu.hidden=true;contextId=null;}
  function syncSelection(){for(const row of items.querySelectorAll('[data-entry]')){const active=selected.has(row.dataset.entry);row.classList.toggle('selected',active);row.classList.toggle('cut',clipboard?.mode==='cut'&&clipboard.ids.includes(row.dataset.entry));row.setAttribute('aria-selected',String(active));}status.textContent=`${visible().length} 个项目${selected.size?` · 已选择 ${selected.size} 项`:''}${clipboard?` · ${clipboard.ids.length} 项等待${clipboard.mode==='copy'?'复制':'移动'}`:''}`;for(const b of manager.querySelectorAll('[data-fm-action]'))b.disabled=b.dataset.fmAction==='paste'?!clipboard:b.dataset.fmAction==='rename'?selected.size!==1:!selected.size;}
  function evaluate(){const dest=fs.list('root').find(e=>e.type==='folder'&&e.name===folderName);step(0,!!dest);step(1,multi);step(2,fs.matches(folderName,targets,copy));issue=fs.completionIssue(targets,copy);recovery.hidden=!issue;if(issue)recovery.querySelector('p').textContent=issue.message;}
  function reset(){fs=createPracticeFiles(names);current='root';clipboard=null;editing=null;multi=false;lastSelected=null;history=[];dragged=[];selected.clear();closeMenu();preview.hidden=true;render();items.focus();tell('本题已重置，原始资料已恢复。请按“本题教学”重新操作。',true);}
  function render(focusId){
    items.innerHTML=visible().map(e=>`<div class="fm-entry" data-entry="${e.id}" ${e.source?`data-file="${fs.originals.indexOf(e.source)}"`:''} ${e.type==='folder'?'data-folder':''} role="option" aria-selected="false" tabindex="0" draggable="${editing!==e.id}"><span class="fm-item-name">${icon(e.type==='folder'?'folder':/\.(png|jpg)$/i.test(e.name)?'image':'file',22)}${editing===e.id?`<input id="folder-name" aria-label="项目名称" value="${esc(e.name)}" autocomplete="off" spellcheck="false">`:`<span>${esc(e.name)}</span>`}</span><small>${e.type==='folder'?'文件夹':e.name.split('.').at(-1).toUpperCase()+' 文件'}</small><small>${e.type==='folder'?'—':'12 KB'}</small></div>`).join('')||'<div class="fm-empty">此文件夹为空<br><small>使用粘贴把资料放到这里</small></div>';
    const trail=[];for(let id=current;id;id=fs.entries.get(id)?.parent)trail.unshift(fs.entries.get(id));
    root.querySelector('#fm-address').innerHTML=trail.map(e=>`<button data-nav="${e.id}">${esc(e.name)}</button>`).join('<span>›</span>');
    function tree(parent,depth=0){return fs.list(parent).filter(e=>e.type==='folder').map(e=>`<button data-nav="${e.id}" draggable="true" style="padding-left:${18+depth*14}px" class="${current===e.id?'active':''}" title="${esc(e.name)} · 可拖入文件，按住 Ctrl 拖放可复制">${icon('folder',16)}<span>${esc(e.name)}</span></button>`+tree(e.id,depth+1)).join('');}
    root.querySelector('#fm-tree').innerHTML=`<small>此电脑 · 可拖入资料</small><button data-nav="root" class="${current==='root'?'active':''}">${icon('folder',17)}<span>信息科技资料</span></button>`+tree('root');
    root.querySelector('#fm-back').disabled=!history.length;root.querySelector('#fm-up').disabled=current==='root';syncSelection();evaluate();
    if(editing){const input=items.querySelector('input');input.focus();const dot=fs.entries.get(editing).type==='file'?input.value.lastIndexOf('.'):-1;input.setSelectionRange(0,dot>0?dot:input.value.length);}else if(focusId)items.querySelector(`[data-entry="${focusId}"]`)?.focus();
  }
  function commit(blur=false){
    if(!editing)return true;
    const id=editing,input=items.querySelector('input'),entry=fs.entries.get(id),empty=!input.value.trim();
    const name=empty?(entry.type==='folder'?fs.defaultFolderName(entry.parent,id):entry.name):input.value;
    const error=fs.rename(id,name);
    if(error&&!blur){tell(error);return false;}
    // Keep the clicked item/button in place. Rebuilding the list during blur
    // would swallow its pending click, or destroy a text-selection gesture.
    editing=null;const label=document.createElement('span');label.textContent=entry.name;input.replaceWith(label);
    const row=items.querySelector(`[data-entry="${id}"]`);row.draggable=true;
    for(const nav of manager.querySelectorAll(`[data-nav="${id}"]`))nav.lastChild.textContent=entry.name;
    syncSelection();evaluate();if(!blur)row.focus();
    tell(error?`${error} 已保留原名称，可再次重命名。`:empty?`已使用名称「${entry.name}」。可从清单拖选目标名称，复制后再重命名粘贴。`:'名称已更新。',!error);return true;
  }
  function navigate(id,back=false){if(fs.entries.get(id)?.type!=='folder'||id===current)return;if(!commit())return;closeMenu();if(!back)history.push(current);current=id;selected.clear();preview.hidden=true;render();items.focus();tell(`${fs.entries.get(id).name}已打开。${clipboard?`现在可按 Ctrl+V ${clipboard.mode==='copy'?'复制':'移动'}文件。`:'双击打开不会移动文件。'}`,true);}
  function newFolder(){if(!commit())return;closeMenu();const folder=fs.folder(current);selected.clear();selected.add(folder.id);editing=folder.id;render();tell('已创建文件夹。可以去上方清单拖选目标名称并 Ctrl+C，再选中文件夹 → 重命名 → Ctrl+V → Enter。',true);}
  function check(){if(!commit())return;evaluate();if(issue){tell(issue.message);root.querySelector('#fm-reset').focus();return;}if(fs.matches(folderName,targets,copy)&&multi){if(finish())tell(`${folderName}内的${targets.length}份资料已${copy?'备份':'整理'}好${copy?'，原件仍在资料区':''}。`,true);return;}
    const dest=fs.list('root').find(e=>e.type==='folder'&&e.name===folderName);if(!dest){tell(`请在“信息科技资料”中新建文件夹，并命名为「${folderName}」。`);return;}
    const content=fs.list(dest.id),extra=content.filter(e=>!targets.some(i=>e.source===fs.originals[i]));if(extra.length){tell(`「${extra.map(e=>e.name).join('、')}」不在本次清单。把它移回资料区再检查。`);return;}
    const missing=targets.filter(i=>!content.some(e=>e.source===fs.originals[i]));if(missing.length){tell(`文件夹里还缺「${missing.map(i=>names[i]).join('、')}」。选中后${copy?'复制':'剪切'}，进入文件夹粘贴。`);return;}
    if(copy&&targets.some(i=>fs.entries.get(fs.originals[i])?.parent!=='root')){tell('这次要保留原件。把移动的资料还原，再用复制、粘贴备份。');return;}
    if(!multi){tell(`本题还要练习多选：在资料区按住 Ctrl 逐个选择清单文件，再一起${copy?'复制':'移动'}到目标文件夹。`);return;}
    tell('请核对清单，移动题需将原件放入目标文件夹，其他文件留在资料区。');
  }
  function action(name,id=contextId){if(name!=='rename'&&!commit())return;closeMenu();if(name==='new'){newFolder();return;}if(name==='open'){const entry=fs.entries.get(id||[...selected][0]);if(entry?.type==='folder')navigate(entry.id);else if(entry){preview.hidden=false;preview.textContent=`${entry.name} · ${p.preview||'学习资料预览。整理前先确认名称和用途。'}`;}return;}
    if(name==='rename'){if(selected.size!==1)return;editing=[...selected][0];const parent=fs.entries.get(editing)?.parent;if(parent&&parent!==current){history.push(current);current=parent;}render();return;}
    if(name==='delete'){
      if(!selected.size)return;
      const count=selected.size;fs.remove([...selected]);selected.clear();lastSelected=null;preview.hidden=true;
      history=history.filter(id=>fs.entries.has(id));if(!fs.entries.has(current))current='root';
      if(clipboard){clipboard.ids=clipboard.ids.filter(id=>fs.entries.has(id));if(!clipboard.ids.length)clipboard=null;}
      render();items.focus();tell(issue?.message||`已删除 ${count} 个练习项目。`,!issue);return;
    }
    if(name==='cut'||name==='copy'){const ids=[...selected].filter(id=>id!=='root'&&fs.entries.has(id));if(!ids.length){tell('请先选择需要处理的文件或文件夹。');return;}clipboard={ids,mode:name};syncSelection();tell(`${ids.length} 个项目已${name==='cut'?'剪切':'复制'}，进入目标文件夹后粘贴。`,true);return;}
    if(name==='paste'&&clipboard){const error=fs.transfer(clipboard.ids,current,clipboard.mode==='copy');if(error){tell(error);return;}if(clipboard.mode==='cut')clipboard=null;selected.clear();render();tell(issue?.message||'粘贴完成。可打开文件夹核对内容，再检查整理结果。',!issue);return;}
  }
  on(root.querySelector('#fm-reset'),'click',reset);
  on(root.querySelector('#new-folder'),'click',newFolder);on(root.querySelector('#fm-check'),'click',check);on(root.querySelector('#fm-back'),'click',()=>{const id=history.at(-1);if(id&&commit()){history.pop();navigate(id,true);}});on(root.querySelector('#fm-up'),'click',()=>navigate(fs.entries.get(current).parent));
  on(manager,'click',e=>{const nav=e.target.closest('[data-nav]');if(nav)navigate(nav.dataset.nav);const b=e.target.closest('[data-fm-action]');if(b&&!b.disabled)action(b.dataset.fmAction);});
  on(items,'click',e=>{if(e.target.closest('input'))return;if(!commit())return;closeMenu();const row=e.target.closest('[data-entry]');if(!row){selected.clear();syncSelection();return;}const id=row.dataset.entry;if(e.ctrlKey||e.metaKey){selected.has(id)?selected.delete(id):selected.add(id);}else if(e.shiftKey&&lastSelected){const ids=visible().map(e=>e.id),a=ids.indexOf(lastSelected),b=ids.indexOf(id);selected.clear();ids.slice(Math.min(a,b),Math.max(a,b)+1).forEach(id=>selected.add(id));}else{selected.clear();selected.add(id);}lastSelected=id;if(selected.size>1&&targets.every(i=>selected.has(fs.originals[i]))){multi=true;step(1);}syncSelection();});
  on(items,'dblclick',e=>{const row=e.target.closest('[data-entry]');if(row&&!e.target.closest('input'))action('open',row.dataset.entry);});
  on(items,'focusout',e=>{if(e.target.id==='folder-name')commit(true);});
  on(manager,'contextmenu',e=>{if(e.target.closest('input'))return;e.preventDefault();if(!commit())return;const nav=e.target.closest('#fm-tree [data-nav]'),row=e.target.closest('[data-entry]')||(nav?.dataset.nav!=='root'?nav:null);contextId=row?.dataset.entry||row?.dataset.nav||null;if(row&&!selected.has(contextId)){selected.clear();selected.add(contextId);syncSelection();}if(!row)selected.clear();
    syncSelection();menu.innerHTML=(row?`<button role="menuitem" data-context="open">打开</button><button role="menuitem" data-context="cut">剪切 <kbd>Ctrl+X</kbd></button><button role="menuitem" data-context="copy">复制 <kbd>Ctrl+C</kbd></button><button role="menuitem" data-context="rename" ${selected.size===1?'':'disabled'}>重命名 <kbd>F2</kbd></button>`:`<button role="menuitem" data-context="new">新建文件夹</button><button role="menuitem" data-context="paste" ${clipboard?'':'disabled'}>粘贴 <kbd>Ctrl+V</kbd></button>`);
    if(row)menu.insertAdjacentHTML('beforeend','<button role="menuitem" data-context="delete">删除 <kbd>Delete</kbd></button>');
    menu.hidden=false;const rect=manager.getBoundingClientRect();menu.style.left=Math.max(0,Math.min(e.clientX-rect.left,manager.clientWidth-menu.offsetWidth-4))+'px';menu.style.top=Math.max(0,Math.min(e.clientY-rect.top,manager.clientHeight-menu.offsetHeight-4))+'px';menu.querySelector('button:not(:disabled)')?.focus();
  });
  on(menu,'click',e=>{const b=e.target.closest('[data-context]');if(b&&!b.disabled)action(b.dataset.context);});
  on(document,'pointerdown',e=>{if(!menu.contains(e.target))closeMenu();});
  on(root,'keydown',e=>{if(e.isComposing)return;if(editing){if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const id=editing;editing=null;render(id);}return;}
    const textSelection=window.getSelection();
    if(shortcut(e,'c')&&textSelection?.toString()&&!items.contains(textSelection.anchorNode)&&!items.contains(textSelection.focusNode))return;
    if(e.target.matches('input,textarea'))return;if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();closeMenu();items.focus();return;}
    if(e.key==='Delete'){e.preventDefault();action('delete');return;}
    const commands=[['x','cut'],['c','copy'],['v','paste']];for(const [key,cmd]of commands)if(shortcut(e,key)){e.preventDefault();action(cmd);return;}
    if(shortcut(e,'a')){e.preventDefault();visible().forEach(e=>selected.add(e.id));if(targets.every(i=>selected.has(fs.originals[i]))){multi=true;step(1);}syncSelection();}
    if(e.key==='F2'){e.preventDefault();action('rename');}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='n'){e.preventDefault();newFolder();}if(e.altKey&&e.key==='ArrowUp'){e.preventDefault();navigate(fs.entries.get(current).parent);}if(e.key==='Enter'&&selected.size===1){e.preventDefault();action('open');}
  });
  function clearDrop(){manager.querySelectorAll('.fm-drop-target').forEach(el=>el.classList.remove('fm-drop-target'));}
  function dropTarget(e){const row=e.target.closest('[data-entry]'),nav=e.target.closest('[data-nav]');return nav||(row&&fs.entries.get(row.dataset.entry)?.type==='folder'?row:items.contains(e.target)?items:null);}
  on(manager,'dragstart',e=>{const row=e.target.closest('[data-entry],#fm-tree [data-nav]'),id=row?.dataset.entry||row?.dataset.nav;if(!id||id==='root'||editing){e.preventDefault();return;}if(row.dataset.nav||!selected.has(id)){selected.clear();selected.add(id);syncSelection();}dragged=[...selected].filter(id=>fs.entries.has(id));e.dataTransfer.setData('text/plain','practice-files');e.dataTransfer.effectAllowed='copyMove';});
  on(manager,'dragover',e=>{const target=dropTarget(e);clearDrop();if(!dragged.length||!target)return;e.preventDefault();e.dataTransfer.dropEffect=e.ctrlKey?'copy':'move';target.classList.add('fm-drop-target');status.textContent=`松开以${e.ctrlKey?'复制':'移动'} ${dragged.length} 个项目到「${fs.entries.get(target.dataset.nav||target.dataset.entry||current)?.name}」 · 按住 Ctrl 可复制`;});
  on(manager,'dragleave',e=>{if(!manager.contains(e.relatedTarget))clearDrop();});
  on(manager,'drop',e=>{const target=dropTarget(e);clearDrop();if(!target||!dragged.length||e.dataTransfer.getData('text/plain')!=='practice-files')return;e.preventDefault();const id=target.dataset.nav||target.dataset.entry||current,error=fs.transfer(dragged,id,e.ctrlKey);dragged=[];if(error){syncSelection();tell(error);return;}selected.clear();render();tell(issue?.message||'拖放完成，打开目标文件夹检查一下吧。',!issue);});on(manager,'dragend',()=>{dragged=[];clearDrop();syncSelection();});
  render();
}
