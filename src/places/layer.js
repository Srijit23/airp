import {BoxGeometry,BufferGeometry,Color,Float32BufferAttribute,Group,InstancedMesh,Matrix4,MeshStandardMaterial,PlaneGeometry,Quaternion,Vector3} from 'three';
import catalog from './catalog.json' with {type:'json'};
import {buildings,orchardTree,wildPlants} from './records.js';
import {landmark,landmarkNames} from './landmarks.js';
import {promenade} from './promenade.js';
import {groundHeight} from '../world/queries.js';
import {pineBoughs} from './conifers.js';
import {dressLot} from './lots.js';
import {facadeMaterial,foliageMaterial,signList,signMaterial} from './materials.js';
import {poolMaterial} from '../environment/water.js';
const up=new Vector3(0,1,0),pos=new Vector3(),size=new Vector3(),rot=new Quaternion(),white=new Color(0xffffff);
function matrix(p,yaw,scale,tilt){
  const m=new Matrix4().compose(pos.set(p.x,p.y,p.z),rot.setFromAxisAngle(up,yaw),size.fromArray(scale));
  if(tilt){m.elements[1]+=tilt[0]*scale[0];m.elements[9]+=tilt[1]*scale[2];}return m;
}
export class PlaceLayer{
  static async create(scene,assets){
    const ids=['homes','city','works','garden','canopy','place-diff','place-nor_gl','place-oak','place-pine','place-bark','pavers','meadow'];
    const results=await Promise.allSettled(ids.map(id=>assets.acquire(id)));
    const handles=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
    try{
      const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
      const values=Object.fromEntries(ids.map((id,i)=>[id,handles[i].value]));
      return new PlaceLayer(scene,values,handles);
    }catch(error){handles.forEach(h=>h.release());throw error;}
  }
  constructor(scene,v,handles){
    this.handles=handles;this.root=new Group();scene.add(this.root);this.clock={value:0};
    this.models=new Map();this.materials=new Set();this.owned=new Set();this.batches=new Map();this.cells=new Map();this.revision=0;
    const facade=facadeMaterial(v['place-diff'],v['place-nor_gl']);
    const urban=facadeMaterial(v['place-diff'],v['place-nor_gl'],true);
    const distant=new MeshStandardMaterial({vertexColors:true,roughness:.85});
    const garden=new MeshStandardMaterial({vertexColors:true,roughness:.96});
    const wood=new MeshStandardMaterial({map:v['place-bark'],color:0x9c947a,roughness:.96});
    const oak=foliageMaterial(v['place-oak'],this.clock),pine=foliageMaterial(v['place-pine'],this.clock);
    const assign=(id,g,m)=>{this.models.set(id,{geometry:g,material:m});this.materials.add(m);};
    for(const kit of ['homes','city','works','garden','canopy']){
      v[kit].instantiate().traverse(n=>{
        if(!n.isMesh)return;const name=n.name;
        let geometry=n.geometry;
        if(name.startsWith('pine_')&&name.endsWith('_leaf')){geometry=pineBoughs(name.includes('_near_'));this.owned.add(geometry);}
        const m=kit==='canopy'?(name.endsWith('wood')?wood:name.startsWith('pine')?pine:oak):
          kit==='garden'?garden:name.endsWith('_lod')?distant:kit==='city'?urban:facade;
        assign(name,geometry,m);
      });
    }
    for(const name of landmarkNames){
      const a=landmark(name),g=new BufferGeometry();
      for(const [key,data,n] of [['position',a.positions,3],['normal',a.normals,3],['color',a.colors,3],['_surface',a.surface,1]])g.setAttribute(key,new Float32BufferAttribute(data,n));
      g.setIndex(a.indices);g.computeBoundingSphere();this.owned.add(g);assign('landmarks_'+name,g,facade);
    }
    const cube=new BoxGeometry(1,1,1),plane=new PlaneGeometry(1,1).rotateX(-Math.PI/2);
    this.owned.add(cube);this.owned.add(plane);
    const flat=new MeshStandardMaterial({roughness:.86}),court=new MeshStandardMaterial({map:v.pavers,roughness:.88}),turf=new MeshStandardMaterial({map:v.meadow,roughness:1});
    for(const m of [court,turf])m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vMapUv=(modelMatrix*instanceMatrix*vec4(position,1.)).xz/4.5;');};
    for(const [key,m] of Object.entries({solid:flat,hedge:turf,poolTile:court,court,turf}))assign(key,cube,m);
    const planks=new MeshStandardMaterial({color:0xb69a74,roughness:.94});
    planks.onBeforeCompile=s=>{
      s.vertexShader='varying vec2 deckUv;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n deckUv=position.xz*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[2].xyz));');
      s.fragmentShader='varying vec2 deckUv;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n float slat=fract(deckUv.y*6.);float seam=smoothstep(0.,.075,min(slat,1.-slat));diffuseColor.rgb*=.64+.26*seam+.10*sin(floor(deckUv.y*6.)*36.2)+.045*sin(deckUv.x*73.+2.*sin(deckUv.y*43.));');
    };assign('deck',cube,planks);assign('poolWater',plane,poolMaterial(this.clock));
    const sign=signMaterial();this.signTexture=sign.map;
    signList.forEach((_,i)=>{const g=new PlaneGeometry(1,1),uv=g.attributes.uv;
      for(let j=0;j<uv.count;j++)uv.setY(j,1-(i+1-uv.getY(j))*48/1024);
      this.owned.add(g);assign('sign'+i,g,sign);
    });
    this.lots=buildings.map(b=>{
      const parts=[];
      dressLot(b,(asset,p,yaw,scale,tint,tilt)=>parts.push({asset,m:matrix(p,yaw,scale,tilt),color:tint?new Color(tint):white}));
      return {b,parts,body:matrix(b.position,b.yaw,b.scale),tree:orchardTree(b)};
    });
  }
  update(p,quality,time){
    this.clock.value=time;
    const cx=Math.floor(p.x/128),cz=Math.floor(p.z/128),stamp=cx+','+cz+quality;
    if(stamp===this.stamp)return;this.stamp=stamp;
    const cfg=quality==='high'?{r:4,tiers:4,view:1650,props:480,lod:260}:quality==='low'?{r:2,tiers:2,view:770,props:210,lod:112}:{r:3,tiers:3,view:1200,props:360,lod:175};
    const x=(cx+.5)*128,z=(cz+.5)*128,buckets=new Map();
    const add=(asset,m,color=white)=>{if(!buckets.has(asset))buckets.set(asset,[]);buckets.get(asset).push([m,color]);};
    let plants=0,bodies=0;
    const plant=(v,d)=>{
      if(v.asset==='pine'||v.asset==='broadleaf'){
        const lod=d<(quality==='high'?140:100)?'near':'far',m=matrix(v,v.yaw,[v.height,v.height,v.height]);
        for(const part of ['wood','leaf'])add(v.asset+'_'+lod+'_'+part,m);
      }else{const h=v.height/catalog[v.asset].size[1];add(v.asset,matrix(v,v.yaw,[h,h,h]));}plants++;
    };
    for(const {b,body,parts,tree} of this.lots){
      const d=Math.hypot(x-b.position.x,z-b.position.z);if(d>cfg.view)continue;
      add(d>cfg.lod&&this.models.has(b.asset+'_lod')?b.asset+'_lod':b.asset,body);bodies++;
      if(d<cfg.props)for(const it of parts)add(it.asset,it.m,it.color);
      if(tree&&d<cfg.props+160)plant(tree,d);
    }
    for(const [i,deck] of promenade.entries()){
      if(Math.hypot(deck.center.x-x,deck.center.z-z)>cfg.props+70)continue;
      add('deck',matrix({...deck.center,y:deck.y-.085},deck.yaw,[deck.halfWidth*2,.17,deck.len+.035],[deck.cross,deck.slope]));
      if(i%5!==0||i>=132)continue;
      const px=deck.center.x+deck.dz*3.5,pz=deck.center.z-deck.dx*3.5;
      plant({asset:'garden_tree_palmDetailedTall',x:px,y:groundHeight(px,pz)-.05,z:pz,yaw:i,height:6.8+i%3},0);
      const seat={x:deck.center.x+deck.dz*1.45,y:deck.y+.43,z:deck.center.z-deck.dx*1.45};
      add('solid',matrix(seat,deck.yaw,[.48,.13,1.85]),new Color(0x82654e));
      for(const side of [-.67,.67])add('solid',matrix({x:seat.x+deck.dx*side,y:deck.y+.20,z:seat.z+deck.dz*side},deck.yaw,[.33,.4,.14]),new Color(0x555b52));
    }
    for(let dz=-cfg.r;dz<=cfg.r;dz++)for(let dx=-cfg.r;dx<=cfg.r;dx++){
      const id=(cx+dx)+','+(cz+dz),list=this.cells.get(id)||wildPlants(cx+dx,cz+dz);
      this.cells.delete(id);this.cells.set(id,list);
      for(const v of list){
        if(v.tier>=cfg.tiers)continue;
        const d=Math.hypot(v.x-x,v.z-z);
        if(d>275&&v.asset==='pine'&&v.tier!==0)continue;
        if(d>200&&!['pine','broadleaf','garden_tree_palmDetailedTall'].includes(v.asset))continue;
        plant(v,d);
      }
    }
    while(this.cells.size>140)this.cells.delete(this.cells.keys().next().value);
    for(const [key,m] of this.batches)if(!buckets.has(key)){m.removeFromParent();m.dispose();this.batches.delete(key);}
    for(const [id,items] of buckets){
      const def=this.models.get(id);if(!def)throw Error('Missing place model '+id);
      let m=this.batches.get(id);
      if(!m||m.instanceMatrix.count<items.length){
        if(m){m.removeFromParent();m.dispose();}
        m=new InstancedMesh(def.geometry,def.material,Math.max(4,2**Math.ceil(Math.log2(items.length))));
        m.name=id;m.receiveShadow=true;m.castShadow=id!=='poolWater';this.root.add(m);this.batches.set(id,m);
      }
      m.count=items.length;const colored=['solid','court','poolTile','hedge','turf'].includes(id);
      items.forEach(([mat,color],i)=>{m.setMatrixAt(i,mat);if(colored)m.setColorAt(i,color);});
      m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();
    }
    this.bodies=bodies;this.plants=plants;this.revision++;
  }
  dispose(){
    this.root.removeFromParent();for(const m of this.batches.values())m.dispose();
    this.owned.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.signTexture.dispose();this.handles.forEach(h=>h.release());
    this.cells.clear();this.batches.clear();
  }
}
