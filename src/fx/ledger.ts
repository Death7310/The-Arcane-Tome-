// The tally across the top of the dice tray: each row counts a roll up hit by hit.
//
//    15    +3    +2    = 20    HIT
//    d20   STR   PROF  to hit  vs AC 15
//
// The dice sum ticks up as each die is struck, each bonus appears as its own hit, then
// the total and the verdict. Layout is worked out from the finished row, so nothing
// shifts as it fills in.

export interface Verdict {
  text: string;
  tone: 'hit' | 'miss' | 'crit' | 'info';
  /** Small print under the verdict, e.g. "vs AC 15". */
  note?: string;
}

export interface TallyRow {
  /** Positions of this row's dice in its phase (kept dice only). */
  dice: number[];
  /** Under the dice sum: "d20", "8d6", "2d8 crit". */
  caption: string;
  /** Flat bonuses, each its own hit: { label: 'STR', value: 3 }. */
  bonuses: { label: string; value: number }[];
  total: number;
  /** Under the total: "to hit", "fire", "healing". */
  unit: string;
  verdict?: Verdict;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const ROW_HEIGHT = 40;
const GAP = 12;
const NUM = '800 21px "Alegreya SC", Georgia, serif';
const CAP = '700 9px system-ui, -apple-system, "Segoe UI", sans-serif';
const STAMP = '800 15px "Alegreya SC", Georgia, serif';

const TONE: Record<Verdict['tone'], string> = { hit: '#86e3a6', miss: '#c3bccf', crit: '#ffd970', info: '#c0d0ff' };

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** Pop-in scale for something revealed at `at`. */
function pop(age: number, at: number): { scale: number; alpha: number } {
  if (at < 0) return { scale: 1, alpha: 0 };
  const k = Math.min(1, (age - at) / 0.22);
  return { scale: 1 + 0.45 * (1 - k) * (1 - k), alpha: Math.min(1, k * 4) };
}

const INK = '#f6efdc';
const GILT = '#ffd970';

interface Cell {
  text: string;
  /** The widest this cell's text will get, for layout. */
  widest: string;
  caption: string;
  color: string;
  /** When it appeared, and when it last changed (for the pop). */
  at: number;
  bump: number;
  glow?: boolean;
}

export class LedgerRow {
  sum = 0;
  sumAt = -1;
  bumpAt = -1;
  bonusAt: number[];
  totalAt = -1;
  verdictAt = -1;
  readonly bonuses: { label: string; value: number }[];
  private widths: number[] | null = null;

  constructor(
    readonly spec: TallyRow,
    compact: boolean,
    /** What the dice add up to once every one is struck. */
    readonly diceSum: number,
  ) {
    const real = spec.bonuses.filter((b) => b.value !== 0);
    const total = real.reduce((a, b) => a + b.value, 0);
    this.bonuses = compact && real.length > 1 ? [{ label: 'bonus', value: total }] : real;
    this.bonusAt = this.bonuses.map(() => -1);
  }

  addDie(value: number, age: number) {
    this.sum += value;
    if (this.sumAt < 0) this.sumAt = age;
    this.bumpAt = age;
  }

  /** Shows everything at once (a skipped roll). */
  complete(age: number) {
    this.sum = this.diceSum;
    // Already in place: revealed a moment ago, so nothing pops.
    const at = Math.max(0, age - 1);
    if (this.sumAt < 0) this.sumAt = at;
    this.bumpAt = Math.min(this.bumpAt, at);
    this.bonusAt = this.bonusAt.map((b) => (b < 0 ? at : b));
    if (this.totalAt < 0) this.totalAt = at;
    if (this.spec.verdict && this.verdictAt < 0) this.verdictAt = at;
  }

  private cells(): Cell[] {
    const s = this.spec;
    const widest = String(Math.max(Math.abs(this.diceSum), Math.abs(s.total), 99));
    if (!this.bonuses.length && this.diceSum === s.total) {
      // Nothing to add: the dice are the total, and turn gold when it's called.
      const done = this.totalAt >= 0;
      return [{ text: String(this.sum), widest, caption: `${s.caption} · ${s.unit}`, color: done ? GILT : INK, at: this.sumAt, bump: Math.max(this.bumpAt, this.totalAt), glow: done }];
    }
    return [
      { text: String(this.sum), widest, caption: s.caption, color: INK, at: this.sumAt, bump: this.bumpAt },
      ...this.bonuses.map((b, i) => ({ text: signed(b.value), widest: signed(b.value), caption: b.label, color: b.value < 0 ? '#ff9f93' : '#d9cfb6', at: this.bonusAt[i], bump: this.bonusAt[i] })),
      { text: `= ${s.total}`, widest: `= ${s.total}`, caption: s.unit, color: GILT, at: this.totalAt, bump: this.totalAt, glow: true },
    ];
  }

