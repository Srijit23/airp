import { BufferAttribute, BufferGeometry, Group, Mesh, Color } from 'three';
import { TILE, tileAt } from '../data/world.js';
import { walkIndex } from './walk-surface.js';
import { grade } from './network.js';
import { roadMaterial } from './surface.js';

const linear = Array.from({ length: 256 }, (_, i) =>
  Math.round(new Color().setRGB(i / 255, 0, 0, 'srgb').r * 255),
);
export function decodeCity(buffer) {
  const view = new DataView(buffer);
  if (
    view.getUint32(0) !== 0x41525033 ||
    buffer.byteLength !== 8 + view.getUint32(4, true) * 15
  )
    throw Error('Invalid road chunk');
  const n = view.getUint32(4, true),
    pos = new Float32Array(n * 3),
    norm = new Int8Array(n * 3),
    rgb = new Uint8Array(n * 3),
    surface = new Uint8Array(n),
    signUV = new Uint8Array(n * 2);
  for (let i = 0, j = 8; i < n; i++, j += 15) {
    surface[i] = view.getUint8(j + 9);
    signUV.set([view.getUint8(j + 13), view.getUint8(j + 14)], i * 2);
    for (let k = 0; k < 3; k++) {
      pos[3 * i + k] = view.getInt16(j + 2 * k, true) / 100;
      norm[3 * i + k] = view.getInt8(j + 6 + k);
      rgb[3 * i + k] = linear[view.getUint8(j + 10 + k)];
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(norm, 3, true));
  g.setAttribute('color', new BufferAttribute(rgb, 3, true));
  g.setAttribute('surface', new BufferAttribute(surface, 1));
  g.setAttribute('signUV', new BufferAttribute(signUV, 2, true));
  g.computeBoundingSphere();
  return g;
}
async function request(path, signal) {
  const res = await fetch(import.meta.env.BASE_URL + path, { signal });
  if (!res.ok) throw Error('City asset ' + path + ' returned ' + res.status);
  return res;
}
export class RoadLayer {
  static async create(scene, assets, fail) {
    const manifest = await (await request('city/index.json')).json();
    return new RoadLayer(scene, manifest, await roadMaterial(assets), fail);
  }
  constructor(scene, manifest, material, fail) {
    this.surface = material;
    this.manifest = manifest;
    this.fail = fail;
    this.root = new Group();
    scene.add(this.root);
    this.meshes = new Map();
    this.loading = new Map();
    this.wanted = new Map();
    this.cache = new Map();
    this.bytes = 0;
    this.dead = false;
    this.revision = 0;
  }
  update(p, streamer) {
    const stamp = streamer.center + '@' + streamer.preset.radius;
    if (this.stamp !== stamp) {
      this.stamp = stamp;
      const cx = tileAt(p.x),
        cz = tileAt(p.z),
        wanted = [];
      const radius = streamer.preset.radius;
      for (let z = cz - radius - 3; z <= cz + radius + 3; z++)
        for (let x = cx - radius - 3; x <= cx + radius + 3; x++) {
          const key = x + ',' + z,
            entry = this.manifest[key];
          if (!entry) continue;
          const dist = Math.max(Math.abs(x - cx), Math.abs(z - cz)),
            sq = (x - cx) ** 2 + (z - cz) ** 2;
          if (entry.base)
            wanted.push({
              x,
              z,
              dist,
              priority: sq,
              kind: 'base',
              path: entry.base,
            });
          if (entry.detail && dist <= radius - 1)
            wanted.push({
              x,
              z,
              dist,
              priority: sq + 1,
              kind: 'detail',
              path: entry.detail,
            });
        }
      wanted.sort((a, b) => a.priority - b.priority);
      this.wanted = new Map(wanted.map((j) => [j.path, j]));
      for (const [path, mesh] of this.meshes)
        if (!this.wanted.has(path)) {
          mesh.removeFromParent();
          mesh.geometry.dispose();
          this.meshes.delete(path);
          this.revision++;
        }
      for (const [path, ctrl] of this.loading)
        if (!this.wanted.has(path)) ctrl.abort();
    }
    let started = 0;
    for (const [path, job] of this.wanted) {
      if (this.loading.size >= 3 || started >= 2) break;
      if (!this.meshes.has(path) && !this.loading.has(path)) {
        started++;
        this.load(job);
      }
    }
  }
  async load(job) {
    const { path } = job,
      ctrl = new AbortController();
    this.loading.set(path, ctrl);
    try {
      let data = this.cache.get(path);
      if (!data) {
        const res = await request(path, ctrl.signal);
        const bytes = await res.arrayBuffer(),
          header = new Uint8Array(bytes, 0, 2);
        // Some static hosts advertise Content-Encoding and the browser decodes on receipt.
        data =
          header[0] === 31 && header[1] === 139
            ? await new Response(
                new Blob([bytes])
                  .stream()
                  .pipeThrough(new DecompressionStream('gzip')),
              ).arrayBuffer()
            : bytes;
        if (this.dead || ctrl.signal.aborted) return;
        this.cache.set(path, data);
        this.bytes += data.byteLength;
        while (this.bytes > 12 * 1024 * 1024 && this.cache.size > 1) {
          const oldest = this.cache.keys().next().value;
          this.bytes -= this.cache.get(oldest).byteLength;
          this.cache.delete(oldest);
        }
      }
      if (this.dead || !this.wanted.has(path)) return;
      const mesh = new Mesh(decodeCity(data), this.surface.material);
      mesh.position.set(job.x * TILE, 0, job.z * TILE);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.receiveShadow = true;
      mesh.castShadow = job.kind === 'detail';
      mesh.renderOrder = job.kind === 'detail' ? 2 : 1;
      mesh.userData.walk = walkIndex(
        mesh.geometry,
        job.x * TILE,
        job.z * TILE,
        grade,
      );
      this.root.add(mesh);
      this.meshes.set(path, mesh);
      this.revision++;
    } catch (error) {
      if (!this.dead && !ctrl.signal.aborted) this.fail(error);
    } finally {
      this.loading.delete(path);
    }
  }
  surfaceHeight(x, z, base) {
    const chunk = this.manifest[tileAt(x) + ',' + tileAt(z)];
    if (!chunk) return base;
    for (const path of [chunk.base, chunk.detail]) {
      const mesh = this.meshes.get(path);
      if (mesh) base = mesh.userData.walk(x, z, base);
    }
    return base;
  }
  get nearReady() {
    for (const [path, j] of this.wanted)
      if (j.dist <= 1 && !this.meshes.has(path)) return false;
    return true;
  }
  get settled() {
    return this.meshes.size === this.wanted.size && !this.loading.size;
  }
  dispose() {
    this.dead = true;
    this.loading.forEach((c) => c.abort());
    this.meshes.forEach((m) => m.geometry.dispose());
    this.root.removeFromParent();
    this.meshes.clear();
    this.cache.clear();
    this.surface.dispose();
  }
}
