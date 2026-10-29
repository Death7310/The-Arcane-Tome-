// Canvas particle engine for spell and action effects.
//
// One full-page canvas sits above the sheet (pointer-events: none). Effects are
// composed from an *element* (how it looks: fire, frost, lightning…) and a *shape*
// (how it travels: bolt, ray, burst, cone, line, rain, aura, touch), so any spell —
// including homebrew — gets a fitting animation without bespoke code.
//
// Photosensitivity: full-screen flashes are capped at two per effect, spaced ≥350 ms
// apart (WCAG 2.2 SC 2.3.1 allows at most three flashes in any one-second period),
// kept at ≤35% opacity, and disabled entirely when flashing is turned off or the
// reader prefers reduced motion.

import type { ActionMotion, EffectRequest, Element, FxLevel, Outcome, Point } from './types';

type Sprite = 'glow' | 'soft' | 'shard' | 'spark' | 'plus' | 'leaf' | 'drop' | 'foot';

interface Drawable {
  additive: boolean;
  update(dt: number): boolean;
  draw(ctx: CanvasRenderingContext2D): void;
}

interface Style {
  colors: string[];
  smoke?: string;
  text: string;
  vignette?: string;
}

const STYLE: Record<Element, Style> = {
  fire: { colors: ['#fff3b0', '#ffc94a', '#ff8a1f', '#e8461a', '#b3260c'], smoke: '#3b2a26', text: '#ffb347', vignette: '#ff6a1a' },
  cold: { colors: ['#ffffff', '#d8f4ff', '#9fe0ff', '#5cb8ff', '#3a7fe0'], smoke: '#cfefff', text: '#9fe0ff', vignette: '#7fd0ff' },
  lightning: { colors: ['#ffffff', '#e6eeff', '#a9c8ff', '#7d9bff', '#c5a8ff'], text: '#c9d8ff', vignette: '#8fa8ff' },
  thunder: { colors: ['#efeaff', '#d9d2ff', '#b0a6e6', '#8a82c2'], smoke: '#8a8378', text: '#d9d2ff' },
  acid: { colors: ['#f0ff9a', '#c6f23a', '#8fd62a', '#4fa31f'], text: '#c6f23a', vignette: '#7fc92a' },
  poison: { colors: ['#d4f58a', '#9bd65a', '#6aa84a', '#8a6aa8'], smoke: '#6f8f4a', text: '#b4e07a', vignette: '#6aa84a' },
  necrotic: { colors: ['#e6d1ff', '#a874e0', '#6d34a6', '#3d1a5c'], smoke: '#1a0f24', text: '#c9a2ff', vignette: '#3d1a5c' },
  radiant: { colors: ['#fffdf0', '#fff0a8', '#ffd75e', '#f2b43a'], text: '#ffe27a', vignette: '#ffd75e' },
  force: { colors: ['#f4ecff', '#cdb3ff', '#9a78ff', '#6a48e8'], text: '#cdb3ff', vignette: '#7a5cff' },
  psychic: { colors: ['#ffe0f7', '#ff9fde', '#e862c0', '#a8429f'], text: '#ff9fde', vignette: '#e862c0' },
  slashing: { colors: ['#ffffff', '#eef3f8', '#c3ccd8', '#ffd08a'], text: '#eef3f8' },
  piercing: { colors: ['#ffffff', '#eef3f8', '#c3ccd8', '#ffe2a8'], text: '#eef3f8' },
  bludgeoning: { colors: ['#fff1d6', '#e3cfa8', '#b89f78', '#8a7658'], smoke: '#7d6f5a', text: '#f0dcb4' },
  healing: { colors: ['#f6fff0', '#c4ffb8', '#7ff0a4', '#ffe9a0'], text: '#8ff5b0', vignette: '#6fe39a' },
  arcane: { colors: ['#f4efff', '#c0d0ff', '#94a8ff', '#d6a2ff'], text: '#c0d0ff', vignette: '#94a8ff' },
  shadow: { colors: ['#b8aed0', '#6a5f86', '#3a3150', '#1e1a2a'], smoke: '#16121f', text: '#b8aed0', vignette: '#2a2238' },
  nature: { colors: ['#eaffc0', '#a8e070', '#5fb042', '#c9a35a'], text: '#b8e88a', vignette: '#5fb042' },
};

export const elementColor = (el: Element): string => STYLE[el].text;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const spriteCache = new Map<string, HTMLCanvasElement>();
function sprite(color: string, soft: boolean): HTMLCanvasElement {
  const key = color + (soft ? 's' : 'g');
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    grd.addColorStop(0, rgba(color, 0.55));
    grd.addColorStop(0.55, rgba(color, 0.22));
    grd.addColorStop(1, rgba(color, 0));
  } else {
    grd.addColorStop(0, rgba(color, 1));
    grd.addColorStop(0.22, rgba(color, 0.65));
    grd.addColorStop(1, rgba(color, 0));
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  spriteCache.set(key, c);
  return c;
}

interface ParticleOpts {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: string;
  sprite?: Sprite;
  gravity?: number;
  drag?: number;
  additive?: boolean;
  alpha?: number;
  rot?: number;
  vrot?: number;
  orbit?: { cx: number; cy: number; w: number; pull: number };
  twinkle?: boolean;
  delay?: number;
}

