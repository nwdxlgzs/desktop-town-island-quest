import * as THREE from 'three';
import { terrainTileSize,terrainCellAt } from './terrain.js';
import { onLand } from './shoreline.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Draw the seams in the existing terrain pass, not with a second coplanar
// mesh or thousands of edge objects. Coordinates stay local to each island,
// including when its root moves during a voyage.
function terrainMaterial(layout){
  const material=new THREE.MeshLambertMaterial({vertexColors:true}),sun={value:new THREE.Vector3(...(layout.level?.environment?.sun||[-12,28,16]))};
  material.userData.owned=true;material.userData.terrainLines='beveled';material.userData.terrainSun=sun;
  material.defines={TERRAIN_LINE_STYLE:1};
  material.onBeforeCompile=shader=>{
    shader.uniforms.terrainSun=sun;
    shader.uniforms.terrainOrigin={value:new THREE.Vector2(layout.width/2,layout.depth/2)};
    shader.vertexShader=`attribute vec2 terrainRelief;
    #if TERRAIN_LINE_STYLE > 0
      attribute float terrainFace;uniform vec2 terrainOrigin;varying vec3 vTerrainGrid;varying vec3 vTerrainPigment;
      uniform vec3 terrainSun;varying vec2 vTerrainSlopeLight;
    #endif\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      #if TERRAIN_LINE_STYLE == 0
        if(objectNormal.y > .5) objectNormal=vec3(0.0,1.0,0.0);
      #endif`);
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`#include <color_vertex>
      #if TERRAIN_LINE_STYLE == 0 && defined(USE_COLOR)
        vColor.rgb /= terrainRelief.y;
      #endif`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #if TERRAIN_LINE_STYLE == 0
        transformed.y += terrainRelief.x;
      #endif
      #if TERRAIN_LINE_STYLE > 0
        vec2 terrainTop = (position.xz + terrainOrigin) / ${terrainTileSize.toFixed(6)};
        vec2 terrainSide = vec2(mix(terrainTop.x, terrainTop.y, abs(normal.x)), (position.y + 1.1) / .75);
        vTerrainGrid = vec3(mix(terrainSide, terrainTop, abs(normal.y)), terrainFace);
        // Keep the pigment before bright lighting/tone mapping washes it out.
        // A seam in grass, sand or snow inherits that face's own color.
        vTerrainPigment = color.rgb / max(max(color.r, color.g), max(color.b, .001));
        vec3 terrainLight = normalize(terrainSun);
        vTerrainSlopeLight = mix(vec2(mix(terrainLight.x, terrainLight.z, abs(normal.x)), terrainLight.y), terrainLight.xz, abs(normal.y));
      #endif
    `);
    shader.fragmentShader=`#if TERRAIN_LINE_STYLE > 0
      varying vec3 vTerrainGrid;varying vec3 vTerrainPigment;
      varying vec2 vTerrainSlopeLight;
      // Integrate a narrow strip over the pixel footprint. Unlike widening a
      // smoothstep to one pixel, this preserves the weight of subpixel seams.
      vec2 terrainStrip(vec2 distance, vec2 pixel, float low, float high) {
        return clamp((min(distance + pixel * .5, vec2(high)) - max(distance - pixel * .5, vec2(low))) / pixel, 0.0, 1.0);
      }
    #endif\n`+shader.fragmentShader;
    // Apply after display conversion, before fog. This also works when the
    // cheap voxel-lighting path calculates display colors at the vertices.
    shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`
      #if TERRAIN_LINE_STYLE > 0
        vec2 terrainPixel = max(fwidth(vTerrainGrid.xy), vec2(.00001));
        vec2 terrainCell = fract(vTerrainGrid.xy);
        vec2 terrainDistance = terrainCell - step(vec2(.5), terrainCell);
        vec2 terrainSeam = terrainStrip(terrainDistance, terrainPixel, -.008, .008);
        float terrainLine = max(terrainSeam.x, terrainSeam.y);
        float terrainFade = 1.0 - smoothstep(.08, .22, max(terrainPixel.x, terrainPixel.y));
        // Flat tile centers, a hairline recess and two very narrow bevels.
        // Match the face's pigment instead of laying gray grout over the land.
        vec2 terrainLeft = terrainStrip(terrainDistance, terrainPixel, -.045, -.008);
        vec2 terrainRight = terrainStrip(terrainDistance, terrainPixel, .008, .045);
        float terrainBevel = dot(terrainLeft - terrainRight, vTerrainSlopeLight) * .09;
        float terrainTone = (fract(dot(floor(vTerrainGrid.xy), vec2(.754877666, .569840296))) - .5) * .035;
        vec3 terrainInk = gl_FragColor.rgb * mix(vec3(1.0), vTerrainPigment, .08) * .94;
        gl_FragColor.rgb = mix(gl_FragColor.rgb * (1.0 + vTerrainGrid.z * terrainFade * (terrainTone + terrainBevel)), terrainInk, vTerrainGrid.z * terrainFade * terrainLine);
      #endif
      #include <fog_fragment>
    `);
  };
  material.customProgramCacheKey=()=> 'terrain-soft-relief-v6';
  return material;
}

