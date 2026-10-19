import { exerciseKindNames, teachingMarkup } from './exercise-teaching.js';
import { mountExercise } from './exercises.js';
import { openExerciseDemo } from './exercise-demo.js';
import { escapeHTML as esc, icon } from './icons.js';

// Demonstrations use isolated exercise instances; success never writes course progress.
export function mountTeachingLibrary(root,{tasks,taskIds,capture}){
  const kinds=Object.keys(exerciseKindNames).filter(kind=>taskIds.some(id=>tasks[id].kind===kind));
  const controller=new AbortController(),options={signal:controller.signal};let kind=kinds[0],selected=taskIds.find(id=>tasks[id].kind===kind),cleanup=null,demo=null;
  root.innerHTML=`<nav class="teaching-kind-list" aria-label="全题型教学目录">${kinds.map((kind,i)=>`<button data-teaching-kind="${kind}">${i+1}. ${esc(exerciseKindNames[kind])}</button>`).join('')}</nav><section class="teaching-library-main"></section>`;
  const main=root.querySelector('.teaching-library-main');
  function stop(){demo?.dispose();demo=null;cleanup?.();cleanup=null;}
  function render(){
    stop();
    for(const button of root.querySelectorAll('[data-teaching-kind]')){const active=button.dataset.teachingKind===kind;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
    main.innerHTML=`<label for="teaching-example">选择本题型的课程例题</label><select id="teaching-example">${taskIds.filter(id=>tasks[id].kind===kind).map(id=>`<option value="${id}" ${id===selected?'selected':''}>${esc(tasks[id].title)}</option>`).join('')}</select><div class="teaching-example-content">${teachingMarkup(tasks[selected])}</div><div class="teaching-library-actions"><button class="primary" id="teaching-practice">${icon('play',17)}试做这道例题</button></div><p class="teaching-library-status" role="status"></p><div class="exercise" id="teaching-practice-area" hidden></div>`;
    main.scrollTop=0;
    const written=main.querySelector('.teaching-example-content'),details=document.createElement('details');details.className='teaching-written';details.innerHTML='<summary>文字步骤（辅助阅读）</summary>';written.before(details);details.append(written);
    const watch=document.createElement('button');watch.className='primary';watch.id='teaching-watch';watch.innerHTML=`${icon('play',17)}观看原题自动演示`;main.querySelector('.teaching-library-actions').prepend(watch);main.querySelector('#teaching-practice').className='secondary';main.querySelector('#teaching-practice').textContent='自己试做这道题';
  }
  function practice(){
    stop();const area=main.querySelector('#teaching-practice-area'),status=main.querySelector('.teaching-library-status');area.hidden=false;status.textContent='教学试做：可以重复练习，课堂存档保持原样。';
    main.querySelector('#teaching-practice').innerHTML=`${icon('reset',16)}重置并重新试做`;
    cleanup=mountExercise(selected,area,{capture,sound(){},feedback(text){status.textContent=text;},success(){status.textContent='教学练习完成！可以切换其他例题，或重置后再次演示。';return true;}});
    area.scrollIntoView({block:'nearest'});
  }
  root.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.teachingKind){kind=button.dataset.teachingKind;selected=taskIds.find(id=>tasks[id].kind===kind);render();}if(button.id==='teaching-practice')practice();if(button.id==='teaching-watch'){demo?.dispose();demo=openExerciseDemo(selected,{capture});}},options);
  root.addEventListener('change',e=>{if(e.target.id==='teaching-example'){selected=e.target.value;render();}},options);
  render();return ()=>{controller.abort();stop();};
}
