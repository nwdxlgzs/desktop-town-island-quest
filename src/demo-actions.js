// Operations target the same controls and event handlers as the student's exercise.
export function demoActions(task){
  const p=task.params||{},kind=task.kind,a=[];
  const add=(type,target,label,extra={})=>a.push({type,target,label,...extra});
  const click=(target,label,extra)=>add('click',target,label,extra);
  const fill=(target,value,label)=>add('fill',target,label,{value:String(value??'')});
  const key=(target,key,label,extra={})=>add('key',target,label,{key,...extra});
  const choose=(target,value,label)=>add('choose',target,label,{value:String(value)});
  const check=(target,checked,label)=>add('check',target,label,{checked});
  const ctrl=(target,keyName,label)=>key(target,keyName,label,{ctrlKey:true});
  switch(kind){
    case 'click':(p.parcels||['green','orange','green','orange','orange','green']).forEach((color,i)=>{if(color===(p.targetColor||'green'))click(`[data-parcel="${i}"]`,'单击清单要求的'+(color==='orange'?'橙色':'绿色')+'资料包');});break;
    case 'double':add('double','#toolbox','在同一个资料图标上快速双击左键');break;
    case 'right':add('context','#fragile-parcel','在资料上单击鼠标右键，打开操作菜单');click('[data-action="fragile"]','用左键选择「'+(p.label||'标记为易碎')+'」');break;
    case 'wheel':add('scroll','#cargo-list','把鼠标放在清单内，向下滚动滚轮',{to:`[data-cargo="${p.target??11}"]`});click(`[data-cargo="${p.target??11}"]`,'找到目标条目后单击打开');break;
    case 'middle':add('middle','#beacon','向下按鼠标滚轮，再松开（不是转动滚轮）');break;
    case 'hover':add('hover','#hover-supply','鼠标停在工具图标上，等提示出现',{settle:620});click('[data-hover-answer="correct"]','读完提示，点击与提示一致的说明');break;
    case 'select':add('textSelection','#selection-text span','从目标句第一个字拖到最后一个字，松开左键',{settle:180});break;
    case 'drag':add('drag','#drag-note','按住黄色便签，拖入右侧收集箱后松开',{to:'#drop-box',data:'desktop-quest-note'});break;
    case 'typing':case 'chinese':fill('#typing-input',p.expected||(kind==='chinese'?'我会使用电脑。':'Hello, AI!'),kind==='chinese'?'点击输入框，用中文输入法输入并确认候选':'点击输入框，照目标输入，留意空格和标点');break;
    case 'repair':{
      const initial=p.initial||'Hello, PCC!',expected=p.expected||'Hello, AI!';let at=0;while(at<initial.length&&initial[at]===expected[at])at++;
      add('repair','#typing-input','把光标放到多余字符后，按 Backspace 删除',{initial,expected,at});key('#typing-input','Enter','核对目标文字，再按 Enter 提交');break;
    }
    case 'tab':fill('#order-name',p.name||'PC','点击第一个输入框，填写'+(p.nameLabel||'名字'));key('#order-name','Tab','按 Tab，切换到第二个输入框',{to:'#order-count'});fill('#order-count',p.count||'3','填写'+(p.countLabel||'份数'));key('#order-count','Tab','按 Shift+Tab，返回第一个输入框',{shiftKey:true,to:'#order-name'});key('#order-name','Enter','核对两项，按 Enter 提交');break;
    case 'copy':case 'cut':{
      const cut=kind==='cut',recipe=p.recipe||'查来源，看日期，核实重要信息。';
      ctrl('#source-input','a','点击原始资料，按 Ctrl+A 全选');ctrl('#source-input',cut?'x':'c',cut?'按 Ctrl+X 剪切，观察原位置变空':'按 Ctrl+C 复制，原始资料保留');
      add('paste','#destination-input','点击右侧输入框，按 Ctrl+V 粘贴',{value:recipe,settle:180});break;
    }
    case 'undo':key('#undo-input','End','点击便签，按 End 到文字末尾');fill('#undo-input',(p.original||'今天也是好日子')+(p.mark||'！'),'在末尾输入题目要求的一个标点');add('undo','#undo-input','按 Ctrl+Z，撤销刚输入的标点',{value:p.original||'今天也是好日子',settle:60});break;
    case 'save':fill('#save-input',p.expected||'实验成功','在记录框中输入完整内容');ctrl('#save-input','s','在练习框中按 Ctrl+S 保存');break;
    case 'crop':add('pointerDrag','#crop-canvas','从图卡左上角按住左键，拖到右下角后松开',{rect:p.crop||{x:160,y:75,w:540,h:350},width:860,height:500});break;
    case 'capture':add('systemCapture','#image-receiver','先用系统截图工具框选安全区域（这里演示截图过程）');add('imagePaste','#image-receiver','回到接收区，点击后按 Ctrl+V 粘贴截图',{settle:100});break;
    case 'delivery':add('double','#message-file','双击消息文件，打开编辑区');ctrl('#message-input','a','点击消息框，按 Ctrl+A 选中旧消息');fill('#message-input',p.expected||'任务完成，出发！','输入任务要求的新消息');ctrl('#message-input','s','按 Ctrl+S，保存并派送');break;
    case 'files':{
      const names=p.files||['查证清单.txt','临时草稿.tmp','素材来源表.xlsx','旧版通知.txt'],targets=p.targets||[0,2],copy=p.operation==='copy';
      click('#new-folder','点击工具栏中的“新建文件夹”');fill('#folder-name',p.folder||'查证资料','输入目标文件夹名称');key('#folder-name','Enter','按 Enter 确认名称');
      targets.forEach((i,n)=>click(`[data-file="${i}"]`,`${n?'按住 Ctrl，再单击':'先单击'}「${names[i]}」`,{ctrlKey:n>0}));
      click(`[data-fm-action="${copy?'copy':'cut'}"]`,copy?'点击“复制”（Ctrl+C），保留原件':'点击“剪切”（Ctrl+X），准备移动原件');
      add('double','[data-folder]','双击刚建立的目标文件夹');click('[data-fm-action="paste"]','点击“粘贴”（Ctrl+V），观察文件出现在目标目录');click('#fm-check','确认目录内容，点击“检查整理结果”');break;
    }
    case 'document':ctrl('#word-title','a','点击标题，按 Ctrl+A 全选标题');for(const tool of p.tools||['bold','align','list'])click(`[data-word-tool="${tool}"]`,'点击“'+({bold:'加粗',align:'居中',list:'项目符号'})[tool]+'”按钮');fill('#word-body',p.body||'沿小路前往集合点。\n请带上饮用水，爱护自然。','对照资料单，补齐正文和换行');ctrl('#word-body','s','查看排版后按 Ctrl+S 保存');break;
    case 'sheet':for(let i=0;i<3;i++){fill(`[data-cell="B${i+2}"]`,(p.values||[3,4,2])[i],`点击 B${i+2}，填写对应数值`);key(`[data-cell="B${i+2}"]`,'Tab','按 Tab，切换到下一格',{to:`[data-cell="B${i+3}"]`});}fill('[data-cell="B5"]','=SUM(B2:B4)','在 B5 输入求和公式 =SUM(B2:B4)');key('[data-cell="B5"]','Enter','按 Enter，让表格计算合计');break;
    case 'search':ctrl('#search-document','h','点击文档，按 Ctrl+H 打开查找替换');fill('#find-text',p.find||'旧码头','在“查找”框填写旧词');fill('#replace-text',p.replace||'新码头','在“替换为”框填写新词');click('#replace-all','点击“全部替换”，观察文档变化');ctrl('#search-document','s','按 Ctrl+S 保存修订后的文档');break;
    case 'settings':check(`[name="setting-theme"][value="${p.theme||'暖色'}"]`,true,'选择题目要求的主题');choose('#setting-size',p.size||'大号','打开文字大小列表，选择要求的字号');check('#setting-autosave',true,'勾选“启用自动保存”');click('#apply-settings','点击“应用设置”');break;
    case 'mail':fill('#mail-to',p.to||'captain@town.test','在收件人框填写邮箱地址');fill('#mail-subject',p.subject||'今日探索报告','填写邮件主题');fill('#mail-body',p.body||'学习资料已整理好，分享前请检查来源。','补齐正文，写清需要分享的内容');check('#mail-attachment',true,'勾选本题要求的附件');click('#mail-send','核对收件人、正文和附件，点击发送');break;
    case 'keys':key('#keys-input','Home','点击便签，按 Home 到行首');add('insert','#keys-input','在行首补上「'+(p.prefix||'通知：')+'」',{value:p.prefix||'通知：'});key('#keys-input','End','按 End 到行末');add('insert','#keys-input','补上句末标点',{value:p.suffix||'。'});click('#keys-submit','对照完整目标，点击“提交便签”');break;
    case 'presentation':choose('#slide-layout','title-photo','打开版式列表，选择“标题与图片”');fill('#slide-title',p.title||'我的探索故事','点击幻灯片标题框，输入标题');add('drag','#slide-art','按住左侧插图，拖到幻灯片右侧图片区',{to:'#slide-drop',data:'quest-photo'});click('#slide-play','点击“预览放映”，查看标题与图片');break;
    case 'browser':case 'browser-tabs':case 'browser-bookmark':case 'browser-find':case 'browser-download':{
      fill('#browser-address',p.address||'town://it','点击地址栏，输入资料站网址');key('#browser-address','Enter','按 Enter 打开资料站');fill('#browser-query',p.query||'人工智能','在资料站搜索框输入关键词');add('submit','#browser-search','点击搜索按钮，比较标题、来源和日期');
      const ids=p.targetIds||['source'];
      if(kind==='browser-tabs'){
        for(const id of ids)click(`[data-browser-new="${id}"]`,'点击“在新标签页打开”，保留这份资料');
        for(const id of ids)add('tab','#browser-tabs','点击资料标签，阅读正文与来源',{title:p.pages?.find(page=>page.id===id)?.title});
      }else{
        click(`[data-browser-result="${ids[0]}"]`,'单击目标资料的标题，进入正文');
        if(kind==='browser-bookmark'){click('#browser-star','点击地址栏旁的星星，收藏当前页');fill('#bookmark-name',p.bookmarkName,'填写便于辨认的收藏名称');choose('#bookmark-folder',p.bookmarkFolder||'学习资料','选择收藏文件夹');add('submit','#browser-bookmark-form','点击“保存收藏”');click('#browser-home','点击主页按钮，离开当前资料');click('[data-saved-bookmark]','从书签栏重新打开刚保存的资料');}
        if(kind==='browser-find'){click('#browser-find-toggle','点击“页内查找”（Ctrl+F）');fill('#browser-find-input',p.find,'输入正文中需要查找的关键词');click('#browser-find-next','点击向下箭头，查看下一处匹配');}
        if(kind==='browser-download'){click('#browser-download-file','点击正文中的下载按钮');fill('#browser-save-name',p.downloadName,'在“文件名”框填写任务要求的名称');choose('#browser-save-folder',p.downloadFolder||'下载','选择保存位置');add('submit','#browser-save-form','点击“保存文件”，查看下载记录');click('[data-download-open]','点击“打开文件”，核对刚保存的内容');}
      }
      click('#browser-check','完成阅读与操作后，点击“检查学习记录”');break;
    }
    case 'paint':click('[data-paint-tool="rect"]','点击工具栏中的“矩形”');click('[data-paint-color="blue"]','点击蓝色色块');add('pointerDrag','#paint-canvas','从虚线框左上角按住左键，拖到右下角',{rect:{x:150,y:65,w:300,h:170},width:600,height:300});click('#paint-save','点击“保存图片”');break;
    case 'pdf':click('[data-pdf-page="2"]','点击左侧第二页缩略图');fill('#pdf-search',p.query||'验证码','在 PDF 搜索框输入关键词');click('#pdf-highlight','点击“高亮批注”，开启批注工具');click('#pdf-target','点击包含关键词的段落，留下高亮');break;
    case 'resize':add('moveWindow','#window-title','按住蓝色标题栏，向右拖动整个窗口');add('resizeWindow','#window-resizer','按住右下角三角标记，向右下方拖大窗口');break;
    case 'sheet-sort':choose('#data-sort-field',p.sortField||'value','选择整表排序的依据');choose('#data-sort-order',p.sortOrder||'desc','选择升序或降序');click('#data-sort','点击“应用排序”，观察整行一起移动');click('#data-save','点击保存，保留正确排序');break;
    case 'sheet-filter':click('#data-filter-toggle','点击“筛选状态”，打开筛选面板');check('#data-filter-all',false,'取消“全选”');add('filter','#data-filter-panel','只勾选「'+p.filterValue+'」',{value:p.filterValue});click('#data-filter-apply','点击确定，观察未选记录被隐藏');click('#data-save','核对保留的记录，点击保存');break;
    case 'sheet-chart':click('[data-data-cell="1,0"]','单击 A1，作为选区起点');click(`[data-data-cell="${p.rows.length+1},1"]`,'按住 Shift 单击最后一行 B 列，选中表头和全部数据',{shiftKey:true});click('[data-data-tab="insert"]','点击“插入”标签');choose('#data-chart-type',p.chartType||'column','选择本题要求的图表类型');click('#data-chart-insert','点击“插入图表”，观察真实数值图形');fill('#data-chart-title',p.chartTitle,'填写图表标题');click('#data-save','确认标题与图表后点击保存');break;
    case 'mail-reply':click('[data-mail-message="request"]','在收件箱中打开本题指定的来信');click('#reply-open','读清请求后，点击“回复”');fill('#reply-body','你好！'+p.requiredPhrases.join('，')+'。谢谢你的提醒！','用自己的话回应来信，保留收件人和原主题');click('#reply-attach','点击“添加附件”，展开文件列表');add('attachment','#reply-file-picker','只选中本题要求的附件「'+p.attachment+'」',{value:p.attachment});click('#reply-send','核对回复与附件，点击“发送回复”');break;
    case 'calendar':click('#calendar-new','点击“新建日程”，打开日程详情');for(const [field,value,label]of [['title',p.eventTitle,'填写活动标题'],['date',p.date,'选择题目要求的日期'],['start',p.start,'设置开始时间'],['end',p.end,'设置结束时间'],['place',p.place,'填写活动地点']])fill('#calendar-'+field,value,label);choose('#calendar-reminder',p.reminder||'10','选择提前提醒的时间');click('#calendar-save','点击“保存日程”，观察周视图中的安排');click('#calendar-check','核对安排没有冲突，点击“检查安排”');break;
    default:throw new Error('Missing demonstration: '+kind);
  }
  return a;
}
