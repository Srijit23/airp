import { plannedHalfSize } from '../data/world.js';
import {
  roads,
  roadLimits,
  along,
  grade,
  offset,
  nodes,
  nearby,
  projection,
  distance,
} from './network.js';
import { site } from './layout.js';
import { naturalElevation } from '../terrain/field.js';

export const zones = {
  downtown: {
    name: 'Exchange Quarter',
    color: '#c8a25f',
    width: 33,
    depth: 33,
    limit: 84,
    density: 'high',
  },
  residential: {
    name: 'Linden Ward',
    color: '#85ac83',
    width: 19,
    depth: 23,
    limit: 12,
    density: 'medium',
  },
  luxury: {
    name: 'Juniper Heights',
    color: '#9ba8c6',
    width: 32,
    depth: 33,
    limit: 12,
    density: 'low',
  },
  commercial: {
    name: 'Market District',
    color: '#d28b6c',
    width: 26,
    depth: 25,
    limit: 28,
    density: 'medium-high',
  },
  public: {
    name: 'Civic Gardens',
    color: '#80aab7',
    width: 42,
    depth: 33,
    limit: 35,
    density: 'civic',
  },
  industrial: {
    name: 'Foundry Ward',
    color: '#b298af',
    width: 40,
    depth: 31,
    limit: 21,
    density: 'employment',
  },
  green: {
    name: 'Basin Greenbelt',
    color: '#688b5d',
    width: 0,
    depth: 0,
    limit: 0,
    density: 'protected',
  },
};
// Parcel and atlas boundaries are derived from the same zoning polygons.
const areas = [
  [
    'public',
    [
      [-214, -152],
      [-155, -148],
      [-155, -48],
      [-211, -58],
    ],
  ],

  [
    'industrial',
    [
      [-204, -470],
      [217, -470],
      [228, -260],
      [102, -252],
      [-12, -265],
      [-195, -237],
    ],
  ],
  [
    'downtown',
    [
      [-154, -238],
      [-12, -265],
      [102, -252],
      [105, 78],
      [12, 110],
      [-118, 68],
      [-155, -43],
    ],
  ],
  [
    'public',
    [
      [-116, 78],
      [-12, 123],
      [59, 124],
      [59, 190],
      [-115, 196],
    ],
  ],
  [
    'green',
    [
      [62, 217],
      [170, 217],
      [160, 323],
      [73, 320],
    ],
  ],
  [
    'luxury',
    [
      [-351, 194],
      [-197, 155],
      [-125, 207],
      [-123, 570],
      [-237, 545],
      [-350, 437],
    ],
  ],
  [
    'commercial',
    [
      [109, -251],
      [234, -255],
      [281, 87],
      [210, 171],
      [64, 187],
      [64, 125],
      [110, 86],
    ],
  ],
  [
    'commercial',
    [
      [-106, 200],
      [58, 197],
      [60, 295],
      [-104, 291],
    ],
  ],
  [
    'residential',
    [
      [-250, -245],
      [232, -254],
      [253, 175],
      [204, 620],
      [179, 689],
      [-55, 691],
      [-235, 581],
      [-265, 217],
    ],
  ],
];
export const zoneAreas = areas.map(([type, uv]) => ({
  type,
  points: uv.map(([u, v]) => site(u, v)),
}));
const regionalZones = [
  ['public','Alder School Grounds',80,1530,167,1675],['residential','Alder Vale',-97,1500,328,1878],
  ['industrial','East Dock',5,2748,305,2950],['commercial','Port Market',-331,2730,5,3000],
  ['downtown','Mariner Quarter',-575,2730,-331,3015],['luxury','Esplanade Gardens',-575,3015,-260,3125],
  ['residential','Saltwood Beach',-260,2950,305,3125],['commercial','Strand Village',-530,3125,-154,3290],
  ['residential','Strand Village',-154,3125,323,3460],
];
for(const [type,name,x0,z0,x1,z1] of regionalZones)
  zoneAreas.push({type,name,points:[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}]});
