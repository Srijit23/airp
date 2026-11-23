import { pixelThreshold } from './fade.js';

// Register three neighbouring views on a triangle in azimuth/elevation space.
// The weights agree on every triangle edge, including the 360-degree seam.
export const canopyVertex = `
attribute vec2 offset;
attribute vec3 heights,form;
attribute float show;
uniform float heightIndex,limit,age;
uniform vec4 tileEye; // sine/cosine of bearing, elevation in radians, bearing in radians
uniform vec2 sizes[5];
uniform vec4 bounds[5];
varying vec2 coord;
varying vec3 weights;
varying vec2 viewA,viewB,viewC;
varying float visibility,horizon,arrival;
#include <fog_pars_vertex>

vec2 sourceView(float column,float tilt,float species){
  // The last three atlas rows hold interleaved Scots pine bearings.
  if(species==1.){
    float band=mod(column,2.)<1.?1.:5.;
    return vec2(mod(floor(column*.5),8.),band*3.+tilt);
  }
  return vec2(mod(column,8.),species*3.+tilt);
}
void main(){
  float y=heightIndex>1.5?heights.z:(heightIndex>.5?heights.y:heights.x);
  vec2 size=sizes[int(form.x)];
  vec3 center=(modelMatrix*vec4(offset.x,y+size.y*form.y,offset.y,1.)).xyz;
  vec3 eye=cameraPosition-center;
  float range=length(eye.xz);
  if(show<=0. || range>limit){gl_Position=vec4(2.,2.,2.,1.);return;}
  visibility=show;
  arrival=smoothstep(0.,.35,age-.16*fract(form.z*.91));
  horizon=smoothstep(limit*.82,limit,range);
  // At street level, upright crowns stay rooted when the eye is below their centre.
  // At long range the views of adjacent trees converge. Reuse the camera
  // bearing of this tile. Both paths converge before the cheap variant takes over.
  float bearing=tileEye.w,elev=tileEye.z;
  vec2 heading=tileEye.xy;
  #ifndef DISTANT_TILE
  float tileMix=smoothstep(320.,620.,range);
  if(tileMix<1.){
    vec2 local=normalize(eye.xz+vec2(.00001,0.));
    heading=normalize(mix(local,tileEye.xy,tileMix));
    bearing=atan(heading.x,heading.y);
    elev=mix(atan(max(eye.y,0.),max(range,.00001)),tileEye.z,tileMix);
  }
  #endif
  vec2 e=vec2(cos(elev),sin(elev));
  vec3 right=vec3(heading.y,0.,-heading.x),up=vec3(-heading.x*e.y,e.x,-heading.y*e.y);
  float az=bearing-form.z;
  float angles=form.x==1.?16.:8.;
  float u=mod(az*(angles*.1591549431),angles);
  float v=elev<.62831853?elev/.62831853:1.+min(.99999,(elev-.62831853)/.73303829);
  vec2 grid=floor(vec2(u,v)),f=fract(vec2(u,v));
  // Subpixel crowns usually need just one sample. Keep a continuous angular
  // crossfade near the boundaries, even in the cheap distant variant.
  f=mix(f,smoothstep(vec2(.30),vec2(.70),f),smoothstep(240.,620.,range));
  vec2 corner;
  // Triangular interpolation avoids four colour samples for a crown.
  if(f.x>f.y){corner=vec2(1.,0.);weights=vec3(1.-f.x,f.x-f.y,f.y);}
  else{corner=vec2(0.,1.);weights=vec3(1.-f.y,f.y-f.x,f.x);}
  viewA=sourceView(grid.x,grid.y,form.x);
  viewB=sourceView(grid.x+corner.x,grid.y+corner.y,form.x);
  viewC=sourceView(grid.x+1.,grid.y+1.,form.x);
  vec4 rect=bounds[int(form.x)];
  coord=mix(rect.xy,rect.zw,position.xy+.5);
  vec3 point=center+((coord.x-.5)*right+(coord.y-.5)*up)*size.x*form.y;
  vec4 mvPosition=viewMatrix*vec4(point,1.);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;

export const canopyFragment = `
uniform sampler2D map;uniform float multisampled;
varying vec2 coord;
varying vec3 weights;
varying vec2 viewA,viewB,viewC;
varying float visibility,horizon,arrival;
#include <fog_pars_fragment>
vec2 atlasUV(vec2 uv,vec2 view){
  uv=clamp(uv,.005,.995);
  return vec2((view.x+uv.x)*.125,1.-(view.y+1.-uv.y)/18.);
}
vec4 portrait(vec2 cell){
  return texture2D(map,atlasUV(coord,cell));
}
void main(){
  float pixel=${pixelThreshold};
  if(pixel<1.-visibility || (arrival<1. && fract(pixel+.43)>arrival))discard;
  // Sample only the active row for level views. Mixture is in premultiplied
  // linear light so transparent black and atlas matte colours cannot tint needles.
  vec4 c=vec4(0.);
  if(weights.x>.001)c+=portrait(viewA)*weights.x;
  if(weights.y>.001)c+=portrait(viewB)*weights.y;
  if(weights.z>.001)c+=portrait(viewC)*weights.z;
  if(c.a<.055)discard;
  float coverage=smoothstep(.045,.89,c.a);
  if(multisampled<.5 && coverage<fract(pixel+.27))discard;
  gl_FragColor=vec4(c.rgb/max(c.a,.025),coverage);
  #include <colorspace_fragment>
  #include <fog_fragment>
  gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,horizon);
}`;
