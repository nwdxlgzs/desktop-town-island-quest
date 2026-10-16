import { taskIds, tasks, stations, levels, biomes, totalXP, stationTasks, targetMinutes, challengesPerMinute, missionCount, configureJourney } from './curriculum.js';
import { normalizeQuality,migrateQuality } from './quality.js';
import { useSessionStep } from './session-flow.js';
const KEY = 'desktop-quest-v3';
const preview=globalThis.location?.hash==='#BYPASS',saveKey=preview?`${KEY}-demo`:KEY;
function prepareProgress(result){
  if(preview){
    result.completed=[...taskIds];result.unlocked=levels.length-1;result.onboardingVersion=1;result.graduated=true;
    // Discovery IDs are deterministic; unlocking a route must not generate
    // every island. Keep the chosen sail while granting every collection.
    result.exploration.shards=levels.flatMap(level=>Array.from({length:3},(_,i)=>`${level.id}:shard-${i}`));
    result.exploration.restored=levels.map(level=>level.id);
    result.exploration.species=[...new Set(biomes.flatMap(b=>b.fauna||['兔子','小鸟']))];
  }
  return result;
}
globalThis.addEventListener?.('hashchange',()=>{if((globalThis.location?.hash==='#BYPASS')!==preview)globalThis.location.reload();});
const fresh = () => ({version:3, routeVersion:1, onboardingVersion:0, seed:Math.floor(Math.random()*4294967296), currentLevel:0, unlocked:0, graduated:false, completed:[], attempts:{}, finishedAt:{}, sound:true, music:false, musicPreference:1, quality:normalizeQuality(),exploration:{shards:[],restored:[],species:[],sail:'cream'}, seconds:0, records:{}, startedAt:new Date().toISOString()});
export let storageAvailable = true;
export const state = (()=>{
  try {
    const raw = JSON.parse(localStorage.getItem(saveKey) || localStorage.getItem(KEY) || localStorage.getItem('desktop-quest-v2') || localStorage.getItem('desktop-quest-v1') || 'null');
    const result = fresh();
    if(raw&&Number.isInteger(raw.seed))result.seed=raw.seed>>>0;
    configureJourney(result.seed);
    if (!raw || ![1,2,3].includes(raw.version)) return prepareProgress(result);
    result.completed = [...new Set((Array.isArray(raw.completed)?raw.completed:[]).filter(id=>taskIds.includes(id)))];
    for (const name of ['attempts','finishedAt','records']) if(raw[name] && typeof raw[name]==='object' && !Array.isArray(raw[name])) result[name]=raw[name];
    if(typeof raw.sound==='boolean') result.sound=raw.sound;
    if(raw.onboardingVersion===1)result.onboardingVersion=1;
    result.quality=migrateQuality(raw.quality);
    if(raw.musicPreference===1&&typeof raw.music==='boolean') result.music=raw.music;
    if(raw.exploration&&typeof raw.exploration==='object'){
      for(const key of ['shards','restored','species'])result.exploration[key]=[...new Set((Array.isArray(raw.exploration[key])?raw.exploration[key]:[]).filter(s=>typeof s==='string'&&s.length<100))];
      if(['cream','rose','aurora','star'].includes(raw.exploration.sail))result.exploration.sail=raw.exploration.sail;
    }
    if(Number.isFinite(raw.seconds)) result.seconds=Math.max(0,raw.seconds);
    if(typeof raw.startedAt==='string') result.startedAt=raw.startedAt;
    let eligible=0;
    while(eligible<levels.length-1 && levels[eligible].tasks.every(id=>result.completed.includes(id))) eligible++;
    if(raw.version===3&&raw.routeVersion===1){
      result.unlocked=Math.max(eligible,Math.min(levels.length-1,Number.isInteger(raw.unlocked)?raw.unlocked:0));
      result.currentLevel=Math.max(0,Math.min(result.unlocked,Number.isInteger(raw.currentLevel)?raw.currentLevel:0));
    }else{
      // Old fixed-island indices cannot identify the new randomly packed journey.
      // Preserve task completion and records, and resume at the first unfinished stop.
      result.currentLevel=eligible;result.unlocked=eligible;
    }
    result.graduated=raw.graduated===true&&result.completed.length===taskIds.length;
    return prepareProgress(result);
  } catch { storageAvailable=false; const result=fresh();configureJourney(result.seed);return prepareProgress(result); }
})();
export function persist() {
  try {localStorage.setItem(saveKey,JSON.stringify(state));return true;}
  catch {storageAvailable=false;return false;}
}
export const completed = id => state.completed.includes(id);
export function collectDiscovery(item){
  const key=item.type==='shard'?'shards':'species',value=item.type==='shard'?item.id:item.species;
  if(!value||state.exploration[key].includes(value))return false;
  state.exploration[key].push(value);persist();return true;
}
export const xp = () => state.completed.reduce((sum,id)=>sum+tasks[id].xp,0);
export const stationCount = id => stationTasks(id).filter(completed).length;
export const levelComplete = level => level.tasks.every(completed);
export const nextTask = level => level.tasks.find(id=>!completed(id)) || level.tasks[0];
export function finishTask(id,step) {
  if(typeof document!=='undefined'&&!useSessionStep(step,2,id))return null;
  if(!taskIds.includes(id)) return false;
  const first=!completed(id);
  if(first){state.completed.push(id);state.finishedAt[id]=new Date().toISOString();}
  const task=tasks[id];
  if(task.kind==='save'||task.kind==='delivery')state.records[task.params?.record||id]=task.params?.expected||(task.kind==='save'?'实验成功':'任务完成，出发！');
  persist();return first;
}
export function visitLevel(index,step) {
  if(typeof document!=='undefined'&&!useSessionStep(step,5,index))return false;
  if(!Number.isInteger(index) || index<0 || index>=levels.length) return false;
  if(index>state.unlocked && (index!==state.currentLevel+1 || !levelComplete(levels[state.currentLevel]))) return false;
  state.currentLevel=index;state.unlocked=Math.max(state.unlocked,index);persist();return true;
}
export function recordAttempt(id){state.attempts[id]=(Number(state.attempts[id])||0)+1;persist();}
export function resetState(){const sound=state.sound,music=state.music,quality=state.quality,onboardingVersion=state.onboardingVersion;Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,fresh(),{sound,music,quality,onboardingVersion});configureJourney(state.seed);prepareProgress(state);persist();}
export function report(){return {title:'电脑小镇 · 岛屿冒险学习报告',exportedAt:new Date().toISOString(),startedAt:state.startedAt,completed:state.completed.length,total:taskIds.length,missionCount,completedMissions:levels.flatMap(l=>l.workshops).filter(w=>w.tasks.every(completed)).length,targetMinutes,challengesPerMinute,estimatedChallengeMinutes:missionCount/challengesPerMinute,xp:xp(),totalXP,activeSeconds:state.seconds,graduated:state.graduated,
  islands:levels.map(level=>({name:level.name,minutes:level.minutes,completed:levelComplete(level),workshops:level.workshops.map(w=>({name:w.name,theme:w.theme,completed:w.tasks.every(completed)})),tasks:level.tasks.map(id=>({name:tasks[id].title,skill:tasks[id].skill,completed:completed(id),attempts:state.attempts[id]||0,finishedAt:state.finishedAt[id]||null}))})),
  stations:stations.map(s=>({name:s.name,completed:stationCount(s.id),total:stationTasks(s.id).length}))};}
export function download(data,name,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
