import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, MeshStandardMaterial } from 'three';
import { prepareJob } from '../src/terrain/generate.js';
import { WorldStreamer, planWindow } from '../src/world/streamer.js';
import { BASE, SECTOR, presets } from '../src/data/world.js';
import { layout } from '../src/terrain/topology.js';

test('resident window is bounded independently of total world size', () => {
  for (const p of Object.values(presets))
    for (const [x, z] of [
      [0, 0],
      [3, -4],
      [-19, 18],
      [1000, -2000],
    ]) {
      const window = planWindow(x, z, p);
      assert.equal(
        window.size,
        (2 * p.radius + 1) ** 2 + (2 * p.sectors + 1) ** 2,
      );
    }
});
test('streamer swaps coverage atomically, returns old tiles to coarse terrain and discards stale work', () => {
  const workers = [];
  globalThis.Worker = class {
    constructor() {
      workers.push(this);
    }
    postMessage(job) {
      this.job = job;
    }
    flush() {
      if (this.job) {
        const job = this.job;
        this.job = null;
        this.onmessage({ data: { job, buffers: prepareJob(job) } });
      }
    }
    terminate() {
      this.stopped = true;
    }
  };
  const material = new MeshStandardMaterial(),
    s = new WorldStreamer(new Scene(), material, (e) => {
      throw e;
    });
  const stride = layout(BASE).index.length;
  function checkCoverage() {
    for (const sector of s.sectors.values())
      for (let j = 0; j < SECTOR * SECTOR; j++) {
        const tx = sector.x * SECTOR + (j % SECTOR),
          tz = sector.z * SECTOR + Math.floor(j / SECTOR);
        const detail = s.tiles.has(tx + ',' + tz),
          start = j * stride;
        const indices = sector.mesh.geometry.index.array;
        for (const k of [0, 1, stride - 2, stride - 1])
          assert.equal(
            indices[start + k],
            detail ? 0 : sector.original[start + k],
          );
      }
  }
  function tick(pos, p) {
    s.update(pos, p);
    checkCoverage();
    workers.forEach((w) => w.flush());
  }
  function settle(pos, p) {
    for (let i = 0; i < 200; i++) {
      tick(pos, p);
      if (s.settled) return;
    }
    assert.fail('Window failed to settle');
  }
  const a = { x: 380, z: 680 },
    b = { x: -980, z: -880 };
  settle(a, presets.medium);
  const initial = s.root.children.length;
  const old = [...s.tiles.values()][0].mesh.geometry;
  let disposed = false;
  old.addEventListener('dispose', () => (disposed = true));
  tick(b, presets.high);
  tick(a, presets.low);
  tick(b, presets.medium);
  settle(b, presets.medium);
  settle(a, presets.medium);
  assert.equal(s.root.children.length, initial);
  assert.ok(disposed);
  assert.ok(s.unloads > 0);
  assert.equal(s.pending.size, 0);
  assert.equal(s.ready.length, 0);
  const sector = s.sectors.values().next().value;
  assert.ok(sector.mesh.geometry.boundingSphere.radius > 0);
  s.dispose();
  material.dispose();
  assert.equal(s.root.children.length, 0);
  assert.ok(workers.every((w) => w.stopped));
  delete globalThis.Worker;
});