class Particle implements Drawable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age = 0;
  life: number;
  size: number;
  sizeEnd: number;
  color: string;
  kind: Sprite;
  gravity: number;
  drag: number;
  additive: boolean;
  alpha: number;
  rot: number;
  vrot: number;
  orbit?: ParticleOpts['orbit'];
  twinkle: boolean;
  delay: number;

  constructor(o: ParticleOpts) {
    this.x = o.x;
    this.y = o.y;
    this.vx = o.vx ?? 0;
    this.vy = o.vy ?? 0;
    this.life = o.life;
    this.size = o.size;
    this.sizeEnd = o.sizeEnd ?? o.size * 0.2;
    this.color = o.color;
    this.kind = o.sprite ?? 'glow';
    this.gravity = o.gravity ?? 0;
    this.drag = o.drag ?? 0;
    this.additive = o.additive ?? (this.kind !== 'soft' && this.kind !== 'drop' && this.kind !== 'foot' && this.kind !== 'leaf');
    this.alpha = o.alpha ?? 1;
    this.rot = o.rot ?? Math.random() * Math.PI * 2;
    this.vrot = o.vrot ?? (this.kind === 'shard' || this.kind === 'leaf' ? rand(-9, 9) : 0);
    this.orbit = o.orbit;
    this.twinkle = o.twinkle ?? false;
    this.delay = o.delay ?? 0;
  }

  update(dt: number): boolean {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    this.age += dt;
    if (this.orbit) {
      const o = this.orbit;
      const dx = this.x - o.cx;
      const dy = this.y - o.cy;
      const r = Math.max(2, Math.hypot(dx, dy) - o.pull * dt);
      const a = Math.atan2(dy, dx) + o.w * dt;
      this.x = o.cx + Math.cos(a) * r;
      this.y = o.cy + Math.sin(a) * r;
    } else {
      const k = Math.exp(-this.drag * dt);
      this.vx *= k;
      this.vy = this.vy * k + this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    this.rot += this.vrot * dt;
    return this.age < this.life;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.delay > 0) return;
    const t = this.age / this.life;
    let a = this.alpha * (t < 0.1 ? t / 0.1 : 1 - Math.pow((t - 0.1) / 0.9, 1.6));
    if (this.twinkle) a *= 0.55 + 0.45 * Math.sin(this.age * 28 + this.rot * 10);
    if (a <= 0.003) return;
    const s = lerp(this.size, this.sizeEnd, t);
    ctx.globalAlpha = Math.min(1, a);
    switch (this.kind) {
      case 'glow':
      case 'soft':
        ctx.drawImage(sprite(this.color, this.kind === 'soft'), this.x - s, this.y - s, s * 2, s * 2);
        break;
      case 'spark': {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(1, s * 0.35);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 0.035, this.y - this.vy * 0.035);
        ctx.stroke();
        break;
      }
      case 'shard': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.32, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.32, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'plus': {
        ctx.fillStyle = this.color;
        const w = s * 0.32;
        ctx.fillRect(this.x - s, this.y - w / 2, s * 2, w);
        ctx.fillRect(this.x - w / 2, this.y - s, w, s * 2);
        break;
      }
      case 'leaf': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'drop':
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'foot': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.45, s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
    }
  }
}

