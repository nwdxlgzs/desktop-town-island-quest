import guides from './exercise-guides.json' with {type:'json'};
import { escapeHTML as esc } from './icons.js';

export function exerciseSteps(task){
  const p=task.params||{},names=p.files||['查证清单.txt','临时草稿.tmp','素材来源表.xlsx','旧版通知.txt'],targets=p.targets||[0,2],copy=p.operation==='copy';
  const values={color:p.targetColor==='orange'?'橙色':'绿色',file:p.file||'工具箱',item:p.item||'未分类资料',label:p.label||'标记为易碎',cargoTarget:(p.cargo||[])[p.target??11]||'星星灯',target:p.target||'救生圈',text:p.text||'重要信息还要查证',note:p.note||'一个好点子',box:p.box||'灵感收集箱',expected:p.expected||(task.kind==='chinese'?'我会使用电脑。':task.kind==='save'?'实验成功':task.kind==='delivery'?'任务完成，出发！':'Hello, AI!'),nameLabel:p.nameLabel||'名字',countLabel:p.countLabel||'份数',name:p.name||'PC',count:p.count||'3',mark:p.mark||'！',original:p.original||'今天也是好日子',folder:p.folder||'查证资料',firstFile:names[targets[0]],otherFiles:targets.slice(1).map(i=>names[i]).join('、'),transferLabel:copy?'复制备份':'移动归档',transferHelp:copy?'按 Ctrl+C 复制，打开目标文件夹，再按 Ctrl+V；保留资料区的原件':'按 Ctrl+X 剪切，打开目标文件夹，再按 Ctrl+V；也可拖放文件到文件夹',tools:(p.tools||['bold','align','list']).map(t=>({bold:'标题加粗',align:'标题居中',list:'正文项目符号'})[t]).join('、'),find:p.find||'旧码头',replace:p.replace||'新码头',theme:p.theme||'暖色',size:p.size||'大号',to:p.to||'captain@town.test',subject:p.subject||'今日探索报告',attachment:p.attachment||'学习记录.pdf',prefix:p.prefix||'通知：',suffix:p.suffix||'。',title:p.title||'我的探索故事',address:p.address||'town://it',query:p.query||(task.kind==='pdf'?'验证码':'人工智能')};
  Object.assign(values,{targetTitle:p.targetTitle||p.resultTitle||'人工智能回答查证指南',bookmarkName:p.bookmarkName||'',bookmarkFolder:p.bookmarkFolder||'学习资料',downloadName:p.downloadName||'',downloadFolder:p.downloadFolder||'下载',valueHeader:p.valueHeader||'数量',sortOrderLabel:p.sortOrder==='asc'?'升序（小 → 大）':'降序（大 → 小）',filterValue:p.filterValue||'已核实',chartTypeLabel:({column:'柱形图',line:'折线图',pie:'饼图'})[p.chartType||'column'],chartTitle:p.chartTitle||'',requestSubject:p.requestSubject||'',replyPoints:(p.requiredPhrases||[]).join('、'),eventDate:p.date||'',eventStart:p.start||'',eventEnd:p.end||'',eventTitle:p.eventTitle||'',eventPlace:p.place||'',eventReminder:p.reminder||'10'});
  const expand=text=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??'');
  return (task.guide||guides[task.kind]||[]).map(s=>({...s,label:expand(s.label),help:expand(s.help)}));
}

export function mountExerciseGuide(root,task,completed){
  const steps=exerciseSteps(task),host=document.createElement('section');let awarded=false;host.className='exercise-coach';host.setAttribute('aria-label','操作向导');
  host.innerHTML=`${task.context?`<p class="coach-context">${esc(task.context)}</p>`:''}<div class="coach-now" aria-live="polite"><small></small><b></b><p></p></div><ol aria-label="任务步骤">${steps.map((s,i)=>`<li data-guide-step="${i}"><span>${i+1}</span>${esc(s.label)}</li>`).join('')}</ol>`;root.prepend(host);
  function update(finished=false){
    awarded ||= finished;finished=awarded;
    const index=steps.findIndex((_,i)=>!completed.has(i)),current=index<0?steps.length-1:index;
    for(const el of root.querySelectorAll('.practice-target'))el.classList.remove('practice-target');
    host.querySelector('small').textContent=finished?'操作完成':index<0?'最后检查':`当前步骤 ${current+1} / ${steps.length}`;
    host.querySelector('b').textContent=finished?'本次挑战已完成':index<0?'核对结果后提交':steps[current]?.label||'按任务要求操作';
    host.querySelector('.coach-now p').textContent=finished?'可以继续下一个挑战，也可以留在这里试试刚学会的工具。':index<0?'确认本次要求已经满足，再使用应用中的保存、发送或检查按钮。':steps[current]?.help||task.hint;
    for(const el of host.querySelectorAll('[data-guide-step]')){const i=+el.dataset.guideStep,done=finished||completed.has(i);el.classList.toggle('done',done);el.classList.toggle('current',!finished&&i===index);el.querySelector('span').textContent=done?'✓':i+1;}
    if(!finished&&index>=0&&steps[index].target)for(const el of root.querySelectorAll(steps[index].target))el.classList.add('practice-target');
  }
  update();return {update,complete(){steps.forEach((_,i)=>completed.add(i));update(true);}};
}
