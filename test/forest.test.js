import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateForestTile,
  isProtected,
  STRIDE,
} from '../src/forest/distribution.js';
import { groundHeight } from '../src/world/queries.js';
import { stations } from '../src/data/world.js';
import { parcels } from '../src/roads/parcels.js';
import { roads } from '../src/roads/network.js';

test('forest regeneration and stitched terrain heights are stable at each detail level', () => {
  const a = generateForestTile(-8, -6);
  assert.ok(a.length / STRIDE > 80);
  assert.deepEqual(generateForestTile(-8, -6), a);
  for (let i = 0; i < a.length; i += STRIDE) {
    const x = -2048 + a[i],
      z = -1536 + a[i + 1];
    for (const [j, n] of [8, 16, 32].entries())
      assert.ok(Math.abs(groundHeight(x, z, n) - a[i + 2 + j]) < 0.001);
    assert.ok(!isProtected(x, z, 2));
  }
});
test('protect roads, lots, landings, demonstration clearing and shoreline', () => {
  for (const r of roads)
    for (const p of r.samples.filter((_, i) => i % 13 === 0))
      assert.ok(isProtected(p.x, p.z, 4));
  for (const p of parcels) assert.ok(isProtected(p.center.x, p.center.z, 3));
  for (const p of stations) assert.ok(isProtected(p.x, p.z, 4));
  assert.ok(isProtected(-380, 405, 3));
  assert.equal(generateForestTile(0, 16).length, 0);
});

test('highlands favor conifers and dry lowlands admit all five species', () => {
  function counts(x, z) {
    const records = generateForestTile(x, z),
      out = [0, 0, 0, 0, 0];
    for (let i = 5; i < records.length; i += STRIDE) out[records[i]]++;
    return out;
  }
  const high = counts(-7, -6),
    low = counts(-3, 7);
  assert.equal(high[4], 0);
  assert.ok(high[1] + high[2] > 8 * (high[0] + high[3]));
  assert.ok(low.every((n) => n > 0));
  assert.ok(low[0] > low[1]);
});

test('trunks retain minimum separation across the shared edge of two populated tiles', () => {
  const previous = new Map();
  for (const tx of [-8, -7]) {
    const trees = generateForestTile(tx, -6);
    for (let k = 0; k < trees.length; k += STRIDE) {
      const x = tx * 256 + trees[k],
        z = trees[k + 1],
        cx = Math.floor(x / 2),
        cz = Math.floor(z / 2);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          for (const [px, pz] of previous.get(cx + dx + ',' + (cz + dz)) || [])
            assert.ok(Math.hypot(x - px, z - pz) >= 1.53);
      const key = cx + ',' + cz;
      if (!previous.has(key)) previous.set(key, []);
      previous.get(key).push([x, z]);
    }
  }
});
