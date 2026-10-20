import { icon,escapeHTML as esc } from './icons.js';
import { readProgress,parseSeed,randomSeed,maxProgressBytes } from './progress-file.js';

export function mountProgressUI(root,{state,preview,exportProgress,download,onImport,onRestart,startNew=false}){
  let active=true,request=0;
  root.innerHTML=`<div class="progress-intro"><h3>随机数像一次抽签</h3><p>游戏用一个随机数作为“航线种子”，决定工坊顺序、岛名和地图。同一版本使用相同种子，就会生成相同航线。种子只记录航线；答题记录需要导出进度。</p><label class="seed-current">当前航线随机数 <input id="current-seed" readonly value="${state.seed}" aria-label="当前航线随机数"><small>点选数字后 Ctrl+C，可记录或分享</small></label>${preview?'<p class="progress-mode-note">当前是教学演示模式，存档与学生模式分开，进度文件不能混用。</p>':''}</div>
  <section class="progress-section"><h3>导出：把进度存成文件</h3><p>当前完成 <b>${state.completed.length}</b> 题。导出文件包含种子、完成题目、收藏和练习记录。把文件保存在自己的文件夹或 U 盘里，换电脑时再导入。</p><button class="primary" id="export-progress">${icon('download',17)}导出进度文件</button><p class="progress-file-note">课堂报告用于查看学习情况；“进度文件”才能恢复游戏。</p></section>
  <section class="progress-section"><h3>导入：从文件恢复</h3><p>先选择以前导出的 JSON 进度文件，核对内容后再恢复。恢复会替换当前浏览器中的进度，建议先导出当前进度。</p><label class="progress-file-label" for="import-progress">选择进度文件（JSON，最多 2 MB）</label><input id="import-progress" type="file" accept=".json,application/json"><div id="import-preview" hidden></div><p id="progress-feedback" role="status" aria-live="polite"></p></section>
  <details class="progress-section" id="new-adventure" ${startNew?'open':''}><summary>用随机数开始新冒险</summary><p>你可以抽取一个新随机数，也可以填写同学分享的种子。开始新冒险会清除当前答题进度，先导出即可留个备份。</p><form id="seed-form"><label for="new-seed">新航线随机数（0–4294967295）</label><div class="seed-controls"><input id="new-seed" inputmode="numeric" pattern="[0-9]{1,10}" required value="${state.seed}"><button type="button" class="secondary" id="random-seed">抽取随机数</button></div><button class="secondary" type="submit">准备这条航线</button></form><div id="seed-confirm" hidden></div><p id="seed-feedback" role="status" aria-live="polite"></p></details>`;
  const current=root.querySelector('#current-seed'),feedback=root.querySelector('#progress-feedback'),previewBox=root.querySelector('#import-preview'),confirmBox=root.querySelector('#seed-confirm');
  current.addEventListener('click',()=>current.select());
  root.querySelector('#export-progress').addEventListener('click',()=>{download(JSON.stringify(exportProgress(),null,2),`电脑小镇进度-${state.seed}-${new Date().toISOString().slice(0,10)}.json`,'application/json;charset=utf-8');feedback.textContent='已发起导出，请保留下载的 JSON 文件，下次用“选择进度文件”恢复。';});
  root.querySelector('#import-progress').addEventListener('change',async e=>{
    const ticket=++request;previewBox.hidden=true;previewBox.replaceChildren();feedback.textContent='';
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>maxProgressBytes)throw new Error('进度文件过大，请选择不超过 2 MB 的 JSON 进度文件。');
      const text=await file.text();if(!active||ticket!==request)return;
      const next=readProgress(text,preview);
      previewBox.innerHTML=`<b>确认要恢复这份进度吗？</b><p>航线随机数：${next.seed} · 已完成 ${next.completed.length} 题 · 位于第 ${next.currentLevel+1} 岛<br>当前 ${state.completed.length} 题的进度将被替换。</p><button class="primary" id="confirm-import">用此进度替换并恢复</button>`;previewBox.hidden=false;
      previewBox.querySelector('button').addEventListener('click',()=>{try{onImport(text);}catch(error){feedback.textContent=error.message;}});
      feedback.textContent='文件检查通过，尚未更改当前进度。';
    }catch(error){if(active&&ticket===request)feedback.textContent=error.message;}
  });
  const seedInput=root.querySelector('#new-seed'),seedFeedback=root.querySelector('#seed-feedback');
  seedInput.addEventListener('input',()=>{confirmBox.hidden=true;seedFeedback.textContent='';});
  root.querySelector('#random-seed').addEventListener('click',()=>{seedInput.value=randomSeed();confirmBox.hidden=true;seedFeedback.textContent=`这次抽到了 ${seedInput.value}。准备航线后，还需确认开始。`;});
  root.querySelector('#seed-form').addEventListener('submit',e=>{
    e.preventDefault();try{
      const seed=parseSeed(seedInput.value);seedFeedback.textContent='';
      confirmBox.innerHTML=`<b>用 ${esc(seed)} 开始新冒险？</b><p>当前 ${state.completed.length} 题的进度会被清除。需要保留的话，请先点击上面的“导出进度文件”。</p><button class="primary danger-button" id="confirm-new-adventure">清除当前进度，开始这条航线</button>`;confirmBox.hidden=false;
      confirmBox.querySelector('button').addEventListener('click',()=>onRestart(seed));
    }catch(error){seedFeedback.textContent=error.message;}
  });
  return ()=>{active=false;request++;};
}
