import { writeFileSync } from 'node:fs';
import { TILE, plannedHalfSize } from '../src/data/world.js';
import {
  habitats,
  habitat,
  generateForestTile,
} from '../src/forest/distribution.js';
import { elevation } from '../src/terrain/field.js';
import { shoreline } from '../src/world/regions.js';
import { treeSpecies } from '../src/trees/species.js';

const counts = habitats.map(() => treeSpecies.map(() => 0)),
  area = habitats.map(() => 0);
// Optional single-channel map of actual crown occupancy. Each texel integrates
// multiple neighbouring crowns. Black texels include the ocean and urban reserves.
const size = 1024,
  pixel = (2 * plannedHalfSize) / size;
const cover = process.argv.includes('--shade')
  ? new Float32Array(size * size)
  : null;
function paint(records, x, z) {
  for (let k = 0; k < records.length; k += 8) {
    const { width, depth } = treeSpecies[records[k + 5]].dimensions;
    const radius = ((width + depth) * 0.25 * records[k + 6]) / pixel + 0.52;
    const u = (x + records[k] + plannedHalfSize) / pixel - 0.5,
      v = (z + records[k + 1] + plannedHalfSize) / pixel - 0.5;
    for (
      let j = Math.max(0, Math.floor(v - radius));
      j <= Math.min(size - 1, v + radius);
      j++
    )
      for (
        let i = Math.max(0, Math.floor(u - radius));
        i <= Math.min(size - 1, u + radius);
        i++
      ) {
        const w = Math.max(0, 1 - Math.hypot(i - u, j - v) / radius);
        cover[j * size + i] += w * 0.7;
      }
  }
}
for (let z = -plannedHalfSize; z < plannedHalfSize; z += TILE)
  for (let x = -plannedHalfSize; x < plannedHalfSize; x += TILE) {
    const records = generateForestTile(x / TILE, z / TILE, counts);
    if (cover) paint(records, x, z);
    for (let dz = 16; dz < TILE; dz += 32)
      for (let dx = 16; dx < TILE; dx += 32) {
        const px = x + dx,
          pz = z + dz;
        if (pz < shoreline(px) - 180)
          area[habitat(px, pz, elevation(px, pz)).biome] += 1024;
      }
  }
console.log(
  JSON.stringify(
    habitats.map((name, i) => ({
      name,
      areaKm2: area[i] / 1e6,
      trees: Object.fromEntries(
        treeSpecies.map((s, j) => [s.id, counts[i][j]]),
      ),
    })),
    null,
    2,
  ),
);

if (cover)
  writeFileSync(
    'test-results/forest-cover.pgm',
    Buffer.concat([
      Buffer.from('P5\n' + size + ' ' + size + '\n255\n'),
      Buffer.from(cover.map((v) => 255 * (1 - Math.exp(-v)))),
    ]),
  );
