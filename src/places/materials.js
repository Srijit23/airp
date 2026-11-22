import { CanvasTexture, DoubleSide, MeshStandardMaterial, SRGBColorSpace } from 'three';
export function facadeMaterial(albedo, normalMap, urban = false) {
  const m = new MeshStandardMaterial({
    vertexColors: true,
    roughness: .8
  });
  m.customProgramCacheKey = () => 'facade_' + urban;
  m.onBeforeCompile = s => {
    s.uniforms.sheetMap = {
      value: albedo
    };
    s.uniforms.bumpSheet = {
      value: normalMap
    };
    const vars = 'varying vec3 metres,faceNormal; varying float surfaceKind;\n';
    s.vertexShader = vars + 'attribute float _surface;\n' + s.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      metres=position*vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      faceNormal=normal;surfaceKind=_surface;`);
    s.fragmentShader = vars + 'uniform sampler2D sheetMap,bumpSheet;\n' + s.fragmentShader.replace(
        '#include <color_fragment>', `
      #include <color_fragment>
      vec3 an=abs(faceNormal);vec2 wall=an.y>.68?metres.xz:vec2(an.x>an.z?metres.z:metres.x,metres.y);
      float k=surfaceKind;bool glass=k>2.5&&k<3.5;
      vec2 cell=k>3.5?vec2(1,1):k>1.5?vec2(0,1):k>.5?vec2(1,0):vec2(0,0);
      vec2 uv=wall/(k>1.5&&k<2.5?2.8:3.6),tile=(cell+.004+.992*fract(uv))*.5;
      vec2 dx=dFdx(uv)*.5,dy=dFdy(uv)*.5;
      vec2 relief=textureGrad(bumpSheet,tile,dx,dy).rg*2.-1.;
      if(${urban?'true':'false'} && !glass && abs(faceNormal.y)<.12 && faceNormal.z<.6&&k<1.6&&metres.y>1.){
        vec2 bays=wall/vec2(2.6,3.2),pane=fract(bays),edge=min(pane-vec2(.14,.2),vec2(.89,.86)-pane);
        float inset=smoothstep(-.015,.015,min(edge.x,edge.y));
        float lit=fract(sin(dot(floor(bays),vec2(17.35,72.43)))*437.54);
        vec3 g=mix(vec3(.042,.085,.094),vec3(.14,.205,.219),.24+.57*pane.y+.19*lit);
        if(lit>.84)g=mix(g,vec3(.24,.2,.14),.48);
        g=mix(vec3(.13,.14,.13),g,smoothstep(.008,.024,abs(pane.x-.52)));
        diffuseColor.rgb=mix(diffuseColor.rgb,g,inset);
      }
      if(!glass)diffuseColor.rgb*=.67+.92*textureGrad(sheetMap,tile,dx,dy).r+relief.y*.09;
      else {
        float f=pow(1.-abs(dot(normalize(vViewPosition),normalize(vNormal))),2.);
        diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.62,.81,1.04),vec3(.36,.5,.54),.20+.40*f+.07*sin(wall.y*.87+wall.x*.27));
      }`).replace('#include <roughnessmap_fragment>', 'float roughnessFactor=glass?.22:.84;')
      .replace('#include <normal_fragment_maps>',
        `
      #include <normal_fragment_maps>
      vec3 dp1=dFdx(-vViewPosition),dp2=dFdy(-vViewPosition);
      vec3 t=cross(dp2,normal)*dFdx(wall.x)+cross(normal,dp1)*dFdy(wall.x);
      vec3 b=cross(dp2,normal)*dFdx(wall.y)+cross(normal,dp1)*dFdy(wall.y);
      normal=normalize(normal+(t*relief.x+b*relief.y)*(glass?0.:.33)*inversesqrt(max(1e-8,max(dot(t,t),dot(b,b)))));`);
  };
  return m;
}
export function foliageMaterial(map, clock) {
  const m = new MeshStandardMaterial({
    map,
    side: DoubleSide,
    alphaTest: .37,
    roughness: 1,
    color: 0xabb48f
  });
  m.shadowSide = DoubleSide;
  m.onBeforeCompile = s => {
    s.uniforms.windTime = clock;
    s.vertexShader = 'uniform float windTime;\n' + s.vertexShader.replace('#include <begin_vertex>',
      `
    #include <begin_vertex>
    float phase=instanceMatrix[3].x*.11+instanceMatrix[3].z*.07;
    transformed.x+=.011*position.y*position.y*(sin(windTime*1.3+phase+position.y*5.)+.35*sin(windTime*2.3+phase*2.))*(1.-smoothstep(65.,240.,length(instanceMatrix[3].xz-cameraPosition.xz)));`);
  };
  return m;
}
export const signs = {
  commercial: ['Mariner Coffee', 'Common Goods', 'Baker & Field', 'Northline Books', 'Salt Table',
    'Aster Pharmacy', 'Market Hall'
  ],
  public: ['Basin Medical', 'Alder School', 'Civic Assembly'],
  downtown: ['ARCADIA', 'The Meridian', 'Basin Exchange', 'Hearth Hotel', 'West & Co'],
  industrial: ['FOUNDRY WORKS', 'Harbor Storage', 'Basin Freight', 'Atlas Supply']
};
export const signList = Object.values(signs).flat();
export function signMaterial() {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 1024;
  const ctx = c.getContext('2d');
  signList.forEach((name, i) => {
    const y = i * 48;
    ctx.fillStyle = ['#263e3e', '#734e40', '#3e4e55', '#3f4c38'][i % 4];
    ctx.fillRect(0, y, 384, 48);
    ctx.fillStyle = '#bbac88';
    ctx.fillRect(0, y + 43, 384, 2);
    ctx.fillStyle = '#f4e9cb';
    ctx.textAlign = 'center';
    ctx.font = '600 31px Georgia, serif';
    ctx.fillText(name, 192, y + 33, 366);
  });
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return new MeshStandardMaterial({
    map: tex,
    roughness: .8
  });
}
