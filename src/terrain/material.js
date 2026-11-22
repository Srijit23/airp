import { MeshStandardMaterial } from 'three';

// Packed surface textures carry tangent normal XY in RG and roughness in B.
import { fadeShadowBounds } from '../environment/shadow-fade.js';
export async function terrainMaterial(assets) {
  const ids = [
    'meadow',
    'stone',
    'silt',
    'meadow-surface',
    'stone-surface',
    'silt-surface','place-forest_floor','place-sand_02',
  ];
  const settled = await Promise.allSettled(ids.map((id) => assets.acquire(id)));
  const handles = settled
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
  const failure = settled.find((r) => r.status === 'rejected');
  if (failure) {
    handles.forEach((h) => h.release());
    throw failure.reason;
  }
  const material = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const grid = { value: 0 };
  material.onBeforeCompile = (shader) => {
    fadeShadowBounds(shader);
    const names = [
      'meadowMap',
      'stoneMap',
      'siltMap',
      'meadowNS',
      'stoneNS',
      'siltNS','duffMap','beachMap',
    ];
    names.forEach(
      (name, i) => (shader.uniforms[name] = { value: handles[i].value }),
    );
    shader.uniforms.showGrid = grid;
    shader.vertexShader =
      'varying vec3 vGround; varying vec3 vSlope;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vGround=(modelMatrix*vec4(position,1.)).xyz;
      vSlope=normal;`,
    );
    shader.fragmentShader =
      `
      varying vec3 vGround; varying vec3 vSlope;
      uniform sampler2D meadowMap,stoneMap,siltMap,meadowNS,stoneNS,siltNS,duffMap,beachMap;
      uniform float showGrid;
      float hash2(vec2 p){
        vec3 q=fract(vec3(p.xyx)*.1031);
        q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z);
      }
      float field(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x),
          mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x),f.y);
      }
      vec3 rockSample(sampler2D tex,vec3 p,vec3 weights){
        return texture2D(tex,p.zy).rgb*weights.x
             + texture2D(tex,p.xz).rgb*weights.y
             + texture2D(tex,p.xy).rgb*weights.z;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec3 gn=normalize(vSlope); vec2 p=vGround.xz;
      float macro=field(p*.006)+.45*field(p*.021)+.18*field(p*.071);
      float rock=smoothstep(.09,.42,1.-gn.y + .20*(macro-.8));
      float dirt=(1.-rock)*smoothstep(.73,1.23,macro+.14*sin(p.y*.018));
      vec3 weights=pow(abs(gn),vec3(3.));weights/=dot(weights,vec3(1.));
      vec2 warp=vec2(field(p*.027),field(p*.031+15.))-.5;
      vec2 uv=p/4.2+warp*.31;
      vec3 cliff=vGround/14.+vec3(warp.x,warp.y*.6,warp.y)*.65;
      vec3 moss=texture2D(meadowMap,uv).rgb;
      vec3 dust=texture2D(siltMap,p/6.3).rgb;
      float detail=1.-smoothstep(240.,540.,length(vViewPosition));
      // Keep coarse stone colour in the distance without repeating bright pebbles over entire hillsides.
      vec3 stone=texture2D(stoneMap,p/37.+warp*.8,4.5).rgb;
      if(detail>0.) {
        vec3 fineStone=rockSample(stoneMap,cliff,weights);
        // A second world-scale sample breaks up repeating stone patches in aerial views.
        vec3 broadStone=rockSample(stoneMap,cliff*.217+vec3(9.3,6.5,3.1),weights);
        stone=mix(stone,mix(fineStone,broadStone,.39),detail);
      }
      float mottling=field(p*.04+.7*field(p*.1));
      moss=mix(moss,vec3(dot(moss,vec3(.26,.56,.18))),.48)
        *mix(vec3(.83,1.02,.62),vec3(1.35,1.16,.71),smoothstep(.3,1.2,macro));
      dust*=vec3(1.06,.98,.81);
      stone=mix(stone,vec3(dot(stone,vec3(.26,.56,.18))),.62)*vec3(1.04,.99,.89);
      diffuseColor.rgb=(moss*(1.-rock-dirt)+stone*rock+dust*dirt)
        *mix(.66,1.32,mottling)*mix(.89,1.12,field(p*.155));
      float woodland=max(1.-smoothstep(-1650.,-1300.,p.x),1.-smoothstep(-1500.,-1120.,p.y));
      if(woodland>.001 && vGround.y<570.){
        vec3 litter=texture2D(duffMap,p/3.6+warp*.11).rgb;
        float under=woodland*(1.-smoothstep(.19,.50,1.-gn.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,litter*vec3(.97,1.10,.81)*(.90+.21*macro),under*.92);
      }
      float strand=3508.+140.*sin(p.x/710.)+50.*sin(p.x/211.)-p.y;
      float sand=1.-smoothstep(42.,155.,strand+18.*macro);
      if(sand>.001){
        float wet=smoothstep(1.4,19.,strand+sin(p.x*.05)*.7);
        float tone=dot(texture2D(beachMap,p/4.7+warp*.07).rgb,vec3(.26,.58,.16));
        vec3 beach=mix(vec3(.19,.157,.101),vec3(.64,.53,.35),wet)*(.66+1.10*tone);
        float rockCoast=smoothstep(.54,.78,field(p*.004+8.))*smoothstep(.035,.25,1.-gn.y);
        diffuseColor.rgb=mix(diffuseColor.rgb,beach,sand*(1.-rockCoast));
      }
      vec3 ns=vec3(.5,.5,.91);
      if(detail>0.){
        vec3 surface=texture2D(meadowNS,uv).rgb*(1.-rock-dirt)
          +rockSample(stoneNS,cliff,weights)*rock+texture2D(siltNS,p/6.3).rgb*dirt;
        ns=mix(ns,surface,detail);
      }
      vec2 lines=abs(fract(p/256.+.5)-.5)*256.;
      vec2 px=max(fwidth(p),vec2(.02));
      float line=1.-min(smoothstep(0.,px.x*1.8,lines.x),smoothstep(0.,px.y*1.8,lines.y));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.63,.93,.18),showGrid*line*.85);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      'float roughnessFactor=clamp(ns.b,.48,1.);',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      vec3 tangent=normalize(vec3(1.,0.,0.)-gn*gn.x);
      vec3 bitangent=normalize(cross(tangent,gn));
      vec2 bump=(ns.rg*2.-1.)*.55;
      normal=normalize(mat3(viewMatrix)*(gn+tangent*bump.x-bitangent*bump.y));`,
    );
  };
  return {
    material,
    grid,
    dispose() {
      material.dispose();
      handles.forEach((h) => h.release());
    },
  };
}
