import { district, NEAR, TILE, tileAt, stableId } from '../data/world.js';
import { elevation, normalAt } from '../terrain/field.js';
import { layout, triangleAt } from '../terrain/topology.js';

export function groundHeight(x, z, resolution = NEAR) {
  const tx = tileAt(x) * TILE,
    tz = tileAt(z) * TILE;
  const { coords } = layout(resolution);
  const t = triangleAt(resolution, x - tx, z - tz);
  const h = (i) =>
    Math.fround(elevation(tx + coords[i * 2], tz + coords[i * 2 + 1]));
  return h(t.a) * t.wa + h(t.b) * t.wb + h(t.c) * t.wc;
}
export function surfaceAt(x, z) {
  const normal = normalAt(x, z);
  return {
    id: stableId('terrain', tileAt(x), tileAt(z), 'surface'),
    height: groundHeight(x, z),
    normal,
    slopeDegrees: (Math.acos(normal[1]) * 180) / Math.PI,
    district:
      Math.max(Math.abs(x), Math.abs(z)) < district.halfSize
        ? district.id
        : null,
  };
}
