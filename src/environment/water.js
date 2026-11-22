import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { shoreline } from '../world/regions.js';
const waves =
  `uniform float clock;
float shore(float x){return 3508.+140.*sin(x/710.)+50.*sin(x/211.);}
float wave(vec2 p){return .15*sin(dot(p,vec2(.12,.24))+clock*.84)+.085*sin(dot(p,vec2(-.23,.16))+clock*1.06)+.046*sin(dot(p,vec2(.37,.28))-clock*1.39);}`;
export class SouthSound {
  constructor(scene) {
    this.scene = scene;
    const m = new ShaderMaterial({
      side: DoubleSide,
      uniforms: {
        clock: {
          value: 0
        },
        detail: {
          value: 1
        },
        sun: {
          value: new Vector3(-.8, .62, -.32).normalize()
        }
      },
      vertexShader: waves + `varying vec3 wc;void main(){vec4 p=modelMatrix*vec4(position,1.);p.y+=smoothstep(-3.,28.,p.z-shore(p.x))*wave(p.xz);
      wc=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: waves + `
      varying vec3 wc;uniform vec3 sun;uniform float detail;
      void main(){float dist=wc.z-shore(wc.x),depth=max(0.,dist*.055);vec2 p=wc.xz,d=vec2(.26,0.);
        vec2 slope=vec2(wave(p+d)-wave(p-d),wave(p+d.yx)-wave(p-d.yx))/.52;
        slope+=detail*(1.-smoothstep(30.,220.,length(cameraPosition-wc)))*.05*vec2(sin(p.x*2.+p.y*1.7+clock),sin(p.x*.7-p.y*2.1-clock));
        vec3 n=normalize(vec3(-slope.x,1.,-slope.y)),v=normalize(cameraPosition-wc),r=reflect(-v,n);
        float f=.035+.79*pow(1.-abs(dot(n,v)),4.);
        vec3 body=mix(vec3(.115,.32,.255),vec3(.019,.124,.164),smoothstep(0.,12.,depth));
        vec3 sky=mix(vec3(.48,.61,.64),vec3(.12,.34,.52),clamp(r.y,0.,1.));
        vec3 col=mix(body,sky,f)+vec3(1.,.84,.60)*pow(max(0.,dot(r,sun)),90.)*.9;
        float wash=dist+sin(p.x*.103+clock*.5)*.65+1.05*sin(clock*.65);
        float foam=(1.-smoothstep(.25,1.7,abs(wash-1.)))+.36*(1.-smoothstep(.4,1.8,abs(wash-6.+sin(p.x*.08-clock))));
        col=mix(col,vec3(.77,.83,.74),clamp(foam*(.68+.19*sin(p.y*1.7+p.x*2.)),0.,.9));
        if(!gl_FrontFacing)col=mix(vec3(.035,.23,.23),col,.32);gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    });
    this.mesh = new Mesh(new PlaneGeometry(13000, 6400, 310, 150).rotateX(-Math.PI / 2), m);
    this.mesh.position.z = 6330;
    scene.add(this.mesh);
    this.dry = new Color(0xbeced0);
    this.wet = new Color(0x407978);
    this.forest = new Color(0xa3b5aa);
  }
  update(p, time, preset) {
    this.underwater = p.z > shoreline(p.x) && p.y < 0;
    this.mesh.visible = p.z > 1480;
    this.mesh.material.uniforms.clock.value = time;
    this.mesh.material.uniforms.detail.value = preset.shadow ? 1 : 0;
    const forest = Math.min(1, Math.max(0, Math.max((-p.x - 1300) / 400, (-p.z - 1120) / 400)));
    this.scene.fog.color.copy(this.underwater ? this.wet : this.dry);
    if (!this.underwater) this.scene.fog.color.lerp(this.forest, forest);
    this.scene.fog.near = this.underwater ? 1 : preset.fog * (.3 - .268 * forest);
    this.scene.fog.far = this.underwater ? 62 : preset.fog * (1 - .59 * forest);
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
export function poolMaterial(clock) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      clock
    },
    vertexShader: `varying vec3 wp;void main(){vec4 p=modelMatrix*instanceMatrix*vec4(position,1.);wp=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `varying vec3 wp;uniform float clock;void main(){vec3 v=normalize(cameraPosition-wp);
    float ripple=sin(wp.x*3.9+wp.z*2.4+clock)*.11+sin(wp.z*6.-clock*1.35)*.045;
    float f=pow(1.-abs(dot(v,normalize(vec3(ripple,1.,ripple*.65)))),3.);
    gl_FragColor=vec4(mix(vec3(.055,.37,.38),vec3(.58,.72,.71),f),.49+.42*f);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
  });
}
