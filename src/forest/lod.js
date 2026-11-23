import { treeSpecies } from '../trees/species.js';

export const profiles = {
  low: {
    search: 145,
    nearPx: 130,
    midPx: 35,
    triangles: 270000,
    nearCap: 16,
    midCap: 54,
  },
  medium: {
    search: 205,
    nearPx: 105,
    midPx: 24,
    triangles: 525000,
    nearCap: 32,
    midCap: 112,
  },
  high: {
    search: 275,
    nearPx: 83,
    midPx: 17,
    triangles: 820000,
    nearCap: 52,
    midCap: 200,
  },
};
export const spruceMidTriangles = 8774;
export function triangleCost(t, level) {
  if (t.species === 2 && level === 'far') return spruceMidTriangles;
  return treeSpecies[t.species].lod.triangles[level === 'near' ? 0 : 1];
}

// A sustained frame-time change adjusts the triangle allowance in small steps.
// Exclude streaming and tab stalls. A slow renderer still keeps foreground detail.
export class DetailBudget {
  factor = 1;
  average = 18;
  seconds = 0;
  sample(dt, stable) {
    if (!stable || dt <= 0 || dt > 2) return false;
    this.average +=
      (Math.min(100, dt * 1000) - this.average) * Math.min(0.25, dt * 0.9);
    this.seconds += Math.min(0.5, dt);
    if (this.seconds < 1.2) return false;
    this.seconds = 0;
    const next = Math.max(
      0.68,
      Math.min(
        1.28,
        this.factor +
          (this.average > 48
            ? -0.12
            : this.average > 32
              ? -0.08
              : this.average < 19
                ? 0.04
                : 0),
      ),
    );
    if (Math.abs(next - this.factor) < 0.001) return false;
    this.factor = next;
    return true;
  }
}

// Broad-phase range is a CPU limit. Rank by projected crown size and actual view
// overlap before spending the triangle budget. Sizes are in drawing-buffer pixels.
export function visualPriority(t, eye, view) {
  const { width, depth, height } = treeSpecies[t.species].dimensions;
  const h = height * t.scale,
    radius = 0.5 * Math.max(width, depth) * t.scale;
  const dx = t.x - eye.x,
    dy = t.y + 0.5 * h - eye.y,
    dz = t.z - eye.z;
  const forward = dx * view.fx + dy * view.fy + dz * view.fz;
  const side = Math.abs(dx * view.rx + dy * view.ry + dz * view.rz);
  const vertical = Math.abs(dx * view.ux + dy * view.uy + dz * view.uz);
  const bound = Math.hypot(radius, h * 0.5),
    z = Math.max(0.5, forward);
  if (
    forward < -bound ||
    side > z * view.tanX * 1.12 + bound ||
    vertical > z * view.tanY * 1.12 + bound
  )
    return 0;
  const distance = Math.max(2, Math.hypot(dx, dy, dz) - 0.4 * radius);
  const centre = 1 - Math.min(1, side / (z * view.tanX + radius));
  const coverage = (view.focal * Math.sqrt(h * 2 * radius)) / distance;
  return (
    coverage *
    (0.88 + 0.23 * centre) *
    (t.species === 1 ? 1.2 : t.species === 2 ? 1.15 : 1)
  );
}

export function selectDetail(candidates, prior, profile, factor = 1) {
  const budget = profile.triangles * factor,
    selected = new Map();
  let spent = 0,
    near = 0,
    mid = 0;
  const rank = (t, level) =>
    t.pixels * (prior.get(t.index) === level ? 1.28 : 1);
  const ranked = candidates
    .slice()
    .sort(
      (a, b) =>
        rank(b, 'near') - rank(a, 'near') || a.index.localeCompare(b.index),
    );
  for (const t of ranked) {
    const cost = triangleCost(t, 'near');
    if (rank(t, 'near') < profile.nearPx) break;
    if (near >= profile.nearCap || spent + cost > budget * 0.49) continue;
    selected.set(t.index, { ...t, level: 'near' });
    spent += cost;
    near++;
  }
  ranked.sort(
    (a, b) => rank(b, 'far') - rank(a, 'far') || a.index.localeCompare(b.index),
  );
  for (const t of ranked) {
    if (rank(t, 'far') < profile.midPx || mid >= profile.midCap) break;
    if (selected.has(t.index)) continue;
    const cost = triangleCost(t, 'far');
    if (spent + cost > budget) continue;
    selected.set(t.index, { ...t, level: 'far' });
    spent += cost;
    mid++;
  }
  return selected;
}

// "near" and "far" are fractions of the pixel mask. The canopy always owns
// 1-near-far. Asset readiness is checked before any canopy coverage is removed.
export class TreeHandoffs {
  constructor() {
    this.states = new Map();
    this.moving = false;
  }
  advance(targets, ready, alive, dt) {
    this.moving = false;
    const step = Math.min(0.22, Math.max(0.001, dt / 0.34));
    const used = { near: 0, far: 0 },
      limits = { near: 4, far: 10 };
    for (const t of targets.values()) limits[t.level]++;
    for (const [id, state] of this.states) {
      if (!alive(state.tree)) {
        this.states.delete(id);
        continue;
      }
      if (state.near > 0) used.near++;
      if (state.far > 0) used.far++;
    }
    for (const [id, t] of targets) {
      if (!this.states.has(id))
        this.states.set(id, { tree: t, near: 0, far: 0 });
      else this.states.get(id).tree = t;
    }
    const drawn = [];
    for (const [id, s] of this.states) {
      const wanted = targets.get(id)?.level,
        level = ready(s.tree.species) ? wanted : undefined;
      for (const name of ['near', 'far']) {
        if (name === level || !s[name]) continue;
        s[name] = Math.max(0, s[name] - step);
        if (!s[name]) used[name]--;
      }
      if (
        level &&
        s[level] < 1 &&
        (s[level] > 0 || used[level] < limits[level])
      ) {
        if (!s[level]) used[level]++;
        s[level] = Math.min(
          1 - s[level === 'near' ? 'far' : 'near'],
          s[level] + step,
        );
      }
      if (level ? s[level] < 0.999999 : s.near + s.far > 0) this.moving = true;
      if (!wanted && !s.near && !s.far) {
        this.states.delete(id);
        continue;
      }
      if (s.near > 0)
        drawn.push({
          ...s.tree,
          level: 'near',
          weight: s.near,
          start: 0,
          end: s.near,
        });
      if (s.far > 0)
        drawn.push({
          ...s.tree,
          level: 'far',
          weight: s.far,
          start: s.near,
          end: s.near + s.far,
        });
    }
    return drawn;
  }
}
