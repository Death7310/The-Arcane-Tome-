import { describe, expect, it } from 'vitest';
import { naturalD20, roll, rollDie } from './dice';
import { checkCounts, checkDie, chiSquarePValue, hitChance } from './fairness';

// Fair dice still fail a 0.001 test one time in a thousand, so the live-randomness tests
// below use 1e-6 (one false alarm in a million runs) to keep the suite from flaking.
const STRICT = 1e-6;

describe('the statistics', () => {
  it('matches published chi-square critical values', () => {
    // Critical values from standard chi-square tables (e.g. NIST/SEMATECH e-Handbook, 1.3.6.7.4).
    expect(chiSquarePValue(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(11.07, 5)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(30.144, 19)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(43.82, 19)).toBeCloseTo(0.001, 4);
    expect(chiSquarePValue(0, 19)).toBe(1);
  });

  it('calls a perfectly even die fair and a loaded one loaded', () => {
    expect(checkCounts(new Array(20).fill(5000))).toMatchObject({ chiSquare: 0, pValue: 1, fair: true });
    // A d20 that lands on 20 just 10% more often than it should, over 100,000 rolls.
    const loaded = new Array(20).fill(0).map((_, i) => (i === 19 ? 5500 : 4974));
    const r = checkCounts(loaded);
    expect(r.fair).toBe(false);
    expect(r.pValue).toBeLessThan(0.001);
  });
});

describe('the app’s dice', () => {
  it('rolls every face, and nothing outside them', () => {
    for (const sides of [2, 3, 4, 6, 8, 10, 12, 20, 100]) {
      const seen = new Set<number>();
      for (let i = 0; i < sides * 200; i++) seen.add(rollDie(sides));
      expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1));
    }
  });

  it('passes the chi-square test for every standard die', () => {
    for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
      const r = checkDie(sides, 60_000);
      expect(r.pValue, `d${sides}: chi-square ${r.chiSquare.toFixed(1)}`).toBeGreaterThan(STRICT);
      expect(Math.abs(r.mean - r.expectedMean)).toBeLessThan(sides * 0.02);
    }
  });

  it('gives Advantage and natural 20s their textbook odds', () => {
    const n = 100_000;
    let atLeast11 = 0;
    let nat20 = 0;
    for (let i = 0; i < n; i++) {
      const r = roll('2d20kh1');
      if (r.total >= 11) atLeast11++;
      if (naturalD20(r) === 20) nat20++;
    }
    // P(max of two d20 >= 11) = 1 - (10/20)^2 = 0.75; P(natural 20 with Advantage) = 1 - (19/20)^2 = 0.0975.
    // Tolerances are about five standard errors.
    expect(Math.abs(atLeast11 / n - 0.75)).toBeLessThan(0.007);
    expect(Math.abs(nat20 / n - 0.0975)).toBeLessThan(0.005);
  });

  it('hits only as often as the bonus and the AC allow', () => {
    const n = 100_000;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const r = roll('1d20+7');
      const nat = naturalD20(r);
      if (nat === 20 || (nat !== 1 && r.total >= 15)) hits++;
    }
    expect(Math.abs(hits / n - hitChance(7, 15))).toBeLessThan(0.008);
  });
});

describe('hit chances', () => {
  it('follow d20 + bonus against the AC, with natural 1s and 20s', () => {
    expect(hitChance(7, 15)).toBeCloseTo(0.65);
    expect(hitChance(7, 30)).toBeCloseTo(0.05);
    expect(hitChance(7, 5)).toBeCloseTo(0.95);
    expect(hitChance(7, 15, 'adv')).toBeCloseTo(1 - 0.35 * 0.35);
    expect(hitChance(7, 15, 'dis')).toBeCloseTo(0.65 * 0.65);
    expect(hitChance(2, 30, 'normal', false)).toBe(0);
  });
});
