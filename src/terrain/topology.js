import { BASE, TILE } from '../data/world.js';

const layouts = new Map();

// All resolutions have the same outer polyline. A zippered ring connects it to
// the interior grid, so adjacent LODs share literal edges (no skirts or T-junctions).
export function layout(n) {
  if (layouts.has(n)) return layouts.get(n);
  if (!Number.isInteger(n) || n < BASE || n % BASE)
    throw Error('Invalid terrain resolution');
  const coords = [],
    index = [],
    lookup = new Map();
  function vertex(x, z) {
    const k = z * (n + 1) + x;
    if (!lookup.has(k)) {
      lookup.set(k, coords.length / 2);
      coords.push((x * TILE) / n, (z * TILE) / n);
    }
    return lookup.get(k);
  }
  function tri(a, b, c) {
    index.push(a, b, c);
  }
  for (let z = 1; z < n - 1; z++) {
    for (let x = 1; x < n - 1; x++) {
      const a = vertex(x, z),
        b = vertex(x + 1, z),
        c = vertex(x, z + 1),
        d = vertex(x + 1, z + 1);
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  // Traverse each side clockwise in XZ with the centre on the right.
  for (let side = 0; side < 4; side++) {
    function rotate(x, z) {
      if (side === 1) return vertex(n - z, x);
      if (side === 2) return vertex(n - x, n - z);
      if (side === 3) return vertex(z, n - x);
      return vertex(x, z);
    }
    const outer = Array.from({ length: BASE + 1 }, (_, i) =>
      rotate((i * n) / BASE, 0),
    );
    const inner = Array.from({ length: n - 1 }, (_, i) => rotate(i + 1, 1));
    let a = 0,
      b = 0;
    while (a < BASE || b < n - 2) {
      if (b === n - 2 || (a < BASE && ((a + 1) * n) / BASE <= b + 2)) {
        tri(outer[a], inner[b], outer[a + 1]);
        a++;
      } else {
        tri(outer[a], inner[b], inner[b + 1]);
        b++;
      }
    }
  }
  const result = {
    coords: new Float32Array(coords),
    index: new Uint16Array(index),
    n,
  };
  layouts.set(n, result);
  return result;
}

// Cache a spatial index of triangle candidates for exact ground queries even in the transition ring.
const indices = new Map();
export function triangleAt(n, x, z) {
  const { coords, index } = layout(n),
    step = TILE / n;
  const cell = (v) => Math.min(n - 1, Math.max(0, Math.floor(v / step)));
  if (!indices.has(n)) {
    const bins = Array.from({ length: n * n }, () => []);
    for (let i = 0; i < index.length; i += 3) {
      const ids = [index[i], index[i + 1], index[i + 2]];
      const xs = ids.map((j) => coords[j * 2]),
        zs = ids.map((j) => coords[j * 2 + 1]);
      for (let v = cell(Math.min(...zs)); v <= cell(Math.max(...zs)); v++)
        for (let u = cell(Math.min(...xs)); u <= cell(Math.max(...xs)); u++)
          bins[v * n + u].push(i);
    }
    indices.set(n, bins);
  }
  for (const i of indices.get(n)[cell(z) * n + cell(x)]) {
    const a = index[i] * 2,
      b = index[i + 1] * 2,
      c = index[i + 2] * 2;
    const ax = coords[a],
      az = coords[a + 1],
      bx = coords[b],
      bz = coords[b + 1],
      cx = coords[c],
      cz = coords[c + 1];
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
    const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
    if (wa >= -1e-7 && wb >= -1e-7 && wa + wb <= 1.0000001)
      return { a: a / 2, b: b / 2, c: c / 2, wa, wb, wc: 1 - wa - wb };
  }
  throw Error('Point outside terrain tile');
}
