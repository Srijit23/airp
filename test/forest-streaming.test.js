import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from 'three';
import { ForestModels } from '../src/forest/models.js';
import { forestWindow, qualityLevels } from '../src/forest/window.js';

test('forest windows prioritize nearby terrain and release the previous district', () => {
  const keys = (x, z, quality) =>
    forestWindow(x, z, qualityLevels[quality].radius);
  const low = keys(-5, -5, 'low'),
    medium = keys(-5, -5, 'medium'),
    high = keys(-5, -5, 'high');
  assert.ok(
    low.length < medium.length &&
      medium.length < high.length &&
      high.length < 420,
  );
  assert.equal(medium[0].priority, 0);
  assert.equal(new Set(medium.map((t) => t.key)).size, medium.length);
  const border = keys(18, 18, 'medium');
  assert.ok(border.every((t) => t.x <= 18 && t.z <= 18));
  const next = new Set(keys(15, 10, 'medium').map((t) => t.key));
  assert.ok(medium.every((t) => !next.has(t.key)));
});
test('a pending shared forest GLB releases its handle if the camera leaves first', async () => {
  let releases = 0,
    resolve;
  const assets = {
    acquire: () =>
      new Promise((r) => {
        resolve = r;
      }),
  };
  const models = new ForestModels(new Scene(), assets, assert.fail);
  const entry = models.request(1);
  assert.equal(models.request(1), entry);
  models.draw([]);
  resolve({ release: () => releases++ });
  await new Promise(setImmediate);
  assert.equal(releases, 1);
  assert.equal(models.entries.size, 0);
  assert.equal(models.scene.children.length, 0);
});
