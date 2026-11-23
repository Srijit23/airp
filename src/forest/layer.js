import { Matrix4 } from 'three';
import { profiles, DetailBudget, visualPriority, selectDetail, TreeHandoffs } from './lod.js';
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
    this.priorTarget=new Map();
    this.targets=new Map();
    this.handoffs=new TreeHandoffs();
    this.budget=new DetailBudget();
    this.rotation=new Matrix4();
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
        data.immediate=Math.max(Math.abs(this.tx-data.x),Math.abs(this.tz-data.z))<=1;
        this.tiles.set(key, data);
        this.coverPending.delete(key);
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
    this.busy = true;
    this.inflight = job.key;
    this.worker.postMessage({ x: job.x, z: job.z });
  }
  get arrivalReady(){
    if(!this.canopy.ready || !this.wanted)return false;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
      const k=(this.tx+i)+','+(this.tz+j);
      if(this.wanted.has(k) && !this.tiles.has(k))return false;
    }
    return true;
  }
  get nearReady() {
    return this.coverPending?.size === 0;
  }
  get settled() {
    return (
      !this.busy &&
      !this.jobs?.length &&
      this.canopy.ready && !this.handoffs.moving && !this.dirty &&
      [...this.models.entries.values()].every((e) => e.ready)
    );
  }
  update(lens,streamer,quality,height,dt){
    const camera=lens.position,profile=profiles[quality];
    const budgetChanged=this.budget.sample(dt,streamer.settled && !this.busy);
    const tx = tileAt(camera.x),
      tz = tileAt(camera.z),
      config = qualityLevels[quality],
      key = tx + ',' + tz + '/' + quality;
    if (key !== this.key) {
      this.key = key;this.tx=tx;this.tz=tz;
      const list = forestWindow(tx, tz, config.radius);
      this.wanted = new Set(list.map((j) => j.key));
      for (const [id, tile] of this.tiles)
        if (!this.wanted.has(id)) {
          this.dropTile(tile);
          this.tiles.delete(id);
        }
      // PlaceLayer queries at most five 128 m cells in each direction. The
      // occupancy mask must include in-flight tiles as well as queued jobs.
      this.coverPending = new Set(
        list
          .filter(
            (job) =>
              Math.abs(job.x - tx) <= 3 &&
              Math.abs(job.z - tz) <= 3 &&
              !this.tiles.has(job.key),
          )
          .map((job) => job.key),
      );
      this.jobs = list.filter(
        (j) =>
          !this.tiles.has(j.key) && !(this.busy && this.inflight === j.key),
      );
      this.dirty = true;
      this.pump();
    }
    const terrainRevision=streamer.loads+streamer.unloads;
    const moved=this.cx===undefined || Math.hypot(camera.x-this.cx,camera.y-this.cy,camera.z-this.cz)>1;
    const turned=!this.orientation || 1-Math.abs(this.orientation.dot(lens.quaternion))>.00012;
    const reselect=this.dirty || moved || turned || height!==this.height || budgetChanged ||
      terrainRevision!==this.terrainRevision || this.modelRevision!==this.models.revision;
    if(!reselect && !this.handoffs.moving)return;
    const start=performance.now();
    if(reselect){
      this.cx=camera.x;this.cy=camera.y;this.cz=camera.z;this.height=height;
      this.orientation=lens.quaternion.clone();this.dirty=false;
      this.terrainRevision=terrainRevision;this.modelRevision=this.models.revision;
      const a=this.rotation.makeRotationFromQuaternion(lens.quaternion).elements;
      const tanY=Math.tan(lens.fov*Math.PI/360);
      const view={rx:a[0],ry:a[1],rz:a[2],ux:a[4],uy:a[5],uz:a[6],fx:-a[8],fy:-a[9],fz:-a[10],
        tanY,tanX:tanY*lens.aspect,focal:Math.max(180,height)/(2*tanY)};
      const candidates=[];
      for(const [id,tile] of this.tiles){
        const ox=tile.x*TILE,oz=tile.z*TILE,r=tile.records;
        if(Math.hypot(Math.max(ox-camera.x,0,camera.x-ox-TILE),Math.max(oz-camera.z,0,camera.z-oz-TILE))>profile.search)continue;
        const res=streamer.resolutionAt(ox+1,oz+1),h=res===32?4:res===16?3:2;
        for(let k=0;k<r.length;k+=8){
          const x=ox+r[k],z=oz+r[k+1],y=r[k+h];
          if((x-camera.x)**2+(z-camera.z)**2+(y-camera.y)**2>profile.search**2)continue;
          const t={x,y,z,k,tile,index:id+'/'+k,species:r[k+5],scale:r[k+6],yaw:r[k+7]};
          t.pixels=visualPriority(t,camera,view);
          if(t.pixels>=profile.midPx/1.28)candidates.push(t);
        }
      }
      this.targets=selectDetail(candidates,this.priorTarget,profile,this.budget.factor);
      this.priorTarget=new Map([...this.targets].map(([id,t])=>[id,t.level]));
      this.keep=new Set([...this.targets.values()].map(t=>t.species));
      for(const i of this.keep)this.models.request(i);
    }
    const drawn=this.handoffs.advance(this.targets,i=>this.models.entries.get(i)?.ready,
      t=>this.tiles.get(t.tile.x+','+t.tile.z)===t.tile,dt);
    const signature=drawn.map(t=>t.index+t.level+t.y+t.start.toFixed(3)+t.end.toFixed(3)).join(',');
    if(signature!==this.drawSignature || this.keep!==this.lastKeep){
      this.models.draw(drawn,this.keep);this.drawn=drawn;this.lastKeep=this.keep;
      this.previous=new Map(drawn.filter(t=>t.weight>=.5).map(t=>[t.index,t.level]));
      // A stationary transition needs a final clean shadow map. Avoid redrawing
      // every shadow caster for each intermediate screen-door pattern.
      if(signature!==this.drawSignature && (!this.handoffs.moving || !this.wasMoving))this.revision++;
      this.drawSignature=signature;
    }
    this.wasMoving=this.handoffs.moving;
    this.updateDistant(this.drawn||[],streamer,config);
    this.stats.budgetFactor=this.budget.factor;
    this.stats.updateMs=performance.now()-start;
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
