import { icon } from './icons.js';
import { normalizeQuality,shadowNames } from './quality.js';

export function showQuality({world,state,persist,showModal,closeModal}){
  const settings=state.quality,live=world?.getQuality();
  const select=(id,label,options,value)=>`<label>${label}<select id="${id}">${options.map(([v,text])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${text}</option>`).join('')}</select></label>`;
  const check=(id,label,value)=>`<label class="quality-check"><input type="checkbox" id="${id}" ${value?'checked':''}>${label}</label>`;
  showModal(`<div class="standard-modal-header"><div><span class="modal-icon">${icon('settings',23)}</span><h2 id="modal-title">画面设置</h2></div><button class="icon-button" data-close aria-label="返回岛屿">${icon('close',21)}</button></div><form class="quality-form" id="quality-form">
    ${select('quality-preset','运行模式',[['auto','自动适配'],['low','流畅低配 · 暂停环境活动']],settings.preset)}
    ${select('render-resolution','渲染分辨率',[['auto','自动 · 优先 120%'],['2','超清 · 200%'],['1.5','高清 · 150%'],['1.2','清晰 · 120%'],['1','标准 · 100%'],['.75','省电 · 75%'],['.5','低分辨率 · 50%']],settings.resolution)}
    ${select('quality-antialias','抗锯齿',[['off','关闭 · 优先流畅'],['fxaa','FXAA · 平滑边缘，增加渲染开销']],settings.antialias)}
    ${check('quality-terrain-lines','显示方块线条',settings.terrainLines!=='off')}
    ${select('quality-fps','移动时帧率上限',[[60,'60 帧'],[30,'30 帧'],[24,'24 帧 · 省电'],[20,'20 帧 · 低配']],settings.maxFps)}
    ${check('quality-adaptive','卡顿时自动减轻负担',settings.adaptive)}
    <p>自动适配保留所选画面效果；勾选自动减负后，持续卡顿才逐级调整，小幅波动保持当前档位。静止时降低绘制频率，不改变阴影和画质。</p>
    ${check('quality-npcs','居民与动物自主漫步',settings.npcMovement)}
    ${check('quality-waves','移动的体素波浪',settings.waves)}
    ${select('quality-shadow-level','阴影等级',[['off','关闭 · 最省资源'],['baked','烘焙 · 地形和景物投影'],['baked-contact','烘焙 + 脚底简影 · 人物与动物固定影子'],['baked-high','转静态烘焙 · 动态高 · 1024 柔和投影 + 脚底简影 · 人物与动物固定影子'],['cached','静态缓存 · 一次投影 + 脚底简影'],['low','动态低 · 512 贴图 / 每秒最多 4 次更新'],['high','动态高 · 1024 柔和投影 / 每秒最多 10 次更新']],settings.shadowQuality)}
    <p>转静态烘焙使用动态高档的 1024 柔和投影，随岛屿和光线生成后复用，人物走动不重算场景投影。脚底简影随人物和动物移动，跳跃及肢体动作不改变影子形状。动态阴影等级增加运行开销。</p>
    ${check('quality-weather','天气粒子',settings.weather)}
    ${check('quality-show-fps','游戏内显示实际 FPS',settings.showFps)}
    <div class="quality-status" role="status">当前：${Math.round((live?.pixelRatio||1)*100)}% · ${shadowNames[live?.shadowQuality]||'关闭'}${live?.stage?` · 减负第 ${live.stage} 档`:''}${live?.npcMovement===false?' · 自主漫步暂停':''}</div><button class="primary" type="submit">保存画面设置 ${icon('check',17)}</button></form>`,'quality-modal');
  const form=document.querySelector('#quality-form');
  form.addEventListener('submit',e=>{e.preventDefault();state.quality=normalizeQuality({preset:form.querySelector('#quality-preset').value,resolution:form.querySelector('#render-resolution').value,antialias:form.querySelector('#quality-antialias').value,terrainLines:form.querySelector('#quality-terrain-lines').checked?'beveled':'off',maxFps:Number(form.querySelector('#quality-fps').value),adaptive:form.querySelector('#quality-adaptive').checked,npcMovement:form.querySelector('#quality-npcs').checked,waves:form.querySelector('#quality-waves').checked,shadowQuality:form.querySelector('#quality-shadow-level').value,showFps:form.querySelector('#quality-show-fps').checked,weather:form.querySelector('#quality-weather').checked});persist();world?.setQuality(state.quality);closeModal();});
}
