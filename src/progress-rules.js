// Travel eligibility and full completion deliberately have different meanings.
export function islandProgress(level,completed){
  const done=completed instanceof Set?completed:new Set(completed);
  const count=level.tasks.filter(id=>done.has(id)).length,total=level.tasks.length;
  const required=Math.ceil(total*3/5);
  const untouched=level.workshops.filter(w=>!w.tasks.some(id=>done.has(id)));
  return {count,total,required,untouched,eligible:total>0&&count>=required&&!untouched.length,complete:count===total};
}
export function unlockedThrough(levels,completed){
  const done=new Set(completed);let index=0;
  while(index<levels.length-1&&islandProgress(levels[index],done).eligible)index++;
  return index;
}
