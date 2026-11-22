import {buildings} from '../places/records.js';
import {shoreline} from '../world/regions.js';
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import { roads, nodes, roadLimits, offset } from '../roads/network.js';
import {
  zoneAreas,
  zones,
  parcels,
  greenReservations,
} from '../roads/parcels.js';
import { junctions } from '../roads/junctions.js';
import { stationsBetween } from '../roads/navigation.js';
import { elevation } from '../terrain/field.js';

export const layers = {
  building:['Building footprints','#f4ce8f'],bounds:['Collision boxes','#91d3ec'],habitat:['Vegetation regions','#a1c977'],
  center: ['Centerlines', '#f7cf6a'],
  edges: ['Road boundaries', '#b4e9f0'],
  junction: ['Junctions', '#f79672'],
  zone: ['Zoning boundaries', '#94c483'],
  parcel: ['Building parcels', '#c3d3a0'],
  graph: ['Connectivity', '#80e4ce'],
  grade: ['Grading limits', '#e3abce'],
};
const loop = (points) => [...points, points[0]];
function paths(key) {
  if(key==='building')return buildings.map(b=>({points:loop(b.corners.map(c=>({...c,y:b.position.y+.14})))}));
  if(key==='bounds')return buildings.flatMap(b=>{
    const roof=b.corners.map(c=>({...c,y:b.position.y+b.height}));
    return [{points:loop(roof)},...b.corners.map((c,i)=>({points:[{...c,y:b.position.y},roof[i]]}))];
  });
  if(key==='habitat')return [
    {points:[{x:-1420,z:4864},{x:-1420,z:-1240},{x:4864,z:-1240}]},
    {points:Array.from({length:100},(_,i)=>{const x=-4864+i*9728/99;return {x,z:shoreline(x)-135};})}
  ];
  if (key === 'zone')
    return [
      ...zoneAreas.map((z) => ({
        points: loop(z.points),
        color: zones[z.type].color,
      })),
      ...greenReservations.map((z) => ({
        points: loop(z.points),
        color: zones.green.color,
      })),
    ];
  if (key === 'parcel')
    return parcels.map((p) => ({
      points: loop(p.corners),
      color: zones[p.zone].color,
    }));
  const out = [];
  for (const r of roads) {
    const line = stationsBetween(r, ...roadLimits(r));
    if (key === 'center') out.push({ points: line });
    if (key === 'edges')
      for (const sign of [-1, 1])
        out.push({
          points: line.map((p) => offset(p, sign * r.section.outer)),
        });
    if (key === 'graph') out.push({ points: [nodes.get(r.a), nodes.get(r.b)] });
  }
  if (key === 'junction')
    for (const j of junctions.values())
      out.push({
        points: loop(
          j.corners.flatMap((c) => [
            offset(c.a.mouth, -c.a.road.section.half),
            ...c.inner,
          ]),
        ),
      });
  if (key === 'grade') {
    // Trace the outer limit of the union of corridor envelopes, including junctions.
    const lines = [],
      step = 12;
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const values = new Map();
    const value = (x, z) => {
      const k = x + ',' + z;
      if (!values.has(k))
        values.set(k, Math.min(100, corridorDistance(x, z, 50)) - 85);
      return values.get(k);
    };
    for (let z = -600; z <= 1050; z += step)
      for (let x = -780; x <= 480; x += step) {
        const pts = corners.map(([a, b]) => ({
            x: x + a * step,
            z: z + b * step,
          })),
          cuts = [];
        for (let i = 0; i < 4; i++) {
          const a = pts[i],
            b = pts[(i + 1) % 4],
            va = value(a.x, a.z),
            vb = value(b.x, b.z);
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          cuts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        }
        for (let i = 1; i < cuts.length; i += 2)
          lines.push({ points: [cuts[i - 1], cuts[i]] });
      }
    return lines;
  }
  return out;
}
import { corridorDistance } from '../roads/network.js';
export class PlanOverlay {
  constructor(scene) {
    this.scene = scene;
    this.active = new Set();
    this.objects = new Map();
    this.paths = new Map();
  }
  lines(k) {
    if (!this.paths.has(k)) this.paths.set(k, paths(k));
    return this.paths.get(k);
  }
  toggle(k, on) {
    if (on) this.active.add(k);
    else this.active.delete(k);
    if (!this.objects.has(k) && on) {
      const vertices = [];
      for (const { points } of this.lines(k)) {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i],
            n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 12));
          for (let j = 0; j < n; j++)
            for (const t of [j / n, (j + 1) / n]) {
              const x = a.x + t * (b.x - a.x),
                z = a.z + t * (b.z - a.z);
              vertices.push(x,a.y===undefined?elevation(x,z)+.38:a.y+(b.y-a.y)*t,z);
            }
        }
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(vertices, 3));
      const line = new LineSegments(
        geo,
        new LineBasicMaterial({
          color: layers[k][1],
          depthTest: false,
          transparent: true,
          opacity: 0.8,
        }),
      );
      line.renderOrder = 30;
      this.scene.add(line);
      this.objects.set(k, line);
    }
    if (this.objects.has(k)) this.objects.get(k).visible = on;
  }
  dispose() {
    for (const obj of this.objects.values()) {
      obj.removeFromParent();
      obj.geometry.dispose();
      obj.material.dispose();
    }
  }
}
export function drawStreets(ctx, px, py, unit, overlay, full) {
  function path(pts, close = false) {
    ctx.beginPath();
    pts.forEach((p, i) =>
      i ? ctx.lineTo(px(p.x), py(p.z)) : ctx.moveTo(px(p.x), py(p.z)),
    );
    if (close) ctx.closePath();
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (overlay.active.has('zone'))
    for (const a of [...zoneAreas].reverse()) {
      path(a.points, true);
      ctx.fillStyle = zones[a.type].color + '60';
      ctx.fill();
    }
  for (const r of roads) {
    path(r.samples);
    ctx.strokeStyle = r.section.lanes >= 4 ? '#e1cf94' : '#c7c9ac';
    ctx.lineWidth = Math.max(full ? 0.7 : 0.6, (r.section.half * 1.7) / unit);
    ctx.stroke();
  }
  for (const k of overlay.active) {
    ctx.lineWidth = k === 'graph' ? 1.4 : 0.85;
    for (const line of overlay.lines(k)) {
      path(line.points);
      ctx.strokeStyle = line.color || layers[k][1];
      ctx.stroke();
    }
  }
  ctx.restore();
}
