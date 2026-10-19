import { normalizeTerrainLines } from './terrain-style.js';

export const defaultQuality={version:8,preset:'auto',resolution:'1.2',antialias:'off',terrainLines:'beveled',maxFps:30,adaptive:false,waves:true,shadows:true,shadowQuality:'baked-high',showFps:false,weather:true,npcMovement:true};
export const shadowNames={off:'关闭',baked:'烘焙阴影','baked-contact':'烘焙 + 脚底简影','baked-high':'转静态烘焙 · 1024 柔和投影 + 脚底简影',cached:'静态缓存阴影',low:'动态阴影 · 低',high:'动态阴影 · 高'};
const scales={auto:1.2,'2':2,'1.5':1.5,'1.2':1.2,'1':1,'.75':.75,'.5':.5};
export function normalizeQuality(raw={}){raw=raw&&typeof raw==='object'?raw:{};const shadowQuality=Object.hasOwn(shadowNames,raw.shadowQuality)?raw.shadowQuality:raw.shadows===false?'off':raw.shadows===true?'low':defaultQuality.shadowQuality;
  const preset=raw.preset==='low'?'low':'auto';
  return {version:8,preset,resolution:Object.hasOwn(scales,raw.resolution)?raw.resolution:defaultQuality.resolution,antialias:raw.antialias==='fxaa'?'fxaa':'off',terrainLines:normalizeTerrainLines(raw.terrainLines),maxFps:[20,24,30,60].includes(Number(raw.maxFps))?Number(raw.maxFps):defaultQuality.maxFps,adaptive:raw.adaptive===true,waves:raw.waves!==false,shadows:shadowQuality!=='off',shadowQuality,showFps:raw.showFps===true,weather:raw.weather!==false,npcMovement:raw.npcMovement!==false};}
