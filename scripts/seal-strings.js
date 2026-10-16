import { createCipheriv,randomBytes } from 'node:crypto';

// A new key is used for every table, so the 96-bit nonce is never reused with
// the same key. The authentication tag is appended in RFC 8439 format.
export function sealTextTable(strings){
  const key=randomBytes(32),nonce=randomBytes(12);
  const cipher=createCipheriv('chacha20-poly1305',key,nonce,{authTagLength:16});
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(strings),'utf8'),cipher.final(),cipher.getAuthTag()]);
  return [key,nonce,ciphertext].map(value=>value.toString('base64'));
}
