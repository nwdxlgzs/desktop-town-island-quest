import {courseId,courseProblem,courseStorageKey} from './runtime-course.js';
import {readCourse,maxCourseBytes} from './course-config.js';
export function mountCourseUI(root){
  const section=document.createElement('section');section.className='progress-section';
  section.innerHTML=`<h3>载入教师课程</h3><p>${courseId==='default'?'当前使用内置课程。':'当前使用教师自定义课程。'}教师可用同文件夹中的 <a href="./teacher.html" target="_blank" rel="noopener">教师备课台</a>设计题目并导出 JSON。每套课程的进度分别保存在本机，切换课程后可继续原来的进度。</p><label class="progress-file-label" for="import-course">选择教师导出的课程 JSON（最多 2 MB）</label><input id="import-course" type="file" accept=".json,application/json"><div id="course-preview" hidden></div><p id="course-feedback" role="status"></p>${courseId!=='default'?'<button class="secondary" id="default-course">返回内置课程</button>':''}`;
  root.append(section);let active=true,ticket=0;
  const feedback=section.querySelector('#course-feedback'),preview=section.querySelector('#course-preview');feedback.textContent=courseProblem;
  section.querySelector('#import-course').addEventListener('change',async e=>{
    const request=++ticket;preview.hidden=true;feedback.textContent='';const file=e.target.files[0];if(!file)return;
    try{if(file.size>maxCourseBytes)throw Error('文件不能超过 2 MB');const next=readCourse(await file.text());if(!active||request!==ticket)return;
      preview.innerHTML=`<b>课程已通过检查</b><p>${next.missions.length} 个工坊 · ${next.missions.reduce((n,m)=>n+m.tasks.length,0)} 道题。载入后重新打开地图；当前课程的进度已保留。</p><button class="primary">载入这套课程</button>`;preview.hidden=false;
      preview.querySelector('button').addEventListener('click',()=>{try{localStorage.setItem(courseStorageKey,JSON.stringify(next));location.reload();}catch{feedback.textContent='浏览器无法保存课程，请允许本地存储后重试。';}});
    }catch(error){if(active&&request===ticket)feedback.textContent=error.message;}
  });
  section.querySelector('#default-course')?.addEventListener('click',()=>{try{localStorage.removeItem(courseStorageKey);location.reload();}catch{feedback.textContent='浏览器无法切换课程。';}});
  return ()=>{active=false;ticket++;};
}