export function migrateQuality(raw={}){
  // Upgrade the former complete default preset once. Independently customized
  // settings and subsequent choices retain their saved values.
  if(raw?.version===3&&raw.preset==='auto'&&raw.resolution==='auto'&&raw.antialias==='fxaa'&&raw.maxFps===60&&raw.adaptive===true&&raw.shadowQuality==='high')return normalizeQuality({...raw,resolution:defaultQuality.resolution,antialias:defaultQuality.antialias,maxFps:defaultQuality.maxFps,adaptive:defaultQuality.adaptive,shadowQuality:defaultQuality.shadowQuality});
  if(raw?.version===4&&raw.shadowQuality==='baked-contact'&&raw.adaptive===false&&raw.resolution==='1.5'&&['preset','antialias','maxFps','waves','weather','npcMovement'].every(key=>raw[key]===defaultQuality[key]))return normalizeQuality({...raw,resolution:defaultQuality.resolution,shadowQuality:defaultQuality.shadowQuality});
  // Version 6 forced adaptation on for auto and introduced a third mode.
  // Undo that migration once, keeping every independently selected effect.
  if(raw?.version===6&&raw.preset!=='low')return migrateQuality({...raw,version:7,preset:'auto',adaptive:false});
  // Upgrade only the former complete visual default; manual resolutions and
  // independently customized effects remain the user's saved preference.
  if(raw?.version===7&&raw.resolution==='1.5'&&['preset','antialias','terrainLines','maxFps','adaptive','waves','shadowQuality','weather','npcMovement'].every(key=>raw[key]===defaultQuality[key]))return normalizeQuality({...raw,resolution:defaultQuality.resolution});
  return normalizeQuality(raw);
}
export function createQualityController(settings={},onChange=()=>{},hardware={}){
  const constrained=(hardware.cores>0&&hardware.cores<=4)||(hardware.memory>0&&hardware.memory<=2)||hardware.softwareGPU;
  let config=normalizeQuality(settings),stage=initialStage(),frames=0,total=0,cost=0,age=0,slowFrames=0,hardFrames=0;
  let clock=0,changedAt=0,settleUntil=1,slowTime=0,fastTime=0,trial=-1,trialAt=0,changes=0,lastPressure=1,lastWork=0,lastGpu=null,lastActive=0;
  const retryAfter=new Float64Array(5),failedTrials=new Uint8Array(5),caps=[60,60,30,30,20];
  const fpsAt=level=>Math.min(config.maxFps,caps[level]);
  function clearWindow(){frames=total=cost=age=slowFrames=hardFrames=0;}
  function clearEvidence(){clearWindow();slowTime=fastTime=0;settleUntil=Math.max(settleUntil,clock+1);}

  function initialStage(){return config.preset==='low'?3:config.adaptive&&constrained?2:0;}
  function profile(){const shadowQuality=config.shadowQuality==='off'?'off':stage>=2?(config.shadowQuality==='baked'?'baked':'baked-contact'):stage===1&&['low','high'].includes(config.shadowQuality)?'cached':config.shadowQuality;
    const fixedShadows=['cached','baked-high'].includes(shadowQuality);
    return {stage,preset:config.preset,resolution:config.resolution,adaptive:config.adaptive,antialias:config.antialias,terrainLines:config.terrainLines,pixelRatio:Math.min(scales[config.resolution],[2,2,1.5,1,.65][stage]),maxPixels:[5000000,5000000,4000000,2100000,800000][stage],waves:config.waves&&stage<1,particles:config.weather?[64,24,0,0,0][stage]:0,shadows:['baked-high','cached','low','high'].includes(shadowQuality),shadowQuality,fixedShadows,softShadows:['baked-high','high'].includes(shadowQuality),bakedShadows:['baked','baked-contact'].includes(shadowQuality),contactShadows:['baked-high','baked-contact','cached','low','high'].includes(shadowQuality),showFps:config.showFps,shadowSize:shadowQuality==='low'?512:1024,shadowInterval:fixedShadows?Infinity:shadowQuality==='high'?.1:.25,ambientAnimation:stage<1,npcMovement:config.npcMovement&&stage<2,actorRadius:stage===0?28:20,actorInterval:[.12,.16,.16,.2,.25][stage],occlusionInterval:stage<2?.24:.4,fps:Math.min(config.maxFps,[60,60,30,30,20][stage]),idleFps:[12,10,6,5,4][stage]};}
  function notify(){onChange(profile());}
  function change(next){
    if(next>stage&&trial>=0&&clock-trialAt<15){
      // A failed recovery must not become a periodic quality/resolution loop.
      retryAfter[trial]=clock+Math.min(600,120*2**failedTrials[trial]);failedTrials[trial]=Math.min(4,failedTrials[trial]+1);
    }
    if(next<stage){trial=next;trialAt=clock;}else trial=-1;
    stage=next;changedAt=clock;settleUntil=clock+1;slowTime=fastTime=0;changes++;notify();
  }
  return {
    get settings(){return {...config};},get profile(){return profile();},
    get adaptation(){return {changes,pressure:lastPressure,workMs:lastWork,gpuMs:lastGpu,slowSeconds:slowTime,stableSeconds:fastTime,retryIn:stage?Math.max(0,retryAfter[stage-1]-clock):0};},
    configure(raw){
      const next=normalizeQuality(raw),changed=Object.keys(next).some(key=>next[key]!==config[key]);
      if(!changed)return;
      const reset=['preset','adaptive','resolution','antialias','maxFps','waves','shadowQuality','weather','npcMovement'].some(key=>next[key]!==config[key]);
      config=next;
      if(reset){stage=initialStage();trial=-1;changedAt=clock;retryAfter.fill(0);failedTrials.fill(0);}
      clearEvidence();notify();
    },
    // Pause, help, resize and travel discard timing samples, not the learned
    // recovery backoff or the currently stable quality stage.
    resetSampling(){clearEvidence();},
    observe(frameMs,workMs,dt,targetFps=fpsAt(stage),gpuMs=null){
      if(!config.adaptive||!Number.isFinite(frameMs)||!Number.isFinite(workMs)||!(dt>0))return;
      const seconds=Math.min(dt,.5),fps=fpsAt(stage),budget=1000/fps;
      clock+=seconds;
      // Idle proves no spare capacity, but short stops between student inputs
      // must not erase every partial overload window before it can complete.
      if(targetFps<fps-.5){fastTime=0;if(clock-lastActive>2){clearWindow();slowTime=0;}return;}
      lastActive=clock;
      const pressure=Math.min(frameMs/budget,8),work=Math.min(workMs,250);
      age+=seconds;frames++;total+=pressure;cost+=work;
      if(pressure>4/3||work>budget*4/3)slowFrames++;
      if(pressure>2.2||work>budget*2.2)hardFrames++;
      if(age<1||frames<6)return;
      const span=age,mean=total/frames,cpu=cost/frames,slowFraction=slowFrames/frames,hardFraction=hardFrames/frames;
      lastPressure=mean;lastWork=cpu;lastGpu=Number.isFinite(gpuMs)&&gpuMs>0?gpuMs:null;clearWindow();
      if(clock<settleUntil)return;
      // The broad middle band is deliberate: 45–60 FPS at a 60 FPS target,
      // or 23–30 at 30, keeps the same configuration despite small fluctuations.
      const slow=(mean>4/3||cpu>budget*4/3)&&slowFraction>=.6;
      const critical=(mean>2.2||cpu>budget*2.2)&&hardFraction>=.6;
      slowTime=slow?slowTime+span:0;
      const nextBudget=1000/fpsAt(Math.max(0,stage-1));
      // Low JS submission time does not imply GPU headroom. A timer query is
      // optional; without one, use a much longer stable period before trials.
      const spare=mean<=1.08&&cpu<nextBudget*.5&&(lastGpu===null||lastGpu<nextBudget*.55)&&slowFraction<.1;
      fastTime=spare?fastTime+span:0;
      if(stage<4&&((critical&&clock-changedAt>=1.5)||(slowTime>=3&&clock-changedAt>=5))){
        // Preserve the selected clarity before reducing pixel count.
        change(stage<2?Math.min(2,stage+(critical?2:1)):stage+1);
      }else if(stage>(config.preset==='low'?3:0)&&fastTime>=(lastGpu===null?120:45)&&clock-changedAt>=45&&clock>=retryAfter[stage-1]){
        change(stage-1);
      }
    }
  };
}
