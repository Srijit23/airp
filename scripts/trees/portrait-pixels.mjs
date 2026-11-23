import sharp from 'sharp';
const toLinear = (v) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const toSrgb = (v) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;

// Store radiance multiplied by coverage in linear light. The GPU then averages
// the two together at each mip level. The canopy shader recovers leaf colour.
export async function writePortraits(encoded, path) {
  const { data, info } = await sharp(Buffer.from(encoded, 'base64'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    for (let c = 0; c < 3; c++)
      data[i + c] = Math.round(255 * toSrgb(toLinear(data[i + c] / 255) * a));
  }
  await sharp(data, { raw: info })
    .webp({ quality: 95, alphaQuality: 100, smartSubsample: true, effort: 5 })
    .toFile(path);
}
