import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';

const [beforePath,afterPath,output]=process.argv.slice(2);
if(!beforePath||!afterPath){
  console.error('用法：node scripts/compare-webgl-audits.mjs <优化前报告.json> <优化后报告.json> [输出.json]。历史报告不随项目发布，请先重新采样。');
  process.exit(1);
}
const before=JSON.parse(await readFile(beforePath,'utf8'));
const after=JSON.parse(await readFile(afterPath,'utf8'));
for(const field of ['island','map','buffer','position','quality'])assert.deepEqual(before.before[field],after.before[field],`same initial ${field}`);
assert.deepEqual(before.after.position,after.after.position,'same final position');
for(const run of [before,after]){
  assert.equal(run.frames,120);assert.equal(run.reason,'complete');
  assert.deepEqual(run.before.buffer,run.after.buffer,'no resolution change during capture');
  assert.equal(run.after.outline,true);assert.ok(run.after.faded>0,'route must trigger occlusion');
}
const summarize=run=>({started:run.started,frames:run.frames,movingFrames:run.records.filter(r=>r.moving).length,cpu:run.cpu,gpu:run.gpu,presentation:run.presentation,renderedFps:1000/run.presentation.meanMs,shaderProgramsLinked:run.records.reduce((n,r)=>n+(r.work.shaderPrograms||0),0),fullCaptures:run.after.staticCache.captures-run.before.staticCache.captures,cacheScrolls:run.after.staticCache.scrolls-run.before.staticCache.scrolls,shadowBakes:run.after.shadowBakes-run.before.shadowBakes,overBudgetFrames:run.overBudgetFrames,stallFrames:run.stallFrames,slowestCPUFrame:[...run.records].sort((a,b)=>b.cpuMs-a.cpuMs)[0]});
const comparison={island:before.before.island,map:before.before.map,buffer:before.before.buffer,pixelRatio:before.before.quality.pixelRatio,qualityMatched:true,startAndEndMatched:true,before:summarize(before),after:summarize(after),limitations:['Results describe only the device and short route used for these captures; they are not a low-end-machine or all-island acceptance result.','Matching GL buffers does not guarantee identical browser compositor surface sizes.']};
assert.equal(comparison.after.shaderProgramsLinked,0);
assert.equal(comparison.after.fullCaptures,0);assert.equal(comparison.after.shadowBakes,0);
if(output){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(comparison,null,2)+'\n');}
console.log(JSON.stringify(comparison,null,2));
