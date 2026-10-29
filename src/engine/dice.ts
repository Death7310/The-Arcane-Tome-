// System-agnostic dice engine.
//
// Supported notation (case-insensitive, whitespace ignored):
//   3d6+2        sum of dice plus constants
//   d20 / d%     implicit count of 1; d% is d100
//   2d20kh1      keep highest N (advantage);  kl = keep lowest (disadvantage)
//   4d6dl1       drop lowest N;  dh = drop highest
//   8d10!        exploding dice (re-roll and add on max face)
//   6d10>=8      count successes instead of summing (dice pools, e.g. World of Darkness)
//
// The parser produces an AST so callers can transform a roll before it is made
// (double the dice on a critical hit, add upcast dice) without string surgery.

export type Rng = () => number; // returns a float in [0, 1)

export interface DiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: 'high' | 'low'; n: number };
  explode?: boolean;
  successAt?: number; // count dice >= this value as successes
}

export interface ConstTerm {
  kind: 'const';
  sign: 1 | -1;
  value: number;
}

export type Term = DiceTerm | ConstTerm;

export interface DieRoll {
  value: number;
  sides: number;
  kept: boolean;
  exploded?: boolean;
  success?: boolean;
}

export interface TermResult {
  term: Term;
  rolls: DieRoll[];
  value: number;
}

export interface RollResult {
  expression: string;
  terms: TermResult[];
  total: number;
  /** Present only when at least one term counts successes. */
  successes?: number;
}

const MAX_DICE = 500;
const MAX_SIDES = 10_000;
const MAX_EXPLOSIONS = 100;

export class DiceSyntaxError extends Error {}

export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
};

/** Uniform integer in [1, sides]. */
export function rollDie(sides: number, rng: Rng = cryptoRng): number {
  return Math.floor(rng() * sides) + 1;
}

const TERM_RE =
  /^(\d*)d(\d+|%)((?:kh|kl|k|dh|dl)\d+)?(!)?(?:(>=|>)(\d+))?|^(\d+)/;

export function parse(expression: string): Term[] {
  const src = expression.toLowerCase().replace(/\s+/g, '');
  if (!src) throw new DiceSyntaxError('Empty dice expression');
  const terms: Term[] = [];
  let i = 0;
  let sign: 1 | -1 = 1;
  let expectTerm = true;
  let sawSign = false;

  while (i < src.length) {
    const ch = src[i];
    if (ch === '+' || ch === '-') {
      // One sign per term: "-1" and "2d6-1" are fine, "2d6+-1" is not.
      if (sawSign) throw new DiceSyntaxError(`Unexpected "${ch}" in "${expression}"`);
      sign = ch === '-' ? -1 : 1;
      sawSign = true;
      expectTerm = true;
      i++;
      continue;
    }
    if (!expectTerm) throw new DiceSyntaxError(`Expected + or - before "${src.slice(i)}"`);

    const m = TERM_RE.exec(src.slice(i));
    if (!m || m[0].length === 0) throw new DiceSyntaxError(`Can't read "${src.slice(i)}"`);

    if (m[7] !== undefined) {
      terms.push({ kind: 'const', sign, value: Number(m[7]) });
    } else {
      const count = m[1] === '' ? 1 : Number(m[1]);
      const sides = m[2] === '%' ? 100 : Number(m[2]);
      if (count < 1 || count > MAX_DICE) throw new DiceSyntaxError(`Dice count must be 1–${MAX_DICE}`);
      if (sides < 2 || sides > MAX_SIDES) throw new DiceSyntaxError(`Dice need 2–${MAX_SIDES} sides`);
      const term: DiceTerm = { kind: 'dice', sign, count, sides };
      if (m[3]) {
        const mode = m[3].replace(/\d+$/, '');
        const n = Number(m[3].slice(mode.length));
        if (n < 1 || n > count) throw new DiceSyntaxError(`Can't keep or drop ${n} of ${count} dice`);
        if (mode === 'kh' || mode === 'k') term.keep = { mode: 'high', n };
        else if (mode === 'kl') term.keep = { mode: 'low', n };
        else if (mode === 'dl') term.keep = { mode: 'high', n: count - n };
        else term.keep = { mode: 'low', n: count - n };
        if (term.keep.n < 1) throw new DiceSyntaxError('Must keep at least one die');
      }
      if (m[4]) {
        if (sides < 3) throw new DiceSyntaxError('Exploding dice need at least 3 sides');
        term.explode = true;
      }
      if (m[5]) {
        const target = Number(m[6]);
        term.successAt = m[5] === '>' ? target + 1 : target;
      }
      terms.push(term);
    }
    i += m[0].length;
    sign = 1;
    sawSign = false;
    expectTerm = false;
  }
  if (expectTerm) throw new DiceSyntaxError(`"${expression}" ends with an operator`);
  return terms;
}

export function format(terms: Term[]): string {
  return terms
    .map((t, idx) => {
      const op = t.sign < 0 ? '-' : idx === 0 ? '' : '+';
      if (t.kind === 'const') return op + t.value;
      let s = `${op}${t.count}d${t.sides}`;
      if (t.keep && t.keep.n !== t.count) s += (t.keep.mode === 'high' ? 'kh' : 'kl') + t.keep.n;
      if (t.explode) s += '!';
      if (t.successAt !== undefined) s += '>=' + t.successAt;
      return s;
    })
    .join('');
}

