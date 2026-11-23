import { Group, InstancedMesh, Matrix4, Object3D } from 'three';
import { treeSpecies } from '../trees/species.js';
const transform = new Object3D(),
  matrix = new Matrix4();

// Hold one asset reference per species in the local detail ring. The showcase
// can independently retain the same source geometries, textures and materials.
export class ForestModels {
  constructor(scene, assets, fail) {
    this.scene = scene;
    this.assets = assets;
    this.fail = fail;
    this.entries = new Map();
    this.revision = 0;
  }
  request(index) {
    let entry = this.entries.get(index);
    if (entry) return entry;
    const s = treeSpecies[index];
    entry = { root: new Group(), parts: { near: [], far: [] }, ready: false };
    this.entries.set(index, entry);
    this.assets
      .acquire(s.assetId)
      .then((handle) => {
        if (this.entries.get(index) !== entry) {
          handle.release();
          return;
        }
        entry.handle = handle;
        const source = handle.value.instantiate();
        source.updateMatrixWorld(true);
        for (const level of s.lod.nodes)
          source.getObjectByName(level).traverse((part) => {
            if (!part.isMesh) return;
            const mesh = new InstancedMesh(
              part.geometry,
              part.material,
              level === 'near' ? 12 : 32,
            );
            mesh.count = 0;
            mesh.visible = false;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            entry.root.add(mesh);
            entry.parts[level].push({ mesh, local: part.matrixWorld.clone() });
          });
        entry.ready = true;
        this.scene.add(entry.root);
        this.revision++;
      })
      .catch((e) => {
        if (this.entries.get(index) === entry) this.fail(e);
      });
    return entry;
  }
  draw(selected) {
    const used = new Set(),
      rendered = [];
    for (const t of selected) {
      const entry = this.request(t.species);
      used.add(t.species);
      if (!entry.ready) continue;
      rendered.push(t);
      const parts = entry.parts[t.level];
      transform.position.set(t.x, t.y - 0.045, t.z);
      transform.rotation.y = t.yaw;
      transform.scale.setScalar(t.scale);
      transform.updateMatrix();
      for (const { mesh, local } of parts) {
        mesh.setMatrixAt(
          mesh.userData.next || 0,
          matrix.multiplyMatrices(transform.matrix, local),
        );
        mesh.userData.next = (mesh.userData.next || 0) + 1;
      }
    }
    for (const [i, e] of this.entries) {
      if (!used.has(i)) {
        this.remove(i);
        continue;
      }
      for (const parts of Object.values(e.parts))
        for (const { mesh } of parts) {
          mesh.count = mesh.userData.next || 0;
          mesh.userData.next = 0;
          mesh.visible = mesh.count > 0;
          if (mesh.visible) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
          }
        }
    }
    return rendered;
  }
  remove(i) {
    const e = this.entries.get(i);
    e.root.removeFromParent();
    e.root.children.forEach((m) => m.dispose());
    e.handle?.release();
    this.entries.delete(i);
  }
  dispose() {
    for (const i of this.entries.keys()) this.remove(i);
  }
}
