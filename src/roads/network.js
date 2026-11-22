import { roads, nodes, sections, rotaryId, gatewayId } from './layout.js';
export { roads, nodes, sections, rotaryId, gatewayId };
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const mix = (a, b, t) => a + (b - a) * t;
export const offset = (p, side) => ({
  x: p.x - p.dz * side,
  z: p.z + p.dx * side,
});
export function grade(x, z) {
  // Vertical curves are shallow piecewise planes; their hinges coincide with tile boundaries.
  return (
    57 +
    0.0055 * Math.min(z,1024) -
    0.039 * Math.max(0,Math.min(z,3072)-1024) -
    0.018 * Math.max(0,Math.min(z,3584)-3072) +
    0.0015 * x +
    0.041 * Math.max(0, Math.min(z,1024) - 256) +
    0.035 * Math.max(0, -z - 256) +
    0.053 * Math.max(0, -x - 512) +
    0.036 * Math.max(0, x)
  );
}
function cubic(a, b, c, d, t) {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
}
export const roadById = new Map();
for (const road of roads) {
  const a = nodes.get(road.a),
    b = nodes.get(road.b),
    length = distance(a, b),
    span = length / 3;
  const num = Math.ceil(length / 5),
    samples = [];
  for (let i = 0; i <= num; i++) {
    const t = i / num;
    const p = {
      x: cubic(a.x, a.x + road.da[0] * span, b.x - road.db[0] * span, b.x, t),
      z: cubic(a.z, a.z + road.da[1] * span, b.z - road.db[1] * span, b.z, t),
    };
    p.s = i ? samples[i - 1].s + distance(samples[i - 1], p) : 0;
    samples.push(p);
  }
  for (let i = 0; i <= num; i++) {
    const p = samples[i],
      before = samples[Math.max(0, i - 1)],
      after = samples[Math.min(num, i + 1)],
      d = distance(before, after);
    p.dx = (after.x - before.x) / d;
    p.dz = (after.z - before.z) / d;
  }
  road.section = sections[road.kind];
  road.samples = samples;
  road.length = samples.at(-1).s;
  roadById.set(road.id, road);
  a.arms.push({ road, start: true });
  b.arms.push({ road, start: false });
}
export function along(road, s) {
  const points = road.samples;
  s = Math.max(0, Math.min(road.length, s));
  let lo = 0,
    hi = points.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (points[m].s <= s) lo = m;
    else hi = m;
  }
  const a = points[lo],
    b = points[hi],
    t = (s - a.s) / (b.s - a.s);
  const dx = mix(a.dx, b.dx, t),
    dz = mix(a.dz, b.dz, t),
    d = Math.hypot(dx, dz);
  return {
    x: mix(a.x, b.x, t),
    z: mix(a.z, b.z, t),
    dx: dx / d,
    dz: dz / d,
    s,
  };
}
for (const n of nodes.values()) {
  const largest = Math.max(...n.arms.map((a) => a.road.section.outer));
  n.radius =
    n.arms.length === 1
      ? 0
      : n.id === rotaryId
        ? 31
        : (n.arms.length === 2 || n.id === 'parkS')
          ? Math.max(9, largest + 3)
          : largest + 8;
  for (const a of n.arms) {
    const p = along(a.road, a.start ? n.radius : a.road.length - n.radius);
    a.mouth = {
      ...p,
      dx: p.dx * (a.start ? 1 : -1),
      dz: p.dz * (a.start ? 1 : -1),
    };
    a.angle = Math.atan2(a.mouth.z - n.z, a.mouth.x - n.x);
  }
  n.arms.sort((a, b) => a.angle - b.angle);
}
export function roadLimits(r) {
  return [nodes.get(r.a).radius, r.length - nodes.get(r.b).radius];
}
export function projection(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  const x = a.x + t * dx,
    z = a.z + t * dz;
  return { t, x, z, distance: Math.hypot(p.x - x, p.z - z) };
}
// Sparse 64 m directory. Queries outside the district do no road work.
const bins = new Map(),
  reach = 105;
const cellKey = (x, z) => Math.floor(x / 64) + ',' + Math.floor(z / 64);
for (const road of roads) {
  // Short chords for precise queries. Group their bounds to avoid scanning the full network.
  const points = road.samples;
  for (let i = 0; i < points.length - 1; i += 6) {
    const pts = points.slice(i, Math.min(points.length, i + 7)),
      xs = pts.map((p) => p.x),
      zs = pts.map((p) => p.z);
    const box = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
    const block = { road, pts, ...box };
    for (
      let z = Math.floor((box.minZ - reach) / 64);
      z <= Math.floor((box.maxZ + reach) / 64);
      z++
    )
      for (
        let x = Math.floor((box.minX - reach) / 64);
        x <= Math.floor((box.maxX + reach) / 64);
        x++
      ) {
        const k = x + ',' + z;
        if (!bins.has(k)) bins.set(k, []);
        bins.get(k).push(block);
      }
  }
}
export function corridorDistance(x, z, stopAt = -Infinity) {
  const blocks = bins.get(cellKey(x, z));
  if (!blocks) return Infinity;
  let best = Infinity;
  for (const b of blocks) {
    const w = b.road.section.outer;
    const bx = Math.max(b.minX - x, x - b.maxX, 0),
      bz = Math.max(b.minZ - z, z - b.maxZ, 0);
    if (Math.hypot(bx, bz) - w >= best) continue;
    for (let i = 1; i < b.pts.length; i++) {
      const a = b.pts[i - 1],
        c = b.pts[i],
        dx = c.x - a.x,
        dz = c.z - a.z;
      const t = Math.min(
        1,
        Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
      );
      best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz) - w);
    }
    if (best <= stopAt) return best;
  }
  return best;
}
export function nearby(x, z) {
  return bins.get(cellKey(x, z)) || [];
}
