// What lands each hit of a tally: a sword swings at a damage die, an axe chops it, a
// hammer smashes it, a rapier or spear runs it through, an arrow thunks into it, and a
// spell's die (an orb of its element) bursts on its own. Weapons are drawn with canvas
// paths, so there are no images to load or license.
//
// Every weapon is drawn in local coordinates pointing along +x, grip at the origin and
// tip at x = L, then placed by its motion: a swing about the hands, a thrust along a
// line, an overhead smash, or a shot in flight.

import { elementColor } from './engine';
import type { Element, Point } from './types';

export type StrikeLook = 'sword' | 'axe' | 'rapier' | 'spear' | 'hammer' | 'fist' | 'arrow' | 'stone' | 'orb';

/** Picks the strike for a weapon from its name, falling back on its damage type. */
export function weaponLook(name: string, type: string, ranged: boolean): StrikeLook {
  const n = name.toLowerCase();
  if (/sling/.test(n)) return 'stone';
  if (ranged || /bow|musket|pistol|blowgun|dart/.test(n)) return 'arrow';
  if (/unarmed|fist|punch|kick|gauntlet/.test(n)) return 'fist';
  if (/axe|halberd|glaive|scythe|sickle/.test(n)) return 'axe';
  if (/hammer|maul|mace|club|flail|morningstar|staff|cudgel|pick/.test(n)) return 'hammer';
  if (/spear|pike|lance|trident|javelin/.test(n)) return 'spear';
  if (/rapier|dagger|short ?sword|stiletto|knife/.test(n)) return 'rapier';
  if (/sword|scimitar|blade|katana|sab(?:er|re)|whip/.test(n)) return 'sword';
  return type === 'piercing' ? 'rapier' : type === 'bludgeoning' ? 'hammer' : 'sword';
}

/** Something a strike can land on: a die on the table, or a bonus token. */
export interface Struck {
  x: number;
  y: number;
  /** 0…1 as a spell's orb swells before it bursts. */
  charge: number;
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Shortest signed turn from a to b. */
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

const GOLD = ['#ffe08a', '#d9a441', '#8a5a14'];
const WOOD = '#6b4423';
const LEATHER = '#4a2f1d';

function steel(ctx: CanvasRenderingContext2D, half: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, -half, 0, half);
  g.addColorStop(0, '#f6f8fb');
  g.addColorStop(0.45, '#b9c2cf');
  g.addColorStop(1, '#5f6979');
  return g;
}

function gold(ctx: CanvasRenderingContext2D, half: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, -half, 0, half);
  g.addColorStop(0, GOLD[0]);
  g.addColorStop(0.5, GOLD[1]);
  g.addColorStop(1, GOLD[2]);
  return g;
}

function shape(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function grip(ctx: CanvasRenderingContext2D, L: number, from: number, to: number, half: number) {
  ctx.fillStyle = LEATHER;
  ctx.beginPath();
  ctx.roundRect(from * L, -half * L, (to - from) * L, half * 2 * L, half * L);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, L * 0.008);
  ctx.beginPath();
  for (let x = from + 0.03; x < to; x += 0.045) {
    ctx.moveTo(x * L, -half * L);
    ctx.lineTo((x + 0.02) * L, half * L);
  }
  ctx.stroke();
}

function pommel(ctx: CanvasRenderingContext2D, L: number, x: number, r: number) {
  ctx.fillStyle = gold(ctx, r * L);
  ctx.beginPath();
  ctx.arc(x * L, 0, r * L, 0, Math.PI * 2);
  ctx.fill();
}

