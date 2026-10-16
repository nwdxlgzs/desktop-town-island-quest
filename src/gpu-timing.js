// Low-frequency, asynchronous GPU evidence for automatic quality recovery.
// Never wait/read pixels. At most two queries can be outstanding; unsupported
// devices keep using frame intervals, with a longer recovery hold.
export function createGpuTiming(renderer){
  let enabled=false,initialized=false,gl=null,extension=null,current=null,lastQuery=-Infinity,lastPoll=-Infinity,estimate=null,sampledAt=-Infinity;
  const pending=[];
  function release(){
    if(current){gl.endQuery(extension.TIME_ELAPSED_EXT);gl.deleteQuery(current);current=null;}
    for(const item of pending)gl.deleteQuery(item.query);pending.length=0;estimate=null;sampledAt=-Infinity;
  }
  function initialize(){
    if(initialized)return;initialized=true;gl=renderer.getContext();extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }
  return {
    configure(value,reset=false){enabled=value;if(!value||reset){release();lastQuery=lastPoll=-Infinity;}},
    begin(time){
      if(!enabled)return;initialize();if(!extension||current)return;
      if(time-lastPoll>=250){
        lastPoll=time;
        if(gl.getParameter(extension.GPU_DISJOINT_EXT)){release();lastQuery=time;return;}
        while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
          const item=pending.shift(),ms=gl.getQueryParameter(item.query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(item.query);
          // A resize/stall can leave a result irrelevant to current load.
          if(time-item.time<3000&&Number.isFinite(ms)&&ms>0){estimate=estimate===null?ms:estimate*.5+ms*.5;sampledAt=time;}
        }
      }
      if(time-lastQuery<1000||pending.length>=2||gl.getQuery(extension.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))return;
      const query=gl.createQuery();if(!query)return;current=query;lastQuery=time;gl.beginQuery(extension.TIME_ELAPSED_EXT,query);
    },
    end(time){if(!current)return;gl.endQuery(extension.TIME_ELAPSED_EXT);pending.push({query:current,time});current=null;},
    value(time){return time-sampledAt<3000?estimate:null;},
    reset(){release();lastQuery=lastPoll=-Infinity;},
    dispose(){enabled=false;release();}
  };
}
