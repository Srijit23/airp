import catalog from './catalog.json' with { type: 'json' };
import { parcels, inside } from '../roads/parcels.js';
import { groundHeight } from '../world/queries.js';
import { corridorDistance } from '../roads/network.js';
import { noise } from '../terrain/field.js';
import { shoreline, regionAt } from '../world/regions.js';

export function seed(id) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function randomSource(n) {
  return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export function localPoint(center, yaw, x, z) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return {
    x: center.x + c * x + s * z,
    z: center.z - s * x + c * z
  };
}
export function footprint(center, yaw, w, d) {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([x, z]) => localPoint(center, yaw, x * w / 2, z * d / 2));
}
const group = prefix => Object.keys(catalog).filter(id => id.startsWith(prefix)).sort();
const houses = group('homes_'),
  urban = group('city_').filter(id => !id.includes('skyscraper')),
  towers = group('city_skyscraper');
const choices = {
  residential: [...houses.slice(0, 8), 'city_a', ...houses.slice(8, 15), 'city_d', ...houses.slice(15),
    'city_f'],
  luxury: ['landmarks_court_villa', 'landmarks_palm_house', 'landmarks_terrace_house', 'homes_b', 'homes_d',
    'homes_n', 'homes_f', 'homes_t', 'homes_u'
  ],
  industrial: group('works_'),
  commercial: urban,
  downtown: [...towers, ...towers, ...urban.slice(5, 11)]
};
const civic = {
  hospital: 'landmarks_medical',
  school: 'landmarks_school',
  'civic hall': 'landmarks_assembly'
};
const counts = new Map();
export const buildings = parcels.filter(p => p.use === 'building').map(p => {
  const index = counts.get(p.zone) || 0;
  counts.set(p.zone, index + 1);
  const asset = p.zone === 'public' ? civic[p.program] : choices[p.zone][index % choices[p.zone].length];
  const dim = catalog[asset].size,
    rand = randomSource(seed(p.id));
  const target = asset.startsWith('landmarks_') ? 1 : ({
    residential: 8.4,
    luxury: 11,
    downtown: 17.8,
    industrial: 13.4,
    commercial: 12.2
  })[p.zone] * (.95 + rand() * .1);
  const sx = Math.min(target, p.maxFootprint.width * .98 / dim[0]);
  const sz = Math.min(target, p.maxFootprint.depth * (p.zone === 'luxury' ? .70 : .98) / dim[2]);
  const sy = Math.min(target, p.heightLimit * .92 / dim[1]);
  const width = dim[0] * sx,
    depth = dim[2] * sz,
    height = dim[1] * sy;
  const shift = (p.maxFootprint.depth - depth) * (.28 + .16 * rand());
  const pos = localPoint(p.center, p.yaw, 0, shift),
    corners = footprint(pos, p.yaw, width, depth);
  const hs = corners.map(c => groundHeight(c.x, c.z)),
    floor = Math.max(...hs, p.center.y) + .13;
  const b = {
    id: p.id + '/building',
    asset,
    zone: p.zone,
    district: p.district,
    parcel: p,
    position: {
      ...pos,
      y: floor
    },
    yaw: p.yaw,
    scale: [sx, sy, sz],
    width,
    depth,
    height,
    corners,
    foundation: floor - Math.min(...hs) + .15,
    collision: {
      type: 'oriented-box',
      half: [width / 2, height / 2, depth / 2]
    },
    entrance: p.entrance,
    access: p.id + '/entrance'
  };
  const room = p.depth / 2 + shift - depth / 2 - 2;
  if (p.zone === 'luxury' && room > 5.6) {
    const back = localPoint(pos, p.yaw, 0, -depth / 2 - room / 2 - .4),
      w = Math.min(8, p.width * .30),
      d = Math.min(4.7, room - 1.1);
    const rim = footprint(back, p.yaw, w + 1, d + 1);
    if (rim.every(c => inside(c, p.corners))) b.pool = {
      id: b.id + '/pool',
      ...back,
      width: w,
      depth: d,
      y: Math.max(...rim.map(c => groundHeight(c.x, c.z))) + 1.03,
      yaw: p.yaw
    };
  }
  return b;
});
const cells = new Map(),
  step = 128,
  cell = (x, z) => Math.floor(x / step) + ',' + Math.floor(z / step);
