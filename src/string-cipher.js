import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { strFromU8 } from 'fflate';

const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));

// Called once at module initialization, never by the animation loop or a guard.
// The key must travel with an offline program; encryption hides static literals,
// while the separate session checks decide whether an operation is allowed.
export function openTextTable([key,nonce,sealed]){
  const secret=bytes(key),iv=bytes(nonce),ciphertext=bytes(sealed);
  let plain;
  try{
    plain=chacha20poly1305(secret,iv).decrypt(ciphertext);
    const result=JSON.parse(strFromU8(plain));
    if(!Array.isArray(result)||result.some(value=>typeof value!=='string'))throw Error();
    return Object.freeze(result);
  }finally{
    secret.fill(0);plain?.fill(0);
  }
}
