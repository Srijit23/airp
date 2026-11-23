// Rebalance only the forest spruce middle LOD. Indices address the approved
// near mesh, so its UVs, branch positions, normals and quantization stay intact.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import {writeFile} from 'node:fs/promises';
await Promise.all([MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read('public/assets/trees/spruce.glb');
const near=doc.getRoot().listNodes().find(n=>n.getName()==='near');
const chunks=[];
for(const name of ['Spruce_Bark','Spruce_Needles']){
  const p=near.listChildren().flatMap(n=>n.getMesh().listPrimitives()).find(p=>p.getMaterial().getName()===name);
  const pos=p.getAttribute('POSITION'),points=new Float32Array(pos.getCount()*3);
  for(let i=0;i<pos.getCount();i++)points.set(pos.getElement(i,[]),i*3);
  const idx=Uint32Array.from(p.getIndices().getArray()),leaf=name==='Spruce_Needles';
  // The trunk contains thousands of tiny disconnected twigs. Sloppy reduction
  // is restricted to bark. Preserve disconnected needle sprays and their UV seams.
  const [indices]=leaf?MeshoptSimplifier.simplify(idx,points,3,Math.floor(idx.length*.64/3)*3,.018):
    MeshoptSimplifier.simplifySloppy(idx,points,3,null,3600,.10);
  const block=Buffer.alloc(4+indices.length*2);block.writeUInt32LE(indices.length);
  for(let k=0;k<indices.length;k++)block.writeUInt16LE(indices[k],4+k*2);
  chunks.push(block);console.log(name,indices.length/3);
}
await writeFile('src/forest/spruce-mid.bin',Buffer.concat(chunks));
