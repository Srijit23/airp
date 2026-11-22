import {BufferGeometry,Float32BufferAttribute} from 'three';
// Radial, folded needle clusters share the pine texture and the original trunk.
export function pineBoughs(near){
  const pos=[],uv=[],idx=[],rings=near?13:8;
  for(let ring=0;ring<rings;ring++){
    const t=ring/(rings-1),root=.17+t*.795,arms=Math.round((near?13:9)*(1-.46*t));
    for(let a=0;a<arms;a++){
      const angle=a/arms*Math.PI*2+ring*2.40,c=Math.cos(angle),s=Math.sin(angle);
      const len=(.024+.205*(1-t)**.64)*(.88+.12*Math.sin(a*71+ring*32)),half=len*(near?.62:.87),first=pos.length/3;
      for(const [f,w,lift,u,v] of [[.02,-.15,0,0,0],[.02,.15,0,1,0],[.55,-.88,-.012,0,.54],[.55,.88,-.012,1,.54],[1,-.72,-.035,0,1],[1,.72,-.035,1,1],[.55,0,.030,.5,.54]]){
        pos.push(c*f*len-s*w*half,root+lift-f*len*.32,s*f*len+c*w*half);uv.push(u,v);
      }
      for(const v of [0,6,1,0,2,6,1,6,3,2,4,6,6,4,5,6,5,3])idx.push(first+v);
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pos,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
