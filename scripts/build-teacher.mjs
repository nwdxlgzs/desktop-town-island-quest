import {build} from 'vite';
import {resolve} from 'node:path';
import {unlink} from 'node:fs/promises';
import {teacherPreviewPlugin} from './teacher-preview-plugin.mjs';
// Keep React/Ant Design completely outside the student's game bundle.
for(const entry of ['teacher.html'])await build({configFile:false,plugins:[teacherPreviewPlugin(),{name:'teacher-offline-inline',enforce:'post',generateBundle(_,bundle){
  const html=bundle[entry];let text=String(html.source);
  for(const [name,item]of Object.entries(bundle)){
    if(item.type==='chunk'){text=text.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/,()=>`<script type="module">${item.code.replace(/<\/script/gi,'<\\/script')}</script>`);delete bundle[name];}
    else if(name.endsWith('.css')){text=text.replace(/<link[^>]*href="[^"]+\.css"[^>]*>/,()=>`<style>${item.source}</style>`);delete bundle[name];}
  }
  html.source=text.replace(/<link[^>]*rel="modulepreload"[^>]*>/g,'');
}}],build:{emptyOutDir:false,target:'es2020',cssCodeSplit:false,assetsInlineLimit:100000000,chunkSizeWarningLimit:1800,rollupOptions:{input:resolve(entry),onwarn(warning,warn){if(warning.code==='MODULE_LEVEL_DIRECTIVE'&&warning.message.includes('use client'))return;warn(warning);},output:{inlineDynamicImports:true}}}});
await unlink(resolve('dist/teacher-preview.html')).catch(e=>{if(e.code!=='ENOENT')throw e;});
