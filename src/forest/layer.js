import { Canopy } from './canopy.js';
import { TILE, tileAt } from '../data/world.js';
import { ForestModels } from './models.js';
import { forestWindow, qualityLevels } from './window.js';

export class ForestLayer {
  constructor(scene, assets, fail) {
    this.canopy = new Canopy(scene, fail);
    this.scene = scene;
    this.models = new ForestModels(scene, assets, fail);
    this.tiles = new Map();
    this.previous = new Map();
    this.revision = 0;
    this.dirty = true;
    this.workerTimes = [];
    this.worker = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
    });
    this.worker.onerror = (e) => fail(new Error(e.message));
    this.worker.onmessage = ({ data }) => {
      const key = data.x + ',' + data.z;
      this.busy = false;
      if (this.wanted.has(key)) {
        // A small occupancy mask deconflicts old wild tree props only where new stands exist.
        data.cover = new Uint8Array(16 * 16);
        for (let i = 0; i < data.records.length; i += 8)
          data.cover[
            Math.floor(data.records[i] / 16) +
              16 * Math.floor(data.records[i + 1] / 16)
          ] = 1;
        this.tiles.set(key, data);
        this.dirty = true;
        this.workerTimes.push(data.ms);
        if (this.workerTimes.length > 64) this.workerTimes.shift();
      }
      this.pump();
    };
  }
  containsWildCrown(x, z) {
    const tx = tileAt(x),
      tz = tileAt(z),
      tile = this.tiles.get(tx + ',' + tz);
    return (
      tile?.cover[
        Math.floor((x - tx * TILE) / 16) + 16 * Math.floor((z - tz * TILE) / 16)
      ] === 1
    );
  }
  pump() {
    if (this.busy || !this.jobs?.length) return;
    const job = this.jobs.shift();
    if (job.priority > 8) this.nearReady = true;
    this.busy = true;
    this.inflight = job.key;
    this.worker.postMessage({ x: job.x, z: job.z });
  }
  get settled() {
    return (
      !this.busy &&
      !this.jobs?.length &&
      !this.dirty &&
      [...this.models.entries.values()].every((e) => e.ready)
    );
  }
  update(camera, streamer, quality) {
    const tx = tileAt(camera.x),
      tz = tileAt(camera.z),
      config = qualityLevels[quality],
      key = tx + ',' + tz + '/' + quality;
    if (key !== this.key) {
      this.key = key;
      this.nearReady = false;
      const list = forestWindow(tx, tz, config.radius);
      this.wanted = new Set(list.map((j) => j.key));
      for (const [id, tile] of this.tiles)
        if (!this.wanted.has(id)) {
          this.dropTile(tile);
          this.tiles.delete(id);
        }
      this.jobs = list.filter(
        (j) =>
          !this.tiles.has(j.key) && !(this.busy && this.inflight === j.key),
      );
      this.dirty = true;
      this.pump();
      if (!this.jobs.length || this.jobs[0].priority > 8) this.nearReady = true;
    }
    const terrainRevision = streamer.loads + streamer.unloads;
    if (
      !this.dirty &&
      this.modelRevision === this.models.revision &&
      this.terrainRevision === terrainRevision &&
      Math.hypot(camera.x - this.cx, camera.y - this.cy, camera.z - this.cz) <
        1.25
    )
      return;
    const start = performance.now();
    this.cx = camera.x;
    this.cy = camera.y;
    this.cz = camera.z;
    this.dirty = false;
    this.modelRevision = this.models.revision;
    this.terrainRevision = terrainRevision;
    const candidates = [];
    for (const [id, tile] of this.tiles) {
      const ox = tile.x * TILE,
        oz = tile.z * TILE,
        records = tile.records;
      const res = streamer.resolutionAt(ox + 1, oz + 1),
        h = res === 32 ? 4 : res === 16 ? 3 : 2;
      if (
        Math.hypot(
          Math.max(ox - camera.x, 0, camera.x - ox - TILE),
          Math.max(oz - camera.z, 0, camera.z - oz - TILE),
        ) > 90
      )
        continue;
      for (let k = 0; k < records.length; k += 8) {
        const x = ox + records[k],
          z = oz + records[k + 1],
          y = records[k + h];
        const d = Math.hypot(x - camera.x, z - camera.z, y - camera.y);
        if (d > 90) continue;
        const index = id + '/' + k,
          old = this.previous.get(index);
        candidates.push({
          index,
          k,
          tile,
          x,
          y,
          z,
          d,
          score: d - (old ? 3 : 0),
          nearScore: d - (old === 'near' ? 3 : 0),
          species: records[k + 5],
          scale: records[k + 6],
          yaw: records[k + 7],
        });
      }
    }
    candidates.sort((a, b) => a.nearScore - b.nearScore);
    const near = candidates
      .filter((t) => t.d < (this.previous.get(t.index) === 'near' ? 28 : 25))
      .slice(0, config.near);
    for (const t of near) t.level = 'near';
    const far = candidates
      .filter((t) => !t.level)
      .sort((a, b) => a.score - b.score)
      .slice(0, config.mid);
    for (const t of far) t.level = 'far';
    const selected = near.concat(far);
    const drawKey =
      selected.map((t) => t.index + t.level + t.y).join(',') +
      '/' +
      this.models.revision;
    const drawn =
      this.drawKey === drawKey ? this.drawn : this.models.draw(selected);
    this.drawKey = drawKey;
    this.drawn = drawn;
    const signature = drawn.map((t) => t.index + t.level + t.y).join(',');
    this.previous = new Map(drawn.map((t) => [t.index, t.level]));
    this.updateDistant(drawn, streamer, config);
    this.stats.updateMs = performance.now() - start;
    if (this.drawSignature !== signature) {
      this.drawSignature = signature;
      this.revision++;
    }
  }
  updateDistant(drawn, streamer, config) {
    const totals = this.canopy.update(this.tiles, drawn, streamer, config);
    this.stats = {
      chunks: this.tiles.size,
      ...totals,
      near: drawn.filter((t) => t.level === 'near').length,
      mid: drawn.filter((t) => t.level === 'far').length,
      workerMeanMs:
        this.workerTimes.reduce((sum, v) => sum + v, 0) /
        Math.max(1, this.workerTimes.length),
      workerMaxMs: Math.max(0, ...this.workerTimes),
    };
  }
  dropTile(tile) {
    this.canopy.drop(tile);
  }
  dispose() {
    this.worker.terminate();
    this.models.dispose();
    for (const tile of this.tiles.values()) this.dropTile(tile);
    this.tiles.clear();
    this.canopy.dispose();
  }
}
