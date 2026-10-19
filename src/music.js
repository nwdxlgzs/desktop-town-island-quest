// Original, gentle eight-phrase score, synthesized locally without audio downloads.
export function createMusicController({enabled=false}={}) {
  let context=null,master=null,timer=null,next=0,phrase=0;
  const voices=new Set(),chords=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59],[40,47,52,55],[45,52,57,60],[41,48,53,60],[43,50,55,62]];
  const melody=[[72,76,79,76],[72,69,67,64],[69,72,77,76],[74,71,67,0],[67,71,76,79],[76,72,69,0],[72,77,76,72],[74,71,67,0]];
  const hz=midi=>440*2**((midi-69)/12);
  function ensure(){if(!context){context=new (window.AudioContext||window.webkitAudioContext)();master=context.createGain();master.gain.value=.045;const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1500;master.connect(filter);filter.connect(context.destination);}return context;}
  function note(midi,start,duration,volume,type='sine'){
    if(!midi)return;const oscillator=context.createOscillator(),envelope=context.createGain();oscillator.type=type;oscillator.frequency.value=hz(midi);envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(volume,start+.35);envelope.gain.setTargetAtTime(0,start+duration*.6,.65);oscillator.connect(envelope);envelope.connect(master);voices.add(oscillator);oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();envelope.disconnect();};oscillator.start(start);oscillator.stop(start+duration+2);
  }
  function schedule(){if(!enabled||!context)return;while(next<context.currentTime+1.5){const i=phrase++%chords.length;chords[i].forEach((n,j)=>note(n,next+j*.14,7.5,.14));melody[i].forEach((n,j)=>note(n,next+j*2,2.4,.23));next+=8;}}
  function start(){if(!enabled)return;try{const c=ensure();c.resume();master.gain.cancelScheduledValues(c.currentTime);master.gain.setTargetAtTime(.045,c.currentTime,.35);if(!timer){next=c.currentTime+.05;schedule();timer=setInterval(schedule,700);}}catch{}}
  function stop(){clearInterval(timer);timer=null;if(context){master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(0,context.currentTime,.08);for(const voice of voices)try{voice.stop(context.currentTime+.45);}catch{}}}
  return {start,stop,toggle(){enabled=!enabled;if(enabled)start();else stop();return enabled;},get enabled(){return enabled;}};
}
