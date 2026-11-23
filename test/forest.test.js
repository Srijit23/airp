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
