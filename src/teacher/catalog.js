import {defaultCourse,resolveCourse} from '../course-config.js';
const canonical=resolveCourse(defaultCourse),byKind=new Map();
for(const [id,task]of Object.entries(canonical)){
  const previous=byKind.get(task.kind);
  if(!previous||Object.keys(task.params||{}).length>Object.keys(previous.task.params||{}).length){
    let base=id;while(defaultCourse.variants[base])base=defaultCourse.variants[base].base;
    byKind.set(task.kind,{id,base,task});
  }
}
export const questionTemplates=[...byKind.values()];
export function newTaskVariant(template){
  return {base:template.base,...Object.fromEntries(['kind','title','skill','xp','instruction','objective','hint','context','params'].filter(k=>template.task[k]!==undefined).map(k=>[k,JSON.parse(JSON.stringify(template.task[k]))]))};
}
