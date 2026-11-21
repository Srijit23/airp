import { ShaderChunk } from 'three';
// Feather the limit of the local shadow map so a long street has no rectangular shadow edge.
export function fadeShadowBounds(shader) {
  const source = ShaderChunk.lights_fragment_begin.replace(
    'directionalLightShadow.shadowIntensity,',
    'directionalLightShadow.shadowIntensity * smoothstep(.0,.16,min(min(vDirectionalShadowCoord[i].x,1.-vDirectionalShadowCoord[i].x),min(vDirectionalShadowCoord[i].y,1.-vDirectionalShadowCoord[i].y))),',
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_begin>',
    source,
  );
}
