// The capture is a toroidal image: logical pixels translate through a fixed
// color/depth attachment. Only the newly exposed, non-overlapping strips change.
export function exposedCacheRects(width,height,dx,dy){
  const rects=[];
  if(dx)rects.push({x:dx>0?width-dx:0,y:0,right:dx>0?width:-dx,top:height});
  if(dy)rects.push({x:Math.max(0,-dx),y:dy>0?height-dy:0,right:width-Math.max(0,dx),top:dy>0?height:-dy});
  return rects;
}

// Split at physical texture seams. shiftX/Y move the camera projection into
// the corresponding physical rectangle; geometry and depth never get rescaled.
export function wrapCacheRect(rect,width,height,origin){
  const parts=[];
  for(let y=rect.y;y<rect.top;){
    const py=((y+origin.y)%height+height)%height,h=Math.min(rect.top-y,height-py);
    for(let x=rect.x;x<rect.right;){
      const px=((x+origin.x)%width+width)%width,w=Math.min(rect.right-x,width-px);
      parts.push({x:px,y:py,right:px+w,top:py+h,shiftX:px-x,shiftY:py-y});x+=w;
    }
    y+=h;
  }
  return parts;
}
