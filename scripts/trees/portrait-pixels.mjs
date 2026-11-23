import sharp from 'sharp';
const toLinear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const toSrgb=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;

// Store radiance multiplied by coverage in linear light. The GPU then averages
// the two together at each mip level. The canopy shader recovers leaf colour.
export async function writePortraits(encoded,path){
  const {data,info}=await sharp(Buffer.from(encoded,'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4){
    const a=data[i+3]/255;
    for(let c=0;c<3;c++)data[i+c]=Math.round(255*toSrgb(toLinear(data[i+c]/255)*a));
  }
  await sharp(data,{raw:info}).webp({quality:95,alphaQuality:100,smartSubsample:true,effort:5}).toFile(path);
}
export async function writeDepth(encoded,path){
  const {data,info}=await sharp(Buffer.from(encoded,'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // Outside the crown the reference plane lies at the centre of the model.
  const pixels=Buffer.alloc(info.width*info.height);
  for(let i=0;i<pixels.length;i++){
    const a=data[i*4+3]/255;
    pixels[i]=Math.round(128+(data[i*4]-128)*a);
  }
  await sharp(pixels,{raw:{width:info.width,height:info.height,channels:1}}).resize(info.width/2,info.height/2).webp({quality:91,effort:5}).toFile(path);
}
