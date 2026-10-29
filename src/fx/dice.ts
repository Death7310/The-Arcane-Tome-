// Rolling dice. Each roll throws dice onto a "table" (the Dice page's felt, or a band
// across the middle of the screen), where they tumble, bounce off the edges and each
// other, and settle on the value the dice engine already rolled. The result is decided
// before the animation starts; the animation only shows it.
//
// Dice are drawn top-down with a lift-and-shadow hop and a squash as they roll over an
// edge, which reads as 3D without a 3D engine. A natural 20 on a d20 test ends in a
// themed critical; a natural 1 cracks the die.

import { fx, type Drawable } from './engine';
import { sound } from './sound';
import type { Element, Point } from './types';

export interface DieSpec {
  /** Number of faces; custom-labelled dice use faces.length. */
  sides: number;
  /** What the die lands on. */
  value: number | string;
  /** false for the die dropped by advantage/disadvantage; drawn dimmed. */
  kept?: boolean;
  /** Body colour; defaults to the sheet's ink-and-gilt die. */
  element?: Element;
  /** Labels for a custom die; tumbling cycles through them. */
  faces?: string[];
  /** A d20 test (attack, check, save): a kept 20 is a critical, a kept 1 a fumble. */
  test?: boolean;
}

export interface DiceRollOptions {
  from?: Point;
  speed?: 'full' | 'quick';
  /** Theme of the critical burst: the spell's element, or arcane gilt for checks. */
  critElement?: Element;
  critHeadline?: string;
  onSettled: () => void;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// [light, dark, ink] per element. Damage dice take their damage type's colours.
const BODY: Record<string, [string, string, string]> = {
  default: ['#fbf4e2', '#c2b08c', '#2a1f3d'],
  fire: ['#f47a30', '#8c1d06', '#fff1c2'],
  cold: ['#86c9ff', '#1f5ea8', '#f2fbff'],
  lightning: ['#94a8ff', '#2b3aa8', '#ffffff'],
  thunder: ['#ad9fe9', '#463b8a', '#f6f2ff'],
  acid: ['#bde44f', '#4a7a0d', '#15240a'],
  poison: ['#93c75e', '#2f5418', '#f0ffd8'],
  necrotic: ['#8f5ac6', '#2a1240', '#f2e6ff'],
  radiant: ['#ffe28f', '#c48a12', '#3a2400'],
  force: ['#a690ff', '#3d26b8', '#f6f2ff'],
  psychic: ['#ff94d3', '#8e2370', '#fff0fa'],
  slashing: ['#dde2ea', '#6b7482', '#1b1f26'],
  piercing: ['#dde2ea', '#6b7482', '#1b1f26'],
  bludgeoning: ['#cfae80', '#6a4c2a', '#1f1408'],
  healing: ['#74e3a5', '#137a42', '#05200f'],
  arcane: ['#99abff', '#2f3d9c', '#f4f6ff'],
  shadow: ['#51476a', '#14111c', '#d6cdee'],
  nature: ['#98d468', '#2e6a1a', '#0f2207'],
};

let surface: HTMLElement | null = null;

/** The Dice page registers its felt so rolls land there while it is on screen. */
export function setDiceSurface(el: HTMLElement | null) {
  surface = el;
}

/** Where the dice land, and whether a tray has to be drawn for them (off the Dice page there is no felt on screen). */
function tableBounds(): { box: Box; tray: boolean } {
  const { w, h } = fx.viewport;
  if (surface) {
    const r = surface.getBoundingClientRect();
    const visible = r.height > 60 && r.bottom > 80 && r.top < h - 80;
    if (visible) return { box: { left: r.left + 6, top: Math.max(r.top, 0) + 6, right: r.right - 6, bottom: Math.min(r.bottom, h) - 6 }, tray: false };
  }
  // A tray across the middle, clear of the header and of the result card at the bottom.
  const width = Math.min(w - 32, 760);
  const top = h * 0.24;
  return { box: { left: (w - width) / 2, top, right: (w + width) / 2, bottom: top + Math.min(h * 0.4, 330) }, tray: true };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

const regular = (n: number, r: number, offset = -Math.PI / 2): [number, number][] =>
  Array.from({ length: n }, (_, i) => [Math.cos(offset + (i / n) * Math.PI * 2) * r, Math.sin(offset + (i / n) * Math.PI * 2) * r]);

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

class RollingDie {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle = rand(0, Math.PI * 2);
  spin = rand(-14, 14);
  tumble = 0;
  z = 0;
  face: number | string;
  settled = false;
  settleAt = 0;
  settleFrom = 0;
  r: number;

  constructor(
    public spec: DieSpec,
    start: Point,
    velocity: Point,
    radius: number,
  ) {
    this.x = start.x;
    this.y = start.y;
    this.vx = velocity.x;
    this.vy = velocity.y;
    this.r = radius;
    this.face = this.randomFace();
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  randomFace(): number | string {
    const f = this.spec.faces;
    if (f?.length) return f[Math.floor(Math.random() * f.length)];
    return Math.floor(Math.random() * this.spec.sides) + 1;
  }

  get crit() {
    return this.settled && this.spec.test && this.spec.kept !== false && this.spec.value === 20 && this.spec.sides === 20;
  }

  get fumble() {
    return this.settled && this.spec.test && this.spec.kept !== false && this.spec.value === 1 && this.spec.sides === 20;
  }

  settle(age: number) {
    this.settled = true;
    this.settleAt = age;
    this.vx = this.vy = 0;
    this.z = 0;
    this.face = this.spec.value;
    // Turn to the nearest upright position so the number reads.
    const turns = Math.round(this.angle / (Math.PI * 2));
    this.settleFrom = this.angle - turns * Math.PI * 2;
    this.angle = this.settleFrom;
  }

  draw(ctx: CanvasRenderingContext2D, age: number, alpha: number) {
    const [light, dark, ink] = BODY[this.spec.element ?? 'default'] ?? BODY.default;
    const r = this.r;
    const since = this.settled ? age - this.settleAt : 0;
    const pop = this.settled ? 1 + Math.max(0, 0.16 * (1 - since / 0.22)) : 1;
    const lift = this.z;
    const dropped = this.settled && this.spec.kept === false;
    const a = alpha * (dropped ? 0.38 : 1);

    // Shadow on the table, further away the higher the die hops.
    ctx.globalAlpha = a * 0.4 * (1 - Math.min(0.6, lift / (r * 1.4)));
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(this.x + 3 + lift * 0.35, this.y + 6 + lift * 0.55, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y - lift);
    if (this.crit) {
      const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.3);
      glow.addColorStop(0, `rgba(255,217,112,${0.55 + 0.25 * Math.sin(age * 8)})`);
      glow.addColorStop(1, 'rgba(255,217,112,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = glow;
      ctx.fillRect(-r * 2.4, -r * 2.4, r * 4.8, r * 4.8);
    }
    ctx.rotate(this.angle);
    // Rolling over an edge flattens the die along its travel for a moment.
    const squash = this.settled ? 0 : Math.abs(Math.sin(this.tumble / (r * 1.5))) * Math.min(1, this.speed / 500) * 0.2;
    ctx.scale(pop * (1 - squash * 0.4), pop * (1 - squash));
    ctx.globalAlpha = a;

    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, light);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';

    const n = this.spec.faces?.length ? Math.max(2, this.spec.faces.length) : this.spec.sides;
    let textY = 0;
    let textScale = 0.72;
    let outline: () => void;
    let facets: [number, number][] = [];
    let innerFace: [number, number][] | null = null;
    if (n === 4) {
      const t = regular(3, r * 1.15);
      outline = () => poly(ctx, t);
      facets = [t[0], [0, r * 0.2], t[1], [0, r * 0.2], t[2], [0, r * 0.2]];
      textY = r * 0.18;
      textScale = 0.6;
    } else if (n === 6) {
      outline = () => {
        ctx.beginPath();
        ctx.roundRect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64, r * 0.24);
      };
    } else if (n === 8) {
      const d = regular(4, r);
      outline = () => poly(ctx, d);
      facets = [d[1], d[3]];
      textY = -r * 0.05;
      textScale = 0.55;
    } else if (n === 10 || n === 100) {
      const k: [number, number][] = [[0, -r], [r * 0.9, -r * 0.05], [0, r * 0.98], [-r * 0.9, -r * 0.05]];
      outline = () => poly(ctx, k);
      facets = [k[1], [0, r * 0.42], k[3], [0, r * 0.42], [0, r * 0.42], k[2]];
      textY = -r * 0.12;
      textScale = n === 100 ? 0.45 : 0.55;
    } else if (n === 12) {
      const p = regular(5, r * 1.02);
      const inner = regular(5, r * 0.55);
      outline = () => poly(ctx, p);
      facets = p.flatMap((q, i) => [q, inner[i]]);
      textScale = 0.55;
    } else if (n === 20) {
      const h = regular(6, r * 1.05);
      const t: [number, number][] = [[0, -r * 0.55], [r * 0.5, r * 0.32], [-r * 0.5, r * 0.32]];
      outline = () => poly(ctx, h);
      innerFace = t;
      facets = [t[0], t[1], t[1], t[2], t[2], t[0], t[0], h[0], t[0], h[1], t[0], h[5], t[1], h[1], t[1], h[2], t[1], h[3], t[2], h[3], t[2], h[4], t[2], h[5]];
      textY = r * 0.06;
      textScale = 0.5;
    } else if (n <= 2) {
      outline = () => {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
      };
    } else {
      const p = regular(Math.min(n, 8), r * 1.02);
      outline = () => poly(ctx, p);
      textScale = 0.55;
    }
    outline();
    ctx.fill();
    ctx.stroke();
    if (innerFace) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      poly(ctx, innerFace);
      ctx.fill();
    }
    if (facets.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i + 1 < facets.length; i += 2) {
        ctx.moveTo(facets[i][0], facets[i][1]);
        ctx.lineTo(facets[i + 1][0], facets[i + 1][1]);
      }
      ctx.stroke();
    }

