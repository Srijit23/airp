import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetManager } from '../src/core/assets.js';

test('asset acquisition deduplicates concurrent loads, retries failures, disposes once', async () => {
  const assets = new AssetManager({ rock: { type: 'texture' } });
  let calls = 0,
    disposed = 0;
  assets.load = async () => {
    if (++calls === 1) throw Error('missing texture');
    return {
      value: {},
      dispose() {
        disposed++;
      },
    };
  };
  await assert.rejects(assets.acquire('rock'), /rock/);
  const [a, b] = await Promise.all([
    assets.acquire('rock'),
    assets.acquire('rock'),
  ]);
  assert.equal(a.value, b.value);
  assert.equal(calls, 2);
  a.release();
  a.release();
  assert.equal(disposed, 0);
  b.release();
  assert.equal(disposed, 1);
  assert.equal(assets.entries.size, 0);
});
