// In-memory directories, separate from the DOM. No access to classroom files.
export function createPracticeFiles(names){
  let serial=0;
  const entries=new Map([['root',{id:'root',name:'信息科技资料',type:'folder',parent:null}]]);
  const originals=names.map((name,index)=>{const id=`file-${index}`;entries.set(id,{id,name,type:'file',parent:'root',source:id});return id;});
  const list=parent=>[...entries.values()].filter(item=>item.parent===parent);
  function validName(name){return !!name.trim()&&!/[<>:"/\\|?*\u0000-\u001f]/.test(name)&&!/[. ]$/.test(name)&&name!=='.'&&name!=='..';}
  function unique(parent,name,except){return !list(parent).some(e=>e.id!==except&&e.name.toLocaleLowerCase()===name.toLocaleLowerCase());}
  function rename(id,name){const entry=entries.get(id);if(!entry||id==='root')return '请选择一个文件或文件夹。';name=name.trim();if(!validName(name))return '名称不能为空，也不能包含 / \\ : * ? 等字符。';if(!unique(entry.parent,name,id))return '这里已有同名项目，请换一个名称。';entry.name=name;return null;}
  function defaultFolderName(parent,except){let name='新建文件夹',n=2;while(!unique(parent,name,except))name=`新建文件夹 (${n++})`;return name;}
  function folder(parent){if(entries.get(parent)?.type!=='folder')return null;const name=defaultFolderName(parent),id=`folder-${serial++}`;entries.set(id,{id,name,type:'folder',parent});return entries.get(id);}
  function descendant(id,parent){while(parent){if(parent===id)return true;parent=entries.get(parent)?.parent;}return false;}
  function transfer(ids,parent,copy=false){
    if(entries.get(parent)?.type!=='folder')return '请打开一个文件夹再粘贴。';
    const chosen=[...new Set(ids)].map(id=>entries.get(id));
    if(!chosen.length||chosen.some(e=>!e||e.id==='root'))return '先选择需要处理的文件。';
    if(chosen.some(e=>e.type==='folder'))return '这个练习先移动或复制文件，文件夹用于存放资料。';
    if(chosen.some(e=>descendant(e.id,parent)))return '不能把项目放进它自己。';
    if(chosen.some(e=>!unique(parent,e.name,copy?null:e.id)))return '目标文件夹中已有同名文件，原有内容已保留。';
    for(const item of chosen){if(copy){const id=`copy-${serial++}`;entries.set(id,{...item,id,parent});}else item.parent=parent;}
    return null;
  }
  function remove(ids){for(const id of ids)if(id!=='root'&&entries.has(id)){for(const child of list(id))remove([child.id]);entries.delete(id);}}
  function completionIssue(targets,copy=false){
    const missing=originals.find(id=>!entries.has(id));
    if(missing)return {kind:'deleted-original',message:`操作有误：原始文件「${names[originals.indexOf(missing)]}」已被删除，同名副本不能代替原件，本题已无法按原要求完成。请重置本题后重新操作。`};
    const moved=copy?targets.find(i=>entries.get(originals[i]).parent!=='root'):undefined;
    if(moved!==undefined)return {kind:'moved-original',message:`操作有误：本题要求复制并保留原件，但「${names[moved]}」的原件已被移动。请重置本题，使用“复制 → 粘贴”重新备份。`};
    return null;
  }
  function matches(folderName,targets,copy=false){
    const dest=list('root').find(e=>e.type==='folder'&&e.name===folderName);if(!dest)return false;
    const content=list(dest.id),expected=targets.map(i=>originals[i]);
    return content.length===expected.length&&expected.every(id=>content.some(e=>e.source===id))&&originals.every(id=>entries.get(id)?.parent===(!copy&&expected.includes(id)?dest.id:'root'));
  }
  return {entries,originals,list,rename,folder,defaultFolderName,transfer,remove,matches,completionIssue};
}
