import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, BoxGeometry, MeshStandardMaterial, Mesh, Scene, Texture } from 'three';
import { AssetManager } from '../src/core/assets.js';
import { treeSpecies } from '../src/trees/species.js';
import { clearing, detailLevel, showcaseStation, showcaseTrees } from '../src/trees/showcase-plan.js';
import { TreeShowcase } from '../src/trees/showcase.js';
import { stations } from '../src/data/world.js';
import { corridorDistance } from '../src/roads/network.js';
import { parcels, greenReservations, overlap } from '../src/roads/parcels.js';
import { buildingAt, footprint, wildPlants } from '../src/places/records.js';
import { surfaceAt } from '../src/world/queries.js';

test('five distinct attributed, self-contained GLBs have lighter LODs and textured PBR primitives', () => {
  assert.deepEqual(treeSpecies.map(s => s.id), ['oak', 'pine', 'spruce', 'birch', 'acacia']);
  const hashes = new Set();
  for (const spec of treeSpecies) {
    const b = readFileSync(new URL('../public/' + spec.modelPath, import.meta.url));
    assert.equal(b.toString('ascii', 0, 4), 'glTF');
    assert.equal(b.readUInt32LE(8), b.length);
    const g = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
    assert.ok(g.asset.copyright.includes(spec.source.author));
    assert.match(g.asset.copyright, /CC BY 4.0|CC0 1.0/);
    assert.ok(g.images.every(i => i.mimeType === 'image/webp' && i.bufferView != null && !i.uri));
    assert.ok(g.buffers.every(buf => !buf.uri));
    assert.ok(g.extensionsRequired.includes('EXT_meshopt_compression'));
    assert.ok(['CC-BY-4.0', 'CC0-1.0'].includes(spec.source.license));
    assert.ok(spec.collision.radius > 0 && spec.biomes.length && spec.dimensions.height > 6);
    hashes.add(spec.source.sha256);
    const levels = g.scenes[0].nodes.map(i => g.nodes[i]);
    assert.deepEqual(levels.map(n => n.name), spec.lod.nodes);
    const materials = [];
    const counts = levels.map(l => {
      const primitives = l.children.flatMap(i => g.meshes[g.nodes[i].mesh].primitives);
      materials.push(primitives.map(p => p.material));
      return primitives.reduce((n, p) => n + g.accessors[p.indices].count / 3, 0);
    });
    assert.deepEqual(materials[0], materials[1]);
    assert.ok(g.materials.some(m => m.normalTexture && m.pbrMetallicRoughness.baseColorTexture));
    assert.ok(g.materials.some(m => m.alphaMode === 'MASK' && m.pbrMetallicRoughness.baseColorTexture));
    assert.deepEqual(counts, spec.lod.triangles);
    assert.ok(counts[1] < counts[0] * 0.55);
  }
  assert.equal(hashes.size, 5);
});

test('all fifteen crowns fit in one dry Kestrel clearing clear of roads, lots and established trees', () => {
  assert.equal(stations.filter(s => s.name === 'Tree Model Showcase').length, 1);
  assert.equal(stations.find(s => s.id === showcaseStation.id), showcaseStation);
  assert.equal(showcaseTrees.length, 15);
  assert.equal(new Set(showcaseTrees.map(t => t.id)).size, 15);
  assert.equal(buildingAt(showcaseStation.x, showcaseStation.z), null);
  assert.ok(corridorDistance(showcaseStation.x, showcaseStation.z) > 5);
  for (const t of showcaseTrees) {
    const s = treeSpecies.find(s => s.id === t.species);
    const radius = Math.max(s.dimensions.width, s.dimensions.depth) * t.scale * 0.55;
    const bounds = footprint(t, 0, radius * 2, radius * 2);
    assert.ok(Math.hypot(t.x - showcaseStation.x, t.z - showcaseStation.z) > radius + 1);
    assert.ok(parcels.every(p => !overlap(bounds, p.corners)));
    assert.ok(greenReservations.every(p => !overlap(bounds, p.points)));
    assert.ok(corridorDistance(t.x, t.z) > radius);
    assert.ok(Math.hypot(t.x - clearing.x, t.z - clearing.z) < 65);
    const surface = surfaceAt(t.x, t.z);
    assert.ok(surface.district === 'kestrel' && surface.height > 0 && surface.slopeDegrees < s.terrain.maxSlopeDegrees);
    for (let x = Math.floor((t.x-14)/128); x <= Math.floor((t.x+14)/128); x++)
      for (let z = Math.floor((t.z-14)/128); z <= Math.floor((t.z+14)/128); z++)
        assert.ok(wildPlants(x,z).filter(p => p.height > 2.5).every(p => Math.hypot(p.x-t.x, p.z-t.z) > radius+3));
  }
  for (const s of treeSpecies) {
    const group = showcaseTrees.filter(t => t.species === s.id);
    assert.equal(new Set(group.map(t => t.scale)).size, 3);
    assert.equal(new Set(group.map(t => t.yaw)).size, 3);
  }
});

