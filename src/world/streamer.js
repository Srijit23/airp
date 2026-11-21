import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  Mesh,
} from 'three';
import { BASE, NEAR, SECTOR, TILE, key, tileAt } from '../data/world.js';
import { layout } from '../terrain/topology.js';

const sectorFor = (x, z) => key(Math.floor(x / SECTOR), Math.floor(z / SECTOR));

export function planWindow(tx, tz, preset, prior = new Map()) {
  const jobs = new Map();
  const sx = Math.floor(tx / SECTOR),
    sz = Math.floor(tz / SECTOR);
  for (let dz = -preset.sectors; dz <= preset.sectors; dz++)
    for (let dx = -preset.sectors; dx <= preset.sectors; dx++) {
      const x = sx + dx,
        z = sz + dz,
        id = key(x, z);
      jobs.set('s' + id, {
        id: 's' + id,
        key: id,
        kind: 'sector',
        x,
        z,
        n: BASE,
        order: dx * dx + dz * dz,
      });
    }
  for (let dz = -preset.radius; dz <= preset.radius; dz++)
    for (let dx = -preset.radius; dx <= preset.radius; dx++) {
      const x = tx + dx,
        z = tz + dz,
        id = key(x, z),
        dist = Math.hypot(dx, dz);
      // Half a chunk of hysteresis at the fine/medium boundary.
      const keepFine = prior.get(id)?.n === NEAR;
      const n = dist <= preset.detail + 0.44 + (keepFine ? 0.5 : 0) ? NEAR : 16;
      jobs.set('t' + id, {
        id: 't' + id,
        key: id,
        kind: 'tile',
        x,
        z,
        n,
        order: 12 + dist,
      });
    }
  return jobs;
}

function makeMesh(buffers, material) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.position, 3));
  geometry.setAttribute('normal', new BufferAttribute(buffers.normal, 3));
  geometry.setIndex(new BufferAttribute(buffers.index, 1));
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export class WorldStreamer {
  constructor(scene, material, onError, workers = 2) {
    this.root = new Group();
    scene.add(this.root);
    this.material = material;
    this.tiles = new Map();
    this.sectors = new Map();
    this.pending = new Set();
    this.ready = [];
    this.wanted = new Map();
    this.queue = [];
    this.center = '';
    this.loads = 0;
    this.unloads = 0;
    this.pool = Array.from({ length: workers }, () => {
      const thread = new Worker(
        new URL('../terrain/worker.js', import.meta.url),
        { type: 'module' },
      );
      const slot = { thread, busy: false };
      thread.onmessage = ({ data }) => {
        slot.busy = false;
        if (data.error) {
          onError(new Error(data.error));
          return;
        }
        this.ready.push(data);
        this.dispatch();
      };
      thread.onerror = (e) =>
        onError(new Error(e.message || 'Terrain worker failed'));
      return slot;
    });
  }
  // Only one surface covers a tile at any time. Keep its coarse sector visible
  // until the worker's replacement is installed in the same animation frame.
  mask(x, z, hidden) {
    const sector = this.sectors.get(sectorFor(x, z));
    if (!sector) return;
    const lx = x - sector.x * SECTOR,
      lz = z - sector.z * SECTOR;
    const attr = sector.mesh.geometry.index,
      stride = layout(BASE).index.length;
    const offset = (lz * SECTOR + lx) * stride;
    if (hidden) attr.array.fill(0, offset, offset + stride);
    else
      attr.array.set(sector.original.subarray(offset, offset + stride), offset);
    attr.addUpdateRange(offset, stride);
    attr.needsUpdate = true;
  }
  remove(entry) {
    this.root.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    this.unloads++;
  }
  update(position, preset) {
    const tx = tileAt(position.x),
      tz = tileAt(position.z),
      center = key(tx, tz);
    if (center !== this.center || preset !== this.preset) {
      this.wanted = planWindow(tx, tz, preset, this.tiles);
      this.center = center;
      this.preset = preset;
      for (const [id, t] of this.tiles)
        if (!this.wanted.has('t' + id)) {
          this.mask(t.x, t.z, false);
          this.remove(t);
          this.tiles.delete(id);
        }
      for (const [id, s] of this.sectors)
        if (!this.wanted.has('s' + id)) {
          this.remove(s);
          this.sectors.delete(id);
        }
      this.queue = [...this.wanted.values()].sort((a, b) => a.order - b.order);
    }
    for (let i = 0; i < 3 && this.ready.length; i++) {
      const { job, buffers } = this.ready.shift();
      this.pending.delete(job.id);
      const wanted = this.wanted.get(job.id);
      if (!wanted || wanted.n !== job.n) continue;
      const mesh = makeMesh(buffers, this.material);
      const span = job.kind === 'sector' ? SECTOR : 1;
      mesh.position.set(job.x * span * TILE, 0, job.z * span * TILE);
      mesh.updateMatrix();
      const entry = { ...job, mesh };
      if (job.kind === 'sector') {
        entry.original = buffers.index.slice();
        mesh.geometry.index.setUsage(DynamicDrawUsage);
        this.sectors.set(job.key, entry);
        for (const t of this.tiles.values())
          if (sectorFor(t.x, t.z) === job.key) this.mask(t.x, t.z, true);
      } else {
        const previous = this.tiles.get(job.key);
        if (previous) this.remove(previous);
        this.tiles.set(job.key, entry);
        this.mask(job.x, job.z, true);
        mesh.castShadow = true;
      }
      this.root.add(mesh);
      this.loads++;
    }
    this.dispatch();
  }
  dispatch() {
    // Workers can prepare the next frame while the GPU renders this one.
    for (const slot of this.pool) {
      if (this.ready.length >= 6) break;
      if (slot.busy) continue;
      const job = this.queue.find((j) => {
        const map = j.kind === 'sector' ? this.sectors : this.tiles;
        return map.get(j.key)?.n !== j.n && !this.pending.has(j.id);
      });
      if (!job) break;
      this.pending.add(job.id);
      slot.busy = true;
      slot.thread.postMessage(job);
    }
  }
  get covered() {
    return (
      this.preset && this.sectors.size === (2 * this.preset.sectors + 1) ** 2
    );
  }
  get settled() {
    return (
      this.covered &&
      this.pending.size === 0 &&
      this.tiles.size === (2 * this.preset.radius + 1) ** 2
    );
  }
  resolutionAt(x, z) {
    return this.tiles.get(key(tileAt(x), tileAt(z)))?.n ?? BASE;
  }
  dispose() {
    this.pool.forEach((s) => s.thread.terminate());
    for (const map of [this.tiles, this.sectors]) {
      map.forEach((t) => this.remove(t));
      map.clear();
    }
    this.root.removeFromParent();
    this.ready = [];
    this.queue = [];
  }
}
