import { groundHeight } from '../world/queries.js';
import { localPoint, seed } from './records.js';
import { signs, signList } from './materials.js';
export function dressLot(b, put) {
  const p = b.parcel,
    yaw = b.yaw,
    home = ['residential', 'luxury'].includes(b.zone);
  const box = (key, q, y, w, h, d, tint, tilt) => put(key, {
    x: q.x,
    y,
    z: q.z
  }, yaw, [w, h, d], tint, tilt);
  const at = (x, z) => localPoint(b.position, yaw, x, z);
  const pad = (key, x, z, w, d, tint, lift = .045) => {
    const q = at(x, z),
      h = (u, v) => {
        const l = localPoint(q, yaw, u, v);
        return groundHeight(l.x, l.z)
      };
    box(key, q, h(0, 0) + lift - .12, w, .24, d, tint, [h(.5, 0) - h(-.5, 0), h(0, .5) - h(0, -.5)]);
  };
  const mid = (p.center.x - b.position.x) * Math.sin(yaw) + (p.center.z - b.position.z) * Math.cos(yaw),
    front = mid + p.depth / 2,
    gap = front - b.depth / 2;
  pad(home ? 'turf' : 'court', 0, mid, p.width - .35, p.depth - .3, home ? 0x79895f : 0xbab5a7);
  box('solid', b.position, b.position.y - b.foundation / 2, b.width, b.foundation, b.depth, 0xa99e8d);
  pad('court', 0, b.depth / 2 + gap / 2, home ? 3.25 : Math.min(b.width * .8, 11), gap + .23, 0xc4bbaa, .075);
  if (home) {
    for (const side of [-1, 1]) {
      const len = (p.width - 4) / 2 - 1.3;
      pad('hedge', side * (len / 2 + 2), front - .65, len, .85, 0x5a7049, .45);
      pad('solid', side * (p.width / 2 - .5), mid, .23, p.depth - 1.6, 0xbeb3a0, .48);
      const q = at(side * 2.28, front - .55);
      box('solid', q, groundHeight(q.x, q.z) + .54, .45, 1.08, .45, 0xaf9e87);
    }
  } else {
    const text = b.zone === 'public' ? ({
      hospital: 'Basin Medical',
      school: 'Alder School',
      'civic hall': 'Civic Assembly'
    })[p.program] : signs[b.zone][seed(b.id) % signs[b.zone].length];
    const w = Math.min(b.width * .63, b.zone === 'industrial' ? 9 : 6.8),
      above = Math.min(b.height * .59, 3.8),
      col = 0x4b514c;
    for (const s of [-1, 1]) box('solid', at(s * (w / 2 - .13), b.depth / 2 + .13), b.position.y + above / 2, .16,
      above, .15, col);
    box('solid', at(0, b.depth / 2 + .25), b.position.y + above, w + .3, .54, 1.2, col);
    put('sign' + signList.indexOf(text), {
      ...at(0, b.depth / 2 + .87),
      y: b.position.y + above
    }, yaw, [w, .51, 1]);
    const q = at(-p.width / 2 + 2.6, front - 2),
      by = groundHeight(q.x, q.z);
    box('solid', q, by + .50, 2.4, .18, .58, 0x866952);
    for (const s of [-.8, .8]) box('solid', localPoint(q, yaw, s, 0), by + .23, .14, .46, .41, col);
    const bin = at(p.width / 2 - 2.6, front - 2);
    box('solid', bin, groundHeight(bin.x, bin.z) + .45, .48, .9, .5, col);
  }
  if (!b.pool) return;
  const pool = b.pool,
    w = pool.width,
    d = pool.depth;
  box('poolTile', pool, pool.y - .90, w, .13, d, 0x97bbb5);
  for (const s of [-1, 1])
    for (const [x, z, width, depth] of [
        [s * (w / 2 + .15), 0, .3, d + .6],
        [0, s * (d / 2 + .15), w, .3]
      ]) {
      const q = localPoint(pool, yaw, x, z);
      box('poolTile', q, pool.y - .6, width, 1.2, depth, 0xc7c5aa);
      box('solid', q, pool.y + .04, width + .09, .09, depth + .09, 0xd5c5a8);
    }
  put('poolWater', {
    x: pool.x,
    y: pool.y - .16,
    z: pool.z
  }, yaw, [w, 1, d]);
}
