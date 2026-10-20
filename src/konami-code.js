const sequence=['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];

export function installKonamiCode(target,{activate,enabled=()=>true,now=()=>performance.now()}){
  let entered=[],lastTime=-Infinity;
  function keydown(event){
    if(event.repeat)return;
    if(!enabled()||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')){entered=[];return;}
    const time=now();if(time-lastTime>5000)entered=[];lastTime=time;
    entered.push(event.key.toLowerCase());
    while(entered.length&&!entered.every((key,i)=>key===sequence[i]))entered.shift();
    if(entered.length===sequence.length){entered=[];activate();}
  }
  target.addEventListener('keydown',keydown,{capture:true});
  return ()=>target.removeEventListener('keydown',keydown,true);
}
