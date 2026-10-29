// Checks that the dice are fair, with the standard statistics rather than by eye.
//
// Pearson's chi-square goodness-of-fit test compares how often each face came up with how
// often a fair die would show it. The p-value is the chance a perfectly fair die would
// stray at least this far from even by luck alone: fair dice give p-values spread evenly
// between 0 and 1, so one run below 0.001 is the conventional red flag (it happens to a
// fair die one run in a thousand).

import { rollDie } from './dice';

export interface FaceCheck {
  sides: number;
  rolls: number;
  counts: number[];
  expected: number;
  chiSquare: number;
  degreesOfFreedom: number;
  pValue: number;
  mean: number;
  expectedMean: number;
  /** The face furthest from its fair share, as a percentage of that share. */
  worstDeviation: number;
  fair: boolean;
}

/** ln Γ(x), Lanczos approximation (g = 7, n = 9), accurate to ~15 significant digits. */
function lnGamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized upper incomplete gamma Q(a, x): series below a + 1, continued fraction above. */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const lead = a * Math.log(x) - x - lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(lead);
  }
  // Modified Lentz's method.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.exp(lead) * h;
}

/** P(X ≥ x) for a chi-square distribution with `df` degrees of freedom. */
export function chiSquarePValue(x: number, df: number): number {
  return Math.min(1, Math.max(0, gammaQ(df / 2, x / 2)));
}

/** Tallies faces already rolled (by any means) and tests them for fairness. */
export function checkCounts(counts: number[], alpha = 0.001): FaceCheck {
  const sides = counts.length;
  const rolls = counts.reduce((a, b) => a + b, 0);
  const expected = rolls / sides;
  const chiSquare = counts.reduce((a, o) => a + ((o - expected) * (o - expected)) / expected, 0);
  const degreesOfFreedom = sides - 1;
  const pValue = chiSquarePValue(chiSquare, degreesOfFreedom);
  const mean = counts.reduce((a, o, i) => a + o * (i + 1), 0) / rolls;
  const worstDeviation = Math.max(...counts.map((o) => Math.abs(o - expected) / expected)) * 100;
  return { sides, rolls, counts, expected, chiSquare, degreesOfFreedom, pValue, mean, expectedMean: (sides + 1) / 2, worstDeviation, fair: pValue >= alpha };
}

/** Rolls a die `rolls` times with the app's own roller and tests the result. */
export function checkDie(sides: number, rolls: number, roll: (sides: number) => number = rollDie): FaceCheck {
  const counts = new Array<number>(sides).fill(0);
  for (let i = 0; i < rolls; i++) counts[roll(sides) - 1]++;
  return checkCounts(counts);
}

/**
 * Chance that d20 + bonus meets or beats `target` (an AC or DC). A natural 20 always hits
 * and a natural 1 always misses on attacks, so attack odds stay between 5% and 95%.
 */
export function hitChance(bonus: number, target: number, mode: 'normal' | 'adv' | 'dis' = 'normal', attack = true): number {
  let p = Math.min(20, Math.max(0, 21 - (target - bonus))) / 20;
  if (attack) p = Math.min(0.95, Math.max(0.05, p));
  if (mode === 'adv') return 1 - (1 - p) * (1 - p);
  if (mode === 'dis') return p * p;
  return p;
}