for (const p of parcels) {
  const r = Math.hypot(p.width, p.depth) / 2 + 4;
  for (let i = Math.floor((p.center.x - r) / step); i <= Math.floor((p.center.x + r) / step); i++)
    for (let j = Math.floor((p.center.z - r) / step); j <= Math.floor((p.center.z + r) / step); j++) {
      const k = i + ',' + j;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(p);
    }
}
const byLot = new Map(buildings.map(b => [b.parcel.id, b]));
export function inParcel(x, z) {
  return (cells.get(cell(x, z)) || []).some(p => inside({
    x,
    z
  }, p.corners));
}
export function buildingAt(x, z, padding = 0) {
  for (const parcel of cells.get(cell(x, z)) || []) {
    const b = byLot.get(parcel.id);
    if (!b) continue;
    const dx = x - b.position.x,
      dz = z - b.position.z,
      c = Math.cos(b.yaw),
      s = Math.sin(b.yaw);
    if (Math.abs(c * dx - s * dz) < b.width / 2 + padding && Math.abs(s * dx + c * dz) < b.depth / 2 + padding)
      return b;
  }
  return null;
}
export function orchardTree(b) {
  const p = b.parcel;
  if (p.zone === 'industrial') return null;
  const q = localPoint(p.center, p.yaw, p.width / 2 - 1.85, p.depth / 2 - 2.35);
  if (buildingAt(q.x, q.z) || corridorDistance(q.x, q.z) < 1.7) return null;
  return {
    id: b.id + '/tree',
    asset: p.zone === 'luxury' && p.center.z > 2000 ? 'garden_tree_palmDetailedTall' : 'broadleaf',
    ...q,
    y: groundHeight(q.x, q.z),
    height: p.zone === 'luxury' ? 6.8 : 5.8,
    yaw: seed(p.id) % 6.28
  };
}
export const promenadeZ = x => shoreline(x) - 34;
export function wildPlants(cx, cz) {
  const rand = randomSource(seed('plants/' + cx + '/' + cz)),
    out = [];
  const forestCell = regionAt((cx + .5) * step, (cz + .5) * step) === 'Silverpine Forest';
  for (let i = 0; i < (forestCell ? 265 : 90); i++) {
    const x = (cx + rand()) * step,
      z = (cz + rand()) * step,
      pick = rand(),
      yaw = rand() * Math.PI * 2;
    const edge = shoreline(x) - z,
      forest = regionAt(x, z) === 'Silverpine Forest',
      cluster = noise(x / 85, z / 85);
    if (pick > (forest ? .64 + cluster * .35 : .055 + cluster * .27) || edge < 17 || corridorDistance(x, z, 5) <
      5 || inParcel(x, z)) continue;
    if (x >= -332 && x <= 340 && Math.abs(z - promenadeZ(x)) < 6) continue;
    const y = groundHeight(x, z);
    if (y > 560 || Math.abs(groundHeight(x + 4, z) - y) > 3.4) continue;
    const roll = rand(),
      coastal = edge < 135;
    if (coastal && pick > .045) continue;
    const asset = coastal ? 'garden_tree_palmDetailedTall' : roll < (forest ? .5 : .29) ? (forest ? 'pine' :
        'broadleaf') :
      roll < (forest ? .70 : .46) ? 'garden_plant_bushDetailed' : roll < .86 ? 'garden_grass_leafsLarge' : roll <
      .92 ? 'garden_plant_flatTall' : 'garden_rock_largeA';
    const h = (asset === 'pine' ? 18 : asset === 'broadleaf' ? 6 : coastal ? 7 : asset.includes('rock') ? 1.4 :
      asset.includes('bush') ? 1.15 : .68) * (.64 + rand() * .95);
    out.push({
      id: 'wild/' + cx + '/' + cz + '/' + i,
      asset,
      x,
      y: y - .07,
      z,
      height: h,
      yaw,
      tier: i % 4
    });
  }
  return out;
}
