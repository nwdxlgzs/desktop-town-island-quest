import { taskIds,tasks,biomes,journeyForSeed } from './curriculum.js';
import { migrateQuality } from './quality.js';
import { unlockedThrough } from './progress-rules.js';

export const maxProgressBytes=2*1024*1024;
export function randomSeed(){
  return globalThis.crypto?.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296);
}
export function parseSeed(value){
  const text=String(value).trim();
  if(!/^\d{1,10}$/.test(text)||Number(text)>4294967295)throw new Error('航线随机数请输入 0 到 4294967295 之间的整数。');
  return Number(text);
}
export function progressFile(state,preview=false){
  return {format:'desktop-town-island-quest-progress',formatVersion:1,mode:preview?'demo':'student',exportedAt:new Date().toISOString(),progress:JSON.parse(JSON.stringify(state))};
}
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const validDate=value=>typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value));
function invalid(){throw new Error('进度文件内容不完整或不受支持，请选择本游戏导出的进度文件。');}
export function readProgress(text,preview=false){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>maxProgressBytes)throw new Error('进度文件过大，请选择不超过 2 MB 的 JSON 进度文件。');
  let file;try{file=JSON.parse(text);}catch{throw new Error('无法读取 JSON，请选择本游戏导出的进度文件。');}
  if(file?.format!=='desktop-town-island-quest-progress'||file.formatVersion!==1)throw new Error('这不是可恢复的游戏进度文件。学习报告只用于查看，请选择“导出进度”生成的文件。');
  if(file.mode!==(preview?'demo':'student'))throw new Error('教学演示与学生进度分别保存，请在对应模式导入。');
  const raw=file.progress;
  if(!object(raw)||raw.version!==3||raw.routeVersion!==1||!Number.isInteger(raw.seed)||raw.seed<0||raw.seed>4294967295)invalid();
  if(!Array.isArray(raw.completed)||raw.completed.length>taskIds.length||raw.completed.some(id=>!taskIds.includes(id))||new Set(raw.completed).size!==raw.completed.length)invalid();
  const route=journeyForSeed(raw.seed),unlocked=unlockedThrough(route,raw.completed);
  if(!Number.isInteger(raw.currentLevel)||raw.currentLevel<0||raw.currentLevel>=route.length||raw.currentLevel>unlocked)invalid();
  if(!Number.isInteger(raw.unlocked)||raw.unlocked<0||raw.unlocked>=route.length||raw.unlocked>unlocked)invalid();
  if(!Number.isSafeInteger(raw.seconds)||raw.seconds<0||!validDate(raw.startedAt))invalid();
  const result={version:3,routeVersion:1,seed:raw.seed,currentLevel:raw.currentLevel,unlocked,completed:[...raw.completed],attempts:{},finishedAt:{},records:{},seconds:raw.seconds,startedAt:raw.startedAt,graduated:raw.graduated===true&&raw.completed.length===taskIds.length,onboardingVersion:raw.onboardingVersion===1?1:0,sound:raw.sound!==false,music:raw.music===true,musicPreference:1,quality:migrateQuality(raw.quality),exploration:{shards:[],restored:[],species:[],sail:'cream'}};
  for(const key of ['attempts','finishedAt','records'])if(!object(raw[key]))invalid();
  for(const [id,value]of Object.entries(raw.attempts)){if(!taskIds.includes(id)||!Number.isSafeInteger(value)||value<0)invalid();result.attempts[id]=value;}
  for(const [id,value]of Object.entries(raw.finishedAt)){if(!raw.completed.includes(id)||!validDate(value))invalid();result.finishedAt[id]=value;}
  // Include existing exercise records, without accepting object/prototype keys.
  const recordKeys=new Set(taskIds.flatMap(id=>[id,tasks[id].params?.record].filter(Boolean)));
  for(const [id,value]of Object.entries(raw.records)){if(!recordKeys.has(id)||typeof value!=='string'||value.length>20000)invalid();result.records[id]=value;}
  const discoveries=raw.exploration;if(!object(discoveries))invalid();
  const allowed={shards:route.flatMap(l=>Array.from({length:3},(_,i)=>`${l.id}:shard-${i}`)),restored:route.map(l=>l.id),species:[...new Set(biomes.flatMap(b=>b.fauna||['兔子','小鸟']))]};
  for(const key of ['shards','restored','species']){const values=discoveries[key];if(!Array.isArray(values)||values.length>allowed[key].length||values.some(value=>!allowed[key].includes(value))||new Set(values).size!==values.length)invalid();result.exploration[key]=[...values];}
  if(!['cream','rose','aurora','star'].includes(discoveries.sail))invalid();result.exploration.sail=discoveries.sail;
  return result;
}
