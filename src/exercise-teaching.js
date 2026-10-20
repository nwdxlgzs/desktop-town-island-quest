import { exerciseSteps } from './exercise-guide.js';
import { icon, escapeHTML as esc } from './icons.js';

export const exerciseKindNames={
  click:'鼠标单击',double:'鼠标双击',right:'鼠标右键',wheel:'滚轮浏览',middle:'鼠标中键',hover:'悬停提示',select:'选中文字',drag:'拖放便签',
  typing:'英文输入',chinese:'中文输入',repair:'删除与修改文字',tab:'Tab 切换输入框',copy:'复制文字',cut:'剪切文字',undo:'撤销修改',save:'保存记录',crop:'框选截图',capture:'系统截图导入',delivery:'编辑并派送消息',
  files:'文件管理器',document:'文档排版',sheet:'表格录入与求和',search:'查找与替换',settings:'软件设置',mail:'编写邮件',keys:'Home / End 编辑',presentation:'制作演示文稿',browser:'浏览器搜索与查证',paint:'画图',pdf:'PDF 阅读与批注',resize:'移动与缩放窗口',
  'browser-tabs':'浏览器多标签比较','browser-bookmark':'收藏与重访','browser-find':'网页内查找','browser-download':'下载与文件预览',
  'sheet-sort':'整表排序','sheet-filter':'筛选数据','sheet-chart':'制作图表','mail-reply':'阅读与回复邮件',calendar:'安排日程'
};

