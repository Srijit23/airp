import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DetailBudget,
  profiles,
  visualPriority,
  selectDetail,
  TreeHandoffs,
  triangleCost,
} from '../src/forest/lod.js';
const make = (index, pixels, extra = {}) => ({
  index,
  pixels,
  species: 2,
  x: 0,
  y: 0,
  z: -50,
  scale: 1,
  ...extra,
});
test('camera-facing spruce wins the detail slot over a closer tree behind the camera', () => {
  const eye = { x: 0, y: 2, z: 0 },
    view = {
      fx: 0,
      fy: 0,
      fz: -1,
      rx: 1,
      ry: 0,
      rz: 0,
      ux: 0,
      uy: 1,
      uz: 0,
      tanX: 1,
      tanY: 0.55,
      focal: 540,
    };
  assert.equal(visualPriority(make('behind', 0, { z: 15 }), eye, view), 0);
  assert.ok(
    visualPriority(make('visible', 0), eye, view) > profiles.high.midPx,
  );
});
test('retains a selected tree through a small ranking change and respects triangle cost', () => {
  const a = make('a', 51),
    b = make('b', 54),
    p = { ...profiles.high, midCap: 1 };
  assert.deepEqual(
    [...selectDetail([a, b], new Map([['a', 'far']]), p).keys()],
    ['a'],
  );
  const many = Array.from({ length: 300 }, (_, i) =>
    make(String(i), 60 + i * 0.4, { species: i % 5 }),
  );
  const chosen = selectDetail(many, new Map(), profiles.medium, 0.68);
  assert.ok(
    [...chosen.values()].reduce((n, t) => n + triangleCost(t, t.level), 0) <=
      profiles.medium.triangles * 0.68,
  );
});
test('asynchronous loading, overflow, reversal and unload keep a continuous representation', () => {
  const fades = new TreeHandoffs(),
    tree = make('a', 100);
  const target = new Map([['a', { ...tree, level: 'far' }]]);
  assert.deepEqual(
    fades.advance(
      target,
      () => false,
      () => true,
      0.1,
    ),
    [],
  );
  let prior = 0;
  for (let i = 0; i < 8; i++) {
    const rows = fades.advance(
        target,
        () => true,
        () => true,
        0.06,
      ),
      cover = rows.reduce((n, t) => n + t.weight, 0);
    assert.ok(cover >= prior && cover - prior <= 0.23);
    prior = cover;
  }
  target.get('a').level = 'near';
  for (const level of ['near', 'far', 'near', 'near']) {
    target.get('a').level = level;
    const rows = fades.advance(
      target,
      () => true,
      () => true,
      0.05,
    );
    assert.ok(
      rows.length > 0 &&
        Math.abs(rows.reduce((n, t) => n + t.weight, 0) - 1) < 1e-6,
    );
  }
  const eviction = fades.advance(
    new Map(),
    () => true,
    () => true,
    0.03,
  );
  assert.ok(eviction.length && eviction.at(-1).end < 1);
  assert.deepEqual(
    fades.advance(
      new Map(),
      () => true,
      () => false,
      0.03,
    ),
    [],
  );
  assert.equal(fades.states.size, 0);
});
test('frame feedback responds slowly to sustained cost and ignores loading stalls', () => {
  const b = new DetailBudget();
  for (let i = 0; i < 230; i++) b.sample(0.05, true);
  assert.ok(b.factor >= 0.68 && b.factor < 0.85);
  const f = b.factor;
  b.sample(3, true);
  b.sample(0.9, false);
  assert.equal(b.factor, f);
  for (let i = 0; i < 1600; i++) b.sample(0.012, true);
  assert.ok(b.factor > 1);
});

test('budget churn limits transient meshes while the portrait covers every rejected crown', () => {
  const handoff = new TreeHandoffs();
  const targets = (prefix) =>
    new Map(
      Array.from({ length: 15 }, (_, i) => {
        const key = prefix + i;
        return [key, { ...make(key, 45), level: 'near' }];
      }),
    );
  let selected = targets('old');
  for (let i = 0; i < 10; i++)
    handoff.advance(
      selected,
      () => true,
      () => true,
      0.05,
    );
  selected = targets('new');
  for (let i = 0; i < 14; i++) {
    const drawn = handoff.advance(
      selected,
      () => true,
      () => true,
      0.03,
    );
    assert.ok(drawn.length <= selected.size + 4);
    for (const t of drawn) assert.ok(t.start === 0 && t.end > 0 && t.end <= 1);
    if (!i)
      assert.ok(
        drawn.filter((t) => t.index.startsWith('old')).every((t) => t.end < 1),
      );
  }
  assert.equal(handoff.states.size, selected.size);
});