export function inside(p, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      hit = !hit;
  }
  return hit;
}
export function zoneAt(p) {
  return zoneAreas.find((z) => inside(p, z.points))?.type || 'green';
}
export function overlap(a, b) {
  for (const points of [a, b])
    for (let i = 0; i < points.length; i++) {
      const m = points[i],
        n = points[(i + 1) % points.length],
        dx = n.z - m.z,
        dz = m.x - n.x;
      const av = a.map((p) => p.x * dx + p.z * dz),
        bv = b.map((p) => p.x * dx + p.z * dz);
      if (
        Math.max(...av) <= Math.min(...bv) + 1e-6 ||
        Math.max(...bv) <= Math.min(...av) + 1e-6
      )
        return false;
    }
  return true;
}
function rectangle(c, axis, w, d, side) {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => ({
    x: c.x + (axis.dx * u * w) / 2 - (axis.dz * v * side * d) / 2,
    z: c.z + (axis.dz * u * w) / 2 + (axis.dx * v * side * d) / 2,
  }));
}
export const parcels = [],
  byRoad = new Map(),
  parking = [];
const parcelBins = new Map(),
  STEP = 80;
function keys(points) {
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z),
    out = [];
  for (
    let i = Math.floor(Math.min(...xs) / STEP);
    i <= Math.floor(Math.max(...xs) / STEP);
    i++
  )
    for (
      let j = Math.floor(Math.min(...zs) / STEP);
      j <= Math.floor(Math.max(...zs) / STEP);
      j++
    )
      out.push(i + ',' + j);
  return out;
}
export function validateParcel(p, neighbors = []) {
  const { corners, center, zone } = p;
  if (
    corners.some(
      (c) =>
        zoneAt(c) !== zone || Math.max(Math.abs(c.x), Math.abs(c.z)) > plannedHalfSize,
    )
  )
    return 'zoning or boundary';
  if (
    corners.some(
      (c) => Math.abs(naturalElevation(c.x, c.z) - grade(c.x, c.z)) > 18,
    )
  )
    return 'earthworks';
  if (neighbors.some((n) => n !== p && overlap(n.corners, corners)))
    return 'parcel overlap';
  const radius = Math.hypot(p.width, p.depth) / 2;
  const seen = new Set();
  for (const b of nearby(center.x, center.z)) {
    if (seen.has(b.road.id)) continue;
    seen.add(b.road.id);
    const road = b.road,
      points = road.samples,
      w = road.section.outer + 0.3;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        c = points[i];
      if (projection(center, a, c).distance > radius + w + 1) continue;
      if (
        overlap(corners, [
          offset(a, w),
          offset(c, w),
          offset(c, -w),
          offset(a, -w),
        ])
      )
        return 'road easement';
    }
    for (const id of [road.a, road.b]) {
      const n = nodes.get(id);
      if (distance(center, n) > radius + n.radius) continue;
      if (
        inside(n, corners) ||
        corners.some(
          (c, i) =>
            projection(n, c, corners[(i + 1) % 4]).distance < n.radius + 0.3,
        )
      )
        return 'junction easement';
    }
  }
  return null;
}
const priority = {
  boulevard: 0,
  arterial: 1,
  service: 2,
  hill: 3,
  city: 4,
  suburban: 5,
  residential: 6,
  highway: 7,
};
for (const road of [...roads].sort(
  (a, b) => Number(a.id.startsWith('region/')) - Number(b.id.startsWith('region/')) || priority[a.kind] - priority[b.kind],
)) {
  if (road.kind === 'highway') continue;
  const [start, end] = roadLimits(road);
  for (const side of [-1, 1]) {
    for (let s = start + 12; s < end - 8; ) {
      const point = along(road, s),
        sample = offset(point, side * (road.section.outer + 13)),
        zone = zoneAt(sample),
        rules = zones[zone];
      if (zone === 'green') {
        s += 8;
        continue;
      }
      const width = rules.width,
        depth = rules.depth;
      const entrance = offset(point, side * (road.section.outer + 2.5)),
        center = offset(point, side * (road.section.outer + 2.5 + depth / 2));
      const corners = rectangle(center, point, width, depth, side),
        id = road.id + '/lot/' + (side > 0 ? 'L' : 'R') + Math.round(s * 10);
      const setback = zone === 'luxury' ? 5 : zone === 'industrial' ? 4 : 2.5;
      const parcel = {
        id,
        zone,
        district: zoneAreas.find(a => a.name && inside(center,a.points))?.name || rules.name,
        center: { ...center, y: grade(center.x, center.z) },
        width,
        depth,
        corners,
        frontage: { roadId: road.id, station: s, width, side },
        entrance: { ...entrance, y: grade(entrance.x, entrance.z) },
        yaw: Math.atan2(entrance.x - center.x, entrance.z - center.z),
        heightLimit: rules.limit,
        density: rules.density,
        envelope: rectangle(
          center,
          point,
          width - 2 * setback,
          depth - 2 * setback,
          side,
        ),
        maxFootprint: {
          width: width - 2 * setback,
          depth: depth - 2 * setback,
          area: (width - 2 * setback) * (depth - 2 * setback),
        },
        restrictions: {
          setback,
          frontageAccessOnly: true,
          noBuildOutsideEnvelope: true,
        },
        use: 'building',
      };
      const cells = keys(corners),
        neighbors = [...new Set(cells.flatMap((k) => parcelBins.get(k) || []))];
      if (validateParcel(parcel, neighbors)) {
        s += 5;
        continue;
      }
      parcels.push(parcel);
      for (const k of cells) {
        if (!parcelBins.has(k)) parcelBins.set(k, []);
        parcelBins.get(k).push(parcel);
      }
      if (!byRoad.has(road.id)) byRoad.set(road.id, []);
      byRoad.get(road.id).push(parcel);
      s += width + 4;
    }
  }
}
const programs = {
  residential: ['townhouses', 'courtyard housing', 'neighbourhood apartments'],
  luxury: ['villa', 'garden mansion'],
  public: ['hospital', 'school', 'civic hall'],
  downtown: ['office tower', 'mixed-use podium', 'hotel'],
  commercial: ['retail and shops', 'restaurant', 'service business'],
  industrial: ['warehouse', 'workshop', 'logistics yard'],
};
const sequence = {};
for (const p of parcels) {
  const key = p.district + p.zone;
  const n = sequence[key] || 0;
  p.program = programs[p.zone][n % programs[p.zone].length];
  sequence[key] = n + 1;
}
// Reserve distinct off-street parking courts with an entrance across the sidewalk.
for (const zone of ['industrial', 'public', 'commercial', 'downtown']) {
  const p = parcels.find((p) => p.zone === zone && p.width >= 25);
  if (p) {
    p.use = 'parking';
    p.program = 'public parking';
    p.heightLimit = 0;
    p.maxFootprint = { width: 0, depth: 0, area: 0 };
    p.envelope = [];
    p.restrictions.parkingOnly = true;
    parking.push(p);
  }
}

// Reserved, unbuilt amenities in the protected block east of Park Crescent.
export const greenReservations = [
  {
    id: 'kb/green/orchard',
    name: 'Orchard Park',
    program: 'neighbourhood park',
    uv: [
      [81, 231],
      [123, 232],
      [121, 287],
      [82, 284],
    ],
  },
  {
    id: 'kb/green/play',
    name: 'Orchard Playfield',
    program: 'playground',
    uv: [
      [130, 233],
      [157, 232],
      [153, 276],
      [129, 276],
    ],
  },
  {
    id: 'kb/green/walk',
    name: 'Park Crescent Greenway',
    program: 'tree corridor',
    uv: [
      [84, 299],
      [153, 298],
      [151, 311],
      [85, 312],
    ],
  },
].map(({ uv, ...reserve }) => ({
  ...reserve,
  points: uv.map(([u, v]) => site(u, v)),
  buildable: false,
}));