export function taskTeaching(task){
  const p=task.params||{},kind=task.kind;
  let steps=exerciseSteps(task).map(({label,help})=>({label,help}));
  const notes=['Mac 上可用 ⌘ 代替 Ctrl。教学可以随时收起，查看教学不会清空正在做的操作。'];
  if(kind==='files'){
    const names=p.files||['查证清单.txt','临时草稿.tmp','素材来源表.xlsx','旧版通知.txt'],targets=(p.targets||[0,2]).map(i=>names[i]),copy=p.operation==='copy',folder=p.folder||'查证资料';
    steps=[
      {label:'先回到资料区',help:'点击左侧“信息科技资料”。先读清上方清单，只处理本题指定的文件。'},
      {label:`复制名称并重命名为「${folder}」`,help:`点击“新建文件夹”后，可先离开命名框保留默认名。在上方清单拖选「${folder}」并按 Ctrl+C，再选中文件夹，点“重命名”（或 F2），按 Ctrl+V、Enter。现成文字可以选中复制，不必重新打字。`},
      {label:'一次选中清单文件',help:`先单击「${targets[0]}」，按住 Ctrl 再逐个单击「${targets.slice(1).join('、')}」。看到这些行同时高亮后松开 Ctrl；多选是本题的操作要求。`},
      {label:copy?'复制，保留原件':'剪切，准备移动',help:copy?'按 Ctrl+C，或点工具栏“复制”。本题是备份，不能用剪切或直接拖走原件。':'按 Ctrl+X，或点工具栏“剪切”。原件会标为等待移动；此时还没有离开资料区。'},
      {label:'进入目标文件夹并粘贴',help:`双击「${folder}」，再按 Ctrl+V 或点“粘贴”。双击文件夹只会打开它，不会自动搬运资料。`},
      {label:'核对并提交',help:`确认文件夹里恰好有清单中的 ${targets.length} 个文件，再点“检查整理结果”。${copy?'回到资料区还能看到原件，才是正确备份。':'目标文件应离开原资料区，其他文件留在原处。'}`}
    ];
    notes.push('选错文件可 Ctrl+单击取消。多余的副本可选中后点“删除”、按 Delete，或用右键菜单删除；不要删除原件。','若出现“需要重置本题”，点击提示旁的“重置本题”，重新按本教程操作。重置只恢复当前题目。');
  }
  if(kind==='select')steps=[
    {label:'找到目标句',help:`找到「${p.text||'重要信息还要查证'}」，将鼠标放到第一个字前。`},
    {label:'按住左键拖选',help:'保持左键按下，拖到这句话最后一个字后。只选目标句，不带上前后的文字或换行。'},
    {label:'松开并检查',help:'松开左键，选中的文字会出现底色。选对后自动完成；多选或少选时，单击空白处后重新拖选。'}
  ];
  if(kind==='document'){
    steps[0].help+=` 本题标题为「${p.title||'小镇公告'}」；每个需要的格式按钮点一次即可，再点会取消。`;
    steps[1].help=(p.initialBody?.includes('____')?'从下方资料单中拖选缺少的正文，按 Ctrl+C；再选中正文草稿里的 ____，按 Ctrl+V 替换，保留已经写好的第一行和换行。':'从下方资料单中拖选完整正文，按 Ctrl+C；点击正文框，再按 Ctrl+V 粘贴，核对换行与标点。')+`本题完整正文：\n${p.body||'沿小路前往集合点。\n请带上饮用水，爱护自然。'}`;
  }
  if(kind==='sheet')steps[0].help=`依次点击 B2、B3、B4，按顺序填入 ${(p.values||[3,4,2]).join('、')}。已有数字可以保留，错误数字可选中后修改。`;
  if(kind==='mail')steps[1].help=`可从下方任务单复制收件地址和主题。正文已有第一句时，只选中任务单中缺少的后半段并按 Ctrl+C，点击草稿末尾按 End，再按 Ctrl+V 补全，核对换行与标点：\n${p.body||'学习资料已整理好，分享前请检查来源。'}`;
  if(kind.startsWith('browser')){
    const pages=p.pages||[],titles=(p.targetIds||['source']).map(id=>pages.find(page=>page.id===id)?.title).filter(Boolean);
    if(titles.length)steps[0].help+=` 本题需查阅：${titles.join('、')}。`;
    if(kind==='browser')notes.push('先在地址栏输入题目网址并按 Enter，再在资料站搜索框搜索关键词；只看搜索结果还不算读过正文。');
    if(kind==='browser-tabs')notes.push('新标签页打开后，还要逐个点击标签阅读正文，并保持两份目标资料都打开。');
    if(kind==='browser-find')notes.push('网页搜索与页内查找是两个工具。先打开正文，再用 Ctrl+F；多个匹配时要点向下箭头。');
  }
  if(kind==='sheet-chart'){
    const last=(p.rows?.length||5)+1;
    steps[0].help=`单击 A1，按住 Shift 再单击 B${last}，或从 A1 拖到 B${last}，选区包含表头、全部类别及数值。`;
  }
  if(kind==='copy'||kind==='cut')notes.push(`先在左框按 Ctrl+A，再用 Ctrl+${kind==='cut'?'X':'C'}，最后点击右框按 Ctrl+V。手工输入相同文字不会代替本题要求的快捷键操作。`);
  if(kind==='cut')notes.push('如果原始文字被误删或改坏，且还没有完成正确剪切，请点“重置本题”恢复材料后再练习。');
  if(kind==='undo')notes.push('只输入题目指定的一个标点，再用 Ctrl+Z 撤销。自己删除标点不能代替撤销操作。');
  if(kind==='capture')notes.push('Windows：Win+Shift+S；Mac：⌘+Control+Shift+4；统信 UOS：Ctrl+Alt+A。截图后回到接收区粘贴，也可选择已保存的截图文件。');
  if(kind==='calendar')notes.push('点错日程可以打开后修改或删除。遇到冲突时保留原有活动，重新选择题目要求的空闲时段。');
  if(['files','document','sheet','search','mail','presentation','save','delivery'].includes(kind)||kind.startsWith('browser'))notes.push('不用把现成资料重新打一遍：在题干、操作提示或资料单中按住左键拖选需要的文字 → Ctrl+C → 点击输入位置 → Ctrl+V。只选文字本身，不带上外面的引号；粘贴后检查空格、标点和换行。');
  return {name:exerciseKindNames[kind],title:task.title,objective:task.objective,steps,notes};
}

export function teachingMarkup(task){
  const teaching=taskTeaching(task);
  return `<div class="teaching-heading"><small>${esc(teaching.name)}</small><h3>${esc(teaching.title)}</h3><p>${esc(teaching.objective)}</p></div><ol class="teaching-steps">${teaching.steps.map(step=>`<li><b>${esc(step.label)}</b><p>${esc(step.help)}</p></li>`).join('')}</ol><div class="teaching-notes"><b>操作提醒</b>${teaching.notes.map(note=>`<p>${esc(note)}</p>`).join('')}</div>`;
}

export function mountExerciseTeaching(root,task,on,demonstrate){
  const host=document.createElement('section');host.className='exercise-teaching';
  host.innerHTML=`<div class="teaching-bar"><span>找不到按钮？看原题界面自动操作</span><button type="button" id="exercise-teaching" aria-haspopup="dialog">${icon('play',19)}本题教学 · 看自动演示</button></div><details class="teaching-written"><summary>文字步骤（辅助阅读）</summary><div id="exercise-teaching-content" class="teaching-content">${teachingMarkup(task)}</div></details>`;
  root.prepend(host);
  on(host.querySelector('button'),'click',demonstrate);
}
