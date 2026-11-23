"""Bake a linear-light, coverage-preserving mip chain from the approved Scots pine GLB."""
from pathlib import Path
import gzip
import io
import json
import struct
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

glb = Path('public/assets/trees/pine.glb').read_bytes()
size = struct.unpack_from('<I', glb, 12)[0]
asset = json.loads(glb[20:20+size])
texture = next(i for i in asset['images'] if i['name'] == 'pine_needles_color')
view = asset['bufferViews'][texture['bufferView']]
start = 28 + size + view.get('byteOffset', 0)
rgba = np.asarray(Image.open(io.BytesIO(glb[start:start+view['byteLength']])).convert('RGBA'))/255.
alpha = rgba[:,:,3]
rgb = rgba[:,:,:3]
linear = np.where(rgb <= .04045, rgb/12.92, ((rgb+.055)/1.055)**2.4)
reference = (alpha >= .5).mean()
levels = bytearray(struct.pack('<II', alpha.shape[1], alpha.shape[0]))
while True:
    # Mip filtering must average needle colour by covered area. Extend two
    # texels of edge colour into clear pixels for bilinear filtering at each LOD.
    seed = alpha > .035
    distance, nearest = distance_transform_edt(~seed, return_indices=True)
    padded = np.where(((~seed) & (distance <= 2.5))[:,:,None], linear[tuple(nearest)], linear)
    encoded = np.where(padded<=.0031308,padded*12.92,1.055*padded**(1/2.4)-.055)
    coverage = alpha
    if alpha.shape[0] < rgba.shape[0] and alpha.size >= 64:
        threshold = np.quantile(alpha, 1-reference)
        coverage = np.clip(alpha * np.clip(.5/max(threshold,.001), .8, 3.), 0, 1)
    levels.extend(np.rint(np.dstack((encoded,coverage)).clip(0,1)*255).astype('uint8').tobytes())
    if alpha.shape == (1,1): break
    h,w=alpha.shape
    weighted=(linear*alpha[:,:,None]).reshape(h//2,2,w//2,2,3).mean(axis=(1,3))
    alpha=alpha.reshape(h//2,2,w//2,2).mean(axis=(1,3))
    linear=weighted/np.maximum(alpha[:,:,None],1.e-12)
Path('public/assets/trees/pine-needle-mips.bin').write_bytes(gzip.compress(levels,compresslevel=9,mtime=0))
