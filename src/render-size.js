// Changing a canvas width/height clears its drawing buffer, even when assigning
// the same size. A quality-only change must not reset a 150% frame buffer.
export function createRenderSize(renderer,antialias){
  let width=0,height=0,ratio=0,aa=null,resizes=0;
  return {configure(profile,w,h){
    if(!w||!h)return;
    const next=(profile.adaptive||profile.resolution==='auto'||profile.preset==='low')?Math.min(profile.pixelRatio,Math.sqrt(profile.maxPixels/(w*h))):profile.pixelRatio;
    const changed=width!==w||height!==h||ratio!==next;
    if(changed){renderer.setDrawingBufferSize(w,h,next);width=w;height=h;ratio=next;resizes++;}
    const enabled=profile.antialias==='fxaa';
    if(changed||aa!==enabled){antialias.configure(enabled,w,h,next);aa=enabled;}
    return changed;
  },get resizes(){return resizes;}};
}
