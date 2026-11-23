import {
  InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, BufferAttribute,
  InstancedBufferAttribute, Mesh, Sphere, Vector3, ShaderMaterial, TextureLoader,
  SRGBColorSpace, UniformsLib, UniformsUtils, DynamicDrawUsage
} from 'three';
import {TILE} from '../data/world.js';
import {treeSpecies} from '../trees/species.js';

// Four azimuths at three elevations per species. Choose each portrait in tree-local
// coordinates, including from directly overhead. Only the texture and shader are shared.
export class Canopy {
  constructor(scene,fail) {
    this.scene=scene;this.hidden=[];this.visibleInstances=0;this.visibleFrame=-1;
    const map=new TextureLoader().load(import.meta.env.BASE_URL+'assets/trees/forest-views.webp',undefined,undefined,fail);
    map.colorSpace=SRGBColorSpace;
    const sizes=treeSpecies.map(({dimensions:{width,height,depth}})=>[Math.max(height*1.12,Math.hypot(width,depth)*1.10),height*.5]);
    this.material=new ShaderMaterial({fog:true,uniforms:{
      ...UniformsUtils.clone(UniformsLib.fog),map:{value:map},heightIndex:{value:0},limit:{value:1650},sizes:{value:sizes.flat()}
    },vertexShader:`
      attribute vec2 offset;
      attribute vec3 heights, form;
      attribute float show;
      uniform float heightIndex,limit;
      uniform vec2 sizes[5];
      varying vec2 portrait;
      varying float lightness;
      #include <fog_pars_vertex>
      void main(){
        float height=heightIndex>1.5?heights.z:(heightIndex>.5?heights.y:heights.x);
        vec2 size=sizes[int(form.x)];
        vec3 center=(modelMatrix*vec4(offset.x,height+size.y*form.y,offset.y,1.)).xyz;
        vec3 eye=cameraPosition-center;
        float range=length(eye.xz);
        if(show<.5 || range>limit){gl_Position=vec4(2.,2.,2.,1.);return;}
        vec3 dir=normalize(eye);
        vec3 right=normalize(vec3(eye.z+.0001,0.,-eye.x));
        vec3 up=normalize(cross(dir,right));
        vec3 point=center+(position.x*right+position.y*up)*size.x*form.y;
        vec4 mvPosition=viewMatrix*vec4(point,1.);
        gl_Position=projectionMatrix*mvPosition;
        float az=mod(floor((atan(eye.x,eye.z)-form.z)*.636619772+.5),4.);
        float tilt=dir.y>.839?2.:(dir.y>.309?1.:0.);
        vec2 coord=clamp(position.xy+.5,.004,.996);
        portrait=vec2((az+coord.x)/4.,1.-(form.x*3.+tilt+1.-coord.y)/15.);
        lightness=.90+.10*cos(form.z);
        #include <fog_vertex>
      }`,
      fragmentShader:`
      uniform sampler2D map;
      varying vec2 portrait;
      varying float lightness;
      #include <fog_pars_fragment>
      void main(){
        vec4 canopy=texture2D(map,portrait);
        if(canopy.a<.22)discard;
        gl_FragColor=vec4(canopy.rgb*lightness,1.);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`});
  }
  attach(t){
    if(!t.records.length)return;
    const count=t.records.length/8,geometry=new InstancedBufferGeometry();
    geometry.setAttribute('position',new BufferAttribute(new Float32Array([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0]),3));
    geometry.setIndex([0,1,2,0,2,3]);
    const packed=new InstancedInterleavedBuffer(t.records,8);
    geometry.setAttribute('offset',new InterleavedBufferAttribute(packed,2,0));
    geometry.setAttribute('heights',new InterleavedBufferAttribute(packed,3,2));
    geometry.setAttribute('form',new InterleavedBufferAttribute(packed,3,5));
    const show=new InstancedBufferAttribute(new Uint8Array(count).fill(1),1);
    show.setUsage(DynamicDrawUsage);geometry.setAttribute('show',show);
    geometry.instanceCount=count;
    let lo=Infinity,hi=-Infinity;
    for(let i=0;i<t.records.length;i+=8)for(let j=2;j<=4;j++){lo=Math.min(lo,t.records[i+j]);hi=Math.max(hi,t.records[i+j]+32);}
    geometry.boundingSphere=new Sphere(new Vector3(TILE/2,(lo+hi)/2,TILE/2),Math.hypot(TILE/2+16,(hi-lo)/2,TILE/2+16));
    const mesh=t.mesh=new Mesh(geometry,this.material);
    mesh.position.set(t.x*TILE,0,t.z*TILE);
    mesh.onBeforeRender=(renderer)=>{
      this.material.uniforms.heightIndex.value=t.heightIndex;
      this.material.uniformsNeedUpdate=true;
      const frame=renderer.info.render.frame;
      if(frame!==this.visibleFrame){this.visibleFrame=frame;this.visibleInstances=0;}
      this.visibleInstances+=count;
    };
    t.show=show;this.scene.add(mesh);
  }
  update(tiles,drawn,streamer,config){
    for(const t of this.hidden){if(t.tile.show){t.tile.show.setX(t.k/8,1);t.tile.show.needsUpdate=true;}}
    this.hidden=drawn;
    let count=0,bytes=0;
    for(const t of tiles.values()){
      if(t.records.length && !t.mesh)this.attach(t);
      const n=streamer.resolutionAt(t.x*TILE+1,t.z*TILE+1);
      t.heightIndex=n===32?2:n===16?1:0;
      count+=t.records.length/8;bytes+=t.records.byteLength;
    }
    for(const t of drawn){t.tile.show.setX(t.k/8,0);t.tile.show.needsUpdate=true;}
    this.material.uniforms.limit.value=config.radius;
    return {instances:count,recordMiB:bytes/1048576};
  }
  drop(t){t.mesh?.removeFromParent();t.mesh?.geometry.dispose();t.mesh=null;t.show=null;}
  dispose(){this.hidden=[];this.material.uniforms.map.value.dispose();this.material.dispose();}
}
