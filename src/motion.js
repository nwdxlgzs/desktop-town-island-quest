export const walkSpeed=4.5,runSpeed=7.6;
export function createMotion(){return {jump:0,wave:0,autoRun:false,running:false};}
export function startJump(motion){if(motion.jump)return false;motion.jump=.68;return true;}
export function tickMotion(m,dt){for(const key of ['jump','wave'])m[key]=Math.max(0,m[key]-dt);}
export function visualJump(m){return m.jump?Math.sin((1-m.jump/.68)*Math.PI)*.85:0;}
