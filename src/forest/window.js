import {TILE,plannedHalfSize} from '../data/world.js';
export const qualityLevels={
  low:{near:3,mid:9,radius:1150}, medium:{near:6,mid:18,radius:1650}, high:{near:12,mid:32,radius:2450}
};
export function forestWindow(tx,tz,radius) {
  const limit=plannedHalfSize/TILE,reach=Math.ceil(radius/TILE),jobs=[];
  for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++){
    const x=tx+dx,z=tz+dz;
    if(x < -limit || z < -limit || x>=limit || z>=limit || z*TILE>3700)continue;
    const d=Math.hypot(Math.max(0,Math.abs(dx)-1),Math.max(0,Math.abs(dz)-1))*TILE;
    if(d<=radius) jobs.push({x,z,key:x+','+z,priority:dx*dx+dz*dz});
  }
  return jobs.sort((a,b)=>a.priority-b.priority);
}
