// Right-handed metres. +Y is up, north is -Z. The survey and future map share an origin.
export const TILE = 256;
export const SECTOR = 4;
export const BASE = 8;
export const NEAR = 32;
export const SEED = 72139;
export const district = {
  id: 'kestrel',
  name: 'Kestrel Basin',
  halfSize: 1024,
};
export const plannedHalfSize = 19 * TILE; // 9,728 m per side, 94.63 km²

export const stations = [
  {
    id: 'overlook',
    name: 'Ridge Overlook',
    x: 382,
    z: 688,
    above: 92,
    yaw: 0.37,
    pitch: -0.14,
  },
  {
    id: 'flats',
    name: 'Alluvial Flats',
    x: -124,
    z: 40,
    above: 9,
    yaw: -0.63,
    pitch: 0.02,
  },
  {
    id: 'divide',
    name: 'North Divide',
    x: -590,
    z: -810,
    above: 42,
    yaw: -2.64,
    pitch: -0.16,
  },
];

stations.push(
  {
    id: 'meridian',
    name: 'Meridian Junction',
    x: -151.2,
    z: 45.3,
    above: 11.8,
    yaw: -.29,
    pitch: -.075,
  },
  {
    id: 'promenade',
    name: 'Basin Boulevard',
    x: -112.1,
    z: -106,
    above: 2.1,
    yaw: 2.9,
    pitch: -0.035,
  },
  {
    id: 'rotary',
    name: 'Orchard Circle',
    x: -240,
    z: 267,
    above: 42,
    yaw: -0.56,
    pitch: -0.49,
  },
  {
    id: 'heights',
    name: 'Juniper Heights',
    x: -475.3,
    z: 243.2,
    above: 3.1,
    yaw: 2.30,
    pitch: -.015,
  },
  {
    id: 'plan',
    name: 'City overview',
    x: -145,
    z: 139,
    above: 1260,
    yaw: 0,
    pitch: -1.46,
  },
);

stations.push(
  {id:'villa',name:'Villa Court',x:-457,z:286,above:6.2,yaw:.50,pitch:-.20},
  {id:'alder',name:'Alder Vale',x:151,z:1576,above:3,yaw:-1.52,pitch:.025},
  {id:'harbor',name:'Port Mariner',x:-247,z:2900,above:3.2,yaw:3.1,pitch:.02},
  {id:'strand',name:'Saltwood Strand',x:135,z:3528,above:4.1,yaw:1.67,pitch:-.065},
  {id:'forest',name:'Silverpine Forest',x:-1815,z:-1533,above:2.05,yaw:.58,pitch:.045},
  {id:'linden',name:'Linden Ward',x:-151,z:368,above:2.2,yaw:2.52,pitch:.02},
);
export const presets = {
  low: { radius: 2, detail: 1, sectors: 2, dpr: 1, fog: 1780, shadow: 0 },
  medium: {
    radius: 3,
    detail: 1,
    sectors: 2,
    dpr: 1.4,
    fog: 1950,
    shadow: 1024,
  },
  high: {
    radius: 4,
    detail: 2,
    sectors: 3,
    dpr: 1.75,
    fog: 3000,
    shadow: 2048,
  },
};
export const key = (x, z) => x + ',' + z;
export const tileAt = (metres) => Math.floor(metres / TILE);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function stableId(layer, tileX, tileZ, localId) {
  return [district.id, layer, tileX, tileZ, localId].join('/');
}
