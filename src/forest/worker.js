import { generateForestTile } from './distribution.js';
self.onmessage = ({ data: { x, z } }) => {
  const start = performance.now(),
    records = generateForestTile(x, z);
  self.postMessage({ x, z, records, ms: performance.now() - start }, [
    records.buffer,
  ]);
};
