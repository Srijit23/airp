import { nodes, offset, distance, rotaryId } from './network.js';

export function blend(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}
export function quadratic(a, c, b, t) {
  return blend(blend(a, c, t), blend(c, b, t), t);
}
function bend(a, b, start, end) {
  const det = a.dx * b.dz - a.dz * b.dx;
  const along =
    Math.abs(det) > 1e-5
      ? ((end.x - start.x) * b.dz - (end.z - start.z) * b.dx) / det
      : 0;
  const length = distance(start, end);
  if (along > -0.01 || Math.abs(along) > length * 1.9)
    return Array.from({ length: 9 }, (_, i) => blend(start, end, i / 8));
  const control = { x: start.x + along * a.dx, z: start.z + along * a.dz };
  return Array.from({ length: 9 }, (_, i) =>
    quadratic(start, control, end, i / 8),
  );
}
export const junctions = new Map();
for (const n of nodes.values()) {
  if (n.arms.length < 2) continue;
  const corners = n.arms.map((a, i) => {
    const b = n.arms[(i + 1) % n.arms.length],
      sa = a.road.section,
      sb = b.road.section;
    const arc = (wa, wb) =>
      bend(a.mouth, b.mouth, offset(a.mouth, wa), offset(b.mouth, -wb));
    return {
      a,
      b,
      inner: arc(sa.half, sb.half),
      lip: arc(sa.half + 0.22, sb.half + 0.22),
      outer: arc(sa.outer, sb.outer),
    };
  });
  junctions.set(n.id, {
    node: n,
    corners,
    rotary: n.id === rotaryId,
    islandRadius: n.id === rotaryId ? 11.8 : 0,
  });
}
