import { clamp, district, stations } from '../data/world.js';
import { drawStreets } from './city-plan.js';
import { elevation } from '../terrain/field.js';

const half = district.halfSize,
  size = 384;
function relief() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'),
    img = ctx.createImageData(size, size);
  const heights = new Float32Array((size + 1) * (size + 1)),
    step = (2 * half) / size;
  for (let y = 0; y <= size; y++)
    for (let x = 0; x <= size; x++)
      heights[y * (size + 1) + x] = elevation(x * step - half, y * step - half);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * (size + 1) + x,
        h = heights[i],
        dx = heights[i + 1] - h,
        dz = heights[i + size + 1] - h;
      const light = clamp((dx + dz) * 0.059, -0.65, 0.65),
        contour =
          Math.floor(h / 16) !==
          Math.floor((h + Math.max(1, Math.abs(dx), Math.abs(dz))) / 16);
      const base =
        35 + clamp(h / 520, 0, 1) * 42 + light * 38 + (contour ? 29 : 0);
      img.data.set([base + 5, base + 20, base + 11, 255], (y * size + x) * 4);
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
export class Atlas {
  constructor(controller, onTravel) {
    this.source = relief();
    this.controller = controller;
    this.onTravel = onTravel;
    this.mini = document.querySelector('#mini-map');
    this.full = document.querySelector('#atlas-map');
    this.cx = 0;
    this.cz = 0;
    this.zoom = 1;
    this.travelButtons();
    const c = this.full;
    c.onwheel = (e) => {
      e.preventDefault();
      this.scale(e.deltaY < 0 ? 1.25 : 0.8);
    };
    document.querySelector('#zoom-in').onclick = () => this.scale(1.4);
    document.querySelector('#zoom-out').onclick = () => this.scale(1 / 1.4);
    c.onpointerdown = (e) => {
      if (e.button !== 0) return;
      c.setPointerCapture(e.pointerId);
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        cx: this.cx,
        cz: this.cz,
        pan: false,
      };
    };
    c.onpointermove = (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x,
        dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.pan = true;
      if (this.drag.pan) {
        const unit = this.worldPerPixel();
        this.cx = this.drag.cx - dx * unit;
        this.cz = this.drag.cz - dy * unit;
        this.constrain();
        this.drawFull();
      }
    };
    c.onpointercancel = () => (this.drag = null);
    c.onpointerup = (e) => {
      if (!this.drag) return;
      if (!this.drag.pan) {
        const r = c.getBoundingClientRect(),
          unit = this.worldPerPixel();
        const x = this.cx + (e.clientX - r.left - r.width / 2) * unit,
          z = this.cz + (e.clientY - r.top - r.height / 2) * unit;
        if (Math.abs(x) < half && Math.abs(z) < half)
          this.onTravel({ x, z, above: 56, yaw: controller.yaw, pitch: -0.18 });
      }
      this.drag = null;
    };
  }
  travelButtons() {
    const parent = document.querySelector('#stations');
    for (const s of stations) {
      const b = document.createElement('button');
      b.textContent = s.name;
      b.onclick = () => this.onTravel(s);
      parent.append(b);
    }
  }
  worldPerPixel() {
    return (2 * half) / (this.full.clientHeight * this.zoom);
  }
  constrain() {
    this.cx = clamp(this.cx, -half, half);
    this.cz = clamp(this.cz, -half, half);
  }
  scale(f) {
    this.zoom = clamp(this.zoom * f, 1, 5);
    this.constrain();
    this.drawFull();
  }
  drawFull() {
    this.draw(this.full, this.cx, this.cz, this.worldPerPixel(), true);
  }
  drawMini() {
    const { x, z } = this.controller.camera.position,
      span = 610;
    this.draw(this.mini, x, z, span / this.mini.clientWidth, false);
    const label = document.querySelector('#map-scale');
    label.textContent = '100 m';
    label.style.width = (100 / span) * this.mini.clientWidth + 'px';
  }
  draw(canvas, cx, cz, unit, full) {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#26372d';
    ctx.fillRect(0, 0, w, h);
    const px = (x) => (x - cx) / unit + w / 2,
      py = (z) => (z - cz) / unit + h / 2;
    ctx.drawImage(
      this.source,
      px(-half),
      py(-half),
      (2 * half) / unit,
      (2 * half) / unit,
    );
    ctx.strokeStyle = '#b8cda833';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (let i = -half; i <= half; i += 256) {
      ctx.moveTo(px(i), py(-half));
      ctx.lineTo(px(i), py(half));
      ctx.moveTo(px(-half), py(i));
      ctx.lineTo(px(half), py(i));
    }
    ctx.stroke();
    if (this.overlay) drawStreets(ctx, px, py, unit, this.overlay, full);
    if (full)
      for (const s of stations) {
        const x = px(s.x),
          y = py(s.z);
        ctx.strokeStyle = '#dce4c3';
        ctx.strokeRect(x - 2, y - 2, 4, 4);
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#f5f2da';
        if (!['meridian', 'flats', 'plan'].includes(s.id) || this.zoom > 2)
          ctx.fillText(s.name, x + 6, y - 5);
      }
    const p = this.controller.camera.position;
    ctx.save();
    ctx.translate(px(p.x), py(p.z));
    ctx.rotate(-this.controller.yaw);
    ctx.fillStyle = '#cdef8530';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, full ? 28 : 23, -2.17, -0.97);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = '#ddff9d';
    ctx.fill();
    ctx.strokeStyle = '#182516';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
}
