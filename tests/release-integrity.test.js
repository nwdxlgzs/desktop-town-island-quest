import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {gzipSync,gunzipSync} from 'node:zlib';
import {sealBuild} from '../scripts/seal-build.js';
import {digest64} from '../src/digest.js';

// No game, renderer, browser, filesystem page or network. Execute the packed
// loader against a tiny DOM fixture to exercise its actual event boundary.
function fixture(html,{extra=false}={}){
  const callbacks=new Map(),observers=[];
  class Node{
    constructor(tag,text='',attrs={}){this.tagName=tag.toUpperCase();this.textContent=text;this.attrs=new Map(Object.entries(attrs));this.parentNode=null;this.children=[];this.dataset={};}
    get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
    get isConnected(){return this===doc.documentElement||!!this.parentNode?.isConnected;}
    get firstElementChild(){return this.children[0]||null;}
    get previousElementSibling(){const peers=this.parentNode?.children||[];return peers[peers.indexOf(this)-1]||null;}
    get id(){return this.attrs.get('id')||'';}set id(value){this.attrs.set('id',value);}
    get type(){return this.attrs.get('type')||'';}set type(value){this.attrs.set('type',value);}
    get content(){return this.attrs.get('content')||'';}set content(value){this.attrs.set('content',value);}
    getAttribute(name){return this.attrs.get(name)??null;}
    hasAttribute(name){return this.attrs.has(name);}
    setAttribute(name,value){this.attrs.set(name,String(value));}
    append(node){node.parentNode=this;this.children.push(node);}
  }
  const doc={createElement:tag=>new Node(tag),dispatchEvent(event){for(const handler of callbacks.get(event.type)||[])handler(event);}};
  doc.documentElement=new Node('html');doc.head=new Node('head');doc.body=new Node('body');doc.documentElement.append(doc.head);doc.documentElement.append(doc.body);
  const charset=new Node('meta','',{charset:'UTF-8'}),policy=new Node('meta','',{'http-equiv':'Content-Security-Policy',content:html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1]}),app=new Node('main','',{id:'app'}),loader=new Node('script',html.match(/id="game-bootstrap">([\s\S]*?)<\/script>/)[1],{id:'game-bootstrap',type:'module'}),packed=new Node('script',html.match(/id="game-program">([^<]+)</)[1],{id:'game-program',type:'application/x-island-packed'});
  doc.head.append(charset);doc.head.append(policy);doc.body.append(app);doc.body.append(packed);doc.body.append(loader);
  const all=()=>{const out=[];function visit(node){out.push(node);node.children.forEach(visit);}visit(doc.documentElement);return out;};
  doc.querySelectorAll=selector=>selector.startsWith('meta[')?all().filter(node=>node===policy):selector==='style,link[rel="stylesheet"]'?all().filter(node=>node.tagName==='STYLE'):all().filter(node=>selector.startsWith('#')&&node.id===selector.slice(1));
  doc.querySelector=selector=>doc.querySelectorAll(selector)[0]||null;
  Object.defineProperty(doc,'scripts',{get:()=>all().filter(node=>node.tagName==='SCRIPT')});
  if(extra){doc.head.append(new Node('style','/* blocked preview stylesheet */'));doc.body.append(new Node('script','/* blocked preview helper */',{id:'preview-helper'}));}
  const context=vm.createContext({document:doc,window:{addEventListener(type,handler){if(!callbacks.has(type))callbacks.set(type,[]);callbacks.get(type).push(handler);}},MutationObserver:class{constructor(callback){this.callback=callback;this.connected=false;observers.push(this);}observe(){this.connected=true;}disconnect(){this.connected=false;}},TextEncoder,TextDecoder,btoa,atob,Event});
  function run(){vm.runInContext(loader.textContent,context);}
  function policyEvent(){doc.dispatchEvent(new Event('securitypolicyviolation'));}
  function mutations(){for(const observer of observers)if(observer.connected)observer.callback([]);}
  let failures=0;callbacks.set('island-integrity-failed',[()=>failures++]);
  return {doc,loader,packed,policy,app,run,policyEvent,mutations,get failures(){return failures;},get styles(){return all().filter(node=>node.tagName==='STYLE');},get entry(){return doc.querySelector('#game-entry');}};
}
const fixtureSource='<!doctype html><html><head><meta charset="UTF-8" /><style>body{color:#345}</style></head><body><main id="app"></main><script type="module">globalThis.fixtureStarted=true;</script></body></html>';
let html;
test.before(async()=>{html=await sealBuild(fixtureSource);});

test('blocked preview resources and CSP reports do not stop an intact game delivery',()=>{
  const f=fixture(html,{extra:true});f.run();assert.ok(f.entry,'loader still mounts the authorized application');assert.equal(f.failures,0);assert.equal(f.app.dataset.gameStopped,undefined);
  f.policyEvent();f.policyEvent();f.mutations();assert.equal(f.failures,0);assert.equal(f.doc.documentElement.dataset.integrityFailed,undefined);
});

test('changing or detaching delivered game nodes still invalidates the session once',()=>{
  for(const target of ['entry','styles','packed','loader','policy','entry-attributes','detached-style']){
    const f=fixture(html);f.run();assert.ok(f.entry);
    if(target==='styles')f.styles[0].textContent+='/* changed */';
    else if(target==='detached-style')f.styles[0].parentNode=null;
    else if(target==='entry-attributes')f.entry.type='text/plain';
    else if(target==='policy')f.policy.content+="; connect-src *";
    else f[target].textContent+='changed';
    f.mutations();assert.equal(f.failures,1,target);assert.equal(f.doc.documentElement.dataset.integrityFailed,'true',target);f.policyEvent();assert.equal(f.failures,1,target+' stays failed');
  }
});

test('an edited packed program or stylesheet fails before the application is mounted',()=>{
  for(const target of ['program','styles']){
    const f=fixture(html),payload=JSON.parse(gunzipSync(Buffer.from(f.packed.textContent,'base64')));
    if(target==='program')payload.program='globalThis.fixtureStarted=false;';else payload.styles=['body{display:none}'];
    f.packed.textContent=gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64');f.run();assert.equal(f.entry,null);assert.equal(f.app.dataset.gameStopped,'true',target);assert.equal(f.doc.documentElement.dataset.integrityFailed,'true');
  }
});

test('binding policy and bootstrap identity are still checked before unpacking',()=>{
  const f=fixture(html);f.policy.content=f.policy.content.replace(digest64(f.loader.textContent),'different');f.run();assert.equal(f.entry,null);assert.equal(f.app.dataset.gameStopped,'true');
});
