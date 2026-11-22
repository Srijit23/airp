// Convert the artist's KTX2 maps offline so the showcase can use one texture
// format and a single browser decoder. Use the Basis transcoder shipped by Three.
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { copyToDocument, dequantize, prune, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';

async function unpackTextures(doc) {
  const base = new URL('../../node_modules/three/examples/jsm/libs/basis/', import.meta.url);
  const dir = await mkdtemp(join(tmpdir(), 'airp-basis-'));
  try {
    const wrapper = join(dir, 'basis.cjs');
    await copyFile(new URL('basis_transcoder.js', base), wrapper);
    const basis = await createRequire(import.meta.url)(wrapper)({
      wasmBinary: await readFile(new URL('basis_transcoder.wasm', base)),
    });
    basis.initializeBasis();
    for (const texture of doc.getRoot().listTextures()) {
      const file = new basis.KTX2File(texture.getImage());
      try {
        const rgba32 = 13;
        const raw = Buffer.alloc(file.getImageTranscodedSizeInBytes(0, 0, 0, rgba32));
        if (!file.startTranscoding() || !file.transcodeImage(raw, 0, 0, 0, rgba32, 0, -1, -1))
          throw Error('Cannot transcode ' + texture.getName());
        const image = await sharp(raw, { raw: { width: file.getWidth(), height: file.getHeight(), channels: 4 } })
          .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        texture.setImage(image).setMimeType('image/png');
      } finally { file.close(); file.delete(); }
    }
    doc.createExtension(KHRTextureBasisu).dispose();
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export async function attachPineLOD(doc, far, distanceDoc) {
  await Promise.all([doc.transform(dequantize()), distanceDoc.transform(dequantize())]);
  const materials = new Map(doc.getRoot().listMaterials().map(m => [m.getName(), m]));
  const nodes = distanceDoc.getRoot().listScenes()[0].listChildren();
  // Copy author-preserved LOD1 topology and its non-identity node transforms.
  const copied = copyToDocument(doc, distanceDoc, nodes);
  for (const source of nodes) {
    const node = copied.get(source);
    for (const primitive of node.getMesh().listPrimitives()) {
      const mat = materials.get(primitive.getMaterial().getName().replace(/_lod1$/, ''));
      if (!mat) throw Error('Unmatched Scots pine material');
      primitive.setMaterial(mat);
    }
    far.addChild(node.setName(node.getName() + '_far'));
  }
  for (const mesh of doc.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) primitive.setAttribute('_WIND', null);
  // The imported LOD1 textures have been replaced by the shared near materials.
  await doc.transform(prune(), unpartition());
  await unpackTextures(doc);
}