// Surface quads only: no hidden voxel interiors and no overlapping tile borders.
export function buildTerrainMesh(layout,palette){
  const size=terrainTileSize,half=size/2,cells=new Map(),positions=[],colors=[],faces=[],relief=[],tint=new THREE.Color(),bottom=-1.1;
  const cols=Math.ceil(layout.width/size),rows=Math.ceil(layout.depth/size),key=(x,z)=>z*cols+x;
  for(let ix=0;ix<cols;ix++)for(let iz=0;iz<rows;iz++){
    const x=-layout.width/2+size*(ix+.5),z=-layout.depth/2+size*(iz+.5);
    const cell=terrainCellAt(layout,x,z);if(!cell)continue;
    const {wet}=cell,edge=!onLand(layout,x,z,1.5);
    cells.set(key(ix,iz),{...cell,color:wet?palette.water:edge?palette.sand:Math.sin(x*.16)+Math.cos(z*.22)>.6?palette.groundAlt:palette.ground});
  }
  let rimHeight=NaN,lowerHeight=NaN,lowerRelief=0,tone=1;
  function quad(a,b,c,d,color,face){tint.set(color);for(const v of [a,b,c,a,c,d]){positions.push(...v);colors.push(tint.r,tint.g,tint.b);faces.push(face);relief.push(v[1]===rimHeight?.035:v[1]===lowerHeight?lowerRelief:0,tone);}}
  for(const cell of cells.values()){
    const {x,z,ix,iz,top,color,elevation,wet}=cell,x0=x-half,x1=x+half,z0=z-half,z1=z+half;
    // Small real sloping shoulders recreate the demo's separate lawn blocks.
    // The shared outer rim stays closed, so ray picks never fall through seams.
    const rim=wet?top:top-.035,inset=wet?0:.028;
    rimHeight=wet?NaN:rim;lowerHeight=NaN;lowerRelief=0;tone=wet?1:(ix+iz)%3===0?.96:1.015;
    const tileColor=new THREE.Color(color).multiplyScalar(tone);
    const pigment=tileColor;
    quad([x0+inset,top,z0+inset],[x0+inset,top,z1-inset],[x1-inset,top,z1-inset],[x1-inset,top,z0+inset],pigment,wet?0:1);
    if(!wet){
      quad([x0,rim,z0],[x0,rim,z1],[x0+inset,top,z1-inset],[x0+inset,top,z0+inset],pigment,0);
      quad([x1,rim,z1],[x1,rim,z0],[x1-inset,top,z0+inset],[x1-inset,top,z1-inset],pigment,0);
      quad([x1,rim,z0],[x0,rim,z0],[x0+inset,top,z0+inset],[x1-inset,top,z0+inset],pigment,0);
      quad([x0,rim,z1],[x1,rim,z1],[x1-inset,top,z1-inset],[x0+inset,top,z1-inset],pigment,0);
    }
    for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const neighbour=ix+dx<0||ix+dx>=cols||iz+dz<0||iz+dz>=rows?null:cells.get(key(ix+dx,iz+dz));
      const low=neighbour?(neighbour.wet?neighbour.top:neighbour.top-.035):bottom;if(low>=rim-.001)continue;
      lowerHeight=low;lowerRelief=neighbour&&!neighbour.wet?.035:0;tone=1;
      for(let y=low;y<rim-.001;){
        const band=Math.floor((y-bottom+.0001)/.75),high=Math.min(rim,bottom+(band+1)*.75),shade=y>=elevation-.2?palette.sand:palette.rock[((band%4)+4)%4];
        if(dx===-1)quad([x0,y,z1],[x0,high,z1],[x0,high,z0],[x0,y,z0],shade,wet?0:.7);
        if(dx===1)quad([x1,y,z0],[x1,high,z0],[x1,high,z1],[x1,y,z1],shade,wet?0:.7);
        if(dz===-1)quad([x0,y,z0],[x0,high,z0],[x1,high,z0],[x1,y,z0],shade,wet?0:.7);
        if(dz===1)quad([x1,y,z1],[x1,high,z1],[x0,high,z1],[x0,y,z1],shade,wet?0:.7);
        y=high;
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('terrainFace',new THREE.Float32BufferAttribute(faces,1));geometry.setAttribute('terrainRelief',new THREE.Float32BufferAttribute(relief,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const indexed=mergeVertices(geometry);geometry.dispose();
  const material=terrainMaterial(layout);
  const mesh=new THREE.Mesh(indexed,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.terrain=true;
  return mesh;
}
