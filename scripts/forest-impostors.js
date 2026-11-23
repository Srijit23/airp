// Bake the approved source meshes into 60 local, alpha-masked crown portraits.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, hmr: false },
  logLevel: 'error',
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: process.env.AIRP_SOFTWARE_GL
      ? [
          '--no-zygote',
          '--single-process',
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
        ]
      : [],
  });
  const page = await browser.newPage();
  await page.route('**/bake.html', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Forest bake</title>',
    }),
  );
  await page.goto(
    'http://127.0.0.1:' + server.httpServer.address().port + '/bake.html',
  );
  const data = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { AssetManager } = await import('/src/core/assets.js'),
      { manifest } = await import('/src/data/assets.js');
    const { treeSpecies } = await import('/src/trees/species.js');
    const assets = new AssetManager(manifest, 1);
    const size = 160,
      atlas = document.createElement('canvas');
    atlas.width = size * 4;
    atlas.height = size * 15;
    const ctx = atlas.getContext('2d'),
      renderer = new T.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
    renderer.setPixelRatio(3);
    renderer.setSize(size, size);
    renderer.setClearColor(0, 0);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    const scene = new T.Scene(),
      sun = new T.DirectionalLight(0xffe2ad, 2.65);
    scene.add(new T.HemisphereLight(0xe3efff, 0x95836a, 1.3), sun);
    for (const [i, s] of treeSpecies.entries()) {
      const handle = await assets.acquire(s.assetId),
        tree = handle.value.instantiate();
      scene.add(tree);
      // A distant needle may cover a fraction of a texel. Supersample masks
      // before reducing the portrait to its shipping size.
      tree.traverse((part) => {
        if (part.material?.alphaTest) part.material.alphaTest *= 0.7;
      });
      tree.getObjectByName('far').visible = false;
      const { width, height, depth } = s.dimensions;
      const span = Math.max(height * 1.12, Math.hypot(width, depth) * 1.1),
        mid = height * 0.5;
      const camera = new T.OrthographicCamera(
        -span / 2,
        span / 2,
        span / 2,
        -span / 2,
        0.1,
        140,
      );
      for (let tilt = 0; tilt < 3; tilt++)
        for (let j = 0; j < 4; j++) {
          const yaw = (Math.PI * j) / 2,
            el = ([0, 36, 78][tilt] * Math.PI) / 180;
          camera.position.set(
            50 * Math.sin(yaw) * Math.cos(el),
            mid + 50 * Math.sin(el),
            50 * Math.cos(yaw) * Math.cos(el),
          );
          camera.lookAt(0, mid, 0);
          sun.position.set(Math.sin(yaw - 0.95), 1.2, Math.cos(yaw - 0.95));
          renderer.render(scene, camera);
          ctx.drawImage(
            renderer.domElement,
            j * size,
            (i * 3 + tilt) * size,
            size,
            size,
          );
        }
      scene.remove(tree);
      handle.release();
    }
    const rectangles = [];
    for (let row = 0; row < 15; row++)
      for (let col = 0; col < 4; col++) {
        const { data } = ctx.getImageData(col * size, row * size, size, size);
        let left = size - 1,
          right = 0,
          top = size - 1,
          bottom = 0;
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++)
            if (data[(y * size + x) * 4 + 3] > 32) {
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
        rectangles.push([
          Math.max(0, left - 2) / size,
          1 - Math.min(size, bottom + 3) / size,
          Math.min(size, right + 3) / size,
          1 - Math.max(0, top - 2) / size,
        ]);
      }
    return {
      rectangles,
      image: atlas.toDataURL('image/webp', 0.93).split(',')[1],
    };
  });
  await writeFile(
    'public/assets/trees/forest-views.webp',
    Buffer.from(data.image, 'base64'),
  );
  await writeFile(
    'src/forest/portraits.json',
    JSON.stringify(data.rectangles) + '\n',
  );
} finally {
  await browser?.close();
  await server.close();
}
