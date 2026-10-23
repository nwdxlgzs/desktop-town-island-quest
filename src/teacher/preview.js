import '../style.css';
import '../adventure.css';
import '../software.css';
import '../teaching.css';
import {mountExercise} from '../exercises.js';
let cleanup;
const root=document.querySelector('#preview-exercise'),feedback=document.querySelector('#preview-feedback');
Object.assign(document.body.style,{margin:'0',padding:'18px',background:'#fafbf5',minWidth:'0'});
addEventListener('message',e=>{
  if(e.source!==parent||e.data?.type!=='quest-teacher-preview')return;
  const task=e.data.task;if(!task||typeof task.kind!=='string')return;
  cleanup?.();feedback.textContent='';document.querySelector('#preview-instruction').textContent=task.instruction;
  try{cleanup=mountExercise(task,root,{capture:()=>'',sound(){},feedback:text=>feedback.textContent=text,success(){feedback.textContent='试做成功！此预览不会记录学生进度。';return true;}});}catch(error){feedback.textContent='题目材料有误：'+error.message;root.replaceChildren();}
});
parent.postMessage({type:'quest-teacher-ready'},'*');
