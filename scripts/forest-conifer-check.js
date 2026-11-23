// Controlled inspection alongside the in-world drive. Render the very same forest
// materials and canopy batches on a neutral background at equal apparent height.
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const out = process.env.LOD_OUTPUT || 'test-results/lod';
await mkdir(out, { recursive: true });
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
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.route('**/inspection.html', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Forest conifer inspection</title>',
    }),
  );
  await page.goto(
    'http://127.0.0.1:' + server.httpServer.address().port + '/inspection.html',
  );
  const images = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { ForestModels } = await import('/src/forest/models.js'),
      { Canopy } = await import('/src/forest/canopy.js');
    const { AssetManager } = await import('/src/core/assets.js'),
      { manifest } = await import('/src/data/assets.js');
    const { treeSpecies } = await import('/src/trees/species.js');
    const renderer = new T.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(280, 320);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    const scene = new T.Scene();
    scene.background = new T.Color(0xb6c9d1);
    scene.fog = new T.Fog(0xb6c9d1, 550, 2400);
    scene.add(new T.HemisphereLight(0xe3efff, 0x95836a, 1.3));
    const sun = new T.DirectionalLight(0xffe2ad, 2.65);
    sun.position.set(-0.8, 0.62, -0.32);
    scene.add(sun);
    const manager = new AssetManager(manifest, 4),
      fail = (e) => {
        throw e;
      },
      model = new ForestModels(scene, manager, fail),
      canopy = new Canopy(scene, fail);
    const images = {};
    try {
      for (const species of [1, 2]) {
        const id = treeSpecies[species].id,
          h = treeSpecies[species].dimensions.height;
        const entry = model.request(species);
        const deadline = performance.now() + 30000;
        while (
          !entry.ready ||
          (canopy.ready === undefined
            ? !canopy.material.uniforms.map.value.image
            : !canopy.ready)
        ) {
          if (performance.now() > deadline)
            throw Error('Timed out loading ' + id);
          await new Promise((r) => setTimeout(r, 15));
        }
        const t = {
          x: 0,
          z: 0,
          records: new Float32Array([128, 128, 0, 0, 0, species, 1, 0.35]),
          heightIndex: 2,
          immediate: true,
        };
        canopy.attach(t);
        const row = {
          x: 128,
          y: 0,
          z: 128,
          scale: 1,
          yaw: 0.35,
          species,
          start: 0,
          end: 1,
          weight: 1,
        };
        for (const [level, d] of [
          ['near', 20],
          ['far', 50],
          ['portrait', 100],
          ['reference', 100],
        ]) {
          const camera = new T.PerspectiveCamera(
            T.MathUtils.radToDeg(2 * Math.atan((h * 0.61) / d)),
            280 / 320,
            0.1,
            2500,
          );
          camera.position.set(
            128 + d * 0.62,
            h * 0.5,
            128 + d * Math.sqrt(1 - 0.62 ** 2),
          );
          camera.lookAt(128, h * 0.5, 128);
          model.draw(
            [
              {
                ...row,
                level:
                  level === 'reference'
                    ? 'near'
                    : level === 'portrait'
                      ? 'far'
                      : level,
              },
            ],
            new Set([species]),
          );
          entry.root.visible = level !== 'portrait';
          t.mesh.visible = level === 'portrait';
          renderer.render(scene, camera);
          images[id + '-' + level] = renderer.domElement
            .toDataURL('image/png')
            .split(',')[1];
        }
        entry.root.visible = true;
        canopy.drop(t);
        model.remove(species);
      }
    } finally {
      model.dispose();
      canopy.dispose();
      renderer.dispose();
    }
    return images;
  });
  if (errors.length) throw Error(errors.join('\n'));
  for (const [name, data] of Object.entries(images))
    await writeFile(out + '/' + name + '.png', Buffer.from(data, 'base64'));
  console.log(
    'Passed Scots pine and spruce mesh, reduced mesh and distant portrait inspection.',
  );
} finally {
  await browser?.close();
  await server.close();
}
