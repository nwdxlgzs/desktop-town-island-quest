import curriculum from './curriculum.json' with { type: 'json' };
import adventure from './levels.json' with { type: 'json' };
import { islandShapes } from './shoreline.js';
import { createJourney } from './journey.js';
export const stations = curriculum.stations;
export const tasks = { ...curriculum.tasks };
function resolveTask(id,chain=new Set()){
  if(tasks[id])return tasks[id];
  const variant=adventure.variants[id];
  if(!variant||chain.has(id))throw new Error(`Unknown or cyclic exercise template: ${id}`);
  chain.add(id);const base=resolveTask(variant.base,chain);
  return tasks[id]={...base,...variant,params:{...base.params,...variant.params}};
}
for(const id of Object.keys(adventure.variants))resolveTask(id);
export const missions=adventure.missions;
export const biomes=adventure.biomes;
export let levels=createJourney(adventure,0);
export const journeyForSeed=seed=>createJourney(adventure,seed);
export function configureJourney(seed){levels=createJourney(adventure,seed);return levels;}
export const targetMinutes = adventure.targetMinutes;
export const challengesPerMinute = adventure.challengesPerMinute;
export const taskIds = missions.flatMap(m=>m.tasks);
export const missionCount = missions.length;
for(const task of Object.values(tasks))if(task.kind==='undo'){
  const mark=task.params.mark||(/[\u4e00-\u9fff]/.test(task.params.original)?'！':'!');
  task.params={...task.params,mark};task.instruction=`先在便签末尾输入一个 ${mark}，再按 Ctrl+Z 撤销，让便签恢复原样。`;task.objective=`输入 ${mark} → Ctrl+Z 撤销`;
}
for(const task of Object.values(tasks))if(task.kind==='document'){
  task.params={...task.params,tools:task.params.tools||['bold','align','list']};
}
for(const task of Object.values(tasks))if(task.kind==='hover'){
  task.instruction=`将鼠标停在「${task.params.target}」上，读一下工具提示，再选择对应的说明。`;
  task.objective='停留查看提示 → 确认对应说明';task.hint='把鼠标移到图标上并停留片刻，看到提示后，再点击下方符合提示的说明。';
}
for(const mission of missions){
  if(!stations.some(s=>s.id===mission.theme)||mission.tasks.some(id=>!tasks[id]))throw new Error(`Invalid mission: ${mission.id}`);
  if(mission.tasks.length<3)throw new Error('Every mission must have at least three stages');
  for(const id of mission.tasks)tasks[id].literacy=mission.literacy;
}
if(new Set(missions.map(m=>m.id)).size!==missions.length||new Set(taskIds).size!==taskIds.length)throw new Error('Mission and task IDs must be unique');
if(!adventure.islandNames.length||!adventure.landscapes.length)throw new Error('Names and landscape pools cannot be empty');
for(const range of [adventure.islands.workshopCount,adventure.islands.introductionCount])if(range.length!==2||range[0]<1||range[1]>6||range[0]>range[1])throw new Error('An island must contain between one and six workshops');
for(const profile of adventure.landscapes){
  if(!profile.map.shapes.length||profile.map.shapes.some(s=>!islandShapes.includes(s)))throw new Error('Unknown shoreline generator');
  for(const key of ['width','depth','trees']){const r=profile.map[key];if(r.length!==2||r[0]<0||r[1]<r[0])throw new Error(`Invalid ${key} in landscape`);}
}
if(!adventure.islands.densities.length||adventure.islands.baseLayers[0]<1||adventure.islands.baseLayers[1]<adventure.islands.baseLayers[0])throw new Error('Invalid terrain layers or density settings');
if(!Number.isFinite(challengesPerMinute)||challengesPerMinute<=0||missionCount<Math.ceil(targetMinutes*challengesPerMinute))throw new Error('Insufficient complete missions for the teaching budget');
export const totalXP = taskIds.reduce((sum, id) => sum + tasks[id].xp, 0);
export const stationTasks = id => levels.flatMap(level=>level.workshops.filter(w=>w.theme===id).flatMap(w=>w.tasks));
