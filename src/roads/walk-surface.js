// Horizontal lookup for the actual centimetre-quantized pavement. Vertical kerb
// faces and street furniture are excluded from the walkable surface index.
export function walkIndex(geometry, x0, z0, grade) {
  const vertices = geometry.attributes.position.array,
    normals = geometry.attributes.normal.array,
    kinds = geometry.attributes.surface.array,
    cells = new Map(),
    size = 8;
  for (let i = 0; i < vertices.length; i += 9) {
    if (
      kinds[i / 3] > 2 ||
      normals[i + 1] < 90 ||
      vertices[i + 1] - grade(x0 + vertices[i], z0 + vertices[i + 2]) > 0.32
    )
      continue;
    const x1 = vertices[i],
      x2 = vertices[i + 3],
      x3 = vertices[i + 6],
      z1 = vertices[i + 2],
      z2 = vertices[i + 5],
      z3 = vertices[i + 8];
    for (
      let z = Math.floor(Math.min(z1, z2, z3) / size);
      z <= Math.floor(Math.max(z1, z2, z3) / size);
      z++
    )
      for (
        let x = Math.floor(Math.min(x1, x2, x3) / size);
        x <= Math.floor(Math.max(x1, x2, x3) / size);
        x++
      ) {
        const k = z * 33 + x;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(i);
      }
  }
  return (x, z, base) => {
    x -= x0;
    z -= z0;
    const tri =
      cells.get(Math.floor(z / size) * 33 + Math.floor(x / size)) || [];
    let height = base;
    for (const i of tri) {
      const ax = vertices[i],
        az = vertices[i + 2],
        bx = vertices[i + 3],
        bz = vertices[i + 5],
        cx = vertices[i + 6],
        cz = vertices[i + 8];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-9) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det,
        v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
      if (u >= -0.00001 && v >= -0.00001 && u + v <= 1.00001)
        height = Math.max(
          height,
          vertices[i + 1] * u +
            vertices[i + 4] * v +
            vertices[i + 7] * (1 - u - v),
        );
    }
    return height;
  };
}
