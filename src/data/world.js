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
