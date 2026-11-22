import {shoreline} from '../world/regions.js';
import { corridorDistance, grade } from '../roads/network.js';
import { SEED } from '../data/world.js';

const mix = (a, b, t) => a + (b - a) * t;
function hash(x, z) {
  let n = Math.imul(x, 1597334677) ^ Math.imul(z, 3812015801) ^ SEED;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  let a = x - ix,
    b = z - iz;
  a *= a * (3 - 2 * a);
  b *= b * (3 - 2 * b);
  return mix(
    mix(hash(ix, iz), hash(ix + 1, iz), a),
    mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), a),
    b,
  );
}
export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// The flat alluvial floor grades into folded escarpments. No per-tile random state.
function basinElevation(x, z) {
  const broad = noise(x / 570 + 3.7, z / 570 - 8.1);
  const warp = 165 * (broad - 0.5) + 54 * (noise(x / 218, z / 218) - 0.5);
  const u = x + warp,
    v = z - warp * 0.65;
  const valley = u + 130 + 185 * Math.sin(v / 540);
  const west = (valley + 790 + 117 * Math.sin(v / 171)) / 490;
  const east = (valley - 790 - 144 * Math.sin(v / 277)) / 460;
  const divide = (v + 1020 + 0.24 * u + 90 * Math.sin(u / 200)) / 470;
  const spur = (v - 730 - 0.46 * u) / 350;
  const crest = Math.max(
    355 * Math.exp(-west * west) * (0.58 + 0.85 * broad),
    330 * Math.exp(-east * east) * (0.62 + 0.72 * broad),
    480 * Math.exp(-divide * divide) * (0.67 + 0.75 * broad),
    150 * Math.exp(-spur * spur) * smooth(30, 570, u),
  );
  const upland = smooth(20, 260, crest);
  const folds = 1 - Math.abs(2 * noise((u + v * 0.45) / 215, v / 320) - 1);
  const gullies = Math.abs(2 * noise((u + v * 0.3) / 86 + 8, v / 150) - 1);
  const grain = noise(x / 32, z / 32) - 0.5;
  const apron = smooth(1250, 2600, Math.hypot(x, z));
  const back = apron * (155 + 475 * noise(u / 550 + 43, v / 540 - 12));
  const relief =
    39 +
    17 * broad +
    crest +
    upland * (94 * folds - 43 * gullies + 12 * grain) +
    4 * noise(x / 72, z / 72) +
    back;
  // Reserve a contiguous, gently graded alluvial terrace for the next planning phase.
  const terrace =
    (1 - smooth(220, 580, Math.abs(valley))) *
    (1 - smooth(370, 790, Math.abs(v - 30)));
  const floor = 53 + 0.007 * z + 6 * broad + 1.1 * noise(x / 110, z / 110);
  return mix(relief, floor, terrace);
}

export function naturalElevation(x,z) {
  const base=basinElevation(x,z);
  if(z<=1050)return base;
  const d=shoreline(x)-z, broad=noise(x/470,z/520);
  const low=grade(x,z)+(broad-.5)*32+5*noise(x/67,z/89);
  const plain=mix(base,low,smooth(1050,1650,z)*(1-smooth(650,1650,Math.abs(x))));
  const beach=d<0?Math.max(-115,d*(.048+.027*broad)):d*(.041+.015*broad)+smooth(22,155,d)*(3*broad+3*noise(x/70,z/80));
  return mix(beach,plain,smooth(140,440,d));
}
export function elevation(x, z) {
  const d = corridorDistance(x, z, 50);
  // The graded bench includes the coarse tile stencil. Every LOD under a street samples
  // the same plane, including transition triangles at a tile boundary.
  if (d <= 50) return grade(x, z);
  const original = naturalElevation(x, z);
  if (d >= 85) return original;
  return mix(grade(x, z), original, smooth(50, 85, d));
}

export function normalAt(x, z) {
  const dx = elevation(x - 2, z) - elevation(x + 2, z);
  const dz = elevation(x, z - 2) - elevation(x, z + 2);
  const length = Math.hypot(dx, 4, dz);
  return [dx / length, 4 / length, dz / length];
}
