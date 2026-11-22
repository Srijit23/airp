// Offline only. Dependencies live next to this script, outside the game's build.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, prune, simplifyPrimitive, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { attachPineLOD } from './scots-pine.mjs';

const destination = fileURLToPath(new URL('../../public/assets/trees/', import.meta.url));
const species = { oak: 'oak-tree', pine: 'scots-pine', spruce: 'snowy-spruce', birch: 'birch-tree', acacia: 'acacia-tree' };
const sourceDir = process.argv[2];
if (!sourceDir) throw Error('Pass the directory containing the five original GLBs.');
await mkdir(destination, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const stats = {};
for (const [id, file] of Object.entries(species)) {
  const bytes = await readFile(join(sourceDir, file + '.glb'));
  const doc = await io.readBinary(bytes);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const near = doc.createNode('near');
  for (const node of doc.getRoot().listNodes().slice()) {
    if (!node.getMesh()) continue;
    if (['Snow', 'SnowMound'].includes(node.getName())) { node.dispose(); continue; }
    near.addChild(node);
  }
  for (const child of scene.listChildren()) child.dispose();
  scene.addChild(near);
  await doc.transform(prune(), weld());
  const far = doc.createNode('far');
  scene.addChild(far);
  let lodSource;
  if (id === 'pine') {
    const lodBytes = await readFile(join(sourceDir, 'scots-pine-lod1.glb'));
    lodSource = { sourceFile: 'scots-pine-lod1', sha256: createHash('sha256').update(lodBytes).digest('hex') };
    await attachPineLOD(doc, far, await io.readBinary(lodBytes));
  } else for (const part of near.listChildren()) {
    const mesh = doc.createMesh(part.getName() + '_far');
    for (const original of part.getMesh().listPrimitives()) {
      const reduced = original.clone();
      simplifyPrimitive(reduced, { simplifier: MeshoptSimplifier, ratio: 0.22, error: 0.04 });
      mesh.addPrimitive(reduced);
    }
    far.addChild(doc.createNode(part.getName() + '_far').setMesh(mesh));
  }
  const triangles = group => group.listChildren().reduce((sum, part) => sum +
    part.getMesh().listPrimitives().reduce((n, p) => n + p.getIndices().getCount() / 3, 0), 0);
  const { min, max } = getBounds(near);
  const rounded = n => Math.round(n * 1000) / 1000;
  stats[id] = { sourceFile: file, ...(lodSource ? { lodSource } : {}), sha256: createHash('sha256').update(bytes).digest('hex'),
    bounds: { min: min.map(rounded), max: max.map(rounded) }, triangles: [triangles(near), triangles(far)] };
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 15, quantizeTexcoord: 14 }));
  await io.write(join(destination, id + '.glb'), doc);
  console.log(id, stats[id]);
}
await writeFile(new URL('../../src/trees/imported.json', import.meta.url), JSON.stringify(stats, null, 2) + '\n');
