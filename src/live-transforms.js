// Three's forced root update recomposes every limb/mesh, even when only an
// unrelated animal moved. Track the small, fixed live rigs independently.
const locals=new WeakMap();
export function syncLocalMatrix(object){
  let state=locals.get(object);
  if(!state){state={};locals.set(object,state);}
  const p=object.position,q=object.quaternion,s=object.scale;
  object.matrixAutoUpdate=false;
  if(state.x===p.x&&state.y===p.y&&state.z===p.z&&state.qx===q.x&&state.qy===q.y&&state.qz===q.z&&state.qw===q.w&&state.sx===s.x&&state.sy===s.y&&state.sz===s.z)return false;
  state.x=p.x;state.y=p.y;state.z=p.z;state.qx=q.x;state.qy=q.y;state.qz=q.z;state.qw=q.w;state.sx=s.x;state.sy=s.y;state.sz=s.z;
  object.updateMatrix();return true;
}

export function createLiveTransforms(){
  const roots=new WeakMap();let compositions=0,propagations=0;
  return {update(root){
    let state=roots.get(root);
    if(!state){const nodes=[];root.traverse(o=>nodes.push(o));state={nodes,parent:new Float64Array(16).fill(NaN)};roots.set(root,state);}
    let dirty=false;
    for(const node of state.nodes){if(syncLocalMatrix(node)){compositions++;dirty=true;}if(node.matrixWorldNeedsUpdate)dirty=true;}
    const parent=root.parent?.matrixWorld.elements;
    if(parent)for(let i=0;i<16;i++)if(state.parent[i]!==parent[i]){state.parent.set(parent);root.matrixWorldNeedsUpdate=true;dirty=true;break;}
    if(dirty){root.updateMatrixWorld();propagations++;}
    return dirty;
  },get stats(){return {compositions,propagations};}};
}