test('LOD hysteresis prevents back-and-forth swaps along the switch boundary', () => {
  for (const { lod } of treeSpecies) {
    const d = lod.switchMetres;
    assert.equal(detailLevel(d+1, 'near', lod), 'near');
    assert.equal(detailLevel(d-1, 'far', lod), 'far');
    assert.equal(detailLevel(d+lod.hysteresisMetres+1, 'near', lod), 'far');
    assert.equal(detailLevel(d-lod.hysteresisMetres-1, 'far', lod), 'near');
  }
});

test('late asset loads release once and cannot resurrect an unloaded showcase', async () => {
  const pending = [], released = [], scene = new Scene();
  const geom = new BoxGeometry(), mat = new MeshStandardMaterial();
  const assets = { acquire(id) {
    return new Promise(resolve => pending.push(() => resolve({
      value: { instantiate() {
        const root = new Group();
        for (const name of ['near', 'far']) {
          const group = new Group(); group.name = name; group.add(new Mesh(geom, mat)); root.add(group);
        }
        return root;
      } }, release() { released.push(id); },
    })));
  } };
  const layer = new TreeShowcase(scene, assets, assert.fail);
  const streamer = { resolutionAt: () => 32 }, inside = { ...clearing, y: 70 };
  layer.update(inside, streamer);
  layer.update({ x: 2000, y: 100, z: 2000 }, streamer);
  layer.update(inside, streamer);
  assert.equal(pending.length, 10);
  pending.splice(5).forEach(r => r());
  await new Promise(r => setImmediate(r));
  layer.update(inside, streamer);
  assert.equal(layer.groves.length, 5);
  assert.equal(layer.root.children.length, 10);
  pending.forEach(r => r());
  await new Promise(r => setImmediate(r));
  assert.equal(released.length, 5);
  assert.equal(layer.root.parent, scene);
  layer.clear();
  assert.equal(released.length, 10);
  assert.equal(layer.root.children.length, 0);
  mat.dispose(); geom.dispose();
});

test('the last handle releases embedded bark and foliage resources, including shared bitmap storage', async () => {
  const assets = new AssetManager({ specimen: { type: 'gltf', category: 'tree' } });
  let closed = 0, disposed = 0;
  const pixels = { close() { closed++; } };
  const bark = new Texture(pixels), foliage = new Texture(pixels);
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial({ map: bark, alphaMap: foliage });
  for (const resource of [bark, foliage, geometry, material])
    resource.addEventListener('dispose', () => disposed++);
  const scene = new Scene();
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
  assets.models.loadAsync = async () => ({ scene, scenes: [scene], animations: [] });
  const a = await assets.acquire('specimen'), b = await assets.acquire('specimen');
  a.release();
  assert.equal(disposed, 0);
  assert.equal(closed, 0);
  b.release();
  b.release();
  assert.equal(disposed, 4);
  assert.equal(closed, 1);
});
