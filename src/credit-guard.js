import { creditSourceSelector,creditSourceId,creditTag,creditClass,creditAttribute,creditSelector,creditText,failureAttribute,entranceAnimation,animationEnd } from './check-strings.js';

// Exact, independent copy avoids accepting a checksum collision or changing
// the expected text when an HTML editor replaces the displayed attribution.
// This is an integrity tripwire, not DRM against rewriting the verifier.
function validCredit(node){
  return node?.tagName===creditTag&&node.className===creditClass
    &&node.hasAttribute(creditAttribute)&&node.attributes.length===2
    &&node.childNodes.length===1&&node.firstChild.nodeType===3
    &&node.textContent===creditText;
}
export function createCreditGuard({onViolation}){
  const source=document.querySelector(creditSourceSelector);let failed=false,watching=null,started=false,entranceUntil=0,entranceTimer=0;
  const guideObserver=new MutationObserver(checkGuide),attachmentObserver=new MutationObserver(checkGuide),sourceObserver=new MutationObserver(checkSource);
  function fail(){if(failed)return false;failed=true;dispose();onViolation();return false;}
  function checkSource(){
    const node=source?.content?.firstElementChild;
    if(document.documentElement.hasAttribute(failureAttribute)||!source?.isConnected||source.id!==creditSourceId||source.parentNode!==document.body
      ||source.content?.childElementCount!==1||!validCredit(node))return fail();
    return true;
  }
  function checkGuide(){
    if(!checkSource())return false;
    if(watching&&(!watching.isConnected||watching.querySelectorAll(creditSelector).length!==1||!validCredit(watching.querySelector(creditSelector))))return fail();
    if(watching)for(let node=watching.querySelector(creditSelector);node;node=node.parentElement){
      const style=getComputedStyle(node);
      // The existing modal entrance starts at opacity 0. Recheck at its end,
      // while explicit hiding and zero-opacity ancestors fail immediately.
      const entering=node===watching&&style.animationName===entranceAnimation&&performance.now()<entranceUntil;
      if(node.hidden||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||node.style.opacity==='0'||Number(style.opacity)===0&&!entering)return fail();
    }
    return true;
  }
  function releaseGuide(){guideObserver.disconnect();attachmentObserver.disconnect();clearTimeout(entranceTimer);entranceTimer=0;entranceUntil=0;watching?.removeEventListener(animationEnd,checkGuide);watching=null;}
  function dispose(){releaseGuide();sourceObserver.disconnect();}
  return {
    startCreditGuard(){
      if(failed||!checkSource())return false;
      if(!started){started=true;
        sourceObserver.observe(document.body,{childList:true});
        sourceObserver.observe(source,{attributes:true,childList:true});
        sourceObserver.observe(source.content,{subtree:true,childList:true,characterData:true,attributes:true});
      }
      return true;
    },
    get markup(){return checkSource()?source.innerHTML:'';},
    watchGuide(host){
      releaseGuide();watching=host;entranceUntil=performance.now()+250;if(!checkGuide())return false;
      entranceTimer=setTimeout(()=>{entranceTimer=0;checkGuide();},260);
      host.addEventListener(animationEnd,checkGuide);
      guideObserver.observe(host,{subtree:true,childList:true,characterData:true,attributes:true});
      // Observe only ancestor child lists, not the whole game's changing DOM.
      // Removing the guide host/layer otherwise leaves its subtree silent.
      for(let parent=host.parentElement;parent;parent=parent.parentElement)attachmentObserver.observe(parent,{childList:true,attributes:true,attributeFilter:['hidden','style','class']});
      return true;
    },
    releaseGuide,disposeCreditGuard:dispose
  };
}
