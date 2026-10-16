// A small offline browser model. Every tab owns its history; addresses never fetch a network resource.
export const queryText=value=>String(value).trim().toLocaleLowerCase().replace(/\s+/g,' ');
const addressKey=value=>String(value).trim().replace(/\/$/,'').toLocaleLowerCase();
export function browserPages(p){
  return p.pages||[
    {id:'source',address:(p.address||'town://it')+'/guide',title:p.resultTitle||'人工智能回答查证指南',source:p.source||'校园信息科技资料站 · 教研组',date:'2026-09-01',summary:p.summary||'重要信息需要核实。',body:p.article||p.summary||'先查找原始来源，再交叉核实重要信息。',keywords:[p.query||'人工智能'],download:p.download},
    {id:'discussion',address:'town://forum/discussion',title:'同学的讨论笔记',source:'个人交流区 · 观点未经核实',date:'2026-09-02',summary:'这是一份个人讨论记录，不能代替原始资料。',body:'分享自己的经验时，也应该说明来源和局限。',keywords:[p.query||'人工智能']},
    {id:'archive',address:'town://archive/old',title:'旧版活动通知',source:'校园活动归档',date:'2022-05-10',summary:'这份历史通知已经过期。',body:'阅读资料时需要关注发布时间，过期信息不一定适用。',keywords:[p.query||'人工智能']}
  ];
}
export function createPracticeBrowser(p={}){
  const pages=browserPages(p),site=p.address||'town://it',tabs=[];let serial=0,active=0;
  const home=()=>({type:'home',address:'town://start',title:'新标签页'});
  const view=()=>tabs.find(t=>t.id===active).history[tabs.find(t=>t.id===active).index];
  function newTab(next=home(),foreground=true){const tab={id:serial++,history:[next],index:0};tabs.push(tab);if(foreground||tabs.length===1)active=tab.id;return tab.id;}
  function navigate(next){const tab=tabs.find(t=>t.id===active);tab.history.splice(tab.index+1);tab.history.push(next);tab.index++;return next;}
  function search(query){query=String(query).trim();if(!query)return null;return navigate({type:'results',address:'town://search?q='+encodeURIComponent(query),title:query+' - 搜索',query});}
  function results(query){const q=queryText(query),tokens=q.split(' ').filter(Boolean);return pages.filter(page=>tokens.every(token=>queryText([page.title,page.summary,page.body,...page.keywords||[]].join(' ')).includes(token)));}
  function open(id,inNewTab=false){const page=pages.find(page=>page.id===id);if(!page)return null;const next={type:'article',address:page.address,title:page.title,record:id};return inNewTab?newTab(next,false):navigate(next);}
  function go(value){value=String(value).trim();if(!value)return null;if(addressKey(value)==='town://start')return navigate(home());if(addressKey(value)===addressKey(site))return navigate({type:'site',address:site,title:p.siteName||'校园资料站'});const page=pages.find(page=>addressKey(page.address)===addressKey(value));if(page)return open(page.id);if(!/^[a-z][\w+.-]*:\/\//i.test(value)&&!/^\w[\w.-]+\.[a-z]{2,}(\/|$)/i.test(value))return search(value);return navigate({type:'unknown',address:value,title:'地址未收录'});}
  function travel(delta){const tab=tabs.find(t=>t.id===active),next=tab.index+delta;if(next<0||next>=tab.history.length)return false;tab.index=next;return true;}
  function activate(id){if(tabs.some(tab=>tab.id===id)){active=id;return true;}return false;}
  function close(id){const index=tabs.findIndex(tab=>tab.id===id);if(index<0)return;if(tabs.length===1){tabs[0].history=[home()];tabs[0].index=0;return;}tabs.splice(index,1);if(active===id)active=tabs[Math.min(index,tabs.length-1)].id;}
  newTab();return {pages,tabs,view,newTab,navigate,search,results,open,go,travel,activate,close,get active(){return active;},get current(){return tabs.find(tab=>tab.id===active);}};
}
