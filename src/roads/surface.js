import {
  MeshStandardMaterial,
  DoubleSide,
  CanvasTexture,
  SRGBColorSpace,
} from 'three';
import { signs } from './signs.js';
import { fadeShadowBounds } from '../environment/shadow-fade.js';
function signAtlas() {
  const atlas = document.createElement('canvas');
  atlas.width = 1024;
  atlas.height = 1024;
  const ctx = atlas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  signs.forEach((name, i) => {
    const x = (i % 4) * 256,
      y = Math.floor(i / 4) * 64;
    const caution =
      name === 'KEEP LEFT' || name.includes('‹') || name.includes('›');
    ctx.fillStyle = caution ? '#eab758' : '#15534e';
    ctx.fillRect(x, y, 256, 64);
    ctx.strokeStyle = caution ? '#584126' : '#d9e4d6';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 5, y + 5, 246, 54);
    ctx.fillStyle = caution ? '#322e1f' : '#f6f5df';
    ctx.font = 'bold 27px sans-serif';
    ctx.fillText(name.toUpperCase(), x + 128, y + 33, 229);
  });
  const tex = new CanvasTexture(atlas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
export async function roadMaterial(assets) {
  const names = [
    'asphalt',
    'asphalt-surface',
    'pavers',
    'pavers-surface',
    'meadow',
  ];
  const results = await Promise.allSettled(
      names.map((id) => assets.acquire(id)),
    ),
    handles = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);
  const failure = results.find((r) => r.status === 'rejected');
  if (failure) {
    handles.forEach((h) => h.release());
    throw failure.reason;
  }
  const mat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const namesTexture = signAtlas();
  mat.onBeforeCompile = (shader) => {
    fadeShadowBounds(shader);
    shader.uniforms.namesTexture = { value: namesTexture };
    const keys = [
      'roadColour',
      'roadSurface',
      'walkColour',
      'walkSurface',
      'islandSoil',
    ];
    keys.forEach((k, i) => (shader.uniforms[k] = { value: handles[i].value }));
    shader.vertexShader =
      'attribute float surface;attribute vec2 signUV;varying vec2 labelUV;flat varying int kind; varying vec3 cityPosition;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      kind=int(surface+.5);labelUV=signUV;cityPosition=(modelMatrix*vec4(position,1.)).xyz;`,
    );
    shader.fragmentShader =
      `flat varying int kind;varying vec3 cityPosition;varying vec2 labelUV;uniform sampler2D namesTexture;
    uniform sampler2D roadColour,roadSurface,walkColour,walkSurface,islandSoil;
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec2 uv=cityPosition.xz;vec3 ns=vec3(.5,.5,.87);
      if(kind==0){
        vec2 p=uv/4.8;
        vec3 scan=texture2D(roadColour,p).rgb;
        vec3 broad=texture2D(roadColour,uv/24.+.43,2.).rgb;
        float l=dot(scan,vec3(.26,.53,.21));
        diffuseColor.rgb*=(vec3(.065)+mix(vec3(l),scan,.13)*1.55)*clamp(.80+dot(broad,vec3(.6,1.,.4)),.75,1.17);
        ns=texture2D(roadSurface,p).rgb;
      }else if(kind==1){
        vec2 p=uv/3.0;
        diffuseColor.rgb*=(.075+texture2D(walkColour,p).rgb*1.30);
        ns=texture2D(walkSurface,p).rgb;
      }else if(kind==5){diffuseColor.rgb*=texture2D(islandSoil,uv/2.8).rgb*vec3(.7,1.25,.50);
      }else if(kind>=10){
        int row=kind-10;vec2 glyph=clamp(labelUV,vec2(.012),vec2(.988));
        vec2 suv=vec2((float(row%4)+glyph.x)/4.,1.-(float(row/4)+1.-glyph.y)/16.);
        diffuseColor.rgb=texture2D(namesTexture,suv).rgb;
      }else if(kind==2){diffuseColor.rgb*=.83+texture2D(walkColour,uv/4.).r*.49;}
      else if(kind==3){diffuseColor.rgb*=.89+.11*texture2D(roadSurface,uv/3.2).b;}
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      'float roughnessFactor=clamp(ns.b,.52,1.);',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `if(kind<=1){
      vec2 delta=(ns.rg*2.-1.)*.35;
      normal=normalize(normal+mat3(viewMatrix)*vec3(delta.x,0.,-delta.y));
    }`,
    );
  };
  return {
    material: mat,
    dispose() {
      namesTexture.dispose();
      mat.dispose();
      handles.forEach((h) => h.release());
    },
  };
}
