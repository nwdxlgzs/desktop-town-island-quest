import { digest64 } from './digest.js';
import { creditSourceSelector,creditTag,creditClass,creditAttribute,creditText,failureAttribute,bootstrapSelector,entrySelector,policySelector,metaTag,charsetAttribute,programMarker } from './check-strings.js';

// Replaced after bundling. Development keeps its normal unsealed module flow.
const release=typeof document!=='undefined'&&import.meta.env?.PROD?'__ISLAND_RELEASE_BINDING__':null;
const sessions=new WeakMap();
const slots=new WeakMap();
function read(doc){
  const sources=doc.querySelectorAll(creditSourceSelector),source=sources[0],node=source?.content?.firstElementChild,text=node?.textContent;
  if(sources.length!==1||!source.isConnected||source.parentNode!==doc.body||source.content?.childElementCount!==1||node?.tagName!==creditTag||node.className!==creditClass||node.attributes.length!==2||!node.hasAttribute(creditAttribute)||node.childNodes.length!==1||node.firstChild.nodeType!==3||text!==creditText||doc.documentElement.hasAttribute(failureAttribute))return 0;
  let value=2166136261;for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);return value>>>0;
}
function delivery(doc,binding){
  if(!binding)return ()=>true;
  const loader=doc.querySelector(bootstrapSelector),entry=doc.querySelector(entrySelector),policies=doc.querySelectorAll(policySelector),policy=policies[0];
  if(!loader||!entry||policies.length!==1||policy.parentNode!==doc.head||doc.head.firstElementChild?.tagName!==metaTag||!doc.head.firstElementChild.hasAttribute(charsetAttribute)||policy.previousElementSibling!==doc.head.firstElementChild||digest64(loader.textContent)!==binding[0])return ()=>false;
  const a=loader.textContent,b=entry.textContent,c=policy.content;
  if(c.replace(digest64(b),programMarker)!==binding[1])return ()=>false;
  return ()=>loader.isConnected&&entry.isConnected&&policy.isConnected&&policy.parentNode===doc.head&&policy.previousElementSibling===doc.head.firstElementChild&&loader.textContent===a&&entry.textContent===b&&policy.content===c;
}
export function createSessionFlow(onViolation,doc=document,binding=release){
  const current={failed:false,doc,onViolation,delivery:delivery(doc,binding)};
  function issue(stage,subject){
    if(current.failed)return null;
    const value=read(doc);if(!value||!current.delivery()){current.failed=true;onViolation();return null;}
    const ticket=Object.freeze({});slots.set(ticket,{current,stage,subject,value});return ticket;
  }
  sessions.set(issue,current);return issue;
}
export function cancelSession(issue){const current=sessions.get(issue);if(current)current.failed=true;}
export function dropSessionStep(ticket){if(ticket&&typeof ticket==='object')slots.delete(ticket);}
export function useSessionStep(ticket,stage,subject){
  const item=ticket&&typeof ticket==='object'?slots.get(ticket):null;if(!item)return false;
  slots.delete(ticket);
  const c=item.current;if(c.failed)return false;
  if(item.stage!==stage||item.subject!==subject||read(c.doc)!==item.value||!c.delivery()){c.failed=true;c.onViolation();return false;}
  return true;
}
