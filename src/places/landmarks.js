// Original architecture. Metres, local +Z frontage, ground at zero.
export const landmarkNames = ['court_villa', 'palm_house', 'terrace_house', 'medical', 'school', 'assembly'];
const stone = [188, 177, 155],
  ivory = [220, 212, 193],
  steel = [68, 77, 75],
  wood = [144, 94, 60],
  glass = [62, 88, 93],
  trim = [115, 112, 100],
  terra = [149, 95, 73];
export function landmark(name) {
  const positions = [],
    normals = [],
    colors = [],
    surface = [],
    indices = [];

  function box(x, y, z, w, h, d, color, kind = 0) {
    const corners = [];
    for (const k of [-1, 1])
      for (const j of [-1, 1])
        for (const i of [-1, 1]) corners.push([x + w * i / 2, y + h * j / 2, z + d * k / 2]);
    const faces = [
      [4, 5, 7, 6],
      [1, 0, 2, 3],
      [0, 4, 6, 2],
      [5, 1, 3, 7],
      [6, 7, 3, 2],
      [0, 1, 5, 4]
    ];
    const ns = [
      [0, 0, 1],
      [0, 0, -1],
      [-1, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, -1, 0]
    ];
    const linear = color.map(c => ((c / 255 + .055) / 1.055) ** 2.4);
    faces.forEach((face, i) => {
      const first = positions.length / 3;
      for (const j of face) {
        positions.push(...corners[j]);
        normals.push(...ns[i]);
        colors.push(...linear);
        surface.push(kind);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    });
  }

  function wing(x, z, w, d, y, levels, skin, pitch = 3.2) {
    box(x, y + levels * pitch / 2, z, w, levels * pitch, d, skin, 1);
    for (let l = 0; l < levels; l++) {
      const floor = y + l * pitch;
      for (const side of [-1, 1]) {
        const plane = z + side * (d / 2 + .035),
          count = Math.max(2, Math.round(w / 2.15)),
          bay = w / count;
        for (let i = 0; i < count; i++) {
          const px = x - w / 2 + (i + .5) * bay;
          box(px, floor + 1.64, plane, bay - .24, 2.12, .09, glass, 3);
          box(px, floor + 1.64, plane + side * .064, .047, 2.14, .055, steel);
          box(px, floor + 2.32, plane + side * .062, bay - .21, .048, .055, steel);
          box(px, floor + .54, plane + side * .085, bay + .02, .115, .26, trim);
        }
      }
      box(x, floor + .12, z, w + .2, .21, d + .23, stone);
    }
    const top = y + levels * pitch;
    box(x, top + .13, z, w + .76, .26, d + .84, ivory);
    box(x, top + .3, z, w - .14, .12, d - .12, trim);
    return top + .37;
  }

  function screen(x, z, w, y, h) {
    for (let i = 0; i < Math.round(w / .36); i++) box(x - w / 2 + (i + .5) * .36, y + h / 2, z, .12, h, .37, wood);
  }

  function portico(x, z, w, d, h) {
    box(x, h, z, w, .24, d, ivory);
    for (const s of [-1, 1]) box(x + s * (w / 2 - .18), h / 2, z + d / 2 - .2, .19, h, .19, steel);
  }
  const index = landmarkNames.indexOf(name);
  if (index < 0) throw Error('Unknown landmark ' + name);
  if (index < 3) {
    wing(-3.65, -.5, [5.7, 7.2, 6.1][index], 8.5, 0, 2, [stone, ivory, terra][index]);
    wing(3.3, -1.25, 6.7, 6.3, 0, 1, ivory);
    portico(2.8, 2.58, 7.8, 3.4, 3.72);
    screen(-5.60, 3.88, 1.62, 0, 6.3);
    box(3.25, 4.54, 1.81, 6.55, .065, .098, steel);
    for (let i = 0; i < 8; i++) box(.03 + i * .92, 4.03, 1.81, .053, .98, .064, steel);
    box(-1.66, 1.29, 3.82, 1.14, 2.58, .18, wood);
    box(-1.28, 1.25, 3.95, .055, .38, .055, steel);
    if (index !== 1) wing(2.22, -2, 4.2, 3.4, 3.61, 1, stone, 2.9);
    else
      for (let j = 0; j < 8; j++) box(2.8, 4, 1.13 + j * .41, 7.9, .15, .12, wood);
    box(-4.8, 6.95, -1, .76, 1.1, .85, stone);
  } else {
    const i = index - 3,
      top = wing(-3.2, -1.9, 17, 10.6, 0, [4, 2, 3][i], [ivory, terra, stone][i], 3.45);
    wing(7.4, 1.1, 6.6, 9.6, 0, [2, 2, 1][i], [stone, ivory, terra][i]);
    portico(-2, 5.45, 14.4, 5.1, 3.8);
    for (let j = 0; j < 4; j++) box(-7.8 + j * 3.7, 1.65, 3.53, 1.5, 3.1, .12, glass, 3);
    if (i === 2)
      for (let j = 0; j < 6; j++) box(-8.5 + j * 2.5, 2, 7.3, .43, 4, .48, ivory);
    if (i === 1) screen(7.5, 6.03, 5.8, .15, 6.55);
    if (i === 0) {
      box(-8.7, top + 1.4, -2, 2.8, 2.8, 4.8, trim);
      for (let j = 0; j < 3; j++) box(-4 + j * 1.7, top + .55, -3.8, 1.25, 1.1, 2.1, steel);
    }
  }
  const min = [Infinity, Infinity, Infinity],
    max = min.map(() => -Infinity);
  for (let i = 0; i < positions.length; i++) {
    const a = i % 3;
    min[a] = Math.min(min[a], positions[i]);
    max[a] = Math.max(max[a], positions[i]);
  }
  const origin = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  for (let i = 0; i < positions.length; i++) positions[i] -= origin[i % 3];
  return {
    positions,
    normals,
    colors,
    surface,
    indices,
    size: max.map((v, i) => v - min[i])
  };
}
