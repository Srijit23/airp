"""Rebuild local RGB albedo + packed tangent-normal/roughness maps. Requires Pillow."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "public/assets/terrain"
SETS = {"meadow": "rocky_terrain_02", "stone": "aerial_rocks_02", "silt": "aerial_ground_rock"}

def prepare(item):
    name, source = item
    def fetch(channel):
        url = (f"https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{source}/"
               f"{source}_{channel}_1k.jpg")
        with urlopen(Request(url, headers={"User-Agent": "Airp terrain asset builder"}), timeout=90) as response:
            return Image.open(BytesIO(response.read())).convert("RGB")
    fetch("diff").save(OUT / f"{name}.webp", quality=87, method=6)
    normal = fetch("nor_gl")
    red, green, _ = normal.split()
    roughness = fetch("rough").convert("L")
    Image.merge("RGB", (red, green, roughness)).save(OUT / f"{name}-surface.webp", quality=93, method=6)
    print(name, flush=True)

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(prepare, SETS.items()))
