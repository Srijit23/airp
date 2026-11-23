// Run against either checkout. All measurements and captures use identical projection and poses.
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const out = process.env.LOD_OUTPUT || 'test-results/lod';
await mkdir(out, { recursive: true });
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
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
          '--disable-dev-shm-usage',
        ]
      : [],
  });
  const page = await browser.newPage({ viewport: { width: 864, height: 486 } });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(m.text());
      console.error(m.text().slice(0, 900));
    }
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(r.status() + ' ' + r.url());
  });
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.waitForFunction(() => window.airp && !airp.waitForTerrain);
  await page.evaluate(async () => {
    const e = airp;
    e.quality('high');
    e.maxDpr = e.nextDpr = 0.85;
    e.resPeriod = -1e8;
    const { treeSpecies } = await import('/src/trees/species.js');
    const { roads, along } = await import('/src/roads/network.js');
    const road = roads.find((r) => r.a === 'uplandPass' && r.b === 'coastCut');
    const spruce = {
      species: 2,
      key: '-3,8/3760',
      x: -645.5296707,
      z: 2242.9801331,
    };
    const pine = {
      species: 1,
      key: '-3,7/3856',
      x: -624.5439148,
      z: 1957.2076111,
    };
    const T = await import('/node_modules/three/build/three.module.js');
    window.frustumCounts = () => {
      const frustum = new T.Frustum().setFromProjectionMatrix(
        new T.Matrix4().multiplyMatrices(
          e.camera.projectionMatrix,
          e.camera.matrixWorldInverse,
        ),
      );
      const sphere = new T.Sphere(),
        visible = { near: 0, mid: 0, portraits: 0 };
      function seen(x, y, z, s, scale) {
        const { height, width, depth } = treeSpecies[s].dimensions;
        sphere.center.set(x, y + height * scale * 0.5, z);
        sphere.radius =
          Math.hypot(height, Math.max(width, depth)) * scale * 0.5;
        return frustum.intersectsSphere(sphere);
      }
      for (const t of e.forest.drawn || [])
        if (seen(t.x, t.y, t.z, t.species, t.scale))
          visible[t.level === 'near' ? 'near' : 'mid']++;
      for (const tile of e.forest.tiles.values()) {
        const r = tile.records,
          ox = tile.x * 256,
          oz = tile.z * 256;
        for (let k = 0; k < r.length; k += 8)
          if (
            tile.show.getX(k / 8) > 0 &&
            Math.hypot(
              ox + r[k] - e.camera.position.x,
              oz + r[k + 1] - e.camera.position.z,
            ) < e.forest.canopy.material.uniforms.limit.value &&
            seen(
              ox + r[k],
              r[k + 2 + tile.heightIndex],
              oz + r[k + 1],
              r[k + 5],
              r[k + 6],
            )
          )
            visible.portraits++;
      }
      return visible;
    };
    // Finish each measured frame on the GPU. Plain rAF intervals can measure
    // command submission while earlier SwiftShader frames are still queued.
    window.benchmark = async () => {
      const renderer = e.renderer,
        gl = renderer.getContext(),
        ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const pixel = new Uint8Array(4),
        times = [],
        gpu = [],
        queries = [];
      renderer.setAnimationLoop(null);
      try {
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        for (let i = 0; i < 12; i++) {
          const q = ext && i >= 5 ? gl.createQuery() : null;
          const start = performance.now();
          if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          e.frame(start);
          if (q) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            queries.push(q);
          }
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          if (i >= 5) times.push(performance.now() - start);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        for (let i = 0; queries.length && i < 200; i++) {
          if (gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
            const q = queries.shift();
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
              gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(q);
          } else await new Promise((resolve) => setTimeout(resolve, 2));
        }
        times.sort((a, b) => a - b);
        gpu.sort((a, b) => a - b);
        return {
          ms: times[3],
          p90: times[6],
          gpuMs: gpu.length ? gpu[Math.floor(gpu.length / 2)] : null,
          gpuSamples: gpu.length,
          method: 'seven synchronized whole frames after five warm-up frames',
        };
      } finally {
        for (const q of queries) gl.deleteQuery(q);
        renderer.setAnimationLoop((t) => e.frame(t));
      }
    };
    window.pose = (d, target = spruce) => {
      const width = Math.min(d, 18.66),
        run = Math.sqrt(d * d - width * width);
      const x = target.x - width * 0.997 - run * 0.073,
        z = target.z - width * 0.073 + run * 0.997;
      const top =
        e.controls.height(target.x, target.z) +
        treeSpecies[target.species].dimensions.height * 0.46;
      return {
        x,
        z,
        above: 2,
        yaw: Math.atan2(x - target.x, z - target.z),
        pitch: Math.atan2(top - e.controls.height(x, z) - 2, d),
      };
    };
    window.targetPine = pine;
    window.roadPose = (s) => {
      const p = along(road, s);
      return {
        x: p.x,
        z: p.z,
        above: 2,
        yaw: Math.atan2(-p.dx, -p.dz),
        pitch: 0.025,
      };
    };
    window.inspectTree = (target = spruce) => {
      const [tileKey, offset] = target.key.split('/'),
        t = e.forest.tiles.get(tileKey),
        k = +offset;
      if (!t?.show) return null;
      const model = e.forest.drawn?.filter((v) => v.index === target.key) || [];
      return {
        species: treeSpecies[t.records[k + 5]].id,
        level: e.forest.previous.get(target.key) || 'portrait',
        model: model.map((v) => [v.level, v.weight ?? 1]),
        portrait: t.show.getX(k / 8),
      };
    };
  });
  const settle = () =>
    page.waitForFunction(
      () =>
        !airp.waitForTerrain && airp.streamer.settled && airp.forest.settled,
    );
  const shot = (name) =>
    page.screenshot({
      path: out + '/' + name + '.jpg',
      quality: 90,
      style: 'main > :not(#world){visibility:hidden!important}',
    });
  const metrics = {};
  const views = (
    process.env.LOD_SPECIES
      ? process.env.LOD_SPECIES.split(',')
      : ['pine', 'spruce']
  ).flatMap((kind) =>
    (process.env.LOD_DISTANCES
      ? process.env.LOD_DISTANCES.split(',').map(Number)
      : kind === 'pine'
        ? [20, 50, 100, 8, 210]
        : [20, 50, 100]
    ).map((d) => [kind, d]),
  );
  for (const [kind, d] of views) {
    await page.evaluate(
      ([k, d]) => airp.travel(pose(d, k === 'pine' ? targetPine : undefined)),
      [kind, d],
    );
    await settle();
    const timing = await page.evaluate(() => benchmark());
    metrics[kind + d] = await page.evaluate((k) => {
      const e = airp,
        r = e.renderer;
      return {
        calls: r.info.render.calls,
        triangles: r.info.render.triangles,
        stats: { ...e.forest.stats },
        submittedCanopies: e.forest.canopy.visibleInstances,
        tree: inspectTree(k === 'pine' ? targetPine : undefined),
        frustum: frustumCounts(),
      };
    }, kind);
    Object.assign(metrics[kind + d], timing);
    await shot(kind + d);
    console.log(kind, d, JSON.stringify(metrics[kind + d]));
    await writeFile(out + '/metrics.json', JSON.stringify(metrics, null, 2));
  }
  if (process.env.LOD_CAPTURE_ONLY) {
    assert.deepEqual(errors, []);
    console.log('PASS static captures');
  } else {
    await page.evaluate(() => airp.travel(pose(195, targetPine)));
    await settle();
    const frames = [];
    let cdp;
    if (process.env.LOD_FILM) {
      cdp = await page.context().newCDPSession(page);
      cdp.on('Page.screencastFrame', (msg) => {
        frames.push(Buffer.from(msg.data, 'base64'));
        cdp
          .send('Page.screencastFrameAck', { sessionId: msg.sessionId })
          .catch(() => {});
      });
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 76,
        maxWidth: 768,
        maxHeight: 432,
        everyNthFrame: 1,
      });
    }
    const motion = await page.evaluate(async () => {
      const frames = [],
        e = airp;
      for (let i = 0; i <= 100; i++) {
        const d = 195 - (50 - Math.abs(i - 50)) * 3.62;
        e.controls.teleport(pose(d, targetPine));
        await new Promise(requestAnimationFrame);
        frames.push({ distance: d, ...inspectTree(targetPine) });
      }
      // Independently check the real terrain sample for each nearby resident tree along the highway.
      let checked = 0;
      for (let i = 0; i < 48; i++) {
        e.controls.teleport(roadPose(5 + i * 4));
        await new Promise(requestAnimationFrame);
        const meshes = new Map();
        for (const m of e.forest.drawn || [])
          meshes.set(m.index, (meshes.get(m.index) || 0) + (m.weight ?? 1));
        for (const [key, t] of e.forest.tiles) {
          if (!t.show) continue;
          const r = t.records;
          for (let k = 0; k < r.length; k += 8) {
            if (
              Math.hypot(
                t.x * 256 + r[k] - e.camera.position.x,
                t.z * 256 + r[k + 1] - e.camera.position.z,
              ) > 35
            )
              continue;
            const cover = t.show.getX(k / 8) + (meshes.get(key + '/' + k) || 0);
            if (Math.abs(cover - 1) > 0.001)
              throw Error(
                'Highway crown coverage ' + key + '/' + k + ' ' + cover,
              );
            checked++;
          }
        }
      }
      if (checked < 48) throw Error('Highway coverage route missed the forest');
      window.highwayChecks = checked;
      return frames;
    });
    if (cdp) {
      await cdp.send('Page.stopScreencast');
      await mkdir(out + '/frames', { recursive: true });
      for (const [i, frame] of frames.entries())
        await writeFile(
          out + '/frames/' + String(i).padStart(4, '0') + '.jpg',
          frame,
        );
      if (frames.length)
        execFileSync('ffmpeg', [
          '-y',
          '-loglevel',
          'error',
          '-framerate',
          '12',
          '-i',
          out + '/frames/%04d.jpg',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          '27',
          '-movflags',
          '+faststart',
          out + '/motion.mp4',
        ]);
    }
    assert.ok(
      motion.every(
        (t) => t.species === 'pine' && (t.portrait > 0 || t.model.length > 0),
      ),
    );
    assert.ok(
      motion.every(
        (t) =>
          Math.abs(t.portrait + t.model.reduce((sum, m) => sum + m[1], 0) - 1) <
          0.001,
      ),
    );
    if (await page.evaluate(() => !!airp.forest.handoffs)) {
      assert.ok(
        motion.some((t) => t.model.some((m) => m[1] > 0 && m[1] < 1)),
        'route must exercise a partial handoff',
      );
      assert.ok(
        motion.some((t) => t.portrait >= 0.99) &&
          motion.some((t) =>
            t.model.some((m) => m[0] === 'near' && m[1] >= 0.99),
          ),
      );
    }
    await writeFile(out + '/motion.json', JSON.stringify(motion, null, 2));
    console.log(
      'Highway nearby crown checks:',
      await page.evaluate(() => highwayChecks),
    );
    await page.evaluate(async () => {
      for (let i = 0; i < 28; i++) {
        airp.controls.teleport({
          x: -660 - i * 75,
          z: 2200 - i * 110,
          above: 100,
          yaw: 0,
          pitch: -0.3,
        });
        await new Promise(requestAnimationFrame);
      }
    });
    for (const name of [
      'Tree Model Showcase',
      'Silverpine Forest',
      'Tree Model Showcase',
    ]) {
      await page.locator('#atlas-btn').click();
      await page
        .locator('#stations')
        .getByRole('button', { name, exact: true })
        .click();
      await settle();
    }
    assert.equal(
      await page.evaluate(() =>
        airp.showcase.groves.reduce((n, g) => n + g.trees.length, 0),
      ),
      15,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS matched captures, approach/retreat, highway travel, tile crossing and repeated atlas visits',
    );
  }
} finally {
  await browser?.close();
  await server.close();
}
