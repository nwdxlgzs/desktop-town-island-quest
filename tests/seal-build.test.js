import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { gunzipSync as portableGunzip,strFromU8 } from 'fflate';
import { sealBuild } from '../scripts/seal-build.js';
import { digest,digest64 } from '../src/digest.js';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { developmentTexts } from '../src/check-strings.js';

test('portable SHA-256 matches independent vectors and multiblock UTF-8 inputs',()=>{
  for(const text of ['', 'abc', '\u4e2d\u6587\u7f72\u540d\u4e0e\ud83d\ude00', 'abc123'.repeat(150)]){
    assert.deepEqual(Buffer.from(digest(text)),createHash('sha256').update(text).digest());
    assert.equal(digest64(text),createHash('sha256').update(text).digest('base64'));
  }
});
test('compression stays portable delivery, with encrypted loader strings and no native API gate',async()=>{
  const code="globalThis.testGame='course';const binding='__ISLAND_RELEASE_BINDING__';globalThis.binding=binding;";
  const html=await sealBuild(`<html><head><meta charset="UTF-8" /><style>body{color:green}</style><script type="module">${code}</script></head><body><div id="app"></div></body></html>`);
  const raw=Buffer.from(html.match(/id="game-program">([^<]+)</)[1],'base64');
  const node=JSON.parse(gunzipSync(raw)),portable=JSON.parse(strFromU8(portableGunzip(raw)));assert.deepEqual(portable,node);
  assert.deepEqual(node.styles,['body{color:green}']);assert.match(node.program,/course/);assert.ok(!node.program.includes('__ISLAND_RELEASE_BINDING__'));
  const bootstrap=html.match(/id="game-bootstrap">([\s\S]*?)<\/script>/)[1];
  assert.ok(!/crypto|DecompressionStream|AES-GCM|function halt/.test(bootstrap));
  assert.ok(html.includes(createHash('sha256').update(node.program).digest('base64')));
  assert.ok(html.includes(createHash('sha256').update(bootstrap).digest('base64')));
});

test('actual executable decrypts its string table once; literals and Unicode escapes are absent',async()=>{
  const code=(await build({stdin:{contents:"import {failedEvent,loaderMessage,creditText,policySelector} from './src/check-strings.js';globalThis.values=[failedEvent,loaderMessage,creditText,policySelector];globalThis.readValues=()=>[failedEvent,loaderMessage,creditText,policySelector];",resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,write:false,minify:true,format:'esm',target:'es2020',define:{'import.meta.env.PROD':'true'}})).outputFiles[0].text;
  const html=await sealBuild(`<html><head><meta charset="UTF-8" /><style>body{color:green}</style><script type="module">${code}</script></head><body><div id="app"></div></body></html>`);
  const program=JSON.parse(gunzipSync(Buffer.from(html.match(/id="game-program">([^<]+)</)[1],'base64'))).program;
  const bootstrap=html.match(/id="game-bootstrap">([\s\S]*?)<\/script>/)[1];
  for(const executable of [program,bootstrap]){
    const decoded=executable.replace(/\\u([\da-f]{4})|\\x([\da-f]{2})/gi,(_,u,x)=>String.fromCharCode(parseInt(u||x,16)));
    for(const text of developmentTexts.filter(text=>text.length>12))assert.ok(!decoded.includes(text),'plaintext/escaped check string: '+text);
    assert.ok(!executable.includes('__ISLAND_CHECK_STRINGS__'));
  }
  let decodes=0;const context={atob(value){decodes++;return atob(value);}};
  runInNewContext(program,context);
  const expected=[developmentTexts[1],developmentTexts[19],developmentTexts[28],developmentTexts[9]];
  assert.deepEqual(Array.from(context.values),expected);
  for(let i=0;i<100;i++)assert.deepEqual(Array.from(context.readValues()),expected);
  assert.equal(decodes,3,'key, nonce and ciphertext decode only at initialization');
});
