import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASE,
  NEAR,
  TILE,
  district,
  plannedHalfSize,
  tileAt,
} from '../src/data/world.js';
import { generate } from '../src/terrain/generate.js';
import { layout, triangleAt } from '../src/terrain/topology.js';
import { groundHeight, surfaceAt } from '../src/world/queries.js';
import { elevation } from '../src/terrain/field.js';

function edge(mesh, axis, value) {
  const out = [];
  for (let i = 0; i < mesh.position.length; i += 3)
    if (mesh.position[i + axis] === value) {
      out.push([
        mesh.position[i + 2 - axis],
        mesh.position[i + 1],
        ...mesh.normal.slice(i, i + 3),
      ]);
    }
  return out.sort((a, b) => a[0] - b[0]);
}

test('equal and mixed LOD borders match exactly, including world normals, in both axes', () => {
  for (const [x, z] of [
    [-4, -4],
    [-1, -1],
    [0, 0],
    [3, 3],
    [-19, 18],
    [18, -19],
  ])
    for (const a of [BASE, 16, NEAR])
      for (const b of [BASE, 16, NEAR]) {
        const first = generate(x, z, a);
        assert.deepEqual(
          edge(first, 0, TILE),
          edge(generate(x + 1, z, b), 0, 0),
        );
        assert.deepEqual(
          edge(first, 2, TILE),
          edge(generate(x, z + 1, b), 2, 0),
        );
      }
});
test('each LOD fully tiles its footprint once with consistently wound triangles', () => {
  for (const n of [BASE, 16, NEAR]) {
    const { coords, index } = layout(n);
    let area = 0;
    const edges = new Map();
    for (let i = 0; i < index.length; i += 3) {
      const [a, b, c] = Array.from(index.slice(i, i + 3), (v) => v * 2);
      const twice =
        (coords[b + 1] - coords[a + 1]) * (coords[c] - coords[a]) -
        (coords[b] - coords[a]) * (coords[c + 1] - coords[a + 1]);
      assert.ok(twice > 0);
      area += twice / 2;
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const k = [Math.min(u, v), Math.max(u, v)].join(',');
        edges.set(k, (edges.get(k) || 0) + 1);
      }
    }
    assert.equal(area, TILE * TILE);
    let boundary = 0;
    for (const [key, count] of edges) {
      if (count === 2) continue;
      const [a, b] = key.split(',').map(Number);
      assert.equal(count, 1);
      assert.ok(
        [0, 1].some(
          (d) =>
            coords[a + d] === coords[b + d] &&
            [0, TILE].includes(coords[a + d]),
        ),
      );
      boundary++;
    }
    assert.equal(boundary, 4 * BASE);
  }
});
test('ground queries intersect actual rendered triangles including stitched rings', () => {
  for (const n of [BASE, 16, NEAR]) {
    const mesh = generate(-1, 2, n);
    for (let i = 0; i < mesh.index.length; i += 3) {
      const [a, b, c] = Array.from(mesh.index.slice(i, i + 3), (j) => j * 3);
      const v = (d) =>
        0.25 * mesh.position[a + d] +
        0.35 * mesh.position[b + d] +
        0.4 * mesh.position[c + d];
      assert.ok(
        Math.abs(groundHeight(-TILE + v(0), 2 * TILE + v(2), n) - v(1)) < 1e-6,
      );
    }
    for (const x of [0, 1, 252, 255, 256])
      for (const z of [0, 0.1, 60, 255.99, 256]) assert.ok(triangleAt(n, x, z));
  }
});
test('regeneration and surface identities are deterministic across signed coordinates', () => {
  assert.deepEqual(generate(-2, 3, 16), generate(-2, 3, 16));
  assert.deepEqual(surfaceAt(-0.01, 0), surfaceAt(-0.01, 0));
  assert.equal(surfaceAt(-0.01, 0).id, 'kestrel/terrain/-1/0/surface');
  assert.equal(tileAt(-256.001), -2);
  for (const p of [-plannedHalfSize, plannedHalfSize])
    assert.ok(Number.isFinite(elevation(p, p)));
  assert.equal((district.halfSize * 2) ** 2 / 1e6, 4.194304);
  assert.ok(
    (plannedHalfSize * 2) ** 2 / 1e6 > 80 &&
      (plannedHalfSize * 2) ** 2 / 1e6 < 100,
  );
});

test('the contiguous alluvial terrace provides a gentle planning surface', () => {
  for (let z = -260; z <= 260; z += 40) {
    const x = -130 - 185 * Math.sin(z / 540);
    for (const offset of [-80, 0, 80])
      assert.ok(surfaceAt(x + offset, z).slopeDegrees < 3);
  }
});