export interface RollOptions {
  rng?: Rng;
  /** Double the number of dice rolled in every summed dice term (critical hits). */
  critical?: boolean;
}

export function rollTerms(terms: Term[], opts: RollOptions = {}): RollResult {
  const rng = opts.rng ?? cryptoRng;
  const results: TermResult[] = [];
  let total = 0;
  let successes: number | undefined;

  for (const term of terms) {
    if (term.kind === 'const') {
      results.push({ term, rolls: [], value: term.sign * term.value });
      total += term.sign * term.value;
      continue;
    }
    const count = opts.critical && term.successAt === undefined && !term.keep ? term.count * 2 : term.count;
    const rolls: DieRoll[] = [];
    let explosions = 0;
    for (let n = 0; n < count; n++) {
      let v = rollDie(term.sides, rng);
      rolls.push({ value: v, sides: term.sides, kept: true });
      while (term.explode && v === term.sides && explosions < MAX_EXPLOSIONS) {
        explosions++;
        v = rollDie(term.sides, rng);
        rolls.push({ value: v, sides: term.sides, kept: true, exploded: true });
      }
    }
    if (term.keep) {
      const order = rolls
        .map((r, idx) => ({ r, idx }))
        .sort((a, b) => (term.keep!.mode === 'high' ? b.r.value - a.r.value : a.r.value - b.r.value));
      order.forEach((o, rank) => (o.r.kept = rank < term.keep!.n));
    }
    let value: number;
    if (term.successAt !== undefined) {
      let s = 0;
      for (const r of rolls) {
        r.success = r.kept && r.value >= term.successAt;
        if (r.success) s++;
      }
      value = term.sign * s;
      successes = (successes ?? 0) + value;
    } else {
      value = term.sign * rolls.filter((r) => r.kept).reduce((a, r) => a + r.value, 0);
    }
    results.push({ term, rolls, value });
    total += value;
  }
  return { expression: format(terms), terms: results, total, successes };
}

export function roll(expression: string, opts: RollOptions = {}): RollResult {
  return rollTerms(parse(expression), opts);
}

/** "2d6 [3, 5] + 3" — a human-readable account of a roll. */
export function describe(result: RollResult): string {
  return result.terms
    .map((tr, idx) => {
      const t = tr.term;
      const op = t.sign < 0 ? '− ' : idx === 0 ? '' : '+ ';
      if (t.kind === 'const') return `${op}${t.value}`;
      const face = (r: DieRoll) => String(r.value) + (r.exploded ? '!' : '') + (r.success ? '✓' : '');
      const kept = tr.rolls.filter((r) => r.kept).map(face).join(', ');
      const dropped = tr.rolls.filter((r) => !r.kept).map(face).join(', ');
      const n = tr.rolls.filter((r) => !r.exploded).length;
      return `${op}${n}d${t.sides} [${kept}${dropped ? `; dropped ${dropped}` : ''}]`;
    })
    .join(' ');
}

/** Returns the expression with `extra` added `times` times, merging same-size dice: ("8d6", "1d6", 2) → "10d6". */
export function addDice(base: string, extra: string, times = 1): string {
  if (!extra || times <= 0) return base;
  const terms = parse(base);
  const add = parse(extra);
  for (let k = 0; k < times; k++) {
    for (const t of add) {
      const same =
        t.kind === 'dice'
          ? terms.find(
              (b): b is DiceTerm =>
                b.kind === 'dice' && b.sides === t.sides && b.sign === t.sign && !b.keep && !b.explode && b.successAt === undefined,
            )
          : terms.find((b): b is ConstTerm => b.kind === 'const' && b.sign === t.sign);
      if (same && t.kind === 'dice' && same.kind === 'dice') same.count += t.count;
      else if (same && t.kind === 'const' && same.kind === 'const') same.value += t.value;
      else terms.push({ ...t });
    }
  }
  return format(terms);
}

/** Multiplies every dice count: ("1d10", 3) → "3d10". Used for cantrip scaling. */
export function multiplyDice(expression: string, factor: number): string {
  const terms = parse(expression);
  for (const t of terms) if (t.kind === 'dice') t.count *= factor;
  return format(terms);
}

/** Appends a flat modifier: ("1d8", 3) → "1d8+3", ("1d8", -1) → "1d8-1". */
export function withModifier(expression: string, mod: number): string {
  if (!mod) return expression;
  return `${expression}${mod > 0 ? '+' : '-'}${Math.abs(mod)}`;
}

export function isValid(expression: string): boolean {
  try {
    parse(expression);
    return true;
  } catch {
    return false;
  }
}

/** Natural (unmodified) value of the kept d20 in a roll, if there is exactly one. */
export function naturalD20(result: RollResult): number | undefined {
  const kept = result.terms.flatMap((t) => (t.term.kind === 'dice' && t.term.sides === 20 ? t.rolls.filter((r) => r.kept) : []));
  return kept.length === 1 ? kept[0].value : undefined;
}
