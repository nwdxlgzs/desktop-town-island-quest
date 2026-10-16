// Development-only UI: captures real WebGL frames through normal game input.
// This module is dynamically imported only in Vite development builds.
export function mountFrameAudit(getWorld){
  const host=document.createElement('aside');
  host.style.cssText='position:fixed;right:8px;bottom:8px;z-index:9000;font:12px monospace;max-width:420px;color:#fff;background:#18362eee;padding:6px;border-radius:6px';
  const button=document.createElement('button');button.textContent='采样 120 帧（开发）';
  const download=document.createElement('button');download.textContent='下载采样报告';download.hidden=true;
  const size=document.createElement('button');size.textContent='固定桌面绘制尺寸';
  const status=document.createElement('span');status.setAttribute('role','status');
  const report=document.createElement('pre');report.setAttribute('aria-label','性能采样报告');report.hidden=true;report.style.cssText='max-height:25vh;overflow:auto;white-space:pre-wrap;font-size:10px;margin:4px 0';
  host.append(button,size,download,status,report);document.body.append(host);let captured=null,originalStyle=null;
  size.addEventListener('click',()=>{const container=document.querySelector('#world-container');if(originalStyle===null){originalStyle=container.style.cssText;container.style.cssText+=';position:fixed;left:0;top:0;right:auto;bottom:auto;box-sizing:content-box;width:1919px;height:1079px;min-width:1919px;min-height:1079px;max-width:none;max-height:none;flex:none';size.textContent='恢复绘制尺寸';}else{container.style.cssText=originalStyle;originalStyle=null;size.textContent='固定桌面绘制尺寸';}});
  download.addEventListener('click',()=>{if(!captured)return;const url=URL.createObjectURL(new Blob([captured],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='webgl-frame-audit.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  function snapshot(world){
    const s=world.getDebugSnapshot(),canvas=document.querySelector('#world-container canvas'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {island:s.layout.level.id,map:[s.layout.width,s.layout.depth],position:s.position,quality:world.getQuality(),viewport:[innerWidth,innerHeight],canvasCSS:[canvas.clientWidth,canvas.clientHeight],fixedDrawingSize:originalStyle!==null,buffer:[canvas.width,canvas.height],gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,staticCache:s.staticCache,drawCalls:s.drawCalls,triangles:s.triangles,shadowBakes:s.shadowBakes,outline:s.outline,faded:s.faded,routeRemaining:s.routeRemaining};
  }
  button.addEventListener('click',async()=>{
    const world=getWorld();if(!world)return;button.disabled=true;report.hidden=true;status.textContent=' 正在采样，请移动';
    const before=snapshot(world),started=new Date().toISOString();
    const frames=await world.profileFrames(120);
    const result={started,before,after:snapshot(world),...frames};
    captured=JSON.stringify(result);report.textContent=captured;report.hidden=false;download.hidden=false;status.textContent=` ${frames.frames}帧 · CPU峰值 ${frames.cpu?.maxMs.toFixed(2)}ms`;button.disabled=false;
  });
}
