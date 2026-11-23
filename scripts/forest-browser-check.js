import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { stations } from '../src/data/world.js';

const baseline = process.argv.includes('--baseline');
const out =
  process.env.FOREST_OUTPUT ||
  'test-results/forests/' + (baseline ? 'before' : 'after');
const stationsById = Object.fromEntries(stations.map((s) => [s.id, s]));
const views = {
  highway: { x: -595, z: 1952, above: 2.05, yaw: -0.34, pitch: 0.035 },
  'highway-aerial': { x: -435, z: 2120, above: 184, yaw: 0.7, pitch: -0.48 },
  slope: { x: -1520, z: -1240, above: 118, yaw: 0.87, pitch: -0.32 },
  interior: stationsById.forest,
  edge: { x: -68, z: 1805, above: 5.1, yaw: 1.92, pitch: 0.015 },
  coast: stationsById.strand,
  showcase: stationsById['tree-showcase'],
};
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  logLevel: 'error',
});
await server.listen();
let browser;
try {
  await mkdir(out, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: process.env.AIRP_SOFTWARE_GL
      ? [
          '--no-zygote',
          '--single-process',
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--disable-dev-shm-usage',
        ]
      : [],
  });
  const page = await browser.newPage({ viewport: { width: 896, height: 544 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(r.status() + ' ' + r.url());
  });
  page.setDefaultTimeout(180000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.waitForFunction(() => window.airp && !airp.waitForTerrain);
  await page.evaluate(() => {
    airp.quality('medium');
    airp.maxDpr = airp.nextDpr = 0.8;
    airp.resPeriod = -1e8;
  });
  const results = {};
  for (const [name, view] of Object.entries(views)) {
    if (name === 'showcase') {
      await page.locator('#atlas-btn').click();
      await page
        .locator('#stations')
        .getByRole('button', { name: 'Tree Model Showcase', exact: true })
        .click();
    } else await page.evaluate((v) => airp.travel(v), view);
    await page.waitForFunction(
      () =>
        !airp.waitForTerrain &&
        airp.streamer.settled &&
        airp.roads.settled &&
        (!airp.forest || airp.forest.settled),
    );
    results[name] = await page.evaluate(async () => {
      const times = [];
      let last = performance.now();
      for (let i = 0; i < 14; i++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        if (i > 1) times.push(now - last);
        last = now;
      }
      times.sort((a, b) => a - b);
      const info = airp.renderer.info;
      return {
        frameMs: times[6],
        p90Ms: times[10],
        fps: 1000 / times[6],
        draws: info.render.calls,
        triangles: info.render.triangles,
        ...info.memory,
        forest: airp.forest
          ? {
              ...airp.forest.stats,
              frustumInstances: airp.forest.canopy.visibleInstances,
            }
          : undefined,
        heapMiB: performance.memory?.usedJSHeapSize / 1048576,
        landscapeProps: airp.places.plants,
        showcase: airp.showcase.groves.reduce(
          (sum, g) => sum + g.trees.length,
          0,
        ),
      };
    });
    await page.screenshot({
      path: out + '/' + name + '.jpg',
      quality: 88,
      style: 'main > :not(#world) {visibility:hidden !important;}',
    });
    await writeFile(out + '/metrics.json', JSON.stringify(results, null, 2));
    console.log(name, JSON.stringify(results[name]));
  }
  assert.equal(results.showcase.showcase, 15);
  if (!baseline) {
    assert.ok(results.interior.forest?.instances > 0);
    await page.evaluate(async (views) => {
      for (let i = 0; i < 28; i++) {
        const x = -595 - i * 100,
          z = 1952 - i * 105;
        airp.travel({ ...views.highway, x, z });
        await new Promise(requestAnimationFrame);
      }
      airp.travel(views.interior);
    }, views);
    await page.waitForFunction(
      () =>
        !airp.waitForTerrain && airp.streamer.settled && airp.forest.settled,
    );
    const reloaded = await page.evaluate(() => airp.forest.stats);
    assert.equal(reloaded.instances, results.interior.forest.instances);
    assert.equal(reloaded.chunks, results.interior.forest.chunks);
    assert.equal(
      await page.evaluate(() => airp.places.plants),
      results.interior.landscapeProps,
    );

    // Walk the same approved models used in the clearing, now in actual seeded stands.
    // Pick the closest natural tree of each species to the centre of its habitat tile.
    const sampled = [];
    for (const [id, tx, tz] of [
      [0, -3, 7],
      [1, -7, -6],
      [2, -7, -6],
      [3, -3, 7],
      [4, -3, 7],
    ]) {
      await page.evaluate(
        ({ tx, tz }) =>
          airp.travel({
            x: (tx + 0.5) * 256,
            z: (tz + 0.5) * 256,
            above: 12,
            yaw: 0,
            pitch: 0,
          }),
        { tx, tz },
      );
      await page.waitForFunction(
        (key) => !airp.waitForTerrain && airp.forest.tiles.has(key),
        tx + ',' + tz,
      );
      const target = await page.evaluate(
        ({ id, tx, tz }) => {
          const tile = airp.forest.tiles.get(tx + ',' + tz),
            r = tile.records;
          let best = Infinity,
            target;
          for (let k = 0; k < r.length; k += 8) {
            const d = Math.hypot(128 - r[k], 128 - r[k + 1]);
            if (r[k + 5] === id && d < best) {
              best = d;
              target = {
                x: tx * 256 + r[k],
                z: tz * 256 + r[k + 1],
                index: tx + ',' + tz + '/' + k,
              };
            }
          }
          return target;
        },
        { id, tx, tz },
      );
      assert.ok(target);
      await page.evaluate(
        (t) =>
          airp.travel({
            x: t.x + 1.7,
            z: t.z + 2.7,
            above: 1.72,
            yaw: 0.56,
            pitch: 0.23,
          }),
        target,
      );
      await page.waitForFunction(
        (t) =>
          !airp.waitForTerrain && airp.forest.previous.get(t.index) === 'near',
        target,
      );
      sampled.push(
        await page.evaluate((id) => {
          const parts = airp.forest.models.entries.get(id).parts.near;
          return {
            id,
            bark: parts.some(
              (p) => p.mesh.visible && p.mesh.material.normalMap,
            ),
            leaves: parts.some(
              (p) => p.mesh.visible && p.mesh.material.alphaTest > 0,
            ),
          };
        }, id),
      );
    }
    assert.ok(sampled.every((s) => s.bark && s.leaves));
    console.log(
      'Verified five natural near-mesh species and their textured materials',
      sampled.map((s) => s.id),
    );

    await page.evaluate((v) => {
      airp.controls.setMode('ground');
      airp.travel(v);
    }, views.highway);
    await page.waitForFunction(
      () => !airp.waitForTerrain && airp.forest.settled,
    );
    const roadWalk = await page.evaluate(async () => {
      const c = airp.controls,
        p = airp.camera.position,
        x = p.x,
        z = p.z;
      c.keys.add('KeyW');
      try {
        for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
      } finally {
        c.keys.clear();
      }
      return {
        distance: Math.hypot(p.x - x, p.z - z),
        height: p.y - c.height(p.x, p.z),
      };
    });
    assert.ok(
      roadWalk.distance > 0.1 && Math.abs(roadWalk.height - 1.72) < 0.06,
    );
    console.log('Ground camera followed the forest-lined highway', roadWalk);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