const WEAPONS: Record<Exclude<StrikeLook, 'orb'>, (ctx: CanvasRenderingContext2D, L: number, side: number) => void> = {
  sword(ctx, L) {
    grip(ctx, L, -0.2, 0, 0.028);
    pommel(ctx, L, -0.22, 0.045);
    ctx.fillStyle = gold(ctx, 0.13 * L);
    ctx.beginPath();
    ctx.roundRect(-0.012 * L, -0.13 * L, 0.036 * L, 0.26 * L, 0.015 * L);
    ctx.fill();
    ctx.fillStyle = steel(ctx, 0.045 * L);
    shape(ctx, [
      [0.024 * L, -0.045 * L],
      [0.86 * L, -0.036 * L],
      [L, 0],
      [0.86 * L, 0.036 * L],
      [0.024 * L, 0.045 * L],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,34,44,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,90,106,0.75)';
    ctx.lineWidth = Math.max(1, 0.012 * L);
    ctx.beginPath();
    ctx.moveTo(0.06 * L, 0);
    ctx.lineTo(0.7 * L, 0);
    ctx.stroke();
  },
  axe(ctx, L, side) {
    ctx.fillStyle = WOOD;
    ctx.beginPath();
    ctx.roundRect(-0.12 * L, -0.026 * L, 1.1 * L, 0.052 * L, 0.02 * L);
    ctx.fill();
    grip(ctx, L, -0.12, 0.12, 0.03);
    const s = side;
    ctx.fillStyle = steel(ctx, 0.28 * L);
    ctx.beginPath();
    ctx.moveTo(0.72 * L, -0.06 * L * s);
    ctx.lineTo(0.9 * L, -0.06 * L * s);
    ctx.lineTo(0.88 * L, 0.04 * L * s);
    ctx.lineTo(1.02 * L, 0.24 * L * s);
    ctx.quadraticCurveTo(0.84 * L, 0.38 * L * s, 0.64 * L, 0.26 * L * s);
    ctx.lineTo(0.75 * L, 0.04 * L * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,34,44,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // The bright cutting edge.
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(1, 0.012 * L);
    ctx.beginPath();
    ctx.moveTo(1.01 * L, 0.24 * L * s);
    ctx.quadraticCurveTo(0.84 * L, 0.36 * L * s, 0.66 * L, 0.26 * L * s);
    ctx.stroke();
  },
  rapier(ctx, L) {
    grip(ctx, L, -0.17, 0, 0.022);
    pommel(ctx, L, -0.19, 0.038);
    ctx.strokeStyle = gold(ctx, 0.12 * L);
    ctx.lineWidth = Math.max(1.5, 0.018 * L);
    ctx.beginPath();
    ctx.arc(-0.04 * L, 0, 0.12 * L, -Math.PI / 2, Math.PI / 2);
    ctx.moveTo(0.01 * L, -0.11 * L);
    ctx.lineTo(0.01 * L, 0.11 * L);
    ctx.stroke();
    ctx.fillStyle = steel(ctx, 0.018 * L);
    shape(ctx, [
      [0.02 * L, -0.017 * L],
      [L, 0],
      [0.02 * L, 0.017 * L],
    ]);
    ctx.fill();
  },
  spear(ctx, L) {
    ctx.fillStyle = WOOD;
    ctx.beginPath();
    ctx.roundRect(-0.45 * L, -0.02 * L, 1.27 * L, 0.04 * L, 0.02 * L);
    ctx.fill();
    ctx.fillStyle = LEATHER;
    ctx.fillRect(0.77 * L, -0.026 * L, 0.05 * L, 0.052 * L);
    ctx.fillStyle = steel(ctx, 0.06 * L);
    shape(ctx, [
      [0.81 * L, 0],
      [0.87 * L, -0.058 * L],
      [L, 0],
      [0.87 * L, 0.058 * L],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,34,44,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },
  hammer(ctx, L) {
    ctx.fillStyle = WOOD;
    ctx.beginPath();
    ctx.roundRect(-0.08 * L, -0.026 * L, 0.92 * L, 0.052 * L, 0.02 * L);
    ctx.fill();
    grip(ctx, L, -0.08, 0.16, 0.03);
    const g = ctx.createLinearGradient(0.78 * L, 0, 0.98 * L, 0);
    g.addColorStop(0, '#9aa3b3');
    g.addColorStop(0.5, '#6d7585');
    g.addColorStop(1, '#3f4552');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(0.78 * L, -0.16 * L, 0.2 * L, 0.32 * L, 0.03 * L);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,22,30,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0.8 * L, -0.15 * L, 0.03 * L, 0.3 * L);
  },
  fist(ctx, L) {
    // Forearm with leather wraps, then a closed fist.
    ctx.fillStyle = '#b8845a';
    ctx.beginPath();
    ctx.roundRect(-0.2 * L, -0.12 * L, 0.9 * L, 0.24 * L, 0.1 * L);
    ctx.fill();
    ctx.fillStyle = LEATHER;
    for (const x of [0.3, 0.42, 0.54]) ctx.fillRect(x * L, -0.125 * L, 0.06 * L, 0.25 * L);
    ctx.fillStyle = '#c99366';
    ctx.beginPath();
    ctx.roundRect(0.62 * L, -0.17 * L, 0.38 * L, 0.34 * L, 0.1 * L);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,20,0.55)';
    ctx.lineWidth = Math.max(1, 0.015 * L);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const y = (-0.085 + k * 0.085) * L;
      ctx.moveTo(0.86 * L, y);
      ctx.lineTo(0.99 * L, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#b8845a';
    ctx.beginPath();
    ctx.ellipse(0.74 * L, 0.15 * L, 0.12 * L, 0.05 * L, 0.2, 0, Math.PI * 2);
    ctx.fill();
  },
  arrow(ctx, L) {
    ctx.fillStyle = '#9a6a3a';
    ctx.fillRect(-0.95 * L, -0.012 * L, 0.86 * L, 0.024 * L);
    ctx.fillStyle = '#b8402f';
    for (const s of [-1, 1]) {
      shape(ctx, [
        [-0.8 * L, 0],
        [-0.98 * L, 0.075 * L * s],
        [-1.0 * L, 0.012 * L * s],
        [-0.86 * L, 0],
      ]);
      ctx.fill();
    }
    ctx.fillStyle = steel(ctx, 0.04 * L);
    shape(ctx, [
      [0, 0],
      [-0.13 * L, -0.045 * L],
      [-0.1 * L, 0],
      [-0.13 * L, 0.045 * L],
    ]);
    ctx.fill();
  },
  stone(ctx, L) {
    const g = ctx.createRadialGradient(-0.03 * L, -0.03 * L, 0, 0, 0, 0.09 * L);
    g.addColorStop(0, '#c9c3b8');
    g.addColorStop(1, '#5d574e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(-0.08 * L, 0, 0.09 * L, 0, Math.PI * 2);
    ctx.fill();
  },
};

/** Weapon length as a multiple of the die's radius. */
const LENGTH: Record<StrikeLook, number> = { sword: 3.4, axe: 3.0, rapier: 3.6, spear: 4.2, hammer: 3.0, fist: 1.9, arrow: 2.6, stone: 2.2, orb: 0 };

/**
 * One blow. It lands (and calls onImpact) halfway through its life; the rest is the
 * wind-up and the follow-through.
 */
export class Strike {
  impacted = false;
  private readonly L: number;

  constructor(
    readonly look: StrikeLook,
    readonly target: Struck,
    readonly start: number,
    readonly life: number,
    private readonly radius: number,
    private readonly side: 1 | -1,
    private readonly element: Element,
    private readonly onImpact: () => void,
  ) {
    this.L = LENGTH[look] * radius;
  }

  /** Returns false once the strike has finished. */
  update(age: number): boolean {
    const t = (age - this.start) / this.life;
    if (this.look === 'orb' && !this.impacted) this.target.charge = clamp01(t / 0.5);
    if (!this.impacted && t >= 0.5) {
      this.impacted = true;
      if (this.look === 'orb') this.target.charge = 0;
      this.onImpact();
    }
    return t < 1;
  }

  draw(ctx: CanvasRenderingContext2D, age: number) {
    if (this.look === 'orb') return;
    const t = clamp01((age - this.start) / this.life);
    const alpha = t < 0.12 ? t / 0.12 : t > 0.8 ? (1 - t) / 0.2 : 1;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (this.look === 'sword' || this.look === 'axe') this.swing(ctx, t, alpha);
    else if (this.look === 'hammer') this.smash(ctx, t);
    else if (this.look === 'arrow' || this.look === 'stone') this.shot(ctx, t, age);
    else this.thrust(ctx, t, alpha);
    ctx.restore();
  }

  private place(ctx: CanvasRenderingContext2D, at: Point, angle: number, bladeSide = 1) {
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    WEAPONS[this.look as Exclude<StrikeLook, 'orb'>](ctx, this.L, bladeSide);
    ctx.restore();
  }

  /** Sword and axe: the hands sit below and to one side; the blade sweeps across the die. */
  private swing(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
    const s = this.side;
    const axe = this.look === 'axe';
    const off = axe ? { x: s * 0.3, y: 0.8 } : { x: s * 0.5, y: 0.6 };
    const tgt = this.target;
    const rise = (1 - easeOut(clamp01(t / 0.3))) * 0.3 * this.L;
    const pivot = { x: tgt.x + off.x * this.L, y: tgt.y + off.y * this.L + rise };
    const aim = Math.atan2(-off.y, -off.x);
    const before = axe ? 1.5 : 1.15;
    const after = axe ? 0.45 : 0.9;
    const angleAt = (u: number) => {
      if (u < 0.3) return aim + s * (before + 0.15 * (u / 0.3));
      if (u < 0.5) {
        const k = (u - 0.3) / 0.2;
        return aim + s * (before + 0.15) * (1 - k * k);
      }
      return aim - s * after * easeOut(clamp01((u - 0.5) / 0.25));
    };
    const a = angleAt(t);
    if (t > 0.32 && t < 0.85) {
      // The bright arc the edge leaves behind.
      const a0 = angleAt(Math.max(0.3, t - 0.14));
      const r = (axe ? 0.9 : 0.82) * this.L;
      const tint = elementColor(this.element);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [w, op, col] of [
        [0.16, 0.16, tint],
        [0.07, 0.4, tint],
        [0.02, 0.9, '#ffffff'],
      ] as const) {
        ctx.globalAlpha = alpha * op * (1 - Math.max(0, t - 0.6) / 0.25);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, w * this.L);
        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, r, Math.min(a0, a), Math.max(a0, a));
        ctx.stroke();
      }
      ctx.restore();
    }
    // An axe's edge leads the swing.
    this.place(ctx, pivot, a, -s);
  }

  /** Hammer: raised overhead, brought down on the die, with a small bounce. */
  private smash(ctx: CanvasRenderingContext2D, t: number) {
    const s = this.side;
    const off = { x: s * 0.84, y: 0.26 };
    const tgt = this.target;
    const rise = (1 - easeOut(clamp01(t / 0.3))) * 0.25 * this.L;
    const pivot = { x: tgt.x + off.x * this.L, y: tgt.y + off.y * this.L + rise };
    const aim = Math.atan2(-off.y, -off.x);
    const raised = -Math.PI / 2 + s * 0.35;
    const dir = Math.sign(turn(raised, aim)) || 1;
    const back = raised - dir * 0.3;
    let a: number;
    if (t < 0.3) a = lerp(raised, back, easeOut(t / 0.3));
    else if (t < 0.5) {
      const k = (t - 0.3) / 0.2;
      a = back + turn(back, aim) * k * k;
    } else a = aim - dir * 0.14 * Math.sin(Math.PI * clamp01((t - 0.5) / 0.14));
    this.place(ctx, pivot, a);
  }

  /** Rapier, spear and fist: drawn back along a line, then driven into the die. */
  private thrust(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
    const s = this.side;
    const len = Math.hypot(0.55, 0.85);
    const dir = { x: (-s * 0.55) / len, y: -0.85 / len };
    const tgt = this.target;
    const L = this.L;
    const into = -0.18 * this.radius;
    let d: number;
    if (t < 0.3) d = lerp(0.55 * L, 0.75 * L, easeOut(t / 0.3));
    else if (t < 0.5) {
      const k = (t - 0.3) / 0.2;
      d = lerp(0.75 * L, into, k * k);
    } else if (t < 0.66) d = into;
    else d = lerp(into, 0.5 * L, ((t - 0.66) / 0.34) ** 2);
    const tip = { x: tgt.x - dir.x * d, y: tgt.y - dir.y * d };
    if (t > 0.36 && t < 0.56) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = elementColor(this.element);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const o of [-0.12, 0, 0.12]) {
        const px = -dir.y * o * L;
        const py = dir.x * o * L;
        ctx.moveTo(tip.x - dir.x * 0.5 * L + px, tip.y - dir.y * 0.5 * L + py);
        ctx.lineTo(tip.x - dir.x * 1.3 * L + px, tip.y - dir.y * 1.3 * L + py);
      }
      ctx.stroke();
      ctx.restore();
    }
    this.place(ctx, { x: tip.x - dir.x * L, y: tip.y - dir.y * L }, Math.atan2(dir.y, dir.x));
  }

  /** Arrow or sling stone: flies in from below and to the side; an arrow sticks and quivers. */
  private shot(ctx: CanvasRenderingContext2D, t: number, age: number) {
    const s = this.side;
    const tgt = this.target;
    const L = this.L;
    const from = { x: tgt.x + s * 0.95 * L * 1.7, y: tgt.y + 0.75 * L * 1.7 };
    const dx = tgt.x - from.x;
    const dy = tgt.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / dist, y: dy / dist };
    const norm = { x: -dir.y * s, y: dir.x * s };
    if (t < 0.5) {
      const k = t / 0.5;
      const lift = Math.sin(Math.PI * k) * 0.1 * dist;
      const pos = { x: lerp(from.x, tgt.x, k) + norm.x * lift, y: lerp(from.y, tgt.y, k) + norm.y * lift };
      const slope = Math.cos(Math.PI * k) * Math.PI * 0.1;
      const ang = Math.atan2(dir.y, dir.x) + slope * s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.4;
      ctx.strokeStyle = '#f2ead8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x - Math.cos(ang) * L * 1.4, pos.y - Math.sin(ang) * L * 1.4);
      ctx.stroke();
      ctx.restore();
      this.place(ctx, pos, ang);
      return;
    }
    if (this.look === 'stone') {
      // Glances off and drops away.
      const k = (t - 0.5) / 0.5;
      this.place(ctx, { x: tgt.x - dir.x * k * 40, y: tgt.y + k * k * 60 - dir.y * k * 20 }, 0);
      return;
    }
    const wobble = 0.09 * Math.sin(age * 55) * Math.exp(-(t - 0.5) * 14);
    const stuck = { x: tgt.x + dir.x * 0.22 * this.radius, y: tgt.y + dir.y * 0.22 * this.radius };
    this.place(ctx, stuck, Math.atan2(dir.y, dir.x) + wobble);
  }
}
