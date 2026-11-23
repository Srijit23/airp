import {pixelThreshold} from './fade.js';

// Register three neighbouring views on a triangle in azimuth/elevation space.
// The weights agree on every triangle edge, including the 360-degree seam.
export const canopyVertex=`
attribute vec2 offset;
attribute vec3 heights,form;
attribute float show;
uniform float heightIndex,limit,age;
uniform vec2 sizes[5];
uniform vec4 bounds[5];
varying vec2 coord;
varying vec3 weights;
varying vec4 viewA,viewB,viewC;
varying float visibility,horizon,parallax,arrival;
#include <fog_pars_vertex>

vec4 sourceView(float column,float tilt,float species,float az,vec2 elevation){
  if(parallax<.01)return vec4(mod(column,8.),species*3.+tilt,0.,0.);
  float a=mod(column,8.)*.7853981634;
  vec2 e=tilt<.5?vec2(1.,0.):(tilt<1.5?vec2(.809017,.587785):vec2(.207912,.978148));
  float ca=cos(az-a);
  vec2 shift=vec2(elevation.x*sin(az-a),elevation.y*e.x-elevation.x*e.y*ca);
  float alignment=elevation.x*e.x*ca+elevation.y*e.y;
  return vec4(mod(column,8.),species*3.+tilt,shift/max(.60,alignment));
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
  vec3 dir=normalize(vec3(eye.x,max(0.,eye.y),eye.z)+vec3(.000001,0.,0.));
  vec3 right=normalize(vec3(eye.z+.0001,0.,-eye.x));
  vec3 up=normalize(cross(dir,right));
  float az=atan(eye.x,eye.z)-form.z;
  float elev=asin(clamp(dir.y,0.,1.));
  float u=mod(az*1.2732395447,8.);
  float v=elev<.62831853?elev/.62831853:1.+min(.99999,(elev-.62831853)/.73303829);
  parallax=1.-smoothstep(110.,230.,length(eye));
  vec2 grid=floor(vec2(u,v)),f=fract(vec2(u,v));
  vec2 e=vec2(length(dir.xz),dir.y),corner;
  // Triangular interpolation avoids four colour/depth samples for a crown.
  if(f.x>f.y){corner=vec2(1.,0.);weights=vec3(1.-f.x,f.x-f.y,f.y);}
  else{corner=vec2(0.,1.);weights=vec3(1.-f.y,f.y-f.x,f.x);}
  viewA=sourceView(grid.x,grid.y,form.x,az,e);
  viewB=sourceView(grid.x+corner.x,grid.y+corner.y,form.x,az,e);
  viewC=sourceView(grid.x+1.,grid.y+1.,form.x,az,e);
  vec4 rect=bounds[int(form.x)];
  coord=mix(rect.xy,rect.zw,position.xy+.5);
  vec3 point=center+((coord.x-.5)*right+(coord.y-.5)*up)*size.x*form.y;
  vec4 mvPosition=viewMatrix*vec4(point,1.);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;

export const canopyFragment=`
uniform sampler2D map,depthMap;uniform float multisampled;
varying vec2 coord;
varying vec3 weights;
varying vec4 viewA,viewB,viewC;
varying float visibility,horizon,parallax,arrival;
#include <fog_pars_fragment>
vec2 atlasUV(vec2 uv,vec2 view){
  uv=clamp(uv,.005,.995);
  return vec2((view.x+uv.x)*.125,1.-(view.y+1.-uv.y)/15.);
}
vec4 portrait(vec4 view){
  vec2 uv=atlasUV(coord,view.xy);
  if(parallax>.01){
    float depth=texture2D(depthMap,uv).r-.502;
    uv=atlasUV(coord+view.zw*depth*parallax,view.xy);
  }
  return texture2D(map,uv);
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
