import {needleLighting} from './needles.js';
import {MeshDepthMaterial, RGBADepthPacking, ShaderChunk} from 'three';
export const pixelThreshold='fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))))';

// The same screen-space mask is used by both meshes and the distant crown.
// Instance color is private to these batches and carries the coverage interval.
function mask(material,needles=false){
  material.onBeforeCompile=shader=>{
    if(needles)needleLighting(shader);
    shader.vertexShader='varying vec2 forestMask;\n'+shader.vertexShader.replace('void main() {',
      'void main() {\nforestMask=instanceColor.xy;').replace('#include <color_vertex>',
      ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;',''));
    shader.fragmentShader='varying vec2 forestMask;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>',
      '#include <alphatest_fragment>\nif(forestMask.x>0. || forestMask.y<1.){float p='+pixelThreshold+';if(p<forestMask.x || p>=forestMask.y)discard;}');
  };
  material.customProgramCacheKey=()=> 'airp-forest-coverage-1/'+needles;
  return material;
}
export function forestMaterials(source,needleMap){
  const surface=mask(source.clone(),Boolean(needleMap));
  if(needleMap)surface.map=needleMap;
  if(surface.alphaTest>0)surface.alphaToCoverage=true;
  const depth=mask(new MeshDepthMaterial({depthPacking:RGBADepthPacking,map:surface.map,alphaMap:source.alphaMap,
    alphaTest:source.alphaTest,side:source.side}));
  return {surface,depth};
}
