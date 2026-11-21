// Planning coordinates follow the valley. Horizontal metres increase east, vertical metres south.
export function site(u, v) {
  return { x: u - 130 - 0.365 * v + 13 * Math.sin(v / 185), z: v };
}
export function localU(x, z) {
  return x - site(0, z).x;
}
export const sections = {
  highway: { lanes: 4, lane: 3.6, edge: 1.55, walk: 0, design: 75 },
  boulevard: { lanes: 6, lane: 3.25, edge: 0.55, walk: 3.7, design: 50 },
  arterial: { lanes: 4, lane: 3.25, edge: 0.55, walk: 3.15, design: 45 },
  city: { lanes: 2, lane: 3.15, edge: 0.4, walk: 2.45, design: 35 },
  suburban: { lanes: 2, lane: 3, edge: 0.35, walk: 1.8, design: 30 },
  residential: { lanes: 2, lane: 2.75, edge: 0.25, walk: 1.65, design: 25 },
  hill: { lanes: 2, lane: 2.95, edge: 0.55, walk: 1.55, design: 30 },
  service: { lanes: 2, lane: 3.2, edge: 0.4, walk: 1.45, design: 25 },
};
for (const s of Object.values(sections)) {
  s.half = (s.lanes * s.lane) / 2 + s.edge;
  s.outer = s.half + s.walk + 0.42;
}
export const nodes = new Map(),
  roads = [];
function junction(id, u, v) {
  const p = { id, ...site(u, v), arms: [] };
  nodes.set(id, p);
  return id;
}
const levels = [-391, -272, -156, -32, 89, 208, 341, 469, 585];
const widths = [
  [-148, -76, 12, 106, 194],
  [-178, -91, 4, 105, 208],
  [-193, -95, 0, 108, 210],
  [-211, -110, -6, 94, 200],
  [-214, -112, -8, 101, 203],
  [-218, -108, -5, 93, 191],
  [-224, -112, 3, 100, 183],
  [-205, -86, 14, 100, 164],
  [-115, -56, 20, 92, 143],
];
const stagger = [
  [-4, 5, 12, 18, 11],
  [-6, -4, 0, 9, 17],
  [-2, -2, 0, 6, 12],
  [-12, -7, 0, 6, 13],
  [-5, -2, 0, -4, -12],
  [11, 7, 0, -3, -14],
  [12, 6, 0, -6, -15],
  [8, 6, 0, -7, -9],
  [1, 1, 0, -1, -3],
];
const cell = (r, c) => 'K' + r + c;
for (let r = 0; r < levels.length; r++)
  for (let c = 0; c < 5; c++)
    junction(cell(r, c), widths[r][c], levels[r] + stagger[r][c]);
const norm = (x, z) => {
  const d = Math.hypot(x, z);
  return [x / d, z / d];
};
function street(name, kind, ids) {
  ids = ids.map((id) => nodes.get(id));
  for (let i = 0; i < ids.length - 1; i++) {
    const a = ids[i],
      b = ids[i + 1],
      prev = ids[i - 1] || a,
      next = ids[i + 2] || b;
    const da = norm(b.x - prev.x, b.z - prev.z),
      db = norm(next.x - a.x, next.z - a.z);
    roads.push({
      id: 'kb/' + a.id + '-' + b.id,
      name,
      kind,
      a: a.id,
      b: b.id,
      da,
      db,
    });
  }
}
const rowNames = [
  'Northgate Road',
  'Foundry Way',
  'Exchange Street',
  'Meridian Avenue',
  'Civic Parade',
  'Orchard Street',
  'Park Crescent',
  'Willow Lane',
  'Southbank Road',
];
for (let r = 0; r < 9; r++) {
  // Long industrial blocks, a civic superblock and permeable residential grids.
  const spans =
    r === 1
      ? [
          [0, 1, 2],
          [3, 4],
        ]
      : r === 4
        ? [
            [0, 1, 2],
            [2, 3, 4],
          ]
        : r === 6
          ? [
              [0, 1, 2],
              [3, 4],
            ]
          : r === 7
            ? [
                [0, 1, 2, 3],
                [3, 4],
              ]
            : [[0, 1, 2, 3, 4]];
  for (const cols of spans)
    street(
      rowNames[r],
      [
        'service',
        'service',
        'city',
        'arterial',
        'city',
        'city',
        'suburban',
        'residential',
        'suburban',
      ][r],
      cols.map((c) => cell(r, c)),
    );
}
const names = [
  'West Terrace',
  'Linden Street',
  'Basin Boulevard',
  'Market Street',
  'East Bank Drive',
];
for (let c = 0; c < 5; c++) {
  const spans =
    c === 1
      ? [
          [0, 1, 2, 3, 4, 5, 6],
          [7, 8],
        ]
      : c === 3
        ? [
            [0, 1],
            [2, 3, 4, 5, 6, 7, 8],
          ]
        : [[0, 1, 2, 3, 4, 5, 6, 7, 8]];
  for (const rows of spans)
    street(
      names[c],
      ['suburban', 'residential', 'boulevard', 'city', 'suburban'][c],
      rows.map((r) => cell(r, c)),
    );
}
// Northern freight loop and hillside residential drive wind back to public streets.
for (const [id, u, v] of [
  ['depotW', -135, -435],
  ['depotN', -40, -450],
  ['depotE', 63, -452],
  ['terraceN', -249, 228],
  ['terraceW', -309, 292],
  ['terraceS', -293, 397],
  ['terraceE', -261, 454],
  ['elmN', 243, -83],
  ['elmE', 261, -16],
  ['elmS', 241, 56],
  ['southW', 87, 693],
  ['passW', 170, 812],
  ['passS', 195, 924],
  ['gate', 203, 1240],
  ['parkS', 177, 670],
  ['parkE', 173, 622],
])
  junction(id, u, v);
street('Foundry Loop', 'service', [
  cell(0, 0),
  'depotW',
  'depotN',
  'depotE',
  cell(0, 3),
]);
street('Juniper Heights', 'hill', [
  cell(5, 0),
  'terraceN',
  'terraceW',
  'terraceS',
  'terraceE',
  cell(7, 0),
]);
street('Elm Court', 'residential', [
  cell(2, 4),
  'elmN',
  'elmE',
  'elmS',
  cell(4, 4),
]);
street('South Pass Highway', 'highway', [
  cell(8, 2),
  'southW',
  'passW',
  'passS',
  'gate',
]);
street('Meadow Approach', 'suburban', ['southW', 'parkS', 'parkE', cell(8, 4)]);
export const rotaryId = cell(5, 2);
export const gatewayId = 'gate';
