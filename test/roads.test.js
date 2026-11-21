import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  roads,
  nodes,
  along,
  roadLimits,
  offset,
  grade,
  rotaryId,
} from '../src/roads/network.js';
import {
  footGraph,
  vehicleGraph,
  crossings,
  lanes,
  route,
} from '../src/roads/navigation.js';
import { junctions } from '../src/roads/junctions.js';
import {
  parcels,
  parking,
  validateParcel,
  zones,
  overlap,
  inside,
  zoneAt,
} from '../src/roads/parcels.js';
import { groundHeight } from '../src/world/queries.js';
import { elevation, naturalElevation } from '../src/terrain/field.js';
import { cityAssets } from '../scripts/city-assets.js';
import { decodeCity } from '../src/roads/layer.js';
const cross = (a, b, c) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function reachable(g, start) {
  const seen = new Set([start]),
    q = [start];
  while (q.length) {
    for (const e of g.get(q.pop()) || [])
      if (!seen.has(e.to)) {
        seen.add(e.to);
        q.push(e.to);
      }
  }
  return seen;
}

test('master routes are connected, within design grades and cross only at planned nodes', () => {
  const visited = new Set(['gate']),
    queue = ['gate'];
  while (queue.length) {
    for (const { road: r } of nodes.get(queue.pop()).arms)
      for (const id of [r.a, r.b])
        if (!visited.has(id)) {
          visited.add(id);
          queue.push(id);
        }
  }
  assert.equal(visited.size, nodes.size);
  assert.equal(new Set(roads.map((r) => r.kind)).size, 8);
  for (const r of roads) {
    assert.ok(roadLimits(r)[1] > roadLimits(r)[0] + 10);
    assert.ok(r.section.lane >= 2.75 && r.section.lane <= 3.6);
    for (let i = 1; i < r.samples.length; i++) {
      const a = r.samples[i - 1],
        b = r.samples[i];
      assert.ok(
        Math.abs(grade(a.x, a.z) - grade(b.x, b.z)) / (b.s - a.s) < 0.075,
      );
    }
  }
  for (let i = 0; i < roads.length; i++)
    for (let j = i + 1; j < roads.length; j++) {
      const a = roads[i],
        b = roads[j];
      if ([a.a, a.b].includes(b.a) || [a.a, a.b].includes(b.b)) continue;
      for (let k = 1; k < a.samples.length; k++)
        for (let l = 1; l < b.samples.length; l++) {
          const p = a.samples[k - 1],
            q = a.samples[k],
            r = b.samples[l - 1],
            s = b.samples[l];
          assert.ok(
            !(
              cross(p, q, r) * cross(p, q, s) < 0 &&
              cross(r, s, p) * cross(r, s, q) < 0
            ),
            'unplanned crossing ' + a.id + ' ' + b.id,
          );
        }
    }
});
test('junction pavement has a nonoverlapping radial fan and continuous section mouths', () => {
  for (const j of junctions.values()) {
    const outline = j.corners.flatMap((c) => [
      offset(c.a.mouth, -c.a.road.section.half),
      ...c.inner,
    ]);
    for (let i = 0; i < outline.length; i++)
      assert.ok(
        cross(j.node, outline[i], outline[(i + 1) % outline.length]) >= -1e-6,
        j.node.id,
      );
    for (const c of j.corners) {
      assert.deepEqual(c.inner[0], offset(c.a.mouth, c.a.road.section.half));
      const end = offset(c.b.mouth, -c.b.road.section.half);
      assert.ok(
        Math.hypot(c.inner.at(-1).x - end.x, c.inner.at(-1).z - end.z) < 1e-6,
      );
      for (const p of c.outer)
        for (const n of [8, 16, 32])
          assert.ok(
            Math.abs(groundHeight(p.x, p.z, n) - grade(p.x, p.z)) < 0.0001,
          );
    }
  }
  assert.ok(junctions.get(rotaryId).islandRadius > 10);
});
test('all pavement rims meet the rendered terrain in every LOD and protected ridges retain their elevations', () => {
  for (const road of roads)
    for (const p of road.samples.filter((_, i) => i % 3 === 0)) {
      for (const l of [-road.section.outer, 0, road.section.outer]) {
        const q = offset(p, l);
        for (const resolution of [8, 16, 32])
          assert.ok(
            Math.abs(groundHeight(q.x, q.z, resolution) - grade(q.x, q.z)) <
              0.0001,
            road.id,
          );
      }
    }
  for (const p of [
    [760, 255],
    [-890, -745],
    [992, -950],
  ])
    assert.equal(elevation(...p), naturalElevation(...p));
});
test('all parcels have valid frontage, buildable envelopes, stable IDs and separate easements', () => {
  assert.equal(new Set(parcels.map((p) => p.id)).size, parcels.length);
  for (const [i, p] of parcels.entries()) {
    assert.equal(validateParcel(p, parcels.slice(i + 1)), null, p.id);
    assert.ok(p.envelope.every((c) => inside(c, p.corners)));
    assert.ok(p.corners.every((q) => zoneAt(q) === p.zone));
    const r = roads.find((r) => r.id === p.frontage.roadId),
      anchor = along(r, p.frontage.station);
    assert.ok(
      Math.abs(
        Math.hypot(p.entrance.x - anchor.x, p.entrance.z - anchor.z) -
          r.section.outer -
          2.5,
      ) < 0.0001,
    );
  }
  assert.equal(parking.length, 4);
  for (const k of Object.keys(zones).filter((k) => k !== 'green'))
    assert.ok(parcels.some((p) => p.zone === k && p.use === 'building'));
  const sample = parcels[0];
  assert.equal(validateParcel(sample, [{ ...sample }]), 'parcel overlap');
});
test('vehicle and pedestrian paths join, crossings span the carriageway and the rotary is one-way', () => {
  const begin = [...lanes.values()].find(
    (l) => l.road.endsWith('passS-gate') && l.direction === -1 && l.index === 0,
  );
  const seen = reachable(vehicleGraph, begin.from),
    foot = reachable(footGraph, footGraph.keys().next().value);
  assert.equal(foot.size, footGraph.size);
  for (const r of roads)
    assert.ok(
      [...lanes.values()].some((l) => l.road === r.id && seen.has(l.to)),
      r.id,
    );
  const dst = [...lanes.values()].find((l) =>
    l.road.includes('terraceW-terraceS'),
  );
  assert.ok(route(vehicleGraph, begin.from, dst.to).length > 2);
  for (const [id, edges] of vehicleGraph)
    if (id.startsWith('ring/'))
      assert.equal(edges.filter((e) => e.type === 'circulate').length, 1);
  for (const c of crossings) {
    const r = roads.find((r) => r.id === c.road),
      p = along(r, c.s);
    const [a, b] = c.points;
    assert.ok(Math.abs((b.x - a.x) * p.dx + (b.z - a.z) * p.dz) < 0.001);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 2 * r.section.half);
  }
});
test('packed city meshes are deterministic, tile-local and retain identical centimetre boundaries', () => {
  const files = cityAssets(),
    again = cityAssets();
  const hash = (b) => createHash('sha256').update(b).digest('hex');
  const rims = new Map();
  for (const [path, bytes] of files) {
    assert.equal(hash(bytes), hash(again.get(path)));
    if (!path.endsWith('base.road')) continue;
    const [x, z] = path.split('/')[1].split(',').map(Number);
    const raw = gunzipSync(bytes),
      geometry = decodeCity(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      );
    const pos = geometry.attributes.position.array,
      surface = geometry.attributes.surface.array,
      nn = geometry.attributes.normal.array;
    for (let i = 0; i < pos.length; i += 3) {
      const lx = Math.round(pos[i] * 100),
        lz = Math.round(pos[i + 2] * 100);
      assert.ok(lx >= 0 && lx <= 25600 && lz >= 0 && lz <= 25600);
      if (surface[i / 3] !== 0 || nn[i + 1] < 100) continue;
      assert.ok(
        Math.abs(
          pos[i + 1] - grade(x * 256 + pos[i], z * 256 + pos[i + 2]) - 0.045,
        ) < 0.019,
      );
      if (lx === 0 || lz === 0 || lx === 25600 || lz === 25600) {
        const k = [
          x * 25600 + lx,
          z * 25600 + lz,
          Math.round(pos[i + 1] * 100),
        ].join(',');
        if (!rims.has(k)) rims.set(k, new Set());
        rims.get(k).add(x + ',' + z);
      }
    }
    geometry.dispose();
  }
  assert.ok(rims.size > 150);
  const matched = [...rims.values()].filter((t) => t.size >= 2).length;
  assert.equal(
    matched,
    rims.size,
    'every clipped asphalt boundary must match on the adjacent tile',
  );
});

test('Phase 3 entrances and parking courts are reachable and green reservations stay unbuilt', async () => {
  const { greenReservations } = await import('../src/roads/parcels.js');
  const pedestrians = reachable(footGraph, footGraph.keys().next().value);
  const inbound = [...lanes.values()].find(
    (l) => l.road.endsWith('passS-gate') && l.direction === -1,
  );
  const vehicles = reachable(vehicleGraph, inbound.from);
  for (const p of parcels) {
    assert.ok(pedestrians.has(p.id + '/entrance'));
    if (p.use === 'parking') {
      assert.ok(vehicles.has(p.id + '/parking'));
      assert.equal(p.maxFootprint.area, 0);
    } else
      assert.ok(
        p.maxFootprint.area < p.width * p.depth && p.maxFootprint.area > 0,
      );
  }
  for (const reserve of greenReservations) {
    assert.ok(reserve.points.every((p) => zoneAt(p) === 'green'));
    assert.ok(parcels.every((p) => !overlap(reserve.points, p.corners)));
  }
});
