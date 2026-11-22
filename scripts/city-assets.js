import {readFileSync} from 'node:fs';
import {buildings} from '../src/places/records.js';
import { gzipSync,gunzipSync } from 'node:zlib';
import { parcels, greenReservations } from '../src/roads/parcels.js';
import { compileCity } from '../src/roads/build.js';

// 15 bytes per vertex: local cm XYZ, snorm8 normal, material ID, sRGB colour, sign UV.
// Assets are compiled once per Vite process and requested individually by the client.
export function encode(values) {
  const count = values.length / 12,
    data = Buffer.alloc(8 + 15 * count);
  data.write('ARP3');
  data.writeUInt32LE(count, 4);
  for (let i = 0, j = 8; i < values.length; i += 12, j += 15) {
    for (let k = 0; k < 3; k++) data.writeInt16LE(values[i + k], j + 2 * k);
    for (let k = 0; k < 3; k++) data.writeInt8(values[i + 3 + k], j + 6 + k);
    for (let k = 0; k < 6; k++) data[j + 9 + k] = values[i + 6 + k];
  }
  return gzipSync(data, { level: 7, mtime: 0 });
}
export function cityAssets() {
  const files = new Map(),
    manifest = {};
  for (const [key, batch] of compileCity()) {
    const record = {};
    for (const kind of ['base', 'detail']) {
      if (!batch[kind].length) continue;
      const path = 'city/' + key + '/' + kind + '.road';
      files.set(path, encode(batch[kind]));
      record[kind] = path;
    }
    manifest[key] = record;
  }
  files.set(
    'city/parcels.json',
    Buffer.from(
      JSON.stringify({
        version: 1,
        district: 'kestrel',
        units: 'metres',
        parcels,
        greenReservations,
      }),
    ),
  );
  files.set('city/index.json', Buffer.from(JSON.stringify(manifest)));
  for(const kit of ['homes','city','works','garden','canopy'])
    files.set('city/models/'+kit+'.glb',gunzipSync(readFileSync(new URL('../assets/models/'+kit+'.glb.gz',import.meta.url))));
  files.set('city/buildings.json',Buffer.from(JSON.stringify({version:1,units:'metres',buildings:buildings.map(({parcel,...b})=>({...b,parcelId:parcel.id}))})));
  return files;
}
export function cityPlugin() {
  let data;
  const files = () => (data ??= cityAssets());
  return {
    name: 'airp-city-chunks',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url || '').split('?')[0]).replace(
          /^\//,
          '',
        );
        if (!path.startsWith('city/')) return next();
        const bytes = files().get(path);
        if (!bytes) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader(
          'Content-Type',
          path.endsWith('.json')
            ? 'application/json'
            : 'application/octet-stream',
        );
        res.end(bytes);
      });
    },
    generateBundle() {
      for (const [fileName, source] of files())
        this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
