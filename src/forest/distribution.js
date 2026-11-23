import { BASE, NEAR, TILE, SEED, plannedHalfSize, stations } from '../data/world.js';
import { elevation, noise, smooth } from '../terrain/field.js';
import { layout, triangleAt } from '../terrain/topology.js';
import { corridorDistance, nodes, projection } from '../roads/network.js';
import { parcels, zoneAreas, greenReservations, inside } from '../roads/parcels.js';
import { shoreline } from '../world/regions.js';
import { clearing } from '../trees/showcase-plan.js';
import { treeSpecies } from '../trees/species.js';
import bounds from '../trees/imported.json' with {type:'json'};

const rows = 40, spacing = TILE / rows;
const crown = treeSpecies.map(s => {
  const {min,max} = bounds[s.id].bounds;
  return Math.hypot(Math.max(-min[0],max[0]),Math.max(-min[2],max[2]));
});
const bins = new Map();
function register(x0,z0,x1,z1,shape) {
  for(let i=Math.floor((x0-16)/64);i<=Math.floor((x1+16)/64);i++)
    for(let j=Math.floor((z0-16)/64);j<=Math.floor((z1+16)/64);j++){
      const key=i+','+j;
      if(!bins.has(key)) bins.set(key,[]);
      bins.get(key).push(shape);
    }
}
function polygon(points) {
  const xs=points.map(p=>p.x),zs=points.map(p=>p.z);
  register(Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs),{points});
}
function disk(x,z,r) {register(x-r,z-r,x+r,z+r,{x,z,r});}
for(const p of parcels) polygon(p.corners);
for(const p of [...zoneAreas,...greenReservations]) polygon(p.points);
for(const n of nodes.values()) disk(n.x,n.z,n.radius);
for(const s of stations) disk(s.x,s.z,s.id==='forest'?3.2:7);
polygon([[-61,-29],[61,-29],[61,46],[-61,46]].map(([x,z])=>({x:x+clearing.x,z:z+clearing.z})));

export function isProtected(x,z,r) {
  if(Math.max(Math.abs(x),Math.abs(z))+r>plannedHalfSize || z+r>shoreline(x)-180) return true;
  if(corridorDistance(x,z,r+3)<=r+3) return true;
  const p={x,z};
  for(const shape of bins.get(Math.floor(x/64)+','+Math.floor(z/64)) || []){
    if(!shape.points){if(Math.hypot(x-shape.x,z-shape.z)<=shape.r+r)return true;continue;}
    const poly=shape.points;
    if(inside(p,poly)||poly.some((a,i)=>projection(p,a,poly[(i+1)%poly.length]).distance<=r))return true;
  }
  return false;
}
function random(x,z,salt) {
  let n=Math.imul(x,0x1b873593)^Math.imul(z,0x85ebca6b)^Math.imul(salt+SEED,0x27d4eb2d);
  n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);
  return ((n^(n>>>16))>>>0)/4294967296;
}

// Sample the identical stitched triangles used by the terrain mesh. Shared vertices
// are evaluated once per tile even when hundreds of trunks sit on the same slope.
function sampler(tx,tz,n) {
  const {coords}=layout(n), heights=new Float32Array(coords.length/2).fill(NaN);
  function vertex(i){
    if(Number.isNaN(heights[i]))heights[i]=elevation(tx*TILE+coords[2*i],tz*TILE+coords[2*i+1]);
    return heights[i];
  }
  return (x,z,withSlope=false)=>{
    const {a,b,c,wa,wb,wc}=triangleAt(n,x,z),ha=vertex(a),hb=vertex(b),hc=vertex(c);
    const y=ha*wa+hb*wb+hc*wc;
    if(!withSlope)return y;
    const bx=coords[2*b]-coords[2*a],bz=coords[2*b+1]-coords[2*a+1];
    const cx=coords[2*c]-coords[2*a],cz=coords[2*c+1]-coords[2*a+1];
    const slope=Math.atan(Math.hypot((hb-ha)*cz-(hc-ha)*bz,bx*(hc-ha)-cx*(hb-ha))/Math.abs(bx*cz-cx*bz))*180/Math.PI;
    return {y,slope};
  };
}

export const habitats=['lowland','valley','upland','montane'];
export function habitat(x,z,y) {
  const patch=noise(x/330+8,z/330-41), clearingNoise=noise(x/135-27,z/142+31);
  const coast=shoreline(x)-z;
  const mountain=smooth(90,300,y+75*(patch-.5));
  const dry=z>1050 && coast>235 && y<110 && patch>.46;
  const cool=smooth(250,440,y+130*(patch-.5))*(.40+.60*noise(x/735,z/790+4));
  const highway= z>580 && z<2650 && x<0 && x>-840 && corridorDistance(x,z)<110;
  const density=(dry?.48:.57+mountain*.32)+(highway?.17:0)+.21*(patch-.5);
  const edge=smooth(.12,.40,clearingNoise+.13*(patch-.5))*smooth(180,300,coast);
  return {density:density*edge,patch,cool,mountain,dry,biome:dry?0:mountain<.36?1:cool<.43?2:3};
}
function speciesAt(h,slope,choice){
  const {patch,cool,mountain,dry}=h;
  const weights=[(1-mountain)*(.49+.7*patch)+.035,.16+mountain*(1.2-.5*patch),.02+cool*(.65+2.4*patch),
    .13+(1-mountain)*(.35-.2*patch),dry?.36+patch*.6:0];
  let sum=0;
  for(let i=0;i<weights.length;i++){if(slope>treeSpecies[i].terrain.maxSlopeDegrees)weights[i]=0;sum+=weights[i];}
  if(!sum)return -1;
  let target=choice*sum;
  return weights.findIndex(w=>(target-=w)<0);
}
// Interleaved records: local x,z; terrain heights at 8/16/32 subdivisions;
// species index, scale, yaw. Every camera and quality preset sees the same population.
export const STRIDE=8;
export function generateForestTile(tx,tz,counts) {
  const out=[];
  if(tx*TILE>=plannedHalfSize||tz*TILE>=plannedHalfSize||(tx+1)*TILE<=-plannedHalfSize||(tz+1)*TILE<=-plannedHalfSize)return new Float32Array();
  const sampleBase=sampler(tx,tz,BASE),sampleMid=sampler(tx,tz,16),sampleNear=sampler(tx,tz,NEAR);
  for(let j=0;j<rows;j++)for(let i=0;i<rows;i++){
    const u=tx*rows+i,v=tz*rows+j;
    const lx=(i+.12+.76*random(u,v,1))*spacing,lz=(j+.12+.76*random(u,v,2))*spacing;
    const x=tx*TILE+lx,z=tz*TILE+lz;
    if(z>shoreline(x)-180)continue;
    const {y,slope}=sampleNear(lx,lz,true);
    if(y<3 || slope>36)continue;
    const h=habitat(x,z,y);
    if(random(u,v,3)>=h.density*(1-.64*smooth(24,36,slope)))continue;
    const species=speciesAt(h,slope,random(u,v,4));
    if(species<0)continue;
    const scale=.80+.39*random(u,v,5)+.12*h.patch;
    if(isProtected(x,z,crown[species]*scale))continue;
    out.push(lx,lz,sampleBase(lx,lz),sampleMid(lx,lz),y,species,scale,random(u,v,6)*Math.PI*2);
    if(counts)counts[h.biome][species]++;
  }
  return Float32Array.from(out);
}
