import { Group, InstancedMesh, Matrix4, Object3D } from 'three';
import { groundHeight } from '../world/queries.js';
import { clearing, detailLevel, showcaseTrees } from './showcase-plan.js';
import { treeSpecies } from './species.js';

const loadRadius = 245;
const unloadRadius = 300;
const treeTransform = new Object3D();
const partMatrix = new Matrix4();

// Each material primitive has one instanced batch per detail level. Placements
// use the source node matrix, including the GLB's quantization transform.
export class TreeShowcase {
  constructor(scene, assets, onError) {
    this.scene = scene;
    this.assets = assets;
    this.onError = onError;
    this.root = new Group();
    this.root.name = 'Tree Model Showcase';
    this.groves = [];
    this.active = false;
    this.ready = false;
    this.generation = 0;
    this.revision = 0;
  }

  async load(generation) {
    const results = await Promise.allSettled(treeSpecies.map(s => this.assets.acquire(s.assetId)));
    const handles = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    if (generation !== this.generation) {
      handles.forEach(h => h.release());
      return;
    }
    this.handles = handles;
    try {
      const failure = results.find(r => r.status === 'rejected');
      if (failure) throw failure.reason;
      treeSpecies.forEach((species, i) => {
        const source = handles[i].value.instantiate();
        source.updateMatrixWorld(true);
        const trees = showcaseTrees.filter(t => t.species === species.id).map(t => ({ ...t }));
        const batches = {};
        for (const level of species.lod.nodes) {
          const parts = batches[level] = [];
          const group = source.getObjectByName(level);
          if (!group) throw Error('Missing ' + species.name + ' ' + level + ' geometry');
          group.traverse(part => {
            if (!part.isMesh) return;
            const batch = new InstancedMesh(part.geometry, part.material, trees.length);
            batch.name = species.id + '/' + level + '/' + part.name;
            batch.castShadow = species.rendering.castsShadow;
            batch.receiveShadow = species.rendering.receivesShadow;
            batch.count = 0;
            batch.visible = false;
            this.root.add(batch);
            parts.push({ batch, local: part.matrixWorld.clone() });
          });
        }
        this.groves.push({ species, trees, batches });
      });
      this.scene.add(this.root);
      this.ready = true;
    } catch (err) {
      this.clear();
      this.onError(err);
    }
  }

  update(camera, streamer) {
    const distance = Math.hypot(camera.x - clearing.x, camera.z - clearing.z);
    if (!this.active && distance < loadRadius) {
      this.active = true;
      void this.load(++this.generation);
    } else if (this.active && distance > unloadRadius) {
      this.clear();
    }
    if (!this.ready) return;
    for (const { species, trees, batches } of this.groves) {
      let changed = false;
      for (const t of trees) {
        const resolution = streamer.resolutionAt(t.x, t.z);
        if (resolution !== t.resolution) {
          t.resolution = resolution;
          t.y = groundHeight(t.x, t.z, resolution) - 0.045;
          changed = true;
        }
        const distance = Math.hypot(camera.x - t.x, camera.y - t.y, camera.z - t.z);
        const level = detailLevel(distance, t.level, species.lod);
        if (level !== t.level) { t.level = level; changed = true; }
      }
      if (!changed) continue;
      const counts = { near: 0, far: 0 };
      for (const t of trees) {
        treeTransform.position.set(t.x, t.y, t.z);
        treeTransform.rotation.y = t.yaw;
        treeTransform.scale.setScalar(t.scale);
        treeTransform.updateMatrix();
        const index = counts[t.level]++;
        for (const { batch, local } of batches[t.level])
          batch.setMatrixAt(index, partMatrix.multiplyMatrices(treeTransform.matrix, local));
      }
      for (const [level, parts] of Object.entries(batches)) {
        for (const { batch } of parts) {
          batch.count = counts[level];
          batch.visible = batch.count > 0;
          batch.instanceMatrix.needsUpdate = true;
          if (batch.visible) batch.computeBoundingSphere();
        }
      }
      this.revision++;
    }
  }

  clear() {
    this.generation++;
    this.active = this.ready = false;
    this.root.removeFromParent();
    this.root.children.forEach(batch => batch.dispose());
    this.root.clear();
    this.groves.length = 0;
    this.handles?.forEach(h => h.release());
    this.handles = null;
    this.revision++;
  }
}
