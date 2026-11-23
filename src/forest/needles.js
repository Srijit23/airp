import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearMipmapLinearFilter,
  LinearFilter,
  SRGBColorSpace,
} from 'three';

// The forest and its offline portrait renderer use identical needle filtering.
// The original asset remains the authority for scale, UVs, bark, normals and shape.
export async function loadNeedleMap(original, anisotropy = 1) {
  const response = await fetch(
    import.meta.env.BASE_URL + 'assets/trees/pine-needle-mips.bin',
  );
  if (!response.ok)
    throw Error('Could not load pine needle mipmaps: ' + response.status);
  const bytes = await new Response(
    response.body.pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer();
  const header = new DataView(bytes),
    width = header.getUint32(0, true),
    height = header.getUint32(4, true);
  let w = width,
    h = height,
    offset = 8;
  const mipmaps = [];
  while (true) {
    const length = w * h * 4;
    mipmaps.push({
      data: new Uint8Array(bytes, offset, length),
      width: w,
      height: h,
    });
    offset += length;
    if (w === 1 && h === 1) break;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  if (offset !== bytes.byteLength) throw Error('Invalid pine needle mip chain');
  const texture = new DataTexture(
    mipmaps[0].data,
    width,
    height,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.name = 'Scots pine needle coverage mips';
  texture.mipmaps = mipmaps;
  texture.generateMipmaps = false;
  texture.flipY = original.flipY;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = original.wrapS;
  texture.wrapT = original.wrapT;
  texture.anisotropy = Math.min(4, anisotropy);
  texture.channel = original.channel;
  texture.offset.copy(original.offset);
  texture.repeat.copy(original.repeat);
  texture.center.copy(original.center);
  texture.rotation = original.rotation;
  texture.needsUpdate = true;
  return texture;
}

// Thin, two-sided needle clusters scatter skylight through the crown. Keep the
// lift proportional to the original albedo, retaining shadows and trunk contrast.
export function needleLighting(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    'vec3 totalDiffuse =',
    'reflectedLight.indirectDiffuse=max(reflectedLight.indirectDiffuse,diffuseColor.rgb*.60);\nvec3 totalDiffuse =',
  );
}
