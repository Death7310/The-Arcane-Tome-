// Rolling dice. Each roll throws dice onto a "table" (the Dice page's felt, or a tray
// across the middle of the screen), where they tumble, bounce off the edges and each
// other, and settle on the value the dice engine already rolled. The result is decided
// before the animation starts; the animation only shows it.
//
// Dice are drawn top-down with a lift-and-shadow hop and a squash as they roll over an
// edge, which reads as 3D without a 3D engine. A spell's dice are orbs of its element.
// A natural 20 on a d20 test ends in a themed critical; a natural 1 cracks the die.
//
// Attacks and spells can then count the roll up hit by hit (the "tally"): the attack die
// is struck, then each bonus, then the total and HIT or MISS; the damage dice are thrown
// and struck one blow per die. Tapping anywhere, or Escape, skips to the result.

import { elementColor, elementPalette, fx, type Drawable } from './engine';
import { Ledger, LedgerRow, ROW_HEIGHT, type TallyRow } from './ledger';
import { sound } from './sound';
import { Strike, type StrikeLook, type Struck } from './strikes';
import type { Element, Point } from './types';

export type { TallyRow, Verdict } from './ledger';
export type { StrikeLook } from './strikes';

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
  /** Drawn as a glowing orb of its element: a spell's dice. */
  orb?: boolean;
  /** −1 for a die that is subtracted (Bane's −1d4). */
  sign?: 1 | -1;
}

/** One throw: the dice, and how the tally counts them once they land. */
export interface DicePhase {
  dice: DieSpec[];
  rows: TallyRow[];
}

export interface DiceRollOptions {
  from?: Point;
  speed?: 'full' | 'quick';
  /** Theme of the critical burst: the spell's element, or arcane gilt for checks. */
  critElement?: Element;
  critHeadline?: string;
  /** What lands each hit of the tally. */
  look?: StrikeLook;
  /** The tally's main element (trails, strike tint). */
  element?: Element;
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

/** Most dice drawn for one throw; any more still count, in one lump. */
const MAX_DICE = 14;

let surface: HTMLElement | null = null;

/** The Dice page registers its felt so rolls land there while it is on screen. */
export function setDiceSurface(el: HTMLElement | null) {
  surface = el;
}

/**
 * Where the dice land, and whether a tray has to be drawn for them (off the Dice page
 * there is no felt on screen). `band` is room kept at the top for the tally.
 */
function tableBounds(band: number): { box: Box; tray: boolean } {
  const { w, h } = fx.viewport;
  if (surface) {
    const r = surface.getBoundingClientRect();
    const top = Math.max(r.top, 0) + 6;
    const bottom = Math.min(r.bottom, h) - 6;
    if (r.height > 60 && r.bottom > 80 && r.top < h - 80 && bottom - top > band + 140) return { box: { left: r.left + 6, top, right: r.right - 6, bottom }, tray: false };
  }
  // A tray across the middle, clear of the header and of the result card at the bottom.
  const width = Math.min(w - 32, 760);
  const top = Math.max(12, h * 0.24 - band / 2);
  const bottom = Math.min(h - 12, top + Math.min(h * 0.4, 330) + band);
  return { box: { left: (w - width) / 2, top, right: (w + width) / 2, bottom }, tray: true };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function polygon(pts: [number, number][]): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
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

interface Geometry {
  outline: Path2D;
  /** Pairs of points: the edges drawn across the face. */
  facets: [number, number][];
  inner: Path2D | null;
  textY: number;
  textScale: number;
}

/** The top-down silhouette of a die with n faces. */
function geometry(n: number, r: number): Geometry {
  if (n === 4) {
    const t = regular(3, r * 1.15);
    return { outline: polygon(t), facets: [t[0], [0, r * 0.2], t[1], [0, r * 0.2], t[2], [0, r * 0.2]], inner: null, textY: r * 0.18, textScale: 0.6 };
  }
  if (n === 6) {
    const outline = new Path2D();
    outline.roundRect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64, r * 0.24);
    return { outline, facets: [], inner: null, textY: 0, textScale: 0.72 };
  }
  if (n === 8) {
    const d = regular(4, r);
    return { outline: polygon(d), facets: [d[1], d[3]], inner: null, textY: -r * 0.05, textScale: 0.55 };
  }
  if (n === 10 || n === 100) {
    const k: [number, number][] = [[0, -r], [r * 0.9, -r * 0.05], [0, r * 0.98], [-r * 0.9, -r * 0.05]];
    return { outline: polygon(k), facets: [k[1], [0, r * 0.42], k[3], [0, r * 0.42], [0, r * 0.42], k[2]], inner: null, textY: -r * 0.12, textScale: n === 100 ? 0.45 : 0.55 };
  }
  if (n === 12) {
    const p = regular(5, r * 1.02);
    const inner = regular(5, r * 0.55);
    return { outline: polygon(p), facets: p.flatMap((q, i) => [q, inner[i]]), inner: null, textY: 0, textScale: 0.55 };
  }
  if (n === 20) {
    const h = regular(6, r * 1.05);
    const t: [number, number][] = [[0, -r * 0.55], [r * 0.5, r * 0.32], [-r * 0.5, r * 0.32]];
    return {
      outline: polygon(h),
      facets: [t[0], t[1], t[1], t[2], t[2], t[0], t[0], h[0], t[0], h[1], t[0], h[5], t[1], h[1], t[1], h[2], t[1], h[3], t[2], h[3], t[2], h[4], t[2], h[5]],
      inner: polygon(t),
      textY: r * 0.06,
      textScale: 0.5,
    };
  }
  if (n <= 2) {
    const outline = new Path2D();
    outline.arc(0, 0, r * 0.95, 0, Math.PI * 2);
    return { outline, facets: [], inner: null, textY: 0, textScale: 0.55 };
  }
  return { outline: polygon(regular(Math.min(n, 8), r * 1.02)), facets: [], inner: null, textY: 0, textScale: 0.55 };
}

class RollingDie implements Struck {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  angle = rand(0, Math.PI * 2);
  spin = rand(-14, 14);
  tumble = 0;
  z = 0;
  face: number | string;
  settled = false;
  settleAt = 0;
  settleFrom = 0;
  thrownAt = 0;
  r: number;
  /** Swelling before a spell's orb bursts. */
  charge = 0;
  /** When the tally struck it. */
  hitAt: number | null = null;
  /** An earlier throw's die, faded back while the next one is counted. */
  dim = false;
  private geo: Geometry | null = null;

