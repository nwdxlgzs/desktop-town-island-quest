export function randomSource(seed) {
  let value=seed>>>0;
  return ()=>{
    value+=0x6D2B79F5;
    let n=Math.imul(value^value>>>15,1|value);
    n^=n+Math.imul(n^n>>>7,61|n);
    return ((n^n>>>14)>>>0)/4294967296;
  };
}
