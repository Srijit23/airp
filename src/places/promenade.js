import {promenadeZ} from './records.js';
import {groundHeight} from '../world/queries.js';
export const promenade=[];
function segment(a,b,start,end){
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
  const center={x:(a.x+b.x)/2,z:(a.z+b.z)/2},rise=.06+.26*Math.min(1,start/12,end/12);
  const y=groundHeight(center.x,center.z)+rise,slope=(groundHeight(b.x,b.z)-groundHeight(a.x,a.z))/len;
  const sx=dz/len,sz=-dx/len,cross=groundHeight(center.x+sx*.5,center.z+sz*.5)-groundHeight(center.x-sx*.5,center.z-sz*.5);
  promenade.push({id:'strand/deck/'+promenade.length,center,y,yaw,len,dx:dx/len,dz:dz/len,slope,cross,halfWidth:1.9});
}
for(let x=-326;x<334;x+=5)segment({x,z:promenadeZ(x)},{x:x+5,z:promenadeZ(x+5)},x+326,329-x);
const from=3350,to=promenadeZ(34)-2.8;
for(let z=from;z<to;z+=5)segment({x:34,z},{x:34,z:Math.min(z+5,to)},z-from,15);
export function promenadeHeight(x,z){
  if(x< -331||x>340||z<3345)return null;
  for(const d of promenade){
    const dx=x-d.center.x,dz=z-d.center.z,a=dx*d.dx+dz*d.dz,c=dx*d.dz-dz*d.dx;
    if(Math.abs(a)<=d.len/2+.04&&Math.abs(c)<=d.halfWidth)return d.y+a*d.slope+c*d.cross;
  }return null;
}
