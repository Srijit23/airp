import {
  BackSide,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

export class Atmosphere {
  constructor(scene) {
    this.scene = scene;
    this.sunDir = new Vector3(-0.8, 0.62, -0.32).normalize();
    this.hemi = new HemisphereLight(0xe3efff, 0x95836a, 1.3);
    this.sun = new DirectionalLight(0xffe2ad, 2.65);
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.8;
    Object.assign(this.sun.shadow.camera, {
      left: -260,
      right: 260,
      top: 260,
      bottom: -260,
      near: 4,
      far: 1300,
    });
    this.sun.shadow.camera.updateProjectionMatrix();
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new Fog(0xbeced0, 400, 2200);
    this.sky = new Mesh(
      new SphereGeometry(6800, 40, 20),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { sunDir: { value: this.sunDir } },
        vertexShader: `varying vec3 dir;
        void main(){dir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}`,
        fragmentShader: `varying vec3 dir; uniform vec3 sunDir;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
        float clouds(vec2 p){float n=0.,a=.5; for(int i=0;i<4;i++){n+=a*noise(p);p=p*2.03+7.23;a*=.5;} return n;}
        void main(){
          vec3 d=normalize(dir);float y=max(0.,d.y), glow=max(0.,dot(d,sunDir));
          vec3 sky=mix(vec3(.59,.70,.74),vec3(.13,.38,.62),pow(y,.42));
          vec2 p=d.xz/(y+.05)*vec2(1.75,3.);
          float cloud=smoothstep(.49,.72,clouds(p))*smoothstep(.014,.13,y);
          sky=mix(sky,vec3(.91,.89,.83),cloud*.65);
          sky+=vec3(.53,.30,.12)*pow(glow,18.)+vec3(3.,2.5,1.6)*smoothstep(.99983,.99997,glow);
          gl_FragColor=vec4(sky,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = 1000;
    scene.add(this.sky);
  }
  configure(preset, renderer) {
    this.scene.fog.near = preset.fog * 0.3;
    this.scene.fog.far = preset.fog;
    this.sun.castShadow = renderer.shadowMap.enabled = !!preset.shadow;
    this.sun.shadow.mapSize.setScalar(preset.shadow || 1);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.sun.shadow.needsUpdate = true;
  }
  follow(position, revision) {
    this.sky.position.copy(position);
    const grid = 16,
      target = this.sun.target.position;
    const x = Math.round(position.x / grid) * grid,
      z = Math.round(position.z / grid) * grid;
    const y = Math.round(position.y / 24) * 24 - 35;
    if (
      x !== target.x ||
      y !== target.y ||
      z !== target.z ||
      revision !== this.revision
    ) {
      this.sun.shadow.needsUpdate = true;
      this.revision = revision;
    }
    target.set(x, y, z);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 650);
  }
  dispose() {
    this.scene.remove(this.sky, this.hemi, this.sun, this.sun.target);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.dispose();
  }
}