  constructor(
    public spec: DieSpec,
    start: Point,
    radius: number,
  ) {
    this.x = start.x;
    this.y = start.y;
    this.r = radius;
    this.face = this.randomFace();
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** The number the tally adds for this die. */
  get signed(): number {
    return typeof this.spec.value === 'number' ? this.spec.value * (this.spec.sign ?? 1) : 0;
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

  private get sides() {
    return this.spec.faces?.length ? Math.max(2, this.spec.faces.length) : this.spec.sides;
  }

  draw(ctx: CanvasRenderingContext2D, age: number, alpha: number) {
    const r = this.r;
    const geo = (this.geo ??= geometry(this.sides, r));
    const since = this.settled ? age - this.settleAt : 0;
    const struck = this.hitAt === null ? Infinity : age - this.hitAt;
    let scale = this.settled ? 1 + Math.max(0, 0.16 * (1 - since / 0.22)) : 1;
    if (struck < 0.3) scale *= 1 + 0.3 * (1 - struck / 0.3) ** 2;
    scale *= 1 + 0.3 * this.charge;
    const lift = this.z;
    const dropped = this.settled && this.spec.kept === false;
    const spent = struck >= 0.3 && !!this.spec.orb;
    const a = alpha * (dropped ? 0.38 : 1) * (this.dim ? 0.55 : 1) * (spent ? 0.75 : 1);
    const jitter = this.charge > 0 ? { x: rand(-2, 2) * this.charge, y: rand(-2, 2) * this.charge } : { x: 0, y: 0 };

    // Shadow on the table, further away the higher the die hops.
    if (!this.spec.orb) {
      ctx.globalAlpha = a * 0.4 * (1 - Math.min(0.6, lift / (r * 1.4)));
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.x + 3 + lift * 0.35, this.y + 6 + lift * 0.55, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(this.x + jitter.x, this.y - lift + jitter.y);
    if (this.crit) {
      const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.3);
      glow.addColorStop(0, `rgba(255,217,112,${0.55 + 0.25 * Math.sin(age * 8)})`);
      glow.addColorStop(1, 'rgba(255,217,112,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = glow;
      ctx.fillRect(-r * 2.4, -r * 2.4, r * 4.8, r * 4.8);
    }
    if (this.spec.orb) {
      ctx.scale(scale * (spent ? 0.82 : 1), scale * (spent ? 0.82 : 1));
      this.drawOrb(ctx, age, a, spent);
      ctx.rotate(this.angle);
      if (!spent) {
        // The die's shape, ghosted inside the orb.
        ctx.globalAlpha = a * 0.28;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.save();
        ctx.scale(0.62, 0.62);
        ctx.stroke(geo.outline);
        ctx.restore();
      }
    } else {
      ctx.rotate(this.angle);
      // Rolling over an edge flattens the die along its travel for a moment.
      const squash = this.settled ? 0 : Math.abs(Math.sin(this.tumble / (r * 1.5))) * Math.min(1, this.speed / 500) * 0.2;
      ctx.scale(scale * (1 - squash * 0.4), scale * (1 - squash));
      this.drawBody(ctx, geo, a);
    }

    if (this.fumble) {
      // Greyed out, with hairline cracks across the face.
      ctx.save();
      ctx.clip(geo.outline);
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
    if (struck < 0.2 && !this.spec.orb) {
      // The flash of the blow landing.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.8 * (1 - struck / 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.fill(geo.outline);
      ctx.restore();
    }
    this.drawFace(ctx, geo, a);
    ctx.restore();
  }

  private drawBody(ctx: CanvasRenderingContext2D, geo: Geometry, a: number) {
    const r = this.r;
    const [light, dark] = BODY[this.spec.element ?? 'default'] ?? BODY.default;
    ctx.globalAlpha = a;
    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, light);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.fill(geo.outline);
    ctx.stroke(geo.outline);
    if (geo.inner) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill(geo.inner);
    }
    if (geo.facets.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i + 1 < geo.facets.length; i += 2) {
        ctx.moveTo(geo.facets[i][0], geo.facets[i][1]);
        ctx.lineTo(geo.facets[i + 1][0], geo.facets[i + 1][1]);
      }
      ctx.stroke();
    }
  }

  /** A spell's die: a glowing ball of its element, the die's outline ghosted inside. */
  private drawOrb(ctx: CanvasRenderingContext2D, age: number, a: number, spent: boolean) {
    const el = this.spec.element ?? 'arcane';
    const pal = elementPalette(el);
    const r = this.r;
    const heat = spent ? 0.35 : 1;
    const c = this.charge;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * heat;
    const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * (1.9 + c * 0.9));
    halo.addColorStop(0, rgba(pal[2], 0.5 + 0.4 * c));
    halo.addColorStop(1, rgba(pal[2], 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.9 + c * 0.9), 0, Math.PI * 2);
    ctx.fill();
    if (!spent) this.flourish(ctx, el, pal, age, a);
    ctx.restore();

    ctx.globalAlpha = a;
    const dark = el === 'necrotic' || el === 'shadow';
    const body = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * 0.95);
    if (dark) {
      body.addColorStop(0, pal[3]);
      body.addColorStop(0.7, '#0c0814');
      body.addColorStop(1, pal[1]);
    } else {
      body.addColorStop(0, pal[0]);
      body.addColorStop(0.35, pal[1]);
      body.addColorStop(0.8, pal[Math.min(3, pal.length - 1)]);
      body.addColorStop(1, (BODY[el] ?? BODY.arcane)[1]);
    }
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  /** Each element's flicker around the orb: flames, sparks, frost spikes, ripples… */
  private flourish(ctx: CanvasRenderingContext2D, el: Element, pal: string[], age: number, alpha: number) {
    const r = this.r;
    const c = this.charge;
    switch (el) {
      case 'fire': {
        ctx.fillStyle = rgba(pal[2], 0.8);
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 + age * 1.3;
          const len = r * (0.35 + 0.22 * Math.sin(age * 11 + i * 1.9) + 0.3 * c);
          const tip = { x: Math.cos(ang) * (r * 0.85 + len), y: Math.sin(ang) * (r * 0.85 + len) - len * 0.35 };
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang - 0.32) * r * 0.85, Math.sin(ang - 0.32) * r * 0.85);
          ctx.quadraticCurveTo(Math.cos(ang - 0.1) * r * 1.2, Math.sin(ang - 0.1) * r * 1.2, tip.x, tip.y);
          ctx.quadraticCurveTo(Math.cos(ang + 0.1) * r * 1.2, Math.sin(ang + 0.1) * r * 1.2, Math.cos(ang + 0.32) * r * 0.85, Math.sin(ang + 0.32) * r * 0.85);
          ctx.fill();
        }
        break;
      }
      case 'lightning': {
        ctx.strokeStyle = pal[1];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          let ang = rand(0, Math.PI * 2);
          ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
          for (let j = 0; j < 4; j++) {
            ang += rand(0.15, 0.3);
            const rr = r * rand(1.05, 1.35 + c * 0.3);
            ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
        }
        ctx.stroke();
        break;
      }
      case 'cold':
        ctx.fillStyle = rgba(pal[1], 0.7);
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + age * 0.4;
          const out = r * (1.35 + 0.25 * c);
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang) * out, Math.sin(ang) * out);
          ctx.lineTo(Math.cos(ang + 0.18) * r * 0.85, Math.sin(ang + 0.18) * r * 0.85);
          ctx.lineTo(Math.cos(ang - 0.18) * r * 0.85, Math.sin(ang - 0.18) * r * 0.85);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 'thunder':
        ctx.strokeStyle = pal[1];
        ctx.lineWidth = 2;
        for (let k = 0; k < 2; k++) {
          const f = (age * 1.4 + k * 0.5) % 1;
          ctx.globalAlpha = alpha * (1 - f) * 0.6;
          ctx.beginPath();
          ctx.arc(0, 0, r * (1 + f * 0.9), 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case 'acid':
      case 'poison':
        ctx.fillStyle = rgba(pal[1], 0.75);
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + age * 0.8;
          const bob = Math.sin(age * 5 + i * 2) * r * 0.08;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * (r * 1.02 + bob), Math.sin(ang) * (r * 1.02 + bob), r * (0.1 + 0.05 * Math.sin(age * 4 + i)), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'necrotic':
      case 'shadow':
        ctx.strokeStyle = rgba(pal[1], 0.7);
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 - age * 1.6;
          ctx.beginPath();
          ctx.arc(0, 0, r * (1.15 + 0.08 * Math.sin(age * 3 + i)), ang, ang + 1.1);
          ctx.stroke();
        }
        break;
      case 'radiant':
      case 'healing':
        ctx.strokeStyle = rgba(pal[1], 0.75);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 + age * 0.5;
          const out = r * (1.3 + 0.12 * Math.sin(age * 6 + i) + 0.3 * c);
          ctx.moveTo(Math.cos(ang) * r * 1.02, Math.sin(ang) * r * 1.02);
          ctx.lineTo(Math.cos(ang) * out, Math.sin(ang) * out);
        }
        ctx.stroke();
        break;
      default:
        ctx.strokeStyle = rgba(pal[1], 0.75);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 5]);
        ctx.lineDashOffset = -age * 24;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.18 + 0.15 * c), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
  }

  /** The face: pips on a d6, otherwise the number or label. Settling turns it upright. */
  private drawFace(ctx: CanvasRenderingContext2D, geo: Geometry, a: number) {
    const r = this.r;
    const n = this.sides;
    const ink = this.spec.orb ? '#ffffff' : (BODY[this.spec.element ?? 'default'] ?? BODY.default)[2];
    ctx.globalAlpha = a;
    ctx.fillStyle = ink;
    if (n === 6 && !this.spec.orb && typeof this.face === 'number' && !this.spec.faces && PIPS[this.face]) {
      for (const [px, py] of PIPS[this.face]) {
        ctx.beginPath();
        ctx.arc(px * r * 0.42, py * r * 0.42, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    let label = String(this.face);
    if (label.length > 7) label = label.slice(0, 6) + '…';
    let size = r * (this.spec.orb ? 0.72 : geo.textScale) * (label.length >= 3 ? 0.8 : 1);
    ctx.font = `800 ${size}px "Alegreya SC", Georgia, serif`;
    const max = r * 1.5;
    const w = ctx.measureText(label).width;
    if (w > max) {
      size *= max / w;
      ctx.font = `800 ${size}px "Alegreya SC", Georgia, serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = this.spec.orb ? 0 : geo.textY;
    if (this.spec.orb) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,6,16,0.7)';
      ctx.strokeText(label, 0, y);
    }
    ctx.fillText(label, 0, y);
  }
}

/** A bonus on its way into the tally: a medallion that is struck (or, for a spell, bursts). */
class Token implements Struck {
  charge = 0;
  hitAt: number | null = null;
  constructor(
    public x: number,
    public y: number,
    private label: string,
    private value: number,
    private born: number,
    private r: number,
    private rim: string,
  ) {}

  alive(age: number) {
    return this.hitAt === null || age - this.hitAt < 0.25;
  }

  draw(ctx: CanvasRenderingContext2D, age: number, alpha: number) {
    const k = Math.min(1, (age - this.born) / 0.15);
    const gone = this.hitAt === null ? 0 : Math.min(1, (age - this.hitAt) / 0.25);
    const s = (0.6 + 0.4 * k) * (1 + 0.3 * this.charge + 0.4 * gone);
    const r = this.r * s;
    ctx.save();
    ctx.globalAlpha = alpha * k * (1 - gone);
    ctx.translate(this.x, this.y);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    g.addColorStop(0, '#3b3150');
    g.addColorStop(1, '#16121f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = this.rim;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe7a8';
    ctx.font = `800 ${r * 0.62}px "Alegreya SC", Georgia, serif`;
    ctx.fillText(this.value < 0 ? `−${-this.value}` : `+${this.value}`, 0, -r * 0.12);
    ctx.fillStyle = '#c9bfdc';
    ctx.font = `700 ${Math.max(7, r * 0.26)}px system-ui, sans-serif`;
    ctx.fillText(this.label.toUpperCase().slice(0, 8), 0, r * 0.45);
    ctx.restore();
  }
}

type Beat =
  | { kind: 'throw'; phase: number }
  | { kind: 'row'; row: LedgerRow }
  | { kind: 'strike'; row: LedgerRow; phase: number; index: number; dur: number; life: number; side: 1 | -1 }
  | { kind: 'lump'; row: LedgerRow; value: number; count: number }
  | { kind: 'bonus'; row: LedgerRow; index: number; dur: number; life: number; struck: boolean; side: 1 | -1 }
  | { kind: 'land' }
  | { kind: 'total'; row: LedgerRow }
  | { kind: 'verdict'; row: LedgerRow };

const TIMING = {
  full: { first: 0.42, each: 0.3, budget: 1.8, min: 0.14, life: 0.48, bonus: 0.28, total: 0.26, verdict: 0.34, hold: 1.2 },
  quick: { first: 0.3, each: 0.2, budget: 1.0, min: 0.1, life: 0.34, bonus: 0.22, total: 0.22, verdict: 0.3, hold: 0.8 },
};

class DiceGroup implements Drawable {
  additive = false;
  private age = 0;
  private readonly box: Box;
  private readonly ledger: Ledger | null;
  private readonly beats: Beat[] = [];
  private readonly rows: LedgerRow[] = [];
  private beatIndex = 0;
  private beatStart = 0;
  private beatBegun = false;
  private readonly thrown: (RollingDie[] | null)[];
  private readonly settledAt: (number | null)[];
  private readonly highlighted: boolean[];
  private dice: RollingDie[] = [];
  private strikes: Strike[] = [];
  private tokens: Token[] = [];
  /** The number each hit knocks out of a die, rising briefly above it. */
  private hits: { text: string; x: number; y: number; at: number; color: string }[] = [];
  private notifiedAt: number | null = null;
  private hold: number;
  private readonly fade = 0.4;
  private readonly quick: boolean;
  private readonly r: number;
  private readonly look: StrikeLook;

  constructor(
    private phases: DicePhase[],
    private table: { box: Box; tray: boolean },
    private opts: DiceRollOptions,
  ) {
    this.quick = opts.speed === 'quick' || fx.level === 'reduced';
    this.look = opts.look ?? 'orb';
    const T = TIMING[this.quick ? 'quick' : 'full'];
    const rowCount = phases.reduce((a, p) => a + p.rows.length, 0);
    this.ledger = rowCount ? new Ledger(Math.min(4, rowCount)) : null;
    this.box = { ...table.box, top: table.box.top + (this.ledger?.height ?? 0) };
    this.thrown = phases.map(() => null);
    this.settledAt = phases.map(() => null);
    this.highlighted = phases.map(() => false);
    this.hold = this.ledger ? T.hold : this.quick ? 1.1 : 1.6;

    const bw = this.box.right - this.box.left;
    const bh = this.box.bottom - this.box.top;
    const shown = phases.reduce((a, p) => a + Math.min(MAX_DICE, p.dice.length), 0);
    const base = clamp(Math.min(bw, bh) / 7, 18, 34);
    this.r = base * (shown > 10 ? 0.7 : shown > 6 ? 0.8 : 1);

    phases.forEach((phase, p) => {
      this.beats.push({ kind: 'throw', phase: p });
      const compact = phase.rows.length > 1;
      for (const spec of phase.rows) {
        const value = (i: number) => {
          const d = phase.dice[i];
          return typeof d?.value === 'number' ? d.value * (d.sign ?? 1) : 0;
        };
        const row = new LedgerRow(spec, compact, spec.dice.reduce((a, i) => a + value(i), 0));
        this.rows.push(row);
        this.beats.push({ kind: 'row', row });
        const seen = spec.dice.filter((i) => i < MAX_DICE);
        const hidden = spec.dice.filter((i) => i >= MAX_DICE);
        const each = seen.length > 1 ? clamp(T.budget / seen.length, T.min, T.each) : T.first;
        seen.forEach((index, k) => {
          const dur = k === 0 ? Math.max(each, T.first * 0.8) : each;
          this.beats.push({ kind: 'strike', row, phase: p, index, dur, life: Math.max(T.life, dur * 1.5), side: k % 2 ? -1 : 1 });
        });
        if (hidden.length) this.beats.push({ kind: 'lump', row, value: hidden.reduce((a, i) => a + value(i), 0), count: hidden.length });
        row.bonuses.forEach((_, index) =>
          this.beats.push({ kind: 'bonus', row, index, dur: compact ? T.min : T.bonus, life: Math.max(T.life, T.bonus * 1.4), struck: !compact, side: index % 2 ? 1 : -1 }),
        );
        this.beats.push({ kind: 'land' }, { kind: 'total', row });
        if (spec.verdict) this.beats.push({ kind: 'verdict', row });
      }
    });
  }

  private get timing() {
    return TIMING[this.quick ? 'quick' : 'full'];
  }

  /** Throws a phase's dice; `atRest` lays them straight down (a skipped roll). */
  private launch(p: number, atRest = false) {
    const box = this.box;
    const r = this.r;
    const bw = box.right - box.left;
    const bh = box.bottom - box.top;
    const from = this.opts.from ?? { x: (box.left + box.right) / 2, y: box.bottom };
    // Throw from the nearest point of the table to where you tapped, into the table.
    const start = { x: clamp(from.x, box.left + r, box.right - r), y: clamp(from.y, box.top + r, box.bottom - r) };
    const dice = this.phases[p].dice.slice(0, MAX_DICE).map((spec, i) => {
      if (atRest) {
        let best = { x: box.left + bw / 2, y: box.top + bh / 2 };
        let bestGap = -1;
        for (let tries = 0; tries < 24; tries++) {
          const at = { x: rand(box.left + r, box.right - r), y: rand(box.top + r, box.bottom - r) };
          const gap = Math.min(Infinity, ...this.dice.map((d) => Math.hypot(d.x - at.x, d.y - at.y)));
          if (gap > bestGap) (best = at), (bestGap = gap);
          if (gap > r * 2.2) break;
        }
        const d = new RollingDie(spec, best, r);
        this.dice.push(d);
        d.settle(this.age);
        return d;
      }
      const target = { x: rand(box.left + bw * 0.2, box.right - bw * 0.2), y: rand(box.top + bh * 0.2, box.bottom - bh * 0.2) };
      const dx = target.x - start.x;
      const dy = target.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const sp = this.quick ? rand(500, 800) : rand(800, 1250);
      const d = new RollingDie(spec, { x: start.x + rand(-r, r) + (i % 3) * 4, y: start.y + rand(-r, r) }, r);
      d.vx = (dx / len) * sp + rand(-120, 120);
      d.vy = (dy / len) * sp + rand(-120, 120);
      d.thrownAt = this.age;
      this.dice.push(d);
      return d;
    });
    for (const d of this.dice) if (!dice.includes(d)) d.dim = true;
    this.thrown[p] = dice;
    if (!atRest) sound.diceHit(0.6);
  }

  update(dt: number): boolean {
    this.age += dt;
    this.physics(dt);
    this.strikes = this.strikes.filter((s) => s.update(this.age));
    this.tokens = this.tokens.filter((t) => t.alive(this.age));
    this.hits = this.hits.filter((h) => this.age - h.at < 0.9);
    this.runBeats();
    const end = (this.notifiedAt ?? Infinity) + this.hold + (this.critical ? 0.8 : 0) + this.fade;
    return this.age < end || this.strikes.length > 0;
  }

  private get critical() {
    return !this.ledger && this.dice.some((d) => d.crit);
  }

  private physics(dt: number) {
    const { left, top, right, bottom } = this.box;
    const minRoll = this.quick ? 0.35 : 0.7;
    const maxRoll = this.quick ? 0.8 : 1.7;
    const friction = this.quick ? 3 : 1.7;
    for (const d of this.dice) {
      if (d.settled) continue;
      const k = friction + (d.speed < 160 ? 3 : 0);
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
      d.z = d.spec.orb ? 0 : Math.abs(Math.sin((d.tumble / (d.r * 1.5)) * Math.PI)) * Math.min(1, d.speed / 700) * d.r * 0.55;
      if (d.spec.orb && d.speed > 60 && Math.random() < (fx.level === 'reduced' ? 0.3 : 0.8)) fx.trailAt(d.spec.element ?? 'arcane', d.x, d.y, d.vx, d.vy);

      const e = 0.55;
      if (d.x - d.r < left) (d.x = left + d.r), (d.vx = Math.abs(d.vx) * e), this.knock(d.speed);
      if (d.x + d.r > right) (d.x = right - d.r), (d.vx = -Math.abs(d.vx) * e), this.knock(d.speed);
      if (d.y - d.r < top) (d.y = top + d.r), (d.vy = Math.abs(d.vy) * e), this.knock(d.speed);
      if (d.y + d.r > bottom) (d.y = bottom - d.r), (d.vy = -Math.abs(d.vy) * e), this.knock(d.speed);

      const rolled = this.age - d.thrownAt;
      if ((d.speed < 28 && rolled > minRoll) || rolled > maxRoll) {
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
  }

  private runBeats() {
    while (this.beatIndex < this.beats.length) {
      const b = this.beats[this.beatIndex];
      if (!this.beatBegun) {
        this.beatBegun = true;
        this.beatStart = this.age;
        this.begin(b);
      }
      if (!this.finished(b)) return;
      this.beatIndex++;
      this.beatBegun = false;
    }
    if (this.notifiedAt === null) {
      this.notifiedAt = this.age;
      this.opts.onSettled();
    }
  }

  private begin(b: Beat) {
    switch (b.kind) {
      case 'throw':
        this.launch(b.phase);
        break;
      case 'row':
        this.ledger?.rows.push(b.row);
        break;
      case 'strike': {
        const die = this.thrown[b.phase]![b.index];
        const el = die.spec.element ?? this.opts.element ?? 'arcane';
        const look = this.look;
        this.strikes.push(
          new Strike(look, die, this.age, b.life, die.r, b.side, el, () => {
            die.hitAt = this.age;
            const at = { x: die.x, y: die.y };
            fx.pop(at, el, look === 'hammer' ? 1.3 : look === 'orb' ? 1.15 : 1);
            this.hits.push({ text: String(die.signed).replace('-', '−'), x: die.x, y: die.y - die.r, at: this.age, color: elementColor(el) });
            if (look === 'hammer') fx.jolt(3);
            b.row.addDie(die.signed, this.age);
          }),
        );
        sound.strike(look, el, b.life / 2);
        break;
      }
      case 'lump':
        b.row.addDie(b.value, this.age);
        sound.tally('bonus');
        break;
      case 'bonus': {
        if (!b.struck) {
          b.row.bonusAt[b.index] = this.age;
          sound.tally('bonus');
          break;
        }
        const bonus = b.row.bonuses[b.index];
        const el = this.opts.element ?? 'arcane';
        const spot = this.freeSpot();
        const token = new Token(spot.x, spot.y, bonus.label, bonus.value, this.age, this.r * 0.78, this.look === 'orb' ? elementColor(el) : '#dcae55');
        this.tokens.push(token);
        this.strikes.push(
          new Strike(this.look, token, this.age, b.life, this.r * 0.8, b.side, el, () => {
            token.hitAt = this.age;
            b.row.bonusAt[b.index] = this.age;
            fx.pop(spot, el, 0.8);
            this.hits.push({ text: bonus.value < 0 ? `−${-bonus.value}` : `+${bonus.value}`, x: spot.x, y: spot.y - this.r * 0.8, at: this.age, color: '#ffd970' });
            sound.tally('bonus');
          }),
        );
        sound.strike(this.look, el, b.life / 2);
        break;
      }
      case 'total':
        b.row.totalAt = this.age;
        sound.tally('total');
        break;
      case 'verdict':
        b.row.verdictAt = this.age;
        sound.tally(b.row.spec.verdict!.tone);
        break;
      case 'land':
        break;
    }
  }

  private finished(b: Beat): boolean {
    const since = this.age - this.beatStart;
    const T = this.timing;
    switch (b.kind) {
      case 'throw': {
        const dice = this.thrown[b.phase]!;
        if (!dice.every((d) => d.settled)) return false;
        this.settledAt[b.phase] ??= this.age;
        if (!this.highlighted[b.phase]) {
          this.highlighted[b.phase] = true;
          this.highlight(dice);
        }
        // Give a critical a beat on its own before the count (or the result) arrives.
        return this.age - this.settledAt[b.phase]! >= (dice.some((d) => d.crit) ? 0.55 : 0.12);
      }
      case 'row':
        return true;
      case 'strike':
      case 'bonus':
        return since >= b.dur;
      case 'lump':
        return since >= T.min;
      case 'land':
        return this.strikes.every((s) => s.impacted);
      case 'total':
        return since >= T.total;
      case 'verdict':
        return since >= T.verdict;
    }
  }

  private highlight(dice: RollingDie[]) {
    const crit = dice.find((d) => d.crit);
    const fumble = dice.find((d) => d.fumble);
    if (crit) {
      fx.critical({ x: crit.x, y: crit.y }, this.opts.critElement ?? 'arcane', this.opts.critHeadline ?? 'NATURAL 20!');
      sound.critical();
    } else if (fumble) {
      fx.fumble({ x: fumble.x, y: fumble.y }, 'NATURAL 1');
      sound.natural('nat1');
    }
  }

  /** The open spot on the table furthest from any die or token, for a bonus token. */
  private freeSpot(): Point {
    const { left, top, right, bottom } = this.box;
    const r = this.r;
    let best = { x: (left + right) / 2, y: (top + bottom) / 2 };
    let bestGap = -1;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        const at = { x: left + r + ((right - left - 2 * r) * (i + 0.5)) / 5, y: top + r + ((bottom - top - 2 * r) * (j + 0.5)) / 3 };
        const gap = Math.min(Infinity, ...this.dice.map((d) => Math.hypot(d.x - at.x, d.y - at.y)), ...this.tokens.map((t) => Math.hypot(t.x - at.x, t.y - at.y)));
        if (gap > bestGap) (best = at), (bestGap = gap);
      }
    }
    return best;
  }

  /** Jumps to the end: every die at rest, the tally filled in, the result shown. */
  skip() {
    if (this.notifiedAt !== null) {
      this.hold = Math.min(this.hold, this.age - this.notifiedAt + 0.3);
      return;
    }
    this.phases.forEach((_, p) => {
      if (!this.thrown[p]) this.launch(p, true);
    });
    for (const d of this.dice) if (!d.settled) d.settle(this.age);
    this.phases.forEach((_, p) => {
      if (!this.highlighted[p]) {
        this.highlighted[p] = true;
        this.highlight(this.thrown[p]!);
      }
    });
    this.strikes = [];
    this.tokens = [];
    for (const row of this.rows) {
      if (this.ledger && !this.ledger.rows.includes(row)) this.ledger.rows.push(row);
      row.complete(this.age);
    }
    this.hits = [];
    this.beatIndex = this.beats.length;
    this.hold = 0.7;
    this.notifiedAt = this.age;
    this.opts.onSettled();
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
    const { left, top, right, bottom } = this.table.box;
    const pad = 10;
    ctx.save();
    ctx.globalAlpha = alpha * 0.97;
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
    const fadeStart = (this.notifiedAt ?? Infinity) + this.hold + (this.critical ? 0.8 : 0);
    const alpha = this.age < fadeStart ? 1 : Math.max(0, 1 - (this.age - fadeStart) / this.fade);
    const appear = Math.min(1, this.age / 0.15);
    if (this.table.tray) this.drawTray(ctx, alpha * appear);
    this.ledger?.draw(ctx, this.table.box, this.age, alpha * appear);
    // Draw the higher (hopping) dice last so they pass over the others.
    for (const d of [...this.dice].sort((p, q) => p.z - q.z)) d.draw(ctx, this.age, alpha);
    for (const t of this.tokens) t.draw(ctx, this.age, alpha);
    for (const s of this.strikes) s.draw(ctx, this.age);
    this.drawHits(ctx, alpha);
    ctx.globalAlpha = 1;
  }

  private drawHits(ctx: CanvasRenderingContext2D, alpha: number) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(12,10,20,0.75)';
    for (const h of this.hits) {
      const t = (this.age - h.at) / 0.9;
      const size = Math.round(this.r * 0.8 * (t < 0.15 ? 0.7 + t * 2.6 : 1.09 - Math.min(0.09, (t - 0.15) * 0.6)));
      const y = h.y - 4 - 20 * (1 - (1 - t) * (1 - t));
      ctx.globalAlpha = alpha * (t < 0.7 ? 1 : (1 - t) / 0.3);
      ctx.font = `800 ${size}px "Alegreya SC", Georgia, serif`;
      ctx.strokeText(h.text, h.x, y);
      ctx.fillStyle = h.color;
      ctx.fillText(h.text, h.x, y);
    }
    ctx.restore();
  }
}

const active = new Set<DiceGroup>();

function skipAll(e: Event) {
  if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
  active.forEach((g) => g.skip());
}

/**
 * Throws dice for an already-made roll, counts up any tally, and calls onSettled once
 * the result can be shown. Phases are thrown one after another (an attack, then its damage).
 */
export function rollDice(phases: DicePhase[], opts: DiceRollOptions) {
  const { w, h } = fx.viewport;
  const count = phases.reduce((a, p) => a + p.dice.length, 0);
  if (!count || fx.level === 'off' || w === 0 || h === 0) {
    queueMicrotask(opts.onSettled);
    return;
  }
  // Without a tally, d20 tests are always drawn and damage dice fill the rest.
  const ready = phases.map((p) => (p.rows.length ? p : { ...p, dice: [...p.dice.filter((d) => d.test), ...p.dice.filter((d) => !d.test)] }));
  const rows = Math.min(4, phases.reduce((a, p) => a + p.rows.length, 0));
  const group = new DiceGroup(ready, tableBounds(rows ? 10 + rows * ROW_HEIGHT : 0), opts);
  if (!active.size) {
    window.addEventListener('pointerdown', skipAll, true);
    window.addEventListener('keydown', skipAll, true);
  }
  active.add(group);
  fx.spawn({
    additive: false,
    update(dt) {
      const alive = group.update(dt);
      if (!alive) {
        active.delete(group);
        if (!active.size) {
          window.removeEventListener('pointerdown', skipAll, true);
          window.removeEventListener('keydown', skipAll, true);
        }
      }
      return alive;
    },
    draw: (ctx) => group.draw(ctx),
  });
}
