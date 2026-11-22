import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import catalog from '../src/places/catalog.json' with {type:'json'};
import {buildings,footprint,wildPlants,orchardTree,buildingAt,inParcel} from '../src/places/records.js';
import {landmark,landmarkNames} from '../src/places/landmarks.js';
import {promenade,promenadeHeight} from '../src/places/promenade.js';
import {inside,overlap,parcels} from '../src/roads/parcels.js';
import {corridorDistance} from '../src/roads/network.js';
import {groundHeight} from '../src/world/queries.js';
import {shoreline} from '../src/world/regions.js';
import {plannedHalfSize,TILE} from '../src/data/world.js';
import {generate} from '../src/terrain/generate.js';

test('original parcel data, building setbacks, foundations, access and pool clearance',()=>{
  const original=parcels.filter(p=>p.id.startsWith('kb/'));
  assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),'a155abe641b10f44e22d683686ceb106f372830023249d21700376a3fa4b6332');
  assert.equal(buildings.length,parcels.filter(p=>p.use==='building').length);
  assert.equal(new Set(buildings.map(b=>b.id)).size,buildings.length);
  assert.equal(buildings.filter(b=>b.id.startsWith('kb/')).length,183);
  for(const b of buildings){
    assert.ok(b.corners.every(c=>inside(c,b.parcel.envelope)),b.id);
    assert.equal(buildingAt(b.position.x,b.position.z),b);
    assert.ok(b.corners.every(c=>Math.abs(b.position.y-groundHeight(c.x,c.z))<b.foundation));
    assert.ok(b.height<=b.parcel.heightLimit && b.access.endsWith('/entrance'));
    if(b.pool){
      const rim=footprint(b.pool,b.yaw,b.pool.width+.7,b.pool.depth+.7);
      assert.ok(rim.every(c=>inside(c,b.parcel.corners)) && !overlap(rim,b.corners));
      assert.ok(rim.every(c=>b.pool.y-.83>groundHeight(c.x,c.z)));
    }
    const tree=orchardTree(b);if(tree){assert.ok(!buildingAt(tree.x,tree.z));assert.ok(corridorDistance(tree.x,tree.z)>1.5);}
  }
});
test('all building templates, source GLB buffers, and simplified architectural meshes resolve',()=>{
  const models=new Map();
  for(const kit of ['homes','city','works','garden','canopy']){
    const data=gunzipSync(readFileSync(new URL('../assets/models/'+kit+'.glb.gz',import.meta.url)));
    assert.equal(data.readUInt32LE(8),data.length);assert.equal(data.toString('ascii',0,4),'glTF');
    const n=data.readUInt32LE(12),g=JSON.parse(data.toString('utf8',20,20+n));
    assert.ok(g.buffers.every(b=>!b.uri));
    for(const view of g.bufferViews)assert.ok(view.byteOffset+view.byteLength<=g.buffers[0].byteLength);
    for(const m of g.meshes){const face=m.primitives[0],pos=g.accessors[face.attributes.POSITION];
      assert.ok(pos.min.every(Number.isFinite)&&pos.max.every(Number.isFinite));models.set(m.name,g.accessors[face.indices].count);}
  }
  for(const name of landmarkNames){
    const rec=landmark(name);assert.deepEqual(rec.size,catalog['landmarks_'+name].size);
    assert.ok(rec.indices.every(v=>v>=0 && v<rec.positions.length/3));assert.ok(rec.normals.every(Number.isFinite));
    models.set('landmarks_'+name,rec.indices.length);
  }
  for(const [id,asset] of Object.entries(catalog)){
    assert.ok(models.get(id)>0,id);
    if(['city','works','homes'].includes(asset.kit))assert.ok(models.get(id+'_lod')<models.get(id));
  }
  assert.equal(new Set(buildings.map(b=>b.asset)).size,66);
});
test('woodland seeds survive revisits and exclude roads, private lots and open water',()=>{
  let checked=0;
  for(const [x,z] of [[-14,-14],[-1,0],[-4,2],[0,25],[1,28]]){
    const plants=wildPlants(x,z);assert.deepEqual(plants,wildPlants(x,z));checked+=plants.length;
    for(const p of plants){assert.ok(!inParcel(p.x,p.z));assert.ok(corridorDistance(p.x,p.z)>5);assert.ok(p.z<shoreline(p.x));}
  }
  assert.ok(checked>30);
});
test('mixed-LOD seams and the submerged shoreline extend across the playable envelope',()=>{
  assert.equal((2*plannedHalfSize)**2/1e6,94.633984);
  for(const [tx,tz] of [[-18,-17],[-2,13],[15,16]]){
    const edges=[];
    for(const [tile,n,side] of [[tx,8,TILE],[tx+1,32,0]]){
      const mesh=generate(tile,tz,n),points=[];
      for(let i=0;i<mesh.position.length;i+=3)if(mesh.position[i]===side)points.push([mesh.position[i+2],mesh.position[i+1],...mesh.normal.slice(i,i+3)]);
      edges.push(points.sort((a,b)=>a[0]-b[0]));
    } assert.deepEqual(edges[0],edges[1]);
  }
  for(const x of [-4300,-2200,-300,300,2800,4650]){const z=shoreline(x);assert.ok(groundHeight(x,z-18)>0 && Math.abs(groundHeight(x,z))<.35 && groundHeight(x,z+30)<0);}
});
test('the beach boardwalk has a walkable deck clear of building footprints',()=>{
  for(const d of promenade){const {x,z}=d.center;assert.ok(Math.abs(promenadeHeight(x,z)-d.y)<.065);assert.ok(!buildingAt(x,z));}
});
