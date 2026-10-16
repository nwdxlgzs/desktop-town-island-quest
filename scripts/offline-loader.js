import { gunzipSync,strFromU8 } from 'fflate';
import { digest64 } from '../src/digest.js';
import { watchReleaseIntegrity } from '../src/release-integrity.js';
import { policyEvent,failedEvent,failureFlag,stoppedFlag,roleAttribute,alertRole,appSelector,policySelector,bootstrapSelector,programSelector,entryId,charsetAttribute,hashPrefix,loaderMessage } from '../src/check-strings.js';

// Compression is only a delivery optimization. Flow checks live in the game.
function fail(){
  document.documentElement.dataset[failureFlag]='true';
  document.dispatchEvent(new Event(failedEvent));
}
let check=()=>true;
// CSP has already blocked the attempted resource. Only content changes to
// delivered game nodes invalidate the session; an injection attempt alone
// must not shut down an otherwise intact preview.
window.addEventListener(policyEvent,()=>check());
try{
  const policies=document.querySelectorAll(policySelector),policy=policies[0],self=document.querySelector(bootstrapSelector);
  if(policies.length!==1||policy.parentNode!==document.head||policy.previousElementSibling!==document.head.firstElementChild||!document.head.firstElementChild.hasAttribute(charsetAttribute))throw Error();
  const directives=policy.content.split(';').map(value=>value.trim()),allows=(directive,text)=>directives.find(value=>value.startsWith(directive+' '))?.includes(hashPrefix+digest64(text)+"'");
  if(!self||!allows('script-src',self.textContent))throw Error();
  const packed=document.querySelector(programSelector),bytes=Uint8Array.from(atob(packed.textContent.trim()),c=>c.charCodeAt(0)),payload=JSON.parse(strFromU8(gunzipSync(bytes)));
  if(typeof payload.program!=='string'||!Array.isArray(payload.styles)||!payload.styles.length||!payload.styles.every(css=>typeof css==='string'))throw Error();
  if(!allows('script-src',payload.program)||!payload.styles.every(css=>allows('style-src',css)))throw Error();
  const styles=payload.styles.map(css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);return style;});
  const entry=document.createElement('script');entry.id=entryId;entry.type='module';entry.textContent=payload.program;
  document.body.append(entry);
  check=watchReleaseIntegrity({doc:document,loader:self,packed,policy,entry,styles,onViolation:fail});
}catch{
  document.documentElement.dataset[failureFlag]='true';
  const host=document.querySelector(appSelector)||document.body;host.dataset[stoppedFlag]='true';host.setAttribute(roleAttribute,alertRole);host.textContent=loaderMessage;
}
