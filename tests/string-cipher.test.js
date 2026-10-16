import test from 'node:test';
import assert from 'node:assert/strict';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { sealTextTable } from '../scripts/seal-strings.js';
import { openTextTable } from '../src/string-cipher.js';

test('portable ChaCha20-Poly1305 agrees with RFC 8439 section 2.8.2',()=>{
  const bytes=hex=>Uint8Array.from(Buffer.from(hex.replace(/\s/g,''),'hex'));
  const key=bytes('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
  const nonce=bytes('070000004041424344454647'),aad=bytes('50515253c0c1c2c3c4c5c6c7');
  const ciphertext=bytes(`d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d63dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b3692ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc3ff4def08e4b7a9de576d26586cec64b6116 1ae10b594f09e26a7e902ecbd0600691`);
  const plain="Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
  assert.equal(Buffer.from(chacha20poly1305(key,nonce,aad).decrypt(ciphertext)).toString(),plain);
});

test('Node encryption interoperates with offline JS for Chinese, emoji, quotes and multiblock strings',()=>{
  const strings=['', '文件完整性检查未通过，游戏已关闭。', '中英文😀！', '"quotes" \\ slash\nnewline', '任务'.repeat(100)];
  const sealed=sealTextTable(strings),opened=openTextTable(sealed);
  assert.deepEqual(opened,strings);assert.equal(Object.isFrozen(opened),true);
  assert.equal(Buffer.from(sealed[0],'base64').length,32);assert.equal(Buffer.from(sealed[1],'base64').length,12);
  assert.equal(Buffer.from(sealed[2],'base64').length,Buffer.byteLength(JSON.stringify(strings))+16);
  const another=sealTextTable(strings);
  assert.notEqual(sealed[0],another[0]);assert.notEqual(sealed[1],another[1]);assert.notEqual(sealed[2],another[2]);
  assert.deepEqual(openTextTable(another),strings);
});

test('altered key, nonce, ciphertext or authentication tag is rejected',()=>{
  const sealed=sealTextTable(['完整性检查']);
  for(const [part,offset] of [[0,0],[1,0],[2,0],[2,-1]]){
    const altered=[...sealed],data=Buffer.from(altered[part],'base64');
    data[offset===-1?data.length-1:offset]^=1;altered[part]=data.toString('base64');
    assert.throws(()=>openTextTable(altered));
  }
  assert.throws(()=>openTextTable([sealed[0],sealed[1],'']));
});
