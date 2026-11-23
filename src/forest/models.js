import { loadNeedleMap } from './needles.js';
import {
  Group,
  InstancedMesh,
  Matrix4,
  Object3D,
  BufferAttribute,
  Color,
  DynamicDrawUsage,
} from 'three';
import { treeSpecies } from '../trees/species.js';
import { profiles } from './lod.js';
import { forestMaterials } from './fade.js';
const transform = new Object3D(),
  matrix = new Matrix4(),
  coverage = new Color();

async function spruceIndices() {
  const r = await fetch(new URL('./spruce-mid.bin', import.meta.url));
  if (!r.ok)
    throw Error('Could not load spruce middle-detail indices: ' + r.status);
  const bytes = await r.arrayBuffer(),
    data = new DataView(bytes),
    parts = new Map();
  let offset = 0;
  for (const name of ['Spruce_Bark', 'Spruce_Needles']) {
    const count = data.getUint32(offset, true);
    offset += 4;
    parts.set(name, new Uint16Array(bytes, offset, count));
    offset += count * 2;
  }
  if (offset !== bytes.byteLength)
    throw Error('Invalid spruce middle-detail data');
  return parts;
}

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
    const species = treeSpecies[index];
    entry = {
      root: new Group(),
      parts: { near: [], far: [] },
      materials: new Map(),
      owned: [],
      ready: false,
    };
    this.entries.set(index, entry);
    this.assets
      .acquire(species.assetId)
      .then(async (handle) => {
        if (this.entries.get(index) !== entry) {
          handle.release();
          return;
        }
        entry.handle = handle;
        const reduced = species.id === 'spruce' ? await spruceIndices() : null;
        if (this.entries.get(index) !== entry) return;
        const source = handle.value.instantiate();
        source.updateMatrixWorld(true);
        if (species.id === 'pine') {
          let original;
          source.traverse((p) => {
            if (p.material?.name === 'pine_needles') original = p.material.map;
          });
          const map = await loadNeedleMap(original, this.assets.anisotropy);
          if (this.entries.get(index) !== entry) {
            map.dispose();
            return;
          }
          entry.needleMap = map;
        }
        for (const level of species.lod.nodes) {
          const useIndices = reduced && level === 'far';
          source
            .getObjectByName(useIndices ? 'near' : level)
            .traverse((part) => {
              if (!part.isMesh) return;
              let geometry = part.geometry;
              if (useIndices) {
                geometry = part.geometry.clone();
                geometry.setIndex(
                  new BufferAttribute(reduced.get(part.material.name), 1),
                );
                entry.owned.push(geometry);
              }
              if (!entry.materials.has(part.material))
                entry.materials.set(
                  part.material,
                  forestMaterials(
                    part.material,
                    part.material.name === 'pine_needles'
                      ? entry.needleMap
                      : null,
                  ),
                );
              const { surface, depth } = entry.materials.get(part.material);
              const capacity =
                level === 'near'
                  ? profiles.high.nearCap + 4
                  : profiles.high.midCap + 10;
              const mesh = new InstancedMesh(geometry, surface, capacity);
              mesh.setColorAt(0, coverage.setRGB(0, 1, 0));
              mesh.instanceColor.setUsage(DynamicDrawUsage);
              mesh.instanceMatrix.setUsage(DynamicDrawUsage);
              mesh.count = 0;
              mesh.visible = false;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              mesh.customDepthMaterial = depth;
              entry.root.add(mesh);
              entry.parts[level].push({
                mesh,
                local: part.matrixWorld.clone(),
              });
            });
        }
        this.scene.add(entry.root);
        entry.ready = true;
        this.revision++;
      })
      .catch((e) => {
        if (this.entries.get(index) === entry) {
          this.remove(index);
          this.fail(e);
        }
      });
    return entry;
  }
  draw(selected, keep = new Set()) {
    const used = new Set(keep);
    for (const t of selected) {
      const entry = this.entries.get(t.species);
      if (!entry?.ready) continue;
      used.add(t.species);
      transform.position.set(t.x, t.y - 0.045, t.z);
      transform.rotation.y = t.yaw;
      transform.scale.setScalar(t.scale);
      transform.updateMatrix();
      coverage.setRGB(t.start, t.end, 0);
      for (const { mesh, local } of entry.parts[t.level]) {
        const i = mesh.userData.next || 0;
        mesh.setMatrixAt(i, matrix.multiplyMatrices(transform.matrix, local));
        mesh.setColorAt(i, coverage);
        mesh.userData.next = i + 1;
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
            mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingSphere();
          }
        }
    }
    return selected;
  }
  remove(i) {
    const e = this.entries.get(i);
    e.root.removeFromParent();
    e.root.children.forEach((m) => m.dispose());
    for (const m of e.materials.values()) {
      m.surface.dispose();
      m.depth.dispose();
    }
    e.needleMap?.dispose();
    e.owned.forEach((g) => g.dispose());
    e.handle?.release();
    this.entries.delete(i);
  }
  dispose() {
    for (const i of this.entries.keys()) this.remove(i);
  }
}
