import {
  roads,
  nodes,
  along,
  offset,
  roadLimits,
  distance,
  grade,
} from './network.js';
import { parcels } from './parcels.js';
import { junctions, blend, quadratic } from './junctions.js';

const xyz = (p) => ({ ...p, y: grade(p.x, p.z) });
export const lanes = new Map(),
  sidewalks = new Map(),
  crossings = [],
  vehicleGraph = new Map(),
  footGraph = new Map();
const id = (r, kind, side, i) => r.id + '/' + kind + '/' + side + '/' + i;
function connection(graph, from, to, points, type) {
  if (!graph.has(from)) graph.set(from, []);
  graph.get(from).push({
    from,
    to,
    type,
    points: points.map(xyz),
    metres: points.slice(1).reduce((s, p, i) => s + distance(points[i], p), 0),
  });
}
function both(g, from, to, pts, type) {
  connection(g, from, to, pts, type);
  connection(g, to, from, [...pts].reverse(), type);
}
export function stationsBetween(r, a, b) {
  return [
    along(r, a),
    ...r.samples.filter((p) => p.s > a + 0.01 && p.s < b - 0.01),
    along(r, b),
  ];
}
for (const r of roads) {
  const [s, e] = roadLimits(r),
    pts = stationsBetween(r, s, e);
  for (const direction of [1, -1]) {
    for (let i = 0; i < r.section.lanes / 2; i++) {
      const line = pts.map((p) =>
        offset(p, -direction * r.section.lane * (i + 0.5)),
      );
      if (direction < 0) line.reverse();
      const key = id(r, 'lane', direction, i),
        from = key + '/in',
        to = key + '/out';
      lanes.set(key, {
        id: key,
        road: r.id,
        direction,
        index: i,
        from,
        to,
        points: line.map(xyz),
      });
      connection(vehicleGraph, from, to, line, 'lane');
    }
    if (r.section.walk) {
      const key = id(r, 'walk', direction, 0),
        line = pts.map((p) =>
          offset(p, direction * (r.section.half + r.section.walk * 0.55)),
        );
      sidewalks.set(key, {
        id: key,
        road: r.id,
        side: direction,
        points: line.map(xyz),
      });
      both(footGraph, key + '/a', key + '/b', line, 'sidewalk');
    }
  }
}
// A lane change is a forward traversal with a smooth lateral transition in the middle third.
for (const l of lanes.values()) {
  const road = roads.find((r) => r.id === l.road);
  for (const adjacent of [l.index - 1, l.index + 1]) {
    const dest = lanes.get(id(road, 'lane', l.direction, adjacent));
    if (!dest || road.length < 70) continue;
    const line = l.points.map((p, i) => {
      const t = Math.max(0, Math.min(1, (3 * i) / (l.points.length - 1) - 1));
      return blend(p, dest.points[i], t * t * (3 - 2 * t));
    });
    connection(vehicleGraph, l.from, dest.to, line, 'change-lane');
  }
}
function armLane(arm, incoming, index) {
  const sign = (arm.start ? -1 : 1) * (incoming ? 1 : -1);
  return lanes.get(id(arm.road, 'lane', sign, index));
}
function walkEnd(arm, side) {
  const key = id(arm.road, 'walk', side * (arm.start ? 1 : -1), 0);
  return {
    id: key + (arm.start ? '/a' : '/b'),
    p: sidewalks.get(key)?.points.at(arm.start ? 0 : -1),
  };
}
for (const { node, corners, rotary } of junctions.values()) {
  const ringRadius = 15.2;
  const radial = (angle, r = ringRadius) => ({
    x: node.x + r * Math.cos(angle),
    z: node.z + r * Math.sin(angle),
  });
  const ringKey = (k, end) => 'ring/' + node.id + '/' + k + '/' + end;
  for (let k = 0; k < node.arms.length; k++) {
    const a = node.arms[k],
      next = (k + 1) % node.arms.length,
      after = node.arms[next];
    if (rotary) {
      // Left-hand traffic circulates clockwise in the north-up plan.
      const spread = 0.18;
      const arc = (from, to, start, finish) => {
        if (finish <= start) finish += Math.PI * 2;
        const points = Array.from({ length: 12 }, (_, i) =>
          radial(start + ((finish - start) * i) / 11),
        );
        connection(vehicleGraph, from, to, points, 'circulate');
      };
      const enter = ringKey(k, 'merge'),
        leave = ringKey(k, 'exit');
      arc(leave, enter, a.angle - spread, a.angle + spread);
      arc(enter, ringKey(next, 'exit'), a.angle + spread, after.angle - spread);
      for (let i = 0; i < a.road.section.lanes / 2; i++) {
        const incoming = armLane(a, true, i),
          outgoing = armLane(a, false, i);
        connection(
          vehicleGraph,
          incoming.to,
          enter,
          [
            incoming.points.at(-1),
            radial(a.angle + 0.11, 22),
            radial(a.angle + spread),
          ],
          'yield',
        );
        connection(
          vehicleGraph,
          leave,
          outgoing.from,
          [
            radial(a.angle - spread),
            radial(a.angle - 0.11, 22),
            outgoing.points[0],
          ],
          'exit',
        );
      }
    } else {
      for (const b of node.arms) {
        if (a === b) continue;
        for (let i = 0; i < a.road.section.lanes / 2; i++) {
          const enter = armLane(a, true, i),
            first = enter.points.at(-1);
          const lastLane = b.road.section.lanes / 2 - 1;
          const firstIndex = Math.min(i, lastLane);
          const lastIndex =
            i === a.road.section.lanes / 2 - 1 ? lastLane : firstIndex;
          for (let dst = firstIndex; dst <= lastIndex; dst++) {
            const exit = armLane(b, false, dst),
              last = exit.points[0];
            connection(
              vehicleGraph,
              enter.to,
              exit.from,
              Array.from({ length: 9 }, (_, j) =>
                quadratic(first, node, last, j / 8),
              ),
              'turn',
            );
          }
        }
      }
    }
    if (a.road.section.walk && after.road.section.walk) {
      const left = walkEnd(a, 1),
        right = walkEnd(after, -1),
        c = corners[k];
      both(
        footGraph,
        left.id,
        right.id,
        [
          left.p,
          ...c.inner.slice(1, -1).map((p, i) => blend(p, c.outer[i + 1], 0.53)),
          right.p,
        ],
        'corner',
      );
    }
    if (a.road.section.walk && node.arms.length >= 3) {
      const left = walkEnd(a, 1),
        right = walkEnd(a, -1);
      const s = a.start ? node.radius + 2.8 : a.road.length - node.radius - 2.8,
        p = along(a.road, s);
      const edge = a.road.section.half + 0.7;
      const pts = [
        offset(p, edge * (a.start ? 1 : -1)),
        offset(p, -edge * (a.start ? 1 : -1)),
      ];
      crossings.push({
        id: node.id + '/' + a.road.id,
        node: node.id,
        road: a.road.id,
        s,
        points: pts.map(xyz),
      });
      both(
        footGraph,
        left.id,
        right.id,
        [left.p, ...pts, right.p],
        'crosswalk',
      );
    }
  }
}
// Entrance edges follow the same frontage station used by ramps and parking geometry.
for (const p of parcels) {
  const r = roads.find((road) => road.id === p.frontage.roadId),
    s = p.frontage.station,
    side = p.frontage.side;
  const [start, end] = roadLimits(r),
    setback = side * (r.section.half + r.section.walk * 0.55);
  const walk = id(r, 'walk', side, 0),
    door = p.id + '/entrance';
  const part = (a, b, l) =>
    stationsBetween(r, a, b).map((point) => offset(point, l));
  both(
    footGraph,
    walk + '/a',
    door,
    [...part(start, s, setback), p.entrance],
    'parcel-access',
  );
  both(
    footGraph,
    door,
    walk + '/b',
    [p.entrance, ...part(s, end, setback)],
    'parcel-access',
  );
  if (p.use !== 'parking') continue;
  const dir = -side,
    lane = lanes.get(id(r, 'lane', dir, r.section.lanes / 2 - 1)),
    l = side * r.section.lane * (r.section.lanes / 2 - 0.5);
  const inPath = dir > 0 ? part(start, s, l) : part(s, end, l).reverse();
  const outPath = dir > 0 ? part(s, end, l) : part(start, s, l).reverse();
  connection(
    vehicleGraph,
    lane.from,
    p.id + '/parking',
    [...inPath, p.entrance, p.center],
    'parking-entry',
  );
  connection(
    vehicleGraph,
    p.id + '/parking',
    lane.to,
    [p.center, p.entrance, ...outPath],
    'parking-exit',
  );
}
// Shortest path returns traversable edge geometry as well as stable graph identifiers.
export function route(graph, from, to) {
  const queue = [[0, from]],
    cost = new Map([[from, 0]]),
    previous = new Map();
  while (queue.length) {
    queue.sort((a, b) => b[0] - a[0]);
    const [d, u] = queue.pop();
    if (u === to) break;
    if (d !== cost.get(u)) continue;
    for (const edge of graph.get(u) || []) {
      const nd = d + edge.metres;
      if (nd >= (cost.get(edge.to) ?? Infinity)) continue;
      cost.set(edge.to, nd);
      previous.set(edge.to, edge);
      queue.push([nd, edge.to]);
    }
  }
  if (!cost.has(to)) return null;
  const edges = [];
  while (to !== from) {
    const edge = previous.get(to);
    edges.push(edge);
    to = edge.from;
  }
  return edges.reverse();
}
