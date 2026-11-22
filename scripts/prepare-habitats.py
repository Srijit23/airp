"""Rebuild the two local 512 px habitat albedos from Poly Haven's CC0 scans."""
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from PIL import Image

dest = Path(__file__).resolve().parents[1] / 'public/assets/places'
for name in ('forest_floor', 'sand_02'):
    url = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{name}/{name}_diff_1k.jpg'
    with urlopen(url, timeout=40) as response:
        tile = Image.open(BytesIO(response.read())).convert('RGB')
        tile.resize((512, 512), Image.Resampling.LANCZOS).save(dest / (name + '.webp'), quality=82)
