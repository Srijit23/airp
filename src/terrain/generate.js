import { BASE, SECTOR, TILE } from '../data/world.js';
import { elevation, normalAt } from './field.js';
import { layout } from './topology.js';

export function generate(x, z, n, span = 1) {
  const { coords, index } = layout(n);
  const vertices = coords.length / 2;
  const position = new Float32Array(vertices * 3 * span * span);
  const normal = new Float32Array(position.length);
  const faces = new Uint16Array(index.length * span * span);
  for (let j = 0; j < span; j++)
    for (let i = 0; i < span; i++) {
      const base = (j * span + i) * vertices;
      for (let k = 0; k < vertices; k++) {
        const lx = i * TILE + coords[k * 2],
          lz = j * TILE + coords[k * 2 + 1];
        const wx = x * TILE + lx,
          wz = z * TILE + lz;
        const p = (base + k) * 3;
        position[p] = lx;
        position[p + 1] = elevation(wx, wz);
        position[p + 2] = lz;
        normal.set(normalAt(wx, wz), p);
      }
      for (let k = 0; k < index.length; k++)
        faces[(j * span + i) * index.length + k] = base + index[k];
    }
  return { position, normal, index: faces };
}
export function prepareJob(job) {
  return job.kind === 'sector'
    ? generate(job.x * SECTOR, job.z * SECTOR, BASE, SECTOR)
    : generate(job.x, job.z, job.n);
}