  draw(ctx: CanvasRenderingContext2D, area: Box, y: number, age: number, alpha: number) {
    const cells = this.cells();
    const v = this.spec.verdict;
    if (!this.widths) {
      // Measure with the finished numbers so the row doesn't reflow as it counts up.
      this.widths = cells.map((c) => {
        ctx.font = NUM;
        const w = ctx.measureText(c.widest).width;
        ctx.font = CAP;
        return Math.max(w, ctx.measureText(c.caption.toUpperCase()).width) + 4;
      });
      if (v) {
        ctx.font = STAMP;
        this.widths.push(ctx.measureText(v.text).width + 20);
      }
    }
    const widths = this.widths;
    const full = widths.reduce((a, w) => a + w, 0) + GAP * (widths.length - 1);
    const scale = Math.min(1, (area.right - area.left - 20) / full);
    ctx.save();
    ctx.translate((area.left + area.right) / 2, y);
    ctx.scale(scale, scale);
    let x = -full / 2;
    ctx.textAlign = 'center';
    cells.forEach((c, i) => {
      const w = widths[i];
      if (c.at >= 0) {
        const mid = x + w / 2;
        const fade = pop(age, c.at).alpha;
        const p = pop(age, c.bump);
        ctx.save();
        ctx.globalAlpha = alpha * fade;
        ctx.translate(mid, -3);
        ctx.scale(p.scale, p.scale);
        if (c.glow) {
          const g = ctx.createRadialGradient(0, 0, 2, 0, 0, w * 0.7);
          g.addColorStop(0, 'rgba(255,217,112,0.28)');
          g.addColorStop(1, 'rgba(255,217,112,0)');
          ctx.fillStyle = g;
          ctx.fillRect(-w * 0.7, -18, w * 1.4, 30);
        }
        ctx.font = NUM;
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(8,6,14,0.7)';
        ctx.strokeText(c.text, 0, 0);
        ctx.fillStyle = c.color;
        ctx.fillText(c.text, 0, 0);
        ctx.restore();
        ctx.globalAlpha = alpha * fade * 0.85;
        ctx.font = CAP;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#b6aec4';
        ctx.fillText(c.caption.toUpperCase(), mid, 10);
      }
      x += w + GAP;
    });
    if (v && this.verdictAt >= 0) {
      const w = widths[widths.length - 1];
      const k = Math.min(1, (age - this.verdictAt) / 0.25);
      const s = 1 + 0.9 * (1 - k) * (1 - k);
      const col = TONE[v.tone];
      ctx.save();
      ctx.translate(x + w / 2, v.note ? -5 : 0);
      ctx.rotate(-0.12 * (1 - k));
      ctx.scale(s, s);
      ctx.globalAlpha = alpha * Math.min(1, k * 3);
      ctx.beginPath();
      ctx.roundRect(-w / 2, -12, w, 24, 6);
      ctx.fillStyle = 'rgba(8,6,14,0.55)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.font = STAMP;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = col;
      ctx.fillText(v.text, 0, 1);
      ctx.restore();
      if (v.note) {
        ctx.globalAlpha = alpha * Math.min(1, k * 3) * 0.85;
        ctx.font = CAP;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#b6aec4';
        ctx.fillText(v.note.toUpperCase(), x + w / 2, 10);
      }
    }
    ctx.restore();
  }
}

/** The rows on show; the newest few when there are more than fit. */
export class Ledger {
  readonly rows: LedgerRow[] = [];
  constructor(readonly visible: number) {}

  get height() {
    return 10 + this.visible * ROW_HEIGHT;
  }

  draw(ctx: CanvasRenderingContext2D, box: Box, age: number, alpha: number) {
    const band = { left: box.left, top: box.top, right: box.right, bottom: box.top + this.height };
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = 'rgba(10,8,18,0.6)';
    ctx.beginPath();
    ctx.roundRect(band.left + 2, band.top + 2, band.right - band.left - 4, band.bottom - band.top - 6, 10);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = '#dcae55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(band.left + 14, band.bottom - 4);
    ctx.lineTo(band.right - 14, band.bottom - 4);
    ctx.stroke();
    ctx.restore();
    const shown = this.rows.slice(-this.visible);
    shown.forEach((r, i) => r.draw(ctx, band, band.top + 6 + ROW_HEIGHT * i + ROW_HEIGHT / 2 - 4, age, alpha));
    ctx.globalAlpha = 1;
  }
}
