export function createFrameMeter(container){
  const element=document.createElement('div');element.className='fps-display';element.hidden=true;element.setAttribute('aria-label','实际渲染帧率');container.append(element);
  let enabled=false,start=0,frames=0,fps=0,cost=0,peak=0,lastSample=0,target=0,gpu=null;
  return {setEnabled(value){if(enabled===value)return;enabled=value;element.hidden=!value;start=performance.now();frames=0;cost=peak=0;element.textContent='FPS · 采样中';},
    frame(workMs,targetFps,gpuMs=null){if(enabled){frames++;cost+=workMs;peak=Math.max(peak,workMs);target=targetFps||0;gpu=gpuMs;}},
    sample(time,paused=false){if(!enabled||time-start<1000)return;const duration=time-start;fps=paused?0:frames*1000/duration;const work=frames?cost/frames:0;
      element.textContent=paused?'已暂停':frames?`${Math.round(fps)}${target?`/${target}`:''} FPS · JS 提交 ${work.toFixed(1)} ms · 峰值 ${peak.toFixed(1)} ms${Number.isFinite(gpu)?` · GPU ${gpu.toFixed(1)} ms`:''}`:'0 FPS · 静止待机';start=time;lastSample=time;frames=0;cost=peak=0;
    },get fps(){return fps;},get lastSample(){return lastSample;},dispose(){element.remove();}};
}
