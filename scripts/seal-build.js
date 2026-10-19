import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build,transform } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { sealTextTable } from './seal-strings.js';
import { developmentTexts } from '../src/check-strings.js';

const sha=text=>createHash('sha256').update(text,'utf8').digest('base64');
const loaderPath=fileURLToPath(new URL('./offline-loader.js',import.meta.url));
let loaderTemplate;
const encryptStrings=source=>source.replace(/['"]__ISLAND_CHECK_STRINGS__['"]/g,()=>JSON.stringify(sealTextTable(developmentTexts)));
export async function sealBuild(html){
  const source=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  const styles=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]);
  if(!source||!styles.length)throw new Error('Cannot pack incomplete game build');
  loaderTemplate??=(await build({entryPoints:[loaderPath],bundle:true,minify:true,format:'esm',target:'es2020',write:false,legalComments:'none',define:{'import.meta.env.PROD':'true'}})).outputFiles[0].text;
  if(!loaderTemplate.includes('__ISLAND_CHECK_STRINGS__'))throw new Error('Missing encrypted string table marker');
  const loader=encryptStrings(loaderTemplate);
  const policy=`default-src 'none'; script-src 'sha256-${sha(loader)}' 'sha256-__PROGRAM__'; style-src ${styles.map(s=>`'sha256-${sha(s)}'`).join(' ')}; style-src-attr 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'`;
  // Replace only the production marker, then mangle the scoped guard members
  // in one pass. Native browser APIs and JSON curriculum keys are unaffected.
  const binding=JSON.stringify([sha(loader),policy]);
  const candidate=encryptStrings(source[1]).replace(/['"]__ISLAND_RELEASE_BINDING__['"]/g,()=>binding);
  const program=(await transform(candidate,{minify:true,target:'es2020',legalComments:'none',mangleProps:/^(onViolation|watchGuide|releaseGuide|markup|startCreditGuard|disposeCreditGuard)$/})).code.replace(/<\/script/gi,'<\\/script');
  const packed=gzipSync(Buffer.from(JSON.stringify({program,styles})),{level:9}).toString('base64');
  let result=html.replace(source[0],()=>`<script type="application/x-island-packed" id="game-program">${packed}</script><script type="module" id="game-bootstrap">${loader}</script>`).replace(/[ \t]*<style>[\s\S]*?<\/style>/g,'');
  result=result.replace(/<meta charset="UTF-8"\s*\/>/,()=>`<meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="${policy.replace('__PROGRAM__',sha(program))}">`);
  if(!result.includes('http-equiv="Content-Security-Policy"'))throw new Error('Missing release policy');
  return result;
}
