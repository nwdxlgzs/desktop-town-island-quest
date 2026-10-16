const modes={off:0,beveled:1};
// Both former enabled styles use the reference's fine beveled seams. Preserve
// an explicit line-free preference when loading an existing save.
export const normalizeTerrainLines=value=>value==='off'?'off':'beveled';

// Only a changed style recompiles the terrain material. Keep the sun vector
// by reference so bevel shading follows the existing time-of-day lighting.
export function setTerrainLines(mesh,value,sunPosition){
  if(!mesh?.userData.terrain)return false;
  const material=mesh.material,style=normalizeTerrainLines(value);
  if(sunPosition)material.userData.terrainSun.value=sunPosition;
  if(material.userData.terrainLines===style)return false;
  material.userData.terrainLines=style;
  material.defines={...material.defines,TERRAIN_LINE_STYLE:modes[style]};
  material.needsUpdate=true;return true;
}
