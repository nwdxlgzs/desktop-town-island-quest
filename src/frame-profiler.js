// Opt-in development capture only. Query GPU results on later frames when
// available; never finish(), readPixels() or wait for the GPU to catch up.
export function createFrameProfiler(renderer,now=()=>performance.now()){
  let active=null;
  const stats=values=>{
    if(!values.length)return null;
    const sorted=[...values].sort((a,b)=>a-b);
    return {samples:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],p99Ms:sorted[Math.ceil(sorted.length*.99)-1],maxMs:sorted.at(-1)};
  };
  function poll(){
    const s=active;if(!s?.ext)return;
    const {gl,ext,pending}=s;
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)){s.gpu.length=0;s.disjoint=true;for(const item of pending)gl.deleteQuery(item.query);pending.length=0;for(const record of s.records)record.gpuMs=null;return;}
    while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
      const {query,record}=pending.shift(),value=gl.getQueryParameter(query,gl.QUERY_RESULT);gl.deleteQuery(query);
      if(Number.isFinite(value)){record.gpuMs=value/1e6;s.gpu.push(record.gpuMs);}
    }
  }
  function finish(reason){
    if(!active)return null;
    const s=active;poll();if(s.current){s.gl.endQuery(s.ext.TIME_ELAPSED_EXT);s.gl.deleteQuery(s.current.query);}
    for(const item of s.pending)s.gl.deleteQuery(item.query);
    const overruns=s.records.filter(r=>r.cpuMs>r.budgetMs),stalls=s.records.filter(r=>r.cpuMs>Math.max(50,r.budgetMs*2)||r.gpuMs>Math.max(50,r.budgetMs*2)||r.intervalMs>Math.max(50,r.presentationBudgetMs*2)+.5);
    const result={reason,frames:s.cpu.length,cpu:stats(s.cpu),presentation:stats(s.records.map(r=>r.intervalMs).filter(Number.isFinite)),gpu:stats(s.gpu),gpuSupported:!!s.ext,gpuDisjoint:s.disjoint,phases:Object.fromEntries(Object.entries(s.phases).map(([name,values])=>[name,stats(values)])),operations:Object.fromEntries(Object.entries(s.operations).map(([name,values])=>[name,stats(values)])),draws:s.draws,triangles:s.triangles,overBudgetFrames:overruns.length,gpuOverBudgetFrames:s.records.filter(r=>r.gpuMs>r.budgetMs).length,stallFrames:stalls.length,worstFrames:[...s.records].sort((a,b)=>Math.max(b.cpuMs,b.gpuMs||0,b.intervalMs-b.presentationBudgetMs)-Math.max(a.cpuMs,a.gpuMs||0,a.intervalMs-a.presentationBudgetMs)).slice(0,8),records:s.records};
    active=null;s.resolve(result);return result;
  }
  return {capture(frames=60){
    finish('replaced');const gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    return new Promise(resolve=>{active={gl,ext,resolve,target:Math.min(120,Math.max(8,Number(frames)||60)),cpu:[],gpu:[],phases:{},operations:{},records:[],pending:[],current:null,record:null,disjoint:false,draws:0,triangles:0,start:0,last:0};});
  },get active(){return !!active;},begin(context={},counters={}){
    if(!active)return;poll();const s=active;s.start=s.last=now();s.before=counters;
    // The first interval began before capture. After idle/input transitions its
    // pacing belongs to the previous target, not the current moving-frame cap.
    s.record={frame:s.cpu.length+1,intervalMs:s.cpu.length?context.intervalMs??null:null,budgetMs:1000/(context.targetFps||30),presentationBudgetMs:1000/(context.previousTargetFps||context.targetFps||30),moving:!!context.moving,cpuMs:0,gpuMs:null,phases:{},operations:{},work:{}};
  },mark(name){if(!active?.record)return;const time=now(),ms=time-active.last;(active.phases[name]||=[]).push(ms);active.record.phases[name]=ms;active.last=time;},
  measure(name,fn){if(!active?.record)return fn();const s=active,start=now();try{return fn();}finally{s.record.operations[name]=(s.record.operations[name]||0)+now()-start;}},
  beginGPU(){if(!active?.ext||active.pending.length>=4||active.current||!active.record)return;const s=active,query=s.gl.createQuery();if(query){s.current={query,record:s.record};s.gl.beginQuery(s.ext.TIME_ELAPSED_EXT,query);}},
  endGPU(){if(!active?.current)return;const s=active;s.gl.endQuery(s.ext.TIME_ELAPSED_EXT);s.pending.push(s.current);s.current=null;},
  end(counters={}){
    if(!active?.record)return;const s=active,r=s.record;r.cpuMs=now()-s.start;r.draws=renderer.info.render.calls;r.triangles=renderer.info.render.triangles;
    for(const [name,value]of Object.entries(counters))if(Number.isFinite(value)&&Number.isFinite(s.before[name]))r.work[name]=value-s.before[name];
    for(const [name,ms]of Object.entries(r.operations))(s.operations[name]||=[]).push(ms);
    r.dominantPhase=Object.entries(r.phases).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
    s.records.push(r);s.cpu.push(r.cpuMs);s.draws+=r.draws;s.triangles+=r.triangles;s.record=null;if(s.cpu.length>=s.target)finish('complete');
  },
  cancel:finish,dispose(){finish('disposed');}};
}
