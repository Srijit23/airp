"""Prepare two CC0 road scans from Poly Haven (Python 3 + Pillow)."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'public/assets/roads'
def prepare(item):
    local, source = item
    def fetch(channel):
        url = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{source}/{source}_{channel}_1k.jpg'
        with urlopen(Request(url, headers={'User-Agent':'AIRP asset preparation'}), timeout=90) as response:
            return Image.open(BytesIO(response.read())).convert('RGB')
    color=fetch('diff')
    color.save(OUT / f'{local}.webp', quality=84, method=6)
    normal=fetch('nor_gl')
    rough=fetch('rough').convert('L')
    Image.merge('RGB',(normal.getchannel('R'),normal.getchannel('G'),rough)).save(OUT / f'{local}-surface.webp',quality=90,method=6)
    print(local,flush=True)
if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(prepare,[('asphalt','worn_asphalt'),('pavers','floor_pavement')]))
