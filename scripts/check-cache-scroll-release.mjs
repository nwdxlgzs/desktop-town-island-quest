import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
import assert from 'node:assert/strict';

const primary=await readFile('dist/index.html'),copy=await readFile('dist/电脑小镇·岛屿探索.html');assert.ok(primary.equals(copy),'offline copies must be identical');
const html=primary.toString('utf8'),packed=html.match(/id="game-program">([^<]+)</)?.[1],bootstrap=html.match(/id="game-bootstrap">([\s\S]*?)<\/script>/)?.[1];assert.ok(packed&&bootstrap);
const {program,styles}=JSON.parse(gunzipSync(Buffer.from(packed.trim(),'base64')).toString('utf8'));
await transform(bootstrap,{loader:'js',target:'es2020'});await transform(program,{loader:'js',target:'es2020'});
const hashes=[bootstrap,program,...styles].map(text=>createHash('sha256').update(text).digest('base64'));
for(const hash of hashes)assert.ok(html.includes(`'sha256-${hash}'`),'all executable/style blocks need their exact CSP hash');
for(const key of ['scrollPixels','scrolls','lastUpdatePixels','maxUpdatePixels','shiftX','shiftY','voxelDisplayFlat','batchPoseRows'])assert.ok(program.includes(key),`missing release path: ${key}`);
assert.match(program,/version:8,preset:"auto",resolution:"1\.2"/);
const decoded=program.replace(/\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi,(_,unicode,byte)=>String.fromCharCode(parseInt(unicode||byte,16)));
assert.ok(/"quality-preset","运行模式",\[\["auto","自动适配"\],\["low","流畅低配 · 暂停环境活动"\]\]/.test(decoded),'release must retain exactly the two requested modes');
assert.doesNotMatch(program,/__quest|__worldCpuCounts|drawSubmission|residentsAndAnimals|gpuSupported|worstFrames|dominantPhase|staticSceneSubmit|staticIndexSelection/);
assert.doesNotMatch(decoded,/采样 120 帧（开发）|性能采样报告|固定桌面绘制尺寸/,'development capture UI must not enter release');
assert.ok(program.includes('Shader warmup deferred'),'hidden live material warmup must enter release');
assert.ok(decoded.includes(' · 峰值 '),'FPS display must retain the submission peak');
const result={bytes:primary.length,sha256:createHash('sha256').update(primary).digest('hex'),copiesIdentical:true,syntax:true,cspHashes:hashes.length,default120:true,twoModes:true,rollingCache:true,priorDisplayAndPosePaths:true,fpsPeak:true,developmentInstrumentationAbsent:true};
if(process.argv[2]!=='--stdout'){
  const output=process.argv[2]||'test-results/release-cache-scroll-check.json';
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
}
console.log(JSON.stringify(result,null,2));
