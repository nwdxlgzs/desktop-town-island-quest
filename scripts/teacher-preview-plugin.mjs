import {build} from 'vite';
import {resolve} from 'node:path';

const moduleId='virtual:teacher-preview',resolvedId='\0'+moduleId;
const documentFor=(head,script)=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}<title>原题试做</title></head><body><main id="teacher-preview"><p id="preview-instruction"></p><div id="preview-exercise" class="exercise"></div><p id="preview-feedback" role="status"></p></main>${script}</body></html>`;

// Isolate the original exercise styles inside srcdoc while shipping one file.
export function teacherPreviewPlugin(){
  let production=false;
  return {name:'embedded-teacher-preview',configResolved(config){production=config.command==='build';},resolveId(id){if(id===moduleId)return resolvedId;},async load(id){
    if(id!==resolvedId)return;
    let html;
    if(production){
      const result=await build({configFile:false,logLevel:'warn',build:{write:false,target:'es2020',cssCodeSplit:false,assetsInlineLimit:100000000,lib:{entry:resolve('src/teacher/preview.js'),formats:['es']},rollupOptions:{output:{inlineDynamicImports:true}}}});
      const outputs=(Array.isArray(result)?result:[result]).flatMap(r=>r.output),js=outputs.filter(o=>o.type==='chunk').map(o=>o.code).join('\n'),css=outputs.filter(o=>o.type==='asset'&&o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
      html=documentFor(`<style>${css}</style>`,`<script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script>`);
    }else html=documentFor('',`<script type="module" src="/src/teacher/preview.js"></script>`);
    return `export default ${JSON.stringify(html)};`;
  }};
}
