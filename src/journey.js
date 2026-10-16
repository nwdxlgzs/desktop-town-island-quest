import { randomSource } from './random.js';

// Names, landscapes and teaching missions are independent pools, not a fixed island list.
export function createJourney(config,seed) {
  const random=randomSource(seed^0x517CC1B7),namesRandom=randomSource(seed^0x6A09E667),biomeRandom=randomSource(seed^0x3C6EF372);
  const biomes=[...(config.biomes||[])];
  const environmentRandom=randomSource(seed^0x510E527F),environments=config.environments||[];let predawnCount=0;
  for(let i=biomes.length-1;i>0;i--){const j=Math.floor(biomeRandom()*(i+1));[biomes[i],biomes[j]]=[biomes[j],biomes[i]];}
  const integer=range=>range[0]+Math.floor(random()*(range[1]-range[0]+1));
  const introduction=config.missions.filter(m=>m.introduction),rest=config.missions.filter(m=>!m.introduction);
  for(let i=rest.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
  const queue=[...introduction,...rest],levels=[],usedNames=new Map();
  while(queue.length){
    const first=levels.length===0,count=Math.min(queue.length,integer(first?config.islands.introductionCount:config.islands.workshopCount));
    const workshops=queue.splice(0,count).map(m=>({...m,tasks:[...m.tasks]}));
    const profile=first?config.landscapes[0]:config.landscapes[integer([0,config.landscapes.length-1])];
    const name=config.islandNames[Math.floor(namesRandom()*config.islandNames.length)]||`无名岛`;
    const repeat=(usedNames.get(name)||0)+1;usedNames.set(name,repeat);
    const density=config.islands.densities[integer([0,config.islands.densities.length-1])];
    const biome=first?config.biomes?.[0]:biomes[(levels.length-1)%biomes.length];
    const choices=environments.filter(e=>e.id!=='predawn'||predawnCount===0),weight=choices.reduce((n,e)=>n+e.weight,0);let pick=environmentRandom()*weight;
    const environment=first?environments.find(e=>e.id==='morning'):choices.find(e=>(pick-=e.weight)<0)||choices[0];
    if(environment?.id==='predawn')predawnCount++;
    levels.push({id:`island-${String(levels.length+1).padStart(3,'0')}`,name:repeat===1?name:`${name} · ${repeat}号`,
      story:first?'沿小路熟悉操作，也找找闪光的星图碎片。完成工坊后乘船出发。':biome?.story||profile.story,
      minutes:Number((count/config.challengesPerMinute).toFixed(1)),workshops,tasks:workshops.flatMap(w=>w.tasks),
      map:{...profile.map,...(biome?.trees?{trees:biome.trees}:{}),features:{...profile.map.features,...biome?.features},workshopCount:[count,count],density,baseLayers:config.islands.baseLayers,npcLimit:config.islands.npcLimit},
      npc:{...config.islands.npc},landscape:profile.id,biome,environment});
  }
  return levels;
}
