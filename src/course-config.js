import templates from './curriculum.json' with {type:'json'};
import defaultCourse from './levels.json' with {type:'json'};
import schema from './levels.schema.json' with {type:'json'};
import {islandShapes} from './shoreline.js';

export {defaultCourse,templates};
export const maxCourseBytes=2*1024*1024;
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const own=(x,k)=>Object.hasOwn(x,k);
const clone=x=>JSON.parse(JSON.stringify(x));
// A small data-only schema interpreter also works in the sealed offline file:
// no generated code, eval, network, or dependency on a server-side validator.
function check(value,rule,path,errors){
  if(rule.$ref)rule=schema.$defs[rule.$ref.split('/').at(-1)];
  if(rule.oneOf){if(rule.oneOf.filter(r=>{const e=[];check(value,r,path,e);return !e.length;}).length!==1)errors.push(`${path}：值的类型不符合要求`);return;}
  const type=rule.type,valid=!type||(type==='object'?object(value):type==='array'?Array.isArray(value):type==='integer'?Number.isInteger(value):type==='number'?Number.isFinite(value):typeof value===type);
  if(!valid){errors.push(`${path}：需要 ${type}`);return;}
  if(own(rule,'const')&&value!==rule.const)errors.push(`${path}：必须为 ${rule.const}`);
  if(rule.enum&&!rule.enum.includes(value))errors.push(`${path}：请选择 ${rule.enum.join(' / ')}`);
  if(typeof value==='number'&&(value<(rule.minimum??-Infinity)||value>(rule.maximum??Infinity)||value<=(rule.exclusiveMinimum??-Infinity)))errors.push(`${path}：数值超出范围`);
  if(typeof value==='string'&&(value.length<(rule.minLength??0)||rule.pattern&&!new RegExp(rule.pattern).test(value)))errors.push(`${path}：文字格式不符合要求`);
  if(Array.isArray(value)){
    if(value.length<(rule.minItems??0)||value.length>(rule.maxItems??Infinity))errors.push(`${path}：项目数量不符合要求`);
    if(rule.uniqueItems&&new Set(value.map(x=>JSON.stringify(x))).size!==value.length)errors.push(`${path}：项目不能重复`);
    value.forEach((x,i)=>{const r=rule.prefixItems?.[i]??rule.items;if(r&&typeof r==='object')check(x,r,`${path}[${i+1}]`,errors);});
  }
  if(object(value)){
    for(const k of rule.required||[])if(!own(value,k))errors.push(`${path}.${k}：缺少此项`);
    for(const [k,x] of Object.entries(value)){
      if(['__proto__','constructor','prototype'].includes(k)){errors.push(`${path}：不支持的属性名`);continue;}
      const r=rule.properties?.[k];
      if(r)check(x,r,`${path}.${k}`,errors);else if(rule.additionalProperties===false)errors.push(`${path}.${k}：不支持此项`);else if(object(rule.additionalProperties))check(x,rule.additionalProperties,`${path}.${k}`,errors);
    }
  }
}
export function resolveCourse(config){
  const tasks=clone(templates.tasks),visiting=new Set(),variants=config.variants;
  function resolve(id){
    if(own(tasks,id))return tasks[id];
    if(!own(variants,id)||visiting.has(id))throw new Error(`题目 ${id} 的模板不存在或形成循环引用`);
    visiting.add(id);const v=variants[id],base=resolve(v.base);visiting.delete(id);
    return tasks[id]={...base,...v,params:{...base.params,...v.params}};
  }
  Object.keys(variants).forEach(resolve);
  for(const task of Object.values(tasks)){
    if(task.kind==='undo'){const mark=task.params.mark||(/[\u4e00-\u9fff]/.test(task.params.original)?'！':'!');task.params={...task.params,mark};}
    if(task.kind==='document')task.params={...task.params,tools:task.params.tools||['bold','align','list']};
  }
  for(const m of config.missions)for(const id of m.tasks)if(own(tasks,id))tasks[id].literacy=m.literacy;
  return tasks;
}
let materialExamples;
const valueType=v=>Array.isArray(v)?'array':v===null?'null':typeof v;
function checkMaterial(value,examples,path,errors){
  if(!examples.length)return;
  const matching=examples.filter(x=>valueType(x)===valueType(value));
  if(!matching.length){errors.push(`${path}：材料类型不符合题型要求`);return;}
  if(Array.isArray(value)){const items=matching.flat();for(const [i,v]of value.entries())checkMaterial(v,items,`${path}[${i}]`,errors);}
  else if(object(value))for(const [key,v]of Object.entries(value))checkMaterial(v,matching.filter(x=>own(x,key)).map(x=>x[key]),`${path}.${key}`,errors);
}
export function validateCourse(config){
  const errors=[];check(config,schema,'课程',errors);if(errors.length)return {errors:errors.slice(0,30),tasks:null};
  let tasks;try{tasks=resolveCourse(config);}catch(e){return {errors:[e.message],tasks:null};}
  materialExamples??=Object.values(resolveCourse(defaultCourse));
  const ids=new Set(),used=new Set(),kinds=new Set(Object.values(templates.tasks).map(t=>t.kind));
  // Additional kinds have their material templates in the shipped variants.
  for(const v of Object.values(defaultCourse.variants))if(v.kind)kinds.add(v.kind);
  for(const m of config.missions){
    if(ids.has(m.id))errors.push(`工坊 ID 重复：${m.id}`);ids.add(m.id);
    if(!templates.stations.some(s=>s.id===m.theme))errors.push(`工坊 ${m.name} 的主题不存在`);
    if(!m.name.trim())errors.push('工坊名称不能为空');
    for(const id of m.tasks){if(used.has(id))errors.push(`题目 ${id} 被多个步骤重复使用，请复制为新题目`);used.add(id);if(!own(tasks,id))errors.push(`工坊 ${m.name} 引用了不存在的题目 ${id}`);}
  }
  for(const id of Object.keys(config.variants)){
    if(own(templates.tasks,id)){errors.push(`题目 ${id} 与内置模板重名，请使用新 ID`);continue;}
    const t=tasks[id],p=t.params||{};
    const previous=errors.length;checkMaterial(p,materialExamples.filter(x=>x.kind===t.kind).map(x=>x.params||{}),`${id}.材料`,errors);if(errors.length>previous)continue;
    if(!kinds.has(t.kind))errors.push(`${id}：不支持的题型 ${t.kind}`);
    for(const key of ['title','skill','instruction','objective','hint'])if(typeof t[key]!=='string'||!t[key].trim())errors.push(`${id}：${key} 不能为空`);
    if(!Number.isInteger(t.xp)||t.xp<0)errors.push(`${id}：XP 须为非负整数`);
    if(t.kind==='files'&&(!Array.isArray(p.files)||!p.files.length||!Array.isArray(p.targets)||!p.targets.length||p.targets.some(i=>!Number.isInteger(i)||!p.files[i])||new Set(p.targets).size!==p.targets.length||!p.folder?.trim()||/[<>:"/\\|?*\u0000-\u001f]/.test(p.folder)||/[. ]$/.test(p.folder)||p.files.some(n=>!n.trim())||new Set(p.files.map(n=>n.toLowerCase())).size!==p.files.length||p.files.some(n=>n.toLowerCase()===p.folder.toLowerCase())||!['move','copy'].includes(p.operation)))errors.push(`${id}：请检查文件清单、目标序号、合法且不重名的文件夹名称和移动/复制操作`);
    if(t.kind==='wheel'&&(!Array.isArray(p.cargo)||!p.cargo[p.target]))errors.push(`${id}：滚轮题目标序号超出清单`);
    if(t.kind==='click'&&(!Array.isArray(p.parcels)||!p.parcels.some(c=>c===(p.targetColor||'green'))))errors.push(`${id}：没有可选择的目标资料包`);
    if(['typing','repair','chinese','save','delivery'].includes(t.kind)&&!p.expected?.trim())errors.push(`${id}：目标文字不能为空`);
    if(t.kind==='settings'&&(!['浅色','暖色','深色'].includes(p.theme)||!['标准','大号','特大'].includes(p.size)))errors.push(`${id}：主题或字号不在设置选项中`);
    if(t.kind==='sheet'&&(p.items?.length!==3||p.values?.length!==3||p.values.some(v=>typeof v!=='number'||!Number.isFinite(v))))errors.push(`${id}：基础求和题需三项材料与三个目标数值一一对应`);
    if(t.kind.startsWith('sheet-')){
      if(!p.rows?.length||p.rows.some(r=>!r.id||typeof r.label!=='string'||!Number.isFinite(r.value)||typeof r.status!=='string')||new Set(p.rows.map(r=>r.id)).size!==p.rows.length)errors.push(`${id}：数据行需要唯一 ID、项目名称、数值和状态`);
      if(!['label','value','status'].includes(p.sortField)||!['asc','desc'].includes(p.sortOrder)||!['column','line','pie'].includes(p.chartType))errors.push(`${id}：排序字段、方向或图表类型无效`);
      if(t.kind==='sheet-filter'&&(!p.targetIds?.length||p.targetIds.some(target=>!p.rows.some(r=>r.id===target&&r.status===p.filterValue))||p.rows.filter(r=>r.status===p.filterValue).length!==p.targetIds.length))errors.push(`${id}：筛选目标 ID 须与指定状态的记录一一对应`);
    }
    if(t.kind.startsWith('browser')&&p.pages){
      if(!p.pages.length||p.pages.some(r=>!r.id||['address','title','body','source'].some(k=>typeof r[k]!=='string'))||new Set(p.pages.map(r=>r.id)).size!==p.pages.length)errors.push(`${id}：资料页面需要唯一 ID、地址、标题、正文和来源`);
      if(!p.targetIds?.length||p.targetIds.some(target=>!p.pages.some(r=>r.id===target)))errors.push(`${id}：目标资料 ID 不在页面清单中`);
    }
    if(t.kind==='mail-reply'&&!p.attachments?.includes(p.attachment))errors.push(`${id}：目标附件不在附件清单中`);
    if(t.kind==='calendar'){
      const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
      const validTime=s=>typeof s==='string'&&/^\d{2}:[0-5]\d$/.test(s)&&s>='09:00'&&s<='17:00';
      if(!validDate(p.weekStart)||!validDate(p.date)||!validTime(p.start)||!validTime(p.end)||p.start>=p.end||!p.eventTitle?.trim()||!['none','10','30','60'].includes(p.reminder)||(p.busy||[]).some(b=>!validDate(b.date)||!validTime(b.start)||!validTime(b.end)||b.start>=b.end||b.date===p.date&&b.start<p.end&&b.end>p.start))errors.push(`${id}：日程须为有效日期、09:00–17:00 内不冲突的起止时间及有效提醒选项`);
    }
  }
  for(const r of [config.islands.workshopCount,config.islands.introductionCount,config.islands.baseLayers,...config.landscapes.flatMap(l=>[l.map.width,l.map.depth,l.map.trees])])if(r[0]>r[1])errors.push('范围的最小值不能大于最大值');
  if(config.landscapes.some(l=>l.map.shapes.some(s=>!islandShapes.includes(s))))errors.push('存在不支持的岛屿轮廓');
  return {errors:errors.slice(0,30),tasks};
}
export function readCourse(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>maxCourseBytes)throw new Error('课程 JSON 不得超过 2 MB');
  let config;try{config=JSON.parse(text);}catch{throw new Error('JSON 格式有误，请检查逗号、引号和括号');}
  const result=validateCourse(config);if(result.errors.length)throw new Error(result.errors.join('\n'));return config;
}
export function courseFingerprint(config){let hash=2166136261;for(const c of JSON.stringify(config))hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0).toString(16);}
