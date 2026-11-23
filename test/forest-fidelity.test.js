import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { generateForestTile } from '../src/forest/distribution.js';
import { forestWindow, qualityLevels } from '../src/forest/window.js';
import { ForestLayer } from '../src/forest/layer.js';
import bounds from '../src/forest/portraits.json' with { type: 'json' };

test('forest records match the approved population, including all three terrain heights', () => {
  const reference = [
    [-3, 7, '583ae68ba04d649c9d07866029ddbd4d6ca238c51520464389161354385daa97'],
    [-3, 8, 'ee7a3393885b9bf4f11ea66ccc8d9331b06d354cdf2e8885968c4b45de2a8890'],
    [
      -8,
      -6,
      '571ed640cd76d9f529c1f5a90c17d19662a7d0db52c04b01aa4c5e3267b95c8e',
    ],
    [1, 12, '39ebc8ac6f09a0cdc3626ee7b1cf14469463967fb3220637a7a64c17f57cb9e2'],
  ];
  for (const [x, z, hash] of reference)
    assert.equal(
      createHash('sha256').update(generateForestTile(x, z)).digest('hex'),
      hash,
    );
});
test('travelling across a tile boundary retains every tile inside either side of the visible horizon', () => {
  for (const { radius } of Object.values(qualityLevels)) {
    const left = forestWindow(-3, 7, radius),
      right = forestWindow(-2, 7, radius);
    const keys = new Set(right.map((t) => t.key));
    for (const t of left) {
      // Eye just crossing x=-512, anywhere on this edge.
      const dx = Math.max(0, -512 - (t.x + 1) * 256, t.x * 256 + 512);
      const dz = Math.max(0, (7 - t.z - 1) * 256, (t.z - 8) * 256);
      if (Math.hypot(dx, dz) < radius) assert.ok(keys.has(t.key));
    }
  }
});
test('arrival holds until both portraits and the resident neighbourhood are ready', () => {
  const layer = Object.create(ForestLayer.prototype);
  Object.assign(layer, {
    tx: -3,
    tz: 7,
    canopy: { ready: false },
    tiles: new Map(),
    wanted: new Set(['-3,7', '-2,7', '-3,8', '-5,7']),
  });
  for (const key of ['-3,7', '-3,8']) layer.tiles.set(key, {});
  assert.equal(layer.arrivalReady, false);
  layer.canopy.ready = true;
  assert.equal(layer.arrivalReady, false);
  layer.tiles.set('-2,7', {});
  assert.equal(layer.arrivalReady, true);
  layer.tx = -5;
  assert.equal(layer.arrivalReady, false);
});
test('each species has registered silhouettes at three elevations, including sixteen Scots pine bearings', () => {
  assert.equal(bounds.length, (4 * 8 + 16) * 3);
  for (const [l, b, r, t] of bounds)
    assert.ok(l >= 0 && b >= 0 && r > l && t > b && r <= 1 && t <= 1);
});
test('Scots pine mipmaps keep needle colour and masked coverage across useful resolutions', () => {
  const data = gunzipSync(
    readFileSync(
      new URL('../public/assets/trees/pine-needle-mips.bin', import.meta.url),
    ),
  );
  let w = data.readUInt32LE(0),
    h = data.readUInt32LE(4),
    off = 8,
    coverage;
  assert.equal(w, 1024);
  assert.equal(h, 1024);
  while (w) {
    let visible = 0,
      green = 0,
      padded = 0;
    for (let i = off; i < off + w * h * 4; i += 4) {
      if (data[i + 3] >= 128) {
        visible++;
        green += data[i + 1];
      } else if (!data[i + 3] && data[i + 1] > 15) padded++;
    }
    if (w >= 8) {
      coverage ??= visible / (w * h);
      assert.ok(Math.abs(visible / (w * h) - coverage) < 0.012);
      assert.ok(green / visible > 55);
      if (w >= 256) assert.ok(padded > 100);
    }
    off += w * h * 4;
    w >>= 1;
    h >>= 1;
  }
  assert.equal(off, data.length);
});
