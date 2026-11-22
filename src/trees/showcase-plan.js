import { treeSpecies } from './species.js';

// A surveyed clearing above Juniper Heights. The front row is accessible on foot.
export const clearing = { x: -372, z: 420 };
export const showcaseStation = {
  id: 'tree-showcase', name: 'Tree Model Showcase',
  x: clearing.x - 7, z: clearing.z + 39, above: 3.5, yaw: -0.13, pitch: 0.13,
};
const planting = [[0, 9, 1, 0.2], [-6, -8, 0.86, 2.4], [7, -17, 1.08, 4.6]];
export const showcaseTrees = treeSpecies.flatMap((s, i) => planting.map(([dx, dz, scale, yaw], j) => ({
  id: 'kestrel/showcase/' + s.id + '/' + (j + 1), species: s.id,
  x: clearing.x + (i - 2) * 23 + dx, z: clearing.z + dz, scale, yaw: yaw + i * 0.8,
})));

export function detailLevel(distance, previous, lod) {
  const margin = previous == null ? 0 : previous === 'near' ? lod.hysteresisMetres : -lod.hysteresisMetres;
  return distance < lod.switchMetres + margin ? 'near' : 'far';
}