    if (this.fumble) {
      // Greyed out, with hairline cracks across the face.
      ctx.save();
      outline();
      ctx.clip();
      ctx.fillStyle = 'rgba(60,58,70,0.5)';
      ctx.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
      ctx.strokeStyle = 'rgba(10,8,14,0.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.4);
      ctx.lineTo(-r * 0.2, -r * 0.05);
      ctx.lineTo(-r * 0.35, r * 0.25);
      ctx.lineTo(r * 0.15, r * 0.45);
      ctx.moveTo(-r * 0.2, -r * 0.05);
      ctx.lineTo(r * 0.45, -r * 0.3);
      ctx.stroke();
      ctx.restore();
    }

    // The face: pips on a d6, otherwise the number or label. Settling turns it upright.
    ctx.fillStyle = ink;
    if (n === 6 && typeof this.face === 'number' && !this.spec.faces && PIPS[this.face]) {
      for (const [px, py] of PIPS[this.face]) {
        ctx.beginPath();
        ctx.arc(px * r * 0.42, py * r * 0.42, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      let label = String(this.face);
      if (label.length > 7) label = label.slice(0, 6) + '…';
      let size = r * textScale * (label.length >= 3 ? 0.8 : 1);
      ctx.font = `800 ${size}px "Alegreya SC", Georgia, serif`;
      const max = r * 1.5;
      const w = ctx.measureText(label).width;
      if (w > max) {
        size *= max / w;
        ctx.font = `800 ${size}px "Alegreya SC", Georgia, serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, textY);
    }
    ctx.restore();
  }
}

class DiceGroup implements Drawable {
  additive = false;
  private age = 0;
  private settledAt: number | null = null;
  private notified = false;
  private highlighted = false;
  private readonly minRoll: number;
  private readonly maxRoll: number;
  private readonly hold: number;
  private readonly fade = 0.4;
  private readonly friction: number;

  constructor(
    private dice: RollingDie[],
    private box: Box,
    private tray: boolean,
    private opts: DiceRollOptions,
  ) {
    const quick = opts.speed === 'quick' || fx.level === 'reduced';
    this.minRoll = quick ? 0.35 : 0.7;
    this.maxRoll = quick ? 0.8 : 1.7;
    this.hold = quick ? 1.1 : 1.6;
    this.friction = quick ? 3 : 1.7;
  }

  update(dt: number): boolean {
    this.age += dt;
    const { left, top, right, bottom } = this.box;
    for (const d of this.dice) {
      if (d.settled) continue;
      const k = this.friction + (d.speed < 160 ? 3 : 0);
      const damp = Math.exp(-k * dt);
      d.vx *= damp;
      d.vy *= damp;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.spin = d.spin * Math.exp(-1.5 * dt);
      d.angle += d.spin * dt + (d.speed / d.r) * 0.02 * Math.sign(d.spin || 1);
      const before = Math.floor(d.tumble / (d.r * 1.5));
      d.tumble += d.speed * dt;
      if (Math.floor(d.tumble / (d.r * 1.5)) !== before) d.face = d.randomFace();
      d.z = Math.abs(Math.sin(d.tumble / (d.r * 1.5) * Math.PI)) * Math.min(1, d.speed / 700) * d.r * 0.55;

      const e = 0.55;
      if (d.x - d.r < left) (d.x = left + d.r), (d.vx = Math.abs(d.vx) * e), this.knock(d.speed);
      if (d.x + d.r > right) (d.x = right - d.r), (d.vx = -Math.abs(d.vx) * e), this.knock(d.speed);
      if (d.y - d.r < top) (d.y = top + d.r), (d.vy = Math.abs(d.vy) * e), this.knock(d.speed);
      if (d.y + d.r > bottom) (d.y = bottom - d.r), (d.vy = -Math.abs(d.vy) * e), this.knock(d.speed);

      if ((d.speed < 28 && this.age > this.minRoll) || this.age > this.maxRoll) {
        d.settle(this.age);
        sound.diceHit(0.15);
      }
    }
    this.collide();

    // Settled dice ease upright.
    for (const d of this.dice) {
      if (!d.settled) continue;
      const t = Math.min(1, (this.age - d.settleAt) / 0.25);
      d.angle = d.settleFrom * (1 - t * (2 - t));
    }

    if (this.settledAt === null && this.dice.every((d) => d.settled)) {
      this.settledAt = this.age;
    }
    if (this.settledAt !== null && !this.notified) {
      const crit = this.dice.find((d) => d.crit);
      const fumble = this.dice.find((d) => d.fumble);
      if (!this.highlighted) {
        this.highlighted = true;
        if (crit) {
          fx.critical({ x: crit.x, y: crit.y }, this.opts.critElement ?? 'arcane', this.opts.critHeadline ?? 'NATURAL 20!');
          sound.critical();
        } else if (fumble) {
          fx.fumble({ x: fumble.x, y: fumble.y }, 'NATURAL 1');
          sound.natural('nat1');
        }
      }
      // Give a critical a beat on its own before the result and the spell arrive.
      if (this.age - this.settledAt >= (crit ? 0.55 : 0.12)) {
        this.notified = true;
        this.opts.onSettled();
      }
    }
    const crit = this.dice.some((d) => d.crit);
    const end = (this.settledAt ?? Infinity) + this.hold + (crit ? 0.8 : 0) + this.fade;
    return this.age < end;
  }

  private knock(speed: number) {
    if (speed > 60) sound.diceHit(speed / 1200);
  }

  private collide() {
    const ds = this.dice;
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const a = ds[i];
        const b = ds[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const min = (a.r + b.r) * 0.9;
        if (dist >= min) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const push = (min - dist) / 2;
        const am = a.settled ? 0 : 1;
        const bm = b.settled ? 0 : 1;
        if (am + bm === 0) continue;
        a.x -= nx * push * (am ? (bm ? 1 : 2) : 0);
        a.y -= ny * push * (am ? (bm ? 1 : 2) : 0);
        b.x += nx * push * (bm ? (am ? 1 : 2) : 0);
        b.y += ny * push * (bm ? (am ? 1 : 2) : 0);
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = -1.6 * rel * 0.5;
          if (am) (a.vx -= imp * nx), (a.vy -= imp * ny);
          if (bm) (b.vx += imp * nx), (b.vy += imp * ny);
          if (-rel > 80) sound.diceHit(-rel / 1400);
        }
      }
    }
  }

  /** A velvet tray, like the Dice page's, slid in under dice rolled from elsewhere. */
  private drawTray(ctx: CanvasRenderingContext2D, alpha: number) {
    const { left, top, right, bottom } = this.box;
    const pad = 10;
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    const g = ctx.createLinearGradient(left, top, right, bottom);
    g.addColorStop(0, '#3a2f55');
    g.addColorStop(1, '#1c1630');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.roundRect(left - pad, top - pad, right - left + pad * 2, bottom - top + pad * 2, 18);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = '#dcae55';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D) {
    const crit = this.dice.some((d) => d.crit);
    const fadeStart = (this.settledAt ?? Infinity) + this.hold + (crit ? 0.8 : 0);
    const alpha = this.age < fadeStart ? 1 : Math.max(0, 1 - (this.age - fadeStart) / this.fade);
    if (this.tray) this.drawTray(ctx, alpha * Math.min(1, this.age / 0.15));
    // Draw the higher (hopping) dice last so they pass over the others.
    for (const d of [...this.dice].sort((p, q) => p.z - q.z)) d.draw(ctx, this.age, alpha);
    ctx.globalAlpha = 1;
  }
}

/** Throws dice for an already-made roll and calls onSettled once they come to rest. */
export function rollDice(specs: DieSpec[], opts: DiceRollOptions) {
  const { w, h } = fx.viewport;
  if (!specs.length || fx.level === 'off' || w === 0 || h === 0) {
    queueMicrotask(opts.onSettled);
    return;
  }
  const { box, tray } = tableBounds();
  const bw = box.right - box.left;
  const bh = box.bottom - box.top;
  const base = clamp(Math.min(bw, bh) / 7, 20, 34);
  const r = specs.length > 6 ? base * 0.8 : base;
  const from = opts.from ?? { x: (box.left + box.right) / 2, y: box.bottom };
  // Throw from the nearest point of the table to where you tapped, into the table.
  const start = { x: clamp(from.x, box.left + r, box.right - r), y: clamp(from.y, box.top + r, box.bottom - r) };
  const quick = opts.speed === 'quick' || fx.level === 'reduced';
  const dice = specs.map((spec, i) => {
    const target = { x: rand(box.left + bw * 0.2, box.right - bw * 0.2), y: rand(box.top + bh * 0.2, box.bottom - bh * 0.2) };
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const sp = quick ? rand(500, 800) : rand(800, 1250);
    const jitter = { x: start.x + rand(-r, r) + (i % 3) * 4, y: start.y + rand(-r, r) };
    return new RollingDie(spec, jitter, { x: (dx / len) * sp + rand(-120, 120), y: (dy / len) * sp + rand(-120, 120) }, r);
  });
  sound.diceHit(0.6);
  fx.spawn(new DiceGroup(dice, box, tray, opts));
}
