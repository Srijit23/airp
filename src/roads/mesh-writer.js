// Clip every primitive to the same signed tile boundaries as terrain. Heights are
// evaluated after clipping so even a grading-plane hinge at a boundary is exact.
import { TILE } from '../data/world.js';
import { grade } from './network.js';
export const ink = {
  asphalt: [0, 184, 183, 178],
  patch: [0, 151, 151, 150],
  pavers: [1, 201, 197, 181],
  curb: [2, 174, 174, 158],
  gutter: [2, 104, 107, 104],
  earth: [2, 113, 124, 71],
  white: [3, 216, 214, 194],
  yellow: [3, 234, 173, 52],
  metal: [4, 86, 93, 90],
  dark: [4, 48, 53, 50],
  red: [3, 201, 58, 39],
  amber: [3, 170, 127, 51],
  green: [3, 84, 165, 127],
  trunk: [4, 115, 126, 121],
  lamp: [3, 230, 220, 179],
  blue: [3, 52, 99, 104],
  tactile: [2, 192, 155, 84],
};
const pt = (p, h = 0) => [p.x, h, p.z];
function cut(poly, axis, v, sign) {
  const out = [];
  let a = poly.at(-1);
  for (const b of poly) {
    const da = (a[axis] - v) * sign,
      db = (b[axis] - v) * sign;
    if (da < 0 !== db < 0) {
      const t = da / (da - db),
        p = a.map((n, i) => n + (b[i] - n) * t);
      p[axis] = v;
      out.push(p);
    }
    if (db >= 0) out.push(b);
    a = b;
  }
  return out;
}
export class MeshWriter {
  constructor() {
    this.tiles = new Map();
  }
  face(points, material, detail = false) {
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[2]);
    for (
      let z = Math.floor(Math.min(...zs) / TILE);
      z <= Math.floor(Math.max(...zs) / TILE);
      z++
    )
      for (
        let x = Math.floor(Math.min(...xs) / TILE);
        x <= Math.floor(Math.max(...xs) / TILE);
        x++
      ) {
        let polygon = points;
        for (const [axis, bound, sign] of [
          [0, x * TILE, 1],
          [0, (x + 1) * TILE, -1],
          [2, z * TILE, 1],
          [2, (z + 1) * TILE, -1],
        ]) {
          if (polygon.length < 3) break;
          if (polygon.some((p) => (p[axis] - bound) * sign < 0))
            polygon = cut(polygon, axis, bound, sign);
        }
        if (polygon.length < 3) continue;
        const key = x + ',' + z;
        for (let i = 1; i < polygon.length - 1; i++) {
          const vs = [polygon[0], polygon[i], polygon[i + 1]].map((p) => [
            p[0],
            grade(p[0], p[2]) + p[1],
            p[2],
            p[3] ?? 0,
            p[4] ?? 0,
          ]);
          let [a, b, c] = vs;
          let nx =
              (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
            ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
            nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          const d = Math.hypot(nx, ny, nz);
          if (d < 0.000001) continue;
          if (ny < -0.05 * d) {
            [vs[1], vs[2]] = [vs[2], vs[1]];
            nx = -nx;
            ny = -ny;
            nz = -nz;
          }
          if (!this.tiles.has(key))
            this.tiles.set(key, { base: [], detail: [] });
          const out = this.tiles.get(key)[detail ? 'detail' : 'base'];
          for (const [px, py, pz, u, v] of vs)
            out.push(
              Math.round((px - x * TILE) * 100),
              Math.round(py * 100),
              Math.round((pz - z * TILE) * 100),
              Math.round((nx / d) * 127),
              Math.round((ny / d) * 127),
              Math.round((nz / d) * 127),
              ...material,
              Math.round(u * 255),
              Math.round(v * 255),
            );
        }
      }
  }
  flat(points, h, mat, detail = false) {
    this.face(
      points.map((p) => pt(p, h)),
      mat,
      detail,
    );
  }
  quad(a, b, c, d, ha, hb, mat, detail = false) {
    this.face([pt(a, ha), pt(b, hb), pt(c, hb), pt(d, ha)], mat, detail);
  }
  strip(a, b, c, d, ha, hb, mat, detail = false) {
    this.face([pt(a, ha), pt(b, ha), pt(c, hb), pt(d, hb)], mat, detail);
  }
  // Cylindrical columns and tapered lighting arms use the same batch as the pavement.
  tube(a, b, ra, rb, mat, n = 7) {
    const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      len = Math.hypot(...dir);
    const u =
      Math.hypot(dir[0], dir[2]) > 0.001 ? [dir[2], 0, -dir[0]] : [1, 0, 0];
    const ul = Math.hypot(...u);
    for (let i = 0; i < 3; i++) u[i] /= ul;
    const v = [
      dir[1] * u[2] - dir[2] * u[1],
      dir[2] * u[0] - dir[0] * u[2],
      dir[0] * u[1] - dir[1] * u[0],
    ].map((a) => a / len);
    const ring = (p, r, k) =>
      p.map(
        (a, i) =>
          a +
          r *
            (Math.cos((k * 2 * Math.PI) / n) * u[i] +
              Math.sin((k * 2 * Math.PI) / n) * v[i]),
      );
    for (let i = 0; i < n; i++)
      this.face(
        [
          ring(a, ra, i),
          ring(a, ra, i + 1),
          ring(b, rb, i + 1),
          ring(b, rb, i),
        ],
        mat,
        true,
      );
  }
}
