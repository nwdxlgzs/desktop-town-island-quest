// Observe only the delivered game nodes. A browser may block an unrelated
// preview/extension resource without changing any of the game's content.
export function watchReleaseIntegrity({doc,loader,packed,policy,entry,styles,onViolation}){
  const nodes=[loader,packed,policy,entry,...styles],snapshots=nodes.map(node=>({node,parent:node.parentNode,text:node.textContent,attributes:[...node.attributes].map(attribute=>[attribute.name,attribute.value])}));
  let failed=false;
  const observer=new MutationObserver(check);
  function check(){
    if(failed)return false;
    const intact=snapshots.every(({node,parent,text,attributes})=>node.isConnected&&node.parentNode===parent&&node.textContent===text&&node.attributes.length===attributes.length&&attributes.every(([name,value])=>node.getAttribute(name)===value));
    if(!intact){failed=true;observer.disconnect();onViolation();return false;}
    return true;
  }
  for(const node of nodes)observer.observe(node,{attributes:true,childList:true,characterData:true,subtree:true});
  for(const parent of new Set([doc.documentElement,doc.head,doc.body]))observer.observe(parent,{childList:true});
  return check;
}
