import {
  roads,
  roadLimits,
  along,
  offset,
  nodes,
  distance,
} from './network.js';
import { junctions, blend } from './junctions.js';
import { byRoad, parking } from './parcels.js';
import { crossings, stationsBetween } from './navigation.js';
import { signKind } from './signs.js';
import { MeshWriter, ink } from './mesh-writer.js';
const DECK = 0.045,
  PAINT = 0.064,
  WALK = 0.195;
const world = (p, f, l) => ({
  x: p.x + p.dx * f - p.dz * l,
  z: p.z + p.dz * f + p.dx * l,
});
function ribbon(w, r, start, end, left, right, height, mat, detail = false) {
  if (end <= start) return;
  const points = stationsBetween(r, start, end);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    w.flat(
      [offset(a, left), offset(b, left), offset(b, right), offset(a, right)],
      height,
      mat,
      detail,
    );
  }
}
function arrow(w, r, s, side, lane = 0) {
  const p = along(r, s),
    l = -side * r.section.lane * (lane + 0.5);
  const shape = (a, b, c, d) =>
    w.flat(
      [a, b, c, d].map(([f, t]) => world(p, f * side, l + t)),
      PAINT,
      ink.white,
      true,
    );
  if (lane === 0) {
    // A branch from the inside lane marks a permitted right turn in left-hand traffic.
    shape([-0.9, 0], [-0.52, 0], [0.15, 0.66 * side], [-0.18, 0.75 * side]);
    w.flat(
      [
        world(p, 0.37 * side, l + 0.54 * side),
        world(p, 0.15 * side, l + 1.04 * side),
        world(p, -0.37 * side, l + 0.69 * side),
      ],
      PAINT,
      ink.white,
      true,
    );
  }
  shape([-2.7, -0.14], [0.45, -0.14], [0.45, 0.14], [-2.7, 0.14]);
  w.flat(
    [
      [0.36, -0.73],
      [2.65, 0],
      [0.36, 0.73],
    ].map(([f, t]) => world(p, f * side, l + t)),
    PAINT,
    ink.white,
    true,
  );
}
function board(
  w,
  p,
  name,
  side,
  edge,
  h,
  width = 2.15,
  height = 0.43,
  ownPole = false,
) {
  if (ownPole) {
    const q = offset(p, side * edge);
    w.tube([q.x, 0.1, q.z], [q.x, h + 0.12, q.z], 0.075, 0.052, ink.metal);
  }
  const at = (l, y, u, v, d) => {
    const q = world(p, d, side * edge + l);
    return [q.x, y, q.z, u, v];
  };
  for (const d of [-0.032, 0.032]) {
    const sign = d > 0 ? 1 : -1;
    w.face(
      [
        at(-width / 2, h, sign > 0 ? 0 : 1, 0, d),
        at(width / 2, h, sign > 0 ? 1 : 0, 0, d),
        at(width / 2, h + height, sign > 0 ? 1 : 0, 1, d),
        at(-width / 2, h + height, sign > 0 ? 0 : 1, 1, d),
      ],
      [signKind(name), 255, 255, 255],
      true,
    );
  }
}
function lamp(w, p, side, edge, signal = false, name) {
  const h = signal ? 6.4 : 7.9,
    at = (f, l, y) => {
      const q = world(p, f, l * side);
      return [q.x, y, q.z];
    };
  w.tube(at(0, edge, 0.1), at(0, edge, 0.6), 0.2, 0.16, ink.dark);
  w.tube(at(0, edge, 0.58), at(0, edge, h), 0.135, 0.087, ink.trunk);
  const reach = signal ? 4.8 : 2.5;
  w.tube(
    at(0, edge, h - 0.25),
    at(0, edge - reach * 0.4, h + 0.38),
    0.09,
    0.065,
    ink.trunk,
  );
  w.tube(
    at(0, edge - reach * 0.4, h + 0.38),
    at(0, edge - reach, h + 0.39),
    0.068,
    0.052,
    ink.trunk,
  );
  const box = (f, l, y, dx, dy, dz, mat) => {
    const corners = [
      [-dx, -dz],
      [dx, -dz],
      [dx, dz],
      [-dx, dz],
    ].map(([x, z]) => world(p, f + x, (l + z) * side));
    for (let i = 0; i < 4; i++)
      w.strip(
        corners[i],
        corners[(i + 1) % 4],
        corners[(i + 1) % 4],
        corners[i],
        y - dy,
        y + dy,
        mat,
        true,
      );
    w.flat(corners, y + dy, mat, true);
    w.flat(corners, y - dy, mat, true);
  };
  if (name) board(w, p, name, side, edge, 3.55, 2.4, 0.51);
  if (!signal) {
    box(0, edge - reach, h + 0.3, 0.23, 0.09, 0.57, ink.dark);
    box(0, edge - reach, h + 0.2, 0.17, 0.018, 0.47, ink.lamp);
    return;
  }
  box(0, edge - reach, h - 0.24, 0.18, 0.6, 0.25, ink.dark);
  for (let j = 0; j < 3; j++) {
    const y = h + 0.08 - j * 0.33,
      base = edge - reach;
    // Signal faces look down the incoming approach.
    const ring = Array.from({ length: 9 }, (_, i) =>
      at(
        0.191,
        base + 0.119 * Math.cos((2 * Math.PI * i) / 9),
        y + 0.119 * Math.sin((2 * Math.PI * i) / 9),
      ),
    );
    w.face(ring, [ink.red, ink.amber, ink.green][j], true);
  }
}
function striped(w, r, start, end, l, width, step, mark, mat) {
  for (let s = start; s < end; s += step)
    ribbon(
      w,
      r,
      s,
      Math.min(s + mark, end),
      l - width / 2,
      l + width / 2,
      PAINT,
      mat,
      true,
    );
}
function buildSegment(w, r) {
  const [a, b] = roadLimits(r),
    sec = r.section,
    H = sec.half;
  const access = (byRoad.get(r.id) || []).filter(
    (p) => ['residential', 'luxury'].includes(p.zone) || p.use === 'parking',
  );
  const curbHeight = (s, side) => {
    let h = WALK;
    for (const p of access.filter((p) => p.frontage.side === side)) {
      const d =
        Math.abs(s - p.frontage.station) - (p.use === 'parking' ? 3.1 : 1.8);
      h = Math.min(
        h,
        0.061 + (WALK - 0.061) * Math.max(0, Math.min(1, d / 1.2)),
      );
    }
    for (const c of crossings.filter((c) => c.road === r.id)) {
      const d = Math.abs(s - c.s) - 1.4;
      h = Math.min(h, 0.061 + (WALK - 0.061) * Math.max(0, Math.min(1, d)));
    }
    return h;
  };
  const cuts = new Set(stationsBetween(r, a, b).map((p) => p.s));
  const special = access.map((p) => [
    p.frontage.station,
    p.use === 'parking' ? 3.1 : 1.8,
  ]);
  for (const c of crossings.filter((c) => c.road === r.id))
    special.push([c.s, 1.4]);
  for (const [s, half] of special)
    for (const v of [s - half - 1.2, s - half, s + half, s + half + 1.2])
      if (v > a && v < b) cuts.add(v);
  const cutsSorted = [...cuts].sort((u, v) => u - v).map((s) => along(r, s));
  for (let i = 1; i < cutsSorted.length; i++) {
    const p = cutsSorted[i - 1],
      q = cutsSorted[i];
    w.flat(
      [
        offset(p, -H + 0.33),
        offset(q, -H + 0.33),
        offset(q, H - 0.33),
        offset(p, H - 0.33),
      ],
      DECK,
      ink.asphalt,
    );
    for (const side of [-1, 1]) {
      const ring = (f, g, h1, h2, mat) =>
        w.quad(
          offset(p, f * side),
          offset(q, f * side),
          offset(q, g * side),
          offset(p, g * side),
          h1,
          h2,
          mat,
        );
      ring(H - 0.33, H, DECK, DECK, ink.gutter);
      if (!sec.walk) {
        ring(H, sec.outer, DECK, 0.012, ink.curb);
        continue;
      }
      const h1 = curbHeight(p.s, side),
        h2 = curbHeight(q.s, side),
        inner1 = offset(p, H * side),
        inner2 = offset(q, H * side);
      w.face(
        [
          [inner1.x, DECK, inner1.z],
          [inner2.x, DECK, inner2.z],
          [inner2.x, h2, inner2.z],
          [inner1.x, h1, inner1.z],
        ],
        ink.curb,
      );
      ring(H, H + 0.22, h1, h2, ink.curb);
      const lip1 = offset(p, (H + 0.22) * side),
        lip2 = offset(q, (H + 0.22) * side),
        outer1 = offset(p, sec.outer * side),
        outer2 = offset(q, sec.outer * side);
      w.face(
        [
          [lip1.x, h1, lip1.z],
          [lip2.x, h2, lip2.z],
          [outer2.x, WALK, outer2.z],
          [outer1.x, WALK, outer1.z],
        ],
        ink.pavers,
      );
      w.strip(outer1, outer2, outer2, outer1, 0.002, WALK, ink.curb);
    }
  }
  const margin = 6,
    start = a + margin,
    end = b - margin;
  if (start < end) {
    if (r.kind === 'residential' || r.kind === 'hill')
      striped(w, r, start, end, 0, 0.11, 8, 3, ink.yellow);
    else {
      for (const l of [-0.115, 0.115])
        ribbon(w, r, start, end, l - 0.06, l + 0.06, PAINT, ink.yellow);
    }
    if (sec.lanes >= 4) {
      for (let i = 1; i < sec.lanes / 2; i++)
        for (const sign of [-1, 1])
          striped(w, r, start, end, sign * i * sec.lane, 0.13, 9, 3, ink.white);
      for (const side of [-1, 1])
        ribbon(
          w,
          r,
          start,
          end,
          side * (H - 0.52) - 0.06,
          side * (H - 0.52) + 0.06,
          PAINT,
          ink.white,
        );
    }
  }
  for (const c of crossings.filter((c) => c.road === r.id)) {
    const sign = c.s < (a + b) / 2 ? 1 : -1;
    for (let l = -H + 0.6; l < H - 0.65; l += 0.84)
      ribbon(w, r, c.s - 1.35, c.s + 1.35, l, l + 0.39, PAINT, ink.white, true);
    const stop = c.s + sign * 2.48;
    if (c.node === 'K52') {
      for (let l = 0.5; l < H - 0.8; l += 1.35) {
        const p = along(r, stop);
        w.flat(
          [
            world(p, -sign * 0.4, l * sign - 0.4),
            world(p, -sign * 0.4, l * sign + 0.4),
            world(p, sign * 0.48, l * sign),
          ],
          PAINT,
          ink.white,
          true,
        );
      }
    } else
      ribbon(
        w,
        r,
        stop - 0.17,
        stop + 0.17,
        sign * 0.24,
        sign * (H - 0.55),
        PAINT,
        ink.white,
        true,
      );
    for (const side of [-1, 1])
      ribbon(
        w,
        r,
        c.s - 1.15,
        c.s + 1.15,
        side * (H + 0.4),
        side * (H + 0.85),
        0.112,
        ink.tactile,
        true,
      );
    if (sec.lanes >= 4 && r.length > 62)
      for (let lane = 0; lane < sec.lanes / 2; lane++)
        arrow(w, r, stop + sign * 6.5, -sign, lane);
    if (
      nodes.get(c.node).arms.some((a) => a.road.section.lanes >= 4) &&
      c.node !== 'K52'
    ) {
      const p = along(r, stop - 2 * sign);
      p.dx *= sign;
      p.dz *= sign;
      const cross = nodes
        .get(c.node)
        .arms.find((arm) => arm.road.name !== r.name);
      lamp(w, p, 1, H + 1.03, true, cross?.road.name);
    }
  }
  if (r.kind === 'hill')
    board(
      w,
      along(r, (a + b) / 2),
      '›  ›  ›',
      1,
      H + 1.15,
      1.65,
      1.46,
      0.56,
      true,
    );
  if (r.kind === 'highway' && r.a === 'passW')
    board(
      w,
      along(r, a + 18),
      'CITY CENTRE  ↑',
      1,
      H + 1.0,
      2.2,
      3.0,
      0.75,
      true,
    );
  for (const c of crossings.filter(
    (c) => c.road === r.id && c.node === 'K52',
  )) {
    const dir = c.s < (a + b) / 2 ? 1 : -1;
    board(
      w,
      along(r, c.s + dir * 9),
      'ORCHARD CIRCLE',
      dir,
      H + 1.05,
      2.2,
      2.6,
      0.62,
      true,
    );
  }
  // Flush utility covers, wheel wear and irregular resurfaced patches.
  if (r.length > 80) {
    const p = along(r, (a + b) * 0.5),
      side = r.section.lane * 0.66;
    const lid = Array.from({ length: 14 }, (_, i) =>
      world(
        p,
        0.34 * Math.cos((i * Math.PI) / 7),
        side + 0.34 * Math.sin((i * Math.PI) / 7),
      ),
    );
    w.flat(lid, 0.071, ink.metal, true);
    for (let i = -2; i <= 2; i++)
      w.flat(
        [
          world(p, -0.22, side + i * 0.08),
          world(p, 0.22, side + i * 0.08),
          world(p, 0.22, side + i * 0.08 + 0.025),
          world(p, -0.22, side + i * 0.08 + 0.025),
        ],
        0.085,
        ink.dark,
        true,
      );
    if (r.a.charCodeAt(r.a.length - 1) % 3 === 0) {
      const patch = [
        [-3, 0.6],
        [2.7, 0.45],
        [3.5, 1.9],
        [1.4, 2.55],
        [-3.1, 2.3],
      ].map(([f, l]) => world(p, f - 6, -l));
      w.flat(patch, 0.061, ink.patch, true);
    }
  }
  for (let s = a + 17; s < b - 9; s += 36) {
    const side = Math.floor((s - a) / 36) % 2 ? 1 : -1,
      p = along(r, s);
    lamp(w, p, side, H + (sec.walk ? 1.08 : 1.85));
    if (sec.walk) {
      const d = side * (H - 0.17);
      ribbon(
        w,
        r,
        s - 1.1,
        s - 0.34,
        d - 0.125,
        d + 0.125,
        0.058,
        ink.dark,
        true,
      );
      for (let t = s - 1.05; t < s - 0.34; t += 0.113)
        ribbon(w, r, t, t + 0.027, d - 0.12, d + 0.12, 0.071, ink.curb, true);
    }
  }
  for (const p of access) {
    const width = p.use === 'parking' ? 6.2 : 3.6,
      side = p.frontage.side,
      base = along(r, p.frontage.station);
    const f = (u, v) => world(base, u, v * side);
    const length = p.use === 'parking' ? 4 : 3.6;
    if (p.use === 'parking')
      board(
        w,
        along(r, p.frontage.station + width / 2 + 1.5),
        'P  /  PARKING',
        side,
        sec.outer + 0.6,
        1.65,
        1.6,
        0.48,
        true,
      );
    w.strip(
      f(-width / 2, sec.outer),
      f(width / 2, sec.outer),
      f(width / 2, sec.outer + length),
      f(-width / 2, sec.outer + length),
      WALK,
      0.04,
      ink.curb,
      true,
    );
  }
}
function buildJunction(w, j) {
  const { node, corners, rotary, islandRadius } = j,
    outline = [];
  for (const c of corners) {
    const { inner, lip, outer } = c;
    const first = offset(c.a.mouth, -c.a.road.section.half);
    outline.push(first, ...inner);
    for (let i = 1; i < inner.length; i++) {
      w.strip(
        inner[i - 1],
        inner[i],
        inner[i],
        inner[i - 1],
        DECK,
        WALK,
        ink.curb,
      );
      w.flat([inner[i - 1], inner[i], lip[i], lip[i - 1]], WALK, ink.curb);
      w.flat([lip[i - 1], lip[i], outer[i], outer[i - 1]], WALK, ink.pavers);
      w.strip(
        outer[i - 1],
        outer[i],
        outer[i],
        outer[i - 1],
        0.004,
        WALK,
        ink.curb,
      );
    }
  }
  if (rotary) {
    for (const arm of node.arms) {
      const p = {
        x: node.x + Math.cos(arm.angle) * (islandRadius - 2.6),
        z: node.z + Math.sin(arm.angle) * (islandRadius - 2.6),
        dx: Math.cos(arm.angle),
        dz: Math.sin(arm.angle),
      };
      const throat = { ...node, dx: p.dx, dz: p.dz };
      // Tapered approach refuge between entering and exiting traffic.
      const shape = [
        [19, 0],
        [21, 0.68],
        [26, 1.02],
        [28.6, 0.48],
        [29, 0],
        [28.6, -0.48],
        [26, -1.02],
        [21, -0.68],
      ].map(([f, l]) => world(throat, f, l));
      w.flat(shape, 0.18, ink.pavers);
      shape.forEach((a, i) => {
        const b = shape[(i + 1) % shape.length];
        w.strip(a, b, b, a, DECK, 0.18, ink.curb);
      });
      board(w, p, '‹  ‹  ‹', 1, 0, 0.94, 1.78, 0.47, true);
    }
  }
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i],
      q = outline[(i + 1) % outline.length];
    if (!rotary) {
      w.flat([node, p, q], DECK, ink.asphalt);
      continue;
    }
    const inner = (p, r) => blend(node, p, r / distance(node, p)),
      angA = Math.atan2(p.z - node.z, p.x - node.x);
    let delta = Math.atan2(q.z - node.z, q.x - node.x) - angA;
    while (delta < -0.000001) delta += Math.PI * 2;
    const count = Math.max(1, Math.ceil(delta / 0.14));
    if (distance(p, q) < 0.01) continue;
    // Radial tessellation retains the exact mouth edge while the island follows a circle.
    for (let k = 0; k < count; k++) {
      const a = blend(p, q, k / count),
        b = blend(p, q, (k + 1) / count),
        ia = inner(a, islandRadius),
        ib = inner(b, islandRadius);
      w.flat([a, b, ib, ia], DECK, ink.asphalt);
      w.flat(
        [ia, ib, inner(b, islandRadius - 1.35), inner(a, islandRadius - 1.35)],
        0.105,
        ink.pavers,
      );
      w.strip(ia, ib, ib, ia, DECK, 0.105, ink.curb);
      const ga = inner(a, islandRadius - 1.35),
        gb = inner(b, islandRadius - 1.35);
      w.strip(ga, gb, gb, ga, 0.105, 0.25, ink.curb);
      w.flat([node, ga, gb], 0.25, [5, 207, 202, 172]);
      w.flat(
        [
          inner(a, islandRadius + 0.28),
          inner(b, islandRadius + 0.28),
          inner(b, islandRadius + 0.41),
          inner(a, islandRadius + 0.41),
        ],
        PAINT,
        ink.white,
        true,
      );
    }
  }
}
function buildParking(w, p) {
  const r = roads.find((r) => r.id === p.frontage.roadId),
    t = along(r, p.frontage.station),
    side = p.frontage.side;
  const f = (u, v) => world(t, u, side * (r.section.outer + 2.5 + v));
  w.flat(
    [
      f(-p.width / 2, 0),
      f(p.width / 2, 0),
      f(p.width / 2, p.depth),
      f(-p.width / 2, p.depth),
    ],
    0.032,
    ink.patch,
  );
  for (let x = -p.width / 2 + 1; x <= p.width / 2 - 1; x += 2.65) {
    w.flat(
      [
        f(x, p.depth - 5.8),
        f(x + 0.105, p.depth - 5.8),
        f(x + 0.105, p.depth - 0.6),
        f(x, p.depth - 0.6),
      ],
      0.051,
      ink.white,
      true,
    );
    if (Math.abs(x) > 4)
      w.flat(
        [f(x, 0.55), f(x + 0.105, 0.55), f(x + 0.105, 5.65), f(x, 5.65)],
        0.051,
        ink.white,
        true,
      );
  }
}
export function compileCity() {
  const writer = new MeshWriter();
  for (const r of roads) buildSegment(writer, r);
  for (const j of junctions.values()) buildJunction(writer, j);
  for (const p of parking) buildParking(writer, p);
  return writer.tiles;
}
