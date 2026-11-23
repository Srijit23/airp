import {canopyVertex,canopyFragment} from './portrait-shader.js';
import rectangles from './portraits.json' with { type: 'json' };
import {
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  BufferAttribute,
  InstancedBufferAttribute,
  Mesh,
  Sphere,
  Vector3,
  ShaderMaterial,
  TextureLoader,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
  DynamicDrawUsage,
} from 'three';
import { TILE } from '../data/world.js';
import { treeSpecies } from '../trees/species.js';

// Shared registered colour/depth views of the exact near geometry, including overhead views.
export class Canopy {
  constructor(scene, fail) {
    this.scene = scene;
    this.hidden = [];
    this.visibleInstances = 0;
    this.visibleFrame = -1;
    const loader=new TextureLoader();
    let loaded=0;this.ready=false;
    const load=name=>loader.load(import.meta.env.BASE_URL+'assets/trees/'+name+'.webp',()=>{this.ready=++loaded===2;},undefined,fail);
    const map=load('forest-views'),depth=load('forest-depth');
    map.colorSpace=SRGBColorSpace;
    const bounds=treeSpecies.flatMap((_,i)=>{
      const views=rectangles.slice(i*24,(i+1)*24);
      return [0,1,2,3].map(k=>k<2?Math.max(0,Math.min(...views.map(v=>v[k]))-.055):
        Math.min(1,Math.max(...views.map(v=>v[k]))+.055));
    });
    const sizes = treeSpecies.map(
      ({ dimensions: { width, height, depth } }) => [
        Math.max(height * 1.12, Math.hypot(width, depth) * 1.1),
        height * 0.5,
      ],
    );
    this.material = new ShaderMaterial({
      fog: true,alphaToCoverage:true,
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.fog),
        map: { value: map },
        heightIndex: { value: 0 },
        limit: { value: 1650 },
        sizes: { value: sizes.flat() },
        bounds:{value:bounds},depthMap:{value:depth},age:{value:2},multisampled:{value:1},
      },
      vertexShader:canopyVertex,fragmentShader:canopyFragment,
    });
  }
  attach(t) {
    if (!t.records.length) return;
    const count = t.records.length / 8,
      geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
        ]),
        3,
      ),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const packed = new InstancedInterleavedBuffer(t.records, 8);
    geometry.setAttribute(
      'offset',
      new InterleavedBufferAttribute(packed, 2, 0),
    );
    geometry.setAttribute(
      'heights',
      new InterleavedBufferAttribute(packed, 3, 2),
    );
    geometry.setAttribute('form', new InterleavedBufferAttribute(packed, 3, 5));
    const show = new InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
    show.setUsage(DynamicDrawUsage);
    geometry.setAttribute('show', show);
    geometry.instanceCount = count;
    let lo = Infinity,
      hi = -Infinity;
    for (let i = 0; i < t.records.length; i += 8)
      for (let j = 2; j <= 4; j++) {
        lo = Math.min(lo, t.records[i + j]);
        hi = Math.max(hi, t.records[i + j] + 32);
      }
    geometry.boundingSphere = new Sphere(
      new Vector3(TILE / 2, (lo + hi) / 2, TILE / 2),
      Math.hypot(TILE / 2 + 16, (hi - lo) / 2, TILE / 2 + 16),
    );
    const mesh = (t.mesh = new Mesh(geometry, this.material));
    mesh.position.set(t.x * TILE, 0, t.z * TILE);
    mesh.onBeforeRender = (renderer) => {
      if(this.samples===undefined)this.samples=renderer.getContext().getParameter(renderer.getContext().SAMPLES);
      this.material.uniforms.multisampled.value=this.samples>1?1:0;
      this.material.uniforms.heightIndex.value = t.heightIndex;
      this.material.uniforms.age.value=Math.max(0,(performance.now()-t.born)/1000);
      this.material.uniformsNeedUpdate = true;
      const frame = renderer.info.render.frame;
      if (frame !== this.visibleFrame) {
        this.visibleFrame = frame;
        this.visibleInstances = 0;
      }
      this.visibleInstances += count;
    };
    t.born=t.immediate?-10000:performance.now();
    t.show = show;
    this.scene.add(mesh);
  }
  update(tiles, drawn, streamer, config) {
    if (this.hidden !== drawn)
      for (const t of this.hidden) {
        if (t.tile.show) {
          t.tile.show.setX(t.k / 8, 1);
          t.tile.show.needsUpdate = true;
        }
      }

    let count = 0,
      bytes = 0;
    for (const t of tiles.values()) {
      if (t.records.length && !t.mesh) this.attach(t);
      const n = streamer.resolutionAt(t.x * TILE + 1, t.z * TILE + 1);
      t.heightIndex = n === 32 ? 2 : n === 16 ? 1 : 0;
      count += t.records.length / 8;
      bytes += t.records.byteLength;
    }
    if (this.hidden !== drawn)
      for (const t of drawn) {
        t.tile.show.setX(t.k / 8, 1-t.end);
        t.tile.show.needsUpdate = true;
      }
    this.hidden = drawn;
    this.material.uniforms.limit.value = config.radius;
    return { instances: count, recordMiB: bytes / 1048576 };
  }
  drop(t) {
    t.mesh?.removeFromParent();
    t.mesh?.geometry.dispose();
    t.mesh = null;
    t.show = null;
  }
  dispose() {
    this.hidden = [];
    this.material.uniforms.map.value.dispose();
    this.material.uniforms.depthMap.value.dispose();
    this.material.dispose();
  }
}