class Ring implements Drawable {
  additive = true;
  private age = 0;
  constructor(
    private x: number,
    private y: number,
    private r0: number,
    private r1: number,
    private width: number,
    private color: string,
    private life: number,
    private delay = 0,
    private sides = 0,
  ) {}
  update(dt: number) {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    this.age += dt;
    return this.age < this.life;
  }
  draw(ctx: CanvasRenderingContext2D) {
    if (this.delay > 0) return;
    const t = this.age / this.life;
    const r = lerp(this.r0, this.r1, easeOut(t));
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = Math.max(0.5, this.width * (1 - t));
    ctx.beginPath();
    if (this.sides > 2) {
      for (let i = 0; i <= this.sides; i++) {
        const a = (i / this.sides) * Math.PI * 2 + this.age * 0.6;
        const px = this.x + Math.cos(a) * r;
        const py = this.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    } else {
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
}

function jagged(a: Point, b: Point, roughness: number, depth = 6): Point[] {
  let pts: Point[] = [a, b];
  let off = roughness;
  for (let d = 0; d < depth; d++) {
    const next: Point[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const o = rand(-off, off);
      next.push({ x: (p.x + q.x) / 2 + (-dy / len) * o, y: (p.y + q.y) / 2 + (dx / len) * o }, q);
    }
    pts = next;
    off *= 0.55;
  }
  return pts;
}

class Bolt implements Drawable {
  additive = true;
  private age = 0;
  private sinceRegen = 0;
  private paths: Point[][] = [];
  constructor(
    private a: Point,
    private b: Point,
    private width: number,
    private color: string,
    private life: number,
    private branches: number,
    private delay = 0,
  ) {
    this.regen();
  }
  private regen() {
    const len = Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y);
    const main = jagged(this.a, this.b, len * 0.16);
    this.paths = [main];
    for (let i = 0; i < this.branches; i++) {
      const start = main[Math.floor(rand(0.15, 0.8) * main.length)];
      const ang = Math.atan2(this.b.y - this.a.y, this.b.x - this.a.x) + rand(-0.9, 0.9);
      const bl = len * rand(0.12, 0.3);
      this.paths.push(jagged(start, { x: start.x + Math.cos(ang) * bl, y: start.y + Math.sin(ang) * bl }, bl * 0.25, 4));
    }
  }
  update(dt: number) {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    this.age += dt;
    this.sinceRegen += dt;
    if (this.sinceRegen > 0.07 && this.age < this.life * 0.6) {
      this.sinceRegen = 0;
      this.regen();
    }
    return this.age < this.life;
  }
  draw(ctx: CanvasRenderingContext2D) {
    if (this.delay > 0) return;
    const t = this.age / this.life;
    const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.paths.forEach((path, i) => {
      const w = i === 0 ? this.width : this.width * 0.45;
      for (const [mult, alpha, col] of [
        [5, 0.12, this.color],
        [2.2, 0.35, this.color],
        [0.8, 1, '#ffffff'],
      ] as const) {
        ctx.globalAlpha = alpha * fade;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, w * mult);
        ctx.beginPath();
        path.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
    });
  }
}

class Beam implements Drawable {
  additive = true;
  private age = 0;
  constructor(
    private a: Point,
    private b: Point,
    private width: number,
    private color: string,
    private life: number,
  ) {}
  update(dt: number) {
    this.age += dt;
    return this.age < this.life;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const t = this.age / this.life;
    const grow = Math.min(1, t / 0.15);
    const fade = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
    const wob = 1 + Math.sin(this.age * 60) * 0.15;
    const ex = lerp(this.a.x, this.b.x, grow);
    const ey = lerp(this.a.y, this.b.y, grow);
    ctx.lineCap = 'round';
    for (const [mult, alpha, col] of [
      [3.2, 0.18, this.color],
      [1.6, 0.45, this.color],
      [0.5, 1, '#ffffff'],
    ] as const) {
      ctx.globalAlpha = alpha * fade;
      ctx.strokeStyle = col;
      ctx.lineWidth = this.width * mult * wob;
      ctx.beginPath();
      ctx.moveTo(this.a.x, this.a.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }
}

class Column implements Drawable {
  additive = true;
  private age = 0;
  constructor(
    private x: number,
    private bottom: number,
    private width: number,
    private color: string,
    private life: number,
  ) {}
  update(dt: number) {
    this.age += dt;
    return this.age < this.life;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const t = this.age / this.life;
    const grow = easeOut(Math.min(1, t / 0.25));
    const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    const yEnd = lerp(-20, this.bottom, grow);
    const grd = ctx.createLinearGradient(0, -20, 0, this.bottom);
    grd.addColorStop(0, rgba(this.color, 0));
    grd.addColorStop(0.7, rgba(this.color, 0.35));
    grd.addColorStop(1, rgba(this.color, 0.85));
    ctx.globalAlpha = fade;
    ctx.fillStyle = grd;
    const w = this.width * (0.9 + Math.sin(this.age * 30) * 0.1);
    ctx.fillRect(this.x - w / 2, -20, w, yEnd + 20);
    ctx.fillStyle = rgba('#ffffff', 0.5);
    ctx.fillRect(this.x - w * 0.12, -20, w * 0.24, yEnd + 20);
  }
}

class Rays implements Drawable {
  additive = true;
  private age = 0;
  private angles: number[];
  constructor(
    private x: number,
    private y: number,
    private length: number,
    private color: string,
    private life: number,
    count: number,
  ) {
    this.angles = Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2 + rand(-0.1, 0.1));
  }
  update(dt: number) {
    this.age += dt;
    return this.age < this.life;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const t = this.age / this.life;
    const len = this.length * easeOut(Math.min(1, t / 0.4));
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.fillStyle = this.color;
    for (const a0 of this.angles) {
      const a = a0 + this.age * 0.4;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(a - 0.05) * len, this.y + Math.sin(a - 0.05) * len);
      ctx.lineTo(this.x + Math.cos(a + 0.05) * len, this.y + Math.sin(a + 0.05) * len);
      ctx.closePath();
      ctx.fill();
    }
  }
}

class Slash implements Drawable {
  additive = true;
  private age = 0;
  constructor(
    private x: number,
    private y: number,
    private r: number,
    private start: number,
    private sweep: number,
    private color: string,
    private life: number,
    private delay = 0,
  ) {}
  update(dt: number) {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    this.age += dt;
    return this.age < this.life;
  }
  draw(ctx: CanvasRenderingContext2D) {
    if (this.delay > 0) return;
    const t = this.age / this.life;
    const head = easeOut(Math.min(1, t / 0.35));
    const tail = Math.max(0, (t - 0.2) / 0.8);
    const a0 = this.start + this.sweep * tail;
    const a1 = this.start + this.sweep * head;
    if (a1 <= a0) return;
    ctx.lineCap = 'round';
    for (const [w, alpha, col] of [
      [14, 0.2, this.color],
      [6, 0.6, this.color],
      [2, 1, '#ffffff'],
    ] as const) {
      ctx.globalAlpha = alpha * (1 - t * 0.6);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, a0, a1);
      ctx.stroke();
    }
  }
}

class FloatText implements Drawable {
  additive = false;
  private age = 0;
  constructor(
    private text: string,
    private x: number,
    private y: number,
    private color: string,
    private size: number,
    private life = 1.6,
    private delay = 0,
  ) {}
  update(dt: number) {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    this.age += dt;
    return this.age < this.life;
  }
  draw(ctx: CanvasRenderingContext2D) {
    if (this.delay > 0) return;
    const t = this.age / this.life;
    const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.5 : t < 0.2 ? 1.1 - ((t - 0.12) / 0.08) * 0.1 : 1;
    ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    ctx.font = `700 ${Math.round(this.size * pop)}px "Alegreya SC", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = this.y - easeOut(t) * 46;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(12,10,20,0.75)';
    ctx.strokeText(this.text, this.x, y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, y);
  }
}

/** Runs `onTick(x, y, vx, vy)` each frame as it travels a gentle arc from a to b, then `onArrive`. */
class Projectile implements Drawable {
  additive = true;
  private age = 0;
  private x: number;
  private y: number;
  private c: Point;
  constructor(
    private a: Point,
    private b: Point,
    private dur: number,
    private head: string,
    private size: number,
    private onTick: (x: number, y: number, vx: number, vy: number) => void,
    private onArrive: () => void,
  ) {
    this.x = a.x;
    this.y = a.y;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const bend = rand(-0.18, 0.18) * len;
    this.c = { x: mx + (-(b.y - a.y) / (len || 1)) * bend, y: my + ((b.x - a.x) / (len || 1)) * bend };
  }
  update(dt: number) {
    this.age += dt;
    const t = Math.min(1, this.age / this.dur);
    const u = 1 - t;
    const nx = u * u * this.a.x + 2 * u * t * this.c.x + t * t * this.b.x;
    const ny = u * u * this.a.y + 2 * u * t * this.c.y + t * t * this.b.y;
    this.onTick(nx, ny, (nx - this.x) / Math.max(dt, 0.001), (ny - this.y) / Math.max(dt, 0.001));
    this.x = nx;
    this.y = ny;
    if (t >= 1) {
      this.onArrive();
      return false;
    }
    return true;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = 1;
    const s = this.size;
    ctx.drawImage(sprite(this.head, false), this.x - s * 2, this.y - s * 2, s * 4, s * 4);
    ctx.drawImage(sprite('#ffffff', false), this.x - s * 0.7, this.y - s * 0.7, s * 1.4, s * 1.4);
  }
}

class Emitter implements Drawable {
  additive = true;
  private age = 0;
  private acc = 0;
  constructor(
    private dur: number,
    private perSecond: number,
    private spawn: (t: number) => void,
    private delay = 0,
  ) {}
  update(dt: number) {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    this.age += dt;
    this.acc += dt * this.perSecond;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.spawn(Math.min(1, this.age / this.dur));
    }
    return this.age < this.dur;
  }
  draw() {}
}

export interface Overlays {
  flash: HTMLElement;
  dim: HTMLElement;
  vignette: HTMLElement;
  shake: HTMLElement;
}

export class FxEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private overlays: Overlays | null = null;
  private items: Drawable[] = [];
  private pending: Drawable[] = [];
  private updating = false;
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private timers = new Set<number>();
  level: FxLevel = 'full';
  allowFlash = true;
  private readonly maxItems = 2200;

  attach(canvas: HTMLCanvasElement, overlays: Overlays) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.overlays = overlays;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  detach() {
    window.removeEventListener('resize', this.resize);
    cancelAnimationFrame(this.raf);
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.items = [];
    this.pending = [];
    this.raf = 0;
    this.canvas = null;
    this.ctx = null;
  }

  private resize = () => {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private get q(): number {
    return this.level === 'reduced' ? 0.35 : 1;
  }

  private add(d: Drawable) {
    if (this.items.length + this.pending.length >= this.maxItems) return;
    // Things spawned while the frame is updating (trails, impacts on arrival) join after it.
    if (this.updating) this.pending.push(d);
    else this.items.push(d);
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private later(ms: number, fn: () => void) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (this.ctx) fn();
    }, ms);
    this.timers.add(id);
  }

  private frame = (now: number) => {
    const ctx = this.ctx;
    if (!ctx) {
      this.raf = 0;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.updating = true;
    this.items = this.items.filter((d) => d.update(dt));
    this.updating = false;
    if (this.pending.length) {
      this.items.push(...this.pending);
      this.pending = [];
    }
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'source-over';
    for (const d of this.items) if (!d.additive) d.draw(ctx);
    ctx.globalCompositeOperation = 'lighter';
    for (const d of this.items) if (d.additive) d.draw(ctx);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.items.length) this.raf = requestAnimationFrame(this.frame);
    else {
      this.raf = 0;
      ctx.clearRect(0, 0, this.w, this.h);
    }
  };

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.q));
  }

  private particle(o: ParticleOpts) {
    this.add(new Particle(o));
  }

  private spray(
    at: Point,
    count: number,
    o: Omit<ParticleOpts, 'x' | 'y' | 'vx' | 'vy' | 'life' | 'size' | 'color'> & {
      speed: [number, number];
      life: [number, number];
      size: [number, number];
      colors: string[];
      angle?: number;
      spread?: number;
      jitter?: number;
    },
  ) {
    for (let i = 0; i < this.n(count); i++) {
      const ang = o.angle !== undefined ? o.angle + rand(-(o.spread ?? Math.PI), o.spread ?? Math.PI) : rand(0, Math.PI * 2);
      const sp = rand(o.speed[0], o.speed[1]);
      const j = o.jitter ?? 0;
      const size = rand(o.size[0], o.size[1]);
      this.particle({
        ...o,
        x: at.x + rand(-j, j),
        y: at.y + rand(-j, j),
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: rand(o.life[0], o.life[1]),
        size,
        sizeEnd: o.sizeEnd !== undefined ? o.sizeEnd * (size / o.size[1]) : undefined,
        color: pick(o.colors),
      });
    }
  }

  // ───────────────────────── screen-level effects ─────────────────────────

  private flash(color: string, strength: number, times = 1) {
    if (!this.overlays || !this.allowFlash || this.level !== 'full') return;
    const el = this.overlays.flash;
    el.style.background = color;
    const peak = Math.min(0.35, strength);
    for (let i = 0; i < Math.min(2, times); i++) {
      this.later(i * 380, () =>
        el.animate([{ opacity: 0 }, { opacity: peak, offset: 0.2 }, { opacity: 0 }], { duration: 220, easing: 'ease-out' }),
      );
    }
  }

  private shake(px: number, ms = 420) {
    if (!this.overlays || this.level !== 'full' || px <= 0) return;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 8; i++) {
      const d = px * (1 - i / 8);
      frames.push({ transform: i === 8 ? 'translate(0,0)' : `translate(${rand(-d, d).toFixed(1)}px, ${rand(-d, d).toFixed(1)}px)` });
    }
    this.overlays.shake.animate(frames, { duration: ms, easing: 'linear' });
  }

  private vignette(color: string | undefined, strength: number, ms = 900) {
    if (!this.overlays || !color) return;
    const el = this.overlays.vignette;
    el.style.setProperty('--fx-vignette', color);
    el.animate([{ opacity: 0 }, { opacity: Math.min(0.9, strength), offset: 0.2 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }

  private dim(strength: number, ms: number) {
    if (!this.overlays || strength <= 0) return;
    // Light pages need a deeper dim for glowing effects to read; the theme sets the boost.
    const boost = parseFloat(getComputedStyle(this.overlays.dim).getPropertyValue('--fx-dim-boost')) || 1;
    strength = Math.min(0.7, strength * boost);
    this.overlays.dim.animate(
      [{ opacity: 0 }, { opacity: strength, offset: 0.15 }, { opacity: strength, offset: 0.65 }, { opacity: 0 }],
      { duration: ms, easing: 'ease-in-out' },
    );
  }

  // ───────────────────────────── public API ─────────────────────────────

  defaultTarget(from?: Point): Point {
    const narrow = this.w < 700;
    let x = narrow ? this.w * rand(0.4, 0.6) : this.w * rand(0.48, 0.62);
    const y = this.h * rand(0.3, 0.4);
    if (from && Math.hypot(from.x - x, from.y - y) < 160) x = from.x > this.w / 2 ? this.w * 0.25 : this.w * 0.75;
    return { x, y };
  }

  /** Plays an effect and returns the delay (ms) until impact, for syncing sound and text. */
  play(req: EffectRequest): number {
    const travel = this.travelTime(req);
    if (this.level === 'off' || !this.ctx) return travel;
    if (req.delayMs) this.later(req.delayMs, () => this.run(req));
    else this.run(req);
    return travel;
  }

  travelTime(req: EffectRequest): number {
    const to = req.to ?? { x: this.w * 0.62, y: this.h * 0.28 };
    const dist = Math.hypot(to.x - req.from.x, to.y - req.from.y);
    switch (req.shape) {
      case 'bolt':
        return Math.round(Math.max(220, Math.min(620, dist / 1.5)));
      case 'burst':
        return dist < 40 ? 0 : Math.round(Math.max(260, Math.min(650, dist / 1.4)));
      case 'rain':
        return 260;
      case 'ray':
      case 'cone':
        return 90;
      default:
        return 0;
    }
  }

  private run(req: EffectRequest) {
    const from = req.from;
    const to = req.to ?? this.defaultTarget(from);
    const p = Math.max(0, Math.min(9, req.power));
    const outcome = req.outcome ?? 'none';
    const el = req.element;
    const S = STYLE[el];
    const travel = this.travelTime({ ...req, to });
    this.dim(0.18 + p * 0.04, 900 + p * 150 + travel);

    const land = (pt: Point, scale = 1) => {
      if (outcome === 'miss') this.fizzle(el, pt);
      else this.impact(el, pt, p, outcome, scale);
      if (req.label) this.text(req.label, pt, outcome === 'miss' ? '#b9b4c4' : outcome === 'crit' ? '#ffe27a' : S.text, outcome === 'crit' ? 34 : 26);
    };

    switch (req.shape) {
      case 'bolt': {
        const end = outcome === 'miss' ? this.missPoint(from, to) : to;
        this.add(new Projectile(from, end, travel / 1000, S.colors[2], 7 + p, (x, y, vx, vy) => this.trail(el, x, y, vx, vy, p), () => land(end)));
        break;
      }
      case 'ray': {
        const end = outcome === 'miss' ? this.missPoint(from, to) : to;
        if (el === 'lightning') this.add(new Bolt(from, end, 2.5 + p * 0.3, S.colors[3], 0.45, 1));
        else this.add(new Beam(from, end, 5 + p, S.colors[2], 0.5));
        this.add(
          new Emitter(0.4, 90 * this.q, () => {
            const t = Math.random();
            this.trail(el, lerp(from.x, end.x, t), lerp(from.y, end.y, t), 0, 0, p);
          }),
        );
        this.later(travel, () => land(end));
        break;
      }
      case 'burst': {
        const self = Math.hypot(to.x - from.x, to.y - from.y) < 40;
        if (self) land(from, 1.25);
        else
          this.add(new Projectile(from, to, travel / 1000, S.colors[1], 4, (x, y, vx, vy) => this.trail(el, x, y, vx, vy, 0), () => land(to, 1.35)));
        break;
      }
      case 'cone':
        this.cone(el, from, to, p);
        if (req.label) this.text(req.label, to, S.text, 26, 0.35);
        break;
      case 'line':
        this.line(el, from, to, p);
        if (req.label) this.text(req.label, to, S.text, 28, 0.1);
        break;
      case 'rain':
        this.rain(el, to, p);
        this.later(travel, () => land(to));
        break;
      case 'aura':
        this.aura(el, from, p);
        if (req.label) this.text(req.label, { x: from.x, y: from.y - 40 }, S.text, 24, 0.2);
        break;
      case 'touch':
        land(from, 0.75);
        break;
    }
  }

  private missPoint(from: Point, to: Point): Point {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const side = Math.random() < 0.5 ? -1 : 1;
    return { x: to.x + (-dy / len) * 90 * side + (dx / len) * 60, y: to.y + (dx / len) * 90 * side + (dy / len) * 60 };
  }

  text(label: string, at: Point, color: string, size = 26, delaySec = 0) {
    if (this.level === 'off' || !this.ctx) return;
    this.add(new FloatText(label, at.x, at.y - 30, color, size, 1.7, delaySec));
  }

  private trail(el: Element, x: number, y: number, vx: number, vy: number, p: number) {
    const S = STYLE[el];
    const back = { vx: -vx * 0.08 + rand(-30, 30), vy: -vy * 0.08 + rand(-30, 30) };
    switch (el) {
      case 'fire':
        this.particle({ x, y, ...back, vy: back.vy - 40, life: rand(0.25, 0.5), size: rand(8, 14) + p, color: pick(S.colors), gravity: -180, drag: 2 });
        if (Math.random() < 0.3) this.particle({ x, y, vx: rand(-60, 60), vy: rand(-80, 20), life: rand(0.5, 1), size: 2, sprite: 'spark', color: '#ffd27a', gravity: 60 });
        break;
      case 'cold':
        this.particle({ x, y, ...back, life: rand(0.4, 0.8), size: rand(3, 6), color: pick(S.colors), twinkle: true, drag: 2 });
        if (Math.random() < 0.35) this.particle({ x, y, vx: rand(-50, 50), vy: rand(-50, 50), life: rand(0.4, 0.7), size: rand(4, 7), sprite: 'shard', color: '#d8f4ff', vrot: rand(-6, 6), gravity: 120 });
        break;
      case 'lightning':
        this.particle({ x, y, vx: rand(-260, 260), vy: rand(-260, 260), life: rand(0.12, 0.3), size: 3, sprite: 'spark', color: pick(S.colors), drag: 4 });
        this.particle({ x, y, life: 0.18, size: rand(6, 10), color: S.colors[2] });
        break;
      case 'poison':
        this.particle({ x, y, ...back, life: rand(0.6, 1.1), size: rand(8, 12), sizeEnd: 22, sprite: 'soft', color: pick(S.colors), drag: 1.5, alpha: 0.6 });
        break;
      case 'necrotic':
      case 'shadow':
        this.particle({ x, y, ...back, life: rand(0.5, 0.9), size: rand(8, 13), sizeEnd: 18, sprite: 'soft', color: S.smoke ?? S.colors[3], drag: 1.5, alpha: 0.7 });
        this.particle({ x, y, ...back, life: rand(0.3, 0.6), size: rand(4, 7), color: S.colors[1] });
        break;
      case 'acid':
        this.particle({ x, y, vx: back.vx, vy: back.vy, life: rand(0.4, 0.7), size: rand(2, 4), sprite: 'drop', color: pick(S.colors), gravity: 500 });
        this.particle({ x, y, ...back, life: rand(0.2, 0.4), size: rand(5, 8), color: S.colors[1] });
        break;
      default:
        this.particle({ x, y, ...back, life: rand(0.3, 0.6), size: rand(4, 8), color: pick(S.colors), drag: 2, twinkle: el === 'radiant' || el === 'arcane' || el === 'healing' });
    }
  }

  private fizzle(el: Element, at: Point) {
    const S = STYLE[el];
    this.spray(at, 14, { speed: [30, 110], life: [0.4, 0.8], size: [3, 7], colors: S.colors, drag: 2 });
    this.spray(at, 6, { speed: [10, 40], life: [0.8, 1.2], size: [10, 18], sizeEnd: 30, colors: ['#8a8496'], sprite: 'soft', alpha: 0.35, gravity: -30 });
  }

  /** The element's signature explosion at a point. */
  private impact(el: Element, at: Point, p: number, outcome: Outcome, scale = 1) {
    const S = STYLE[el];
    const k = scale * (1 + p * 0.22) * (outcome === 'crit' ? 1.4 : 1);
    if (outcome === 'crit') {
      this.add(new Ring(at.x, at.y, 10, 120 * k, 6, '#ffe27a', 0.7));
      this.spray(at, 26, { speed: [200, 520], life: [0.5, 1], size: [2, 4], sprite: 'spark', colors: ['#ffe27a', '#fff6d8'], drag: 2.5 });
    }
    // A bright core flare almost every element shares.
    if (el !== 'poison' && el !== 'shadow') this.particle({ x: at.x, y: at.y, life: 0.3, size: 46 * k, sizeEnd: 10, color: S.colors[1] });

    switch (el) {
      case 'fire':
        this.spray(at, 46 * k, { speed: [60, 260 * k], life: [0.5, 1.1], size: [12, 26 * k], colors: S.colors, gravity: -260, drag: 2.2, jitter: 8 });
        this.spray(at, 26, { speed: [120, 420 * k], life: [0.9, 1.8], size: [1.5, 3], sprite: 'spark', colors: ['#ffd27a', '#ffb347'], gravity: -30, drag: 1.2 });
        this.spray(at, 12 * k, { speed: [20, 90], life: [1.2, 2.2], size: [16, 26], sizeEnd: 70 * k, sprite: 'soft', colors: [S.smoke!], gravity: -70, drag: 1, alpha: 0.4 });
        if (p >= 3) {
          this.add(new Ring(at.x, at.y, 20, 200 * k, 14, '#ffb347', 0.6));
          this.flash('#ffd9a0', 0.22);
          this.shake(4 + p);
        }
        this.vignette(S.vignette, 0.35 + p * 0.05);
        break;
      case 'cold':
        this.spray(at, 30 * k, { speed: [200, 520 * k], life: [0.6, 1.2], size: [6, 14 * Math.min(1.6, k)], sprite: 'shard', colors: S.colors, drag: 2.6, gravity: 160 });
        this.spray(at, 22, { speed: [40, 200 * k], life: [0.8, 1.6], size: [2, 5], colors: S.colors, twinkle: true, drag: 1.6 });
        this.spray(at, 10 * k, { speed: [20, 80], life: [1.2, 1.9], size: [18, 28], sizeEnd: 70 * k, sprite: 'soft', colors: [S.smoke!], drag: 1.4, alpha: 0.35 });
        this.add(new Ring(at.x, at.y, 10, 110 * k, 5, '#bfeaff', 0.7, 0, 6));
        this.vignette(S.vignette, 0.4 + p * 0.05, 1300);
        break;
      case 'lightning':
        for (let i = 0; i < 3 + Math.min(5, p); i++) {
          const a = rand(0, Math.PI * 2);
          const r = rand(50, 140) * k;
          this.add(new Bolt(at, { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, 1.6, S.colors[3], rand(0.2, 0.35), 0, rand(0, 0.12)));
        }
        this.spray(at, 30 * k, { speed: [300, 700], life: [0.25, 0.6], size: [2, 3.5], sprite: 'spark', colors: S.colors, drag: 3, gravity: 400 });
        if (p >= 1) this.flash('#dfe7ff', 0.18 + p * 0.02);
        this.vignette(S.vignette, 0.3);
        break;
      case 'thunder':
        for (let i = 0; i < 3; i++) this.add(new Ring(at.x, at.y, 12, (140 + i * 40) * k, 12 - i * 3, S.colors[1], 0.7, i * 0.09));
        this.spray(at, 24 * k, { speed: [140, 360 * k], life: [0.8, 1.4], size: [10, 18], sizeEnd: 44, sprite: 'soft', colors: [S.smoke!], drag: 3, alpha: 0.45 });
        this.shake(6 + p * 1.5, 520);
        break;
      case 'acid':
        this.spray(at, 34 * k, { angle: -Math.PI / 2, spread: 1.3, speed: [180, 520], life: [0.7, 1.2], size: [3, 7], sprite: 'drop', colors: S.colors, gravity: 900, drag: 0.6 });
        this.spray(at, 16, { speed: [10, 60], life: [1, 1.7], size: [4, 8], colors: S.colors, gravity: -80, twinkle: true });
        this.add(new Ring(at.x, at.y, 6, 70 * k, 6, S.colors[2], 0.5));
        this.vignette(S.vignette, 0.25);
        break;
      case 'poison':
        this.spray(at, 22 * k, { speed: [20, 130 * k], life: [1.6, 2.6], size: [18, 30], sizeEnd: 85 * k, sprite: 'soft', colors: S.colors, drag: 1.2, gravity: -15, alpha: 0.5, jitter: 10 });
        this.spray(at, 14, { speed: [20, 70], life: [1.2, 2], size: [3, 6], colors: S.colors, twinkle: true, gravity: -25 });
        this.vignette(S.vignette, 0.3, 1600);
        break;
      case 'necrotic': {
        const R = 130 * k;
        for (let i = 0; i < this.n(34 * k); i++) {
          const a = rand(0, Math.PI * 2);
          const r = rand(R * 0.5, R);
          this.particle({ x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r, life: rand(0.8, 1.3), size: rand(4, 9), color: pick(S.colors), orbit: { cx: at.x, cy: at.y, w: rand(3, 5), pull: r / 1.1 }, delay: rand(0, 0.2) });
        }
        this.spray(at, 16 * k, { speed: [20, 90], life: [1.2, 2], size: [18, 28], sizeEnd: 70 * k, sprite: 'soft', colors: [S.smoke!, '#2a1438'], alpha: 0.6, drag: 1 });
        this.vignette(S.vignette, 0.5, 1400);
        break;
      }
      case 'radiant':
        this.add(new Rays(at.x, at.y, 200 * k, '#ffe9a0', 1, 14));
        this.spray(at, 32 * k, { speed: [40, 200 * k], life: [0.9, 1.7], size: [3, 7], colors: S.colors, gravity: -90, drag: 1.6, twinkle: true });
        this.particle({ x: at.x, y: at.y, life: 0.7, size: 90 * k, sizeEnd: 20, color: '#fff6d8', alpha: 0.7 });
        if (p >= 3) this.flash('#fff6d8', 0.2);
        this.vignette(S.vignette, 0.3 + p * 0.04);
        break;
      case 'force':
      case 'arcane':
        this.add(new Ring(at.x, at.y, 8, 120 * k, 8, S.colors[2], 0.55, 0, el === 'force' ? 6 : 0));
        this.add(new Ring(at.x, at.y, 8, 80 * k, 4, S.colors[1], 0.5, 0.08));
        this.spray(at, 22 * k, { speed: [220, 480], life: [0.4, 0.8], size: [5, 10], sprite: el === 'force' ? 'shard' : 'glow', colors: S.colors, drag: 3 });
        this.spray(at, 16, { speed: [40, 160], life: [0.6, 1.2], size: [2, 5], colors: S.colors, twinkle: true, drag: 2 });
        if (el === 'force' && p >= 2) this.shake(3 + p);
        break;
      case 'psychic':
        for (let i = 0; i < 4; i++) this.add(new Ring(at.x, at.y, 6, 150 * k, 3, i % 2 ? S.colors[2] : S.colors[1], 0.9, i * 0.12));
        for (let i = 0; i < this.n(24); i++) {
          const a = rand(0, Math.PI * 2);
          const r = rand(20, 90) * k;
          this.particle({ x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r, life: rand(0.8, 1.4), size: rand(3, 7), color: pick(S.colors), orbit: { cx: at.x, cy: at.y, w: rand(-4, 4), pull: -20 }, twinkle: true });
        }
        this.vignette(S.vignette, 0.3);
        break;
      case 'slashing': {
        const start = rand(-2.6, -1.8);
        this.add(new Slash(at.x, at.y + 20, 70 * k, start, 2.3, S.colors[2], 0.4));
        if (outcome === 'crit') this.add(new Slash(at.x, at.y - 10, 80 * k, start + Math.PI * 0.6, -2.1, '#ffe27a', 0.4, 0.12));
        this.spray(at, 16, { speed: [200, 500], life: [0.3, 0.6], size: [2, 3], sprite: 'spark', colors: ['#ffd08a', '#ffffff'], drag: 3, gravity: 300 });
        break;
      }
      case 'piercing':
        this.spray(at, 14, { angle: rand(0, Math.PI * 2), spread: 0.6, speed: [250, 520], life: [0.25, 0.5], size: [2, 3], sprite: 'spark', colors: S.colors, drag: 3 });
        this.add(new Ring(at.x, at.y, 4, 46 * k, 4, '#ffffff', 0.3));
        break;
      case 'bludgeoning':
        this.add(new Ring(at.x, at.y, 10, 110 * k, 12, S.colors[1], 0.45));
        this.spray(at, 16, { speed: [150, 380], life: [0.6, 1], size: [4, 8], sprite: 'shard', colors: S.colors, gravity: 700, drag: 1 });
        this.spray(at, 12, { speed: [60, 200], life: [0.8, 1.3], size: [12, 20], sizeEnd: 40, sprite: 'soft', colors: [S.smoke!], drag: 2.4, alpha: 0.4 });
        this.shake(5 + p);
        break;
      case 'healing':
        this.spray(at, 36 * k, { speed: [30, 140], life: [1, 1.8], size: [3, 7], colors: S.colors, gravity: -130, drag: 1.2, twinkle: true, jitter: 24 });
        this.spray(at, 10, { speed: [20, 70], life: [1, 1.6], size: [5, 8], sprite: 'plus', colors: ['#9ff5b8', '#ffe9a0'], gravity: -110, drag: 1, jitter: 30 });
        this.add(new Ring(at.x, at.y, 10, 90 * k, 5, '#9ff5b8', 0.9));
        this.vignette(S.vignette, 0.3, 1200);
        break;
      case 'shadow':
        this.spray(at, 20 * k, { speed: [30, 140], life: [1, 1.8], size: [16, 26], sizeEnd: 70, sprite: 'soft', colors: [S.smoke!, '#2a2238'], alpha: 0.65, drag: 1.4 });
        this.spray(at, 12, { speed: [30, 120], life: [0.6, 1.2], size: [3, 6], colors: S.colors, drag: 2 });
        break;
      case 'nature':
        this.spray(at, 26 * k, { speed: [120, 360], life: [1, 1.8], size: [5, 9], sprite: 'leaf', colors: S.colors, gravity: 140, drag: 1.6 });
        this.spray(at, 16, { speed: [20, 90], life: [0.9, 1.5], size: [3, 6], colors: S.colors, gravity: -60, twinkle: true });
        break;
    }
  }

  private cone(el: Element, from: Point, to: Point, p: number) {
    const S = STYLE[el];
    const dir = Math.atan2(to.y - from.y, to.x - from.x);
    const k = 1 + p * 0.2;
    const smoky = el === 'poison' || el === 'necrotic' || el === 'shadow';
    this.add(
      new Emitter(0.5, 160 * this.q * k, () => {
        const a = dir + rand(-0.42, 0.42);
        const sp = rand(380, 820) * k;
        this.particle({
          x: from.x,
          y: from.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rand(0.45, 0.8),
          size: smoky ? rand(10, 16) : rand(6, 12),
          sizeEnd: smoky ? 60 : 30 * k,
          sprite: smoky ? 'soft' : el === 'cold' && Math.random() < 0.4 ? 'shard' : 'glow',
          color: smoky ? pick([S.smoke ?? S.colors[3], ...S.colors]) : pick(S.colors),
          drag: 1.8,
          gravity: el === 'fire' ? -120 : 0,
          alpha: smoky ? 0.55 : 1,
          vrot: rand(-6, 6),
        });
      }),
    );
    this.vignette(S.vignette, 0.35 + p * 0.04);
    if (el === 'thunder') this.shake(5 + p);
  }

  private line(el: Element, from: Point, to: Point, p: number) {
    const S = STYLE[el];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.hypot(this.w, this.h);
    const end = { x: from.x + (dx / len) * reach, y: from.y + (dy / len) * reach };
    if (el === 'lightning') {
      this.add(new Bolt(from, end, 3 + p * 0.4, S.colors[3], 0.6, 3 + Math.min(4, p)));
      this.add(new Bolt(from, end, 2, S.colors[4], 0.45, 1, 0.38));
      this.flash('#e3eaff', 0.3, 2);
    } else {
      this.add(new Beam(from, end, 10 + p * 2, S.colors[2], 0.7));
      this.flash(S.colors[1], 0.15);
    }
    this.add(
      new Emitter(0.5, 220 * this.q, () => {
        const t = Math.random();
        this.trail(el, lerp(from.x, end.x, t), lerp(from.y, end.y, t), dx * 2, dy * 2, p);
      }),
    );
    this.vignette(S.vignette, 0.45);
    if (p >= 3) this.shake(3 + p * 0.8);
  }

  private rain(el: Element, at: Point, p: number) {
    const S = STYLE[el];
    const k = 1 + p * 0.2;
    if (el === 'lightning') {
      this.add(new Bolt({ x: at.x + rand(-40, 40), y: -20 }, at, 3 + p * 0.3, S.colors[3], 0.5, 3, 0.2));
      this.flash('#e3eaff', 0.22);
      return;
    }
    if (el === 'cold' || el === 'bludgeoning' || el === 'acid') {
      const spread = 90 * k;
      this.add(
        new Emitter(0.7, 120 * this.q * k, () => {
          const x = at.x + rand(-spread, spread);
          this.particle({ x, y: -20, vx: rand(-40, 40), vy: rand(900, 1300), life: (at.y + 20) / 1100, size: rand(5, 10), sprite: el === 'acid' ? 'drop' : 'shard', color: pick(S.colors), rot: Math.PI / 2 + rand(-0.2, 0.2), vrot: 0, additive: el !== 'acid' });
        }),
      );
      return;
    }
    this.add(new Column(at.x, at.y, 34 + p * 6, S.colors[2], 0.9));
    this.add(
      new Emitter(0.6, 90 * this.q, () => {
        this.particle({ x: at.x + rand(-20, 20) * k, y: rand(0, at.y), vy: rand(300, 600), life: rand(0.3, 0.6), size: rand(3, 6), color: pick(S.colors), twinkle: true });
      }),
    );
  }

  private aura(el: Element, at: Point, p: number) {
    const S = STYLE[el];
    const k = 1 + p * 0.15;
    const R = 70 * k;
    if (el === 'force') {
      this.add(new Ring(at.x, at.y, R * 0.7, R * 1.05, 5, S.colors[1], 1.1, 0, 6));
      this.add(new Ring(at.x, at.y, R * 0.6, R * 0.9, 3, S.colors[2], 1.1, 0.12, 6));
    } else {
      this.add(new Ring(at.x, at.y, 10, R * 1.4, 6, S.colors[2], 1));
    }
    if (el === 'radiant') this.add(new Rays(at.x, at.y, R * 1.8, '#ffe9a0', 1.1, 12));
    for (let i = 0; i < this.n(40 * k); i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(R * 0.6, R * 1.2);
      this.particle({
        x: at.x + Math.cos(a) * r,
        y: at.y + Math.sin(a) * r,
        life: rand(0.9, 1.6),
        size: rand(3, 7),
        color: pick(S.colors),
        orbit: { cx: at.x, cy: at.y, w: rand(2.5, 4) * (Math.random() < 0.5 ? -1 : 1), pull: el === 'necrotic' ? 40 : -15 },
        twinkle: true,
        delay: rand(0, 0.3),
      });
    }
    if (el === 'healing') this.impact('healing', at, p, 'none', 0.7);
    this.vignette(S.vignette, 0.3);
  }

  /** Animations for the standard combat actions and movement. */
  action(m: ActionMotion, from: Point, label?: string) {
    if (this.level === 'off' || !this.ctx) return;
    const dust = '#a08c6e';
    const dirX = from.x > this.w * 0.6 ? -1 : 1;
    switch (m) {
      case 'move':
      case 'disengage': {
        const steps = m === 'move' ? 6 : 4;
        const stride = m === 'move' ? 46 : -40;
        for (let i = 0; i < steps; i++) {
          const x = from.x + dirX * stride * (i + 1);
          const y = from.y + (i % 2 ? 10 : -10);
          this.particle({ x, y, life: 1.6, size: 9, sprite: 'foot', color: 'rgba(120,100,80,0.75)', rot: dirX > 0 ? Math.PI / 2 : -Math.PI / 2, delay: i * 0.16, alpha: 0.9 });
          this.particle({ x, y: y + 6, vx: rand(-30, 30), vy: rand(-40, -10), life: 0.8, size: 10, sizeEnd: 26, sprite: 'soft', color: dust, delay: i * 0.16, alpha: 0.5 });
        }
        if (m === 'disengage') for (let i = 0; i < 3; i++) this.particle({ x: from.x - dirX * i * 18, y: from.y, life: 0.6, size: 26, sizeEnd: 30, sprite: 'soft', color: '#9fb4d8', alpha: 0.5 - i * 0.12, delay: i * 0.05 });
        break;
      }
      case 'dash':
        for (let i = 0; i < this.n(26); i++) {
          const y = rand(this.h * 0.1, this.h * 0.9);
          const sp = rand(1800, 2800) * dirX;
          this.particle({ x: dirX > 0 ? rand(-200, 0) : this.w + rand(0, 200), y, vx: sp, vy: 0, life: rand(0.5, 0.8), size: rand(6, 14), sprite: 'spark', color: '#d9dee8', delay: rand(0, 0.35), alpha: 0.55 });
        }
        this.spray(from, 10, { speed: [40, 140], life: [0.6, 1], size: [10, 16], sizeEnd: 36, sprite: 'soft', colors: [dust], alpha: 0.45, drag: 2 });
        break;
      case 'dodge':
        for (let i = 1; i <= 3; i++) this.particle({ x: from.x + i * 22 * (i % 2 ? 1 : -1), y: from.y, life: 0.7, size: 30, sizeEnd: 34, sprite: 'soft', color: '#9fc8ff', alpha: 0.5 - i * 0.1, delay: i * 0.05 });
        this.add(new Ring(from.x, from.y, 20, 70, 4, '#bfe0ff', 0.6, 0, 6));
        break;
      case 'hide':
        this.spray(from, 22, { speed: [30, 120], life: [1.2, 2], size: [18, 28], sizeEnd: 70, sprite: 'soft', colors: ['#8d8a96', '#6b6875', '#a7a3b0'], alpha: 0.55, drag: 1.5, gravity: -20 });
        break;
      case 'help': {
        const to = this.defaultTarget(from);
        this.add(new Projectile(from, to, 0.6, '#ffe27a', 5, (x, y, vx, vy) => this.trail('radiant', x, y, vx, vy, 0), () => this.spray(to, 18, { speed: [30, 120], life: [0.6, 1.2], size: [3, 6], colors: STYLE.radiant.colors, twinkle: true, gravity: -60 })));
        break;
      }
      case 'search':
        for (let i = 0; i < 3; i++) this.add(new Ring(from.x, from.y, 10, 220, 2, '#c9d4e8', 1.1, i * 0.25));
        break;
      default:
        this.spray(from, 18, { speed: [40, 160], life: [0.6, 1.1], size: [3, 6], colors: STYLE.arcane.colors, twinkle: true, drag: 2 });
    }
    if (label) this.text(label, { x: from.x, y: from.y - 30 }, '#e9e4d6', 22, 0.15);
  }

  /** Red pulse and a jolt when you take damage. */
  hurt(at: Point, amount: number) {
    this.vignette('#d02a2a', Math.min(0.85, 0.35 + amount / 40), 900);
    this.shake(Math.min(10, 3 + amount / 6), 380);
    if (this.level !== 'off' && this.ctx) this.text(`−${amount}`, at, '#ff6a6a', 30);
  }

  healed(at: Point, amount: number) {
    if (this.level === 'off' || !this.ctx) return;
    this.impact('healing', at, 1, 'none', 0.8);
    this.text(`+${amount}`, at, '#8ff5b0', 30);
  }

  /** Small celebratory sparkle for natural 20s (and a wilt for natural 1s) next to the roll. */
  natural(at: Point, kind: 'nat20' | 'nat1') {
    if (this.level === 'off' || !this.ctx) return;
    if (kind === 'nat20') {
      this.add(new Rays(at.x, at.y, 90, '#ffe27a', 0.9, 10));
      this.spray(at, 30, { speed: [80, 300], life: [0.6, 1.3], size: [2, 5], colors: ['#ffe27a', '#fff6d8', '#ffffff'], twinkle: true, drag: 2 });
    } else {
      this.spray(at, 10, { speed: [10, 50], life: [0.8, 1.3], size: [10, 16], sizeEnd: 26, sprite: 'soft', colors: ['#6b6875'], alpha: 0.5, gravity: 40 });
    }
  }
}

export const fx = new FxEngine();
