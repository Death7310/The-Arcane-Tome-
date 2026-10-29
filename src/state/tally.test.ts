import { describe, expect, it } from 'vitest';
import { roll, type Rng } from '../engine/dice';
import { sampleCharacter } from '../systems/dnd5e/sample';
import { attackVerdict, bonusParts, captionOf, counted, phaseOf, tokenParts } from './tally';

/** Lands dice on fixed faces, given as [face, sides], so rolls are repeatable. */
const faces = (...dice: [number, number][]): Rng => {
  let i = 0;
  return () => {
    const [face, sides] = dice[i++ % dice.length];
    return (face - 0.5) / sides;
  };
};

describe('a weapon attack row', () => {
  it('strikes the d20, then names each bonus, and adds up to the roll', () => {
    const r = roll('1d20+5', { rng: faces([14, 20]) });
    const { dice, row } = counted([{ r, known: [{ label: 'STR', value: 3 }, { label: 'PROF', value: 2 }], test: true }], r.total, 'to hit');
    expect(dice).toMatchObject([{ sides: 20, value: 14, test: true }]);
    expect(row.dice).toEqual([0]);
    expect(row.caption).toBe('d20');
    expect(row.bonuses).toEqual([
      { label: 'STR', value: 3 },
      { label: 'PROF', value: 2 },
    ]);
    expect(row.total).toBe(19);
  });

  it('throws both dice for Advantage but counts only the kept one', () => {
    const r = roll('2d20kh1+5', { rng: faces([4, 20], [17, 20]) });
    const { dice, row } = counted([{ r, known: [], test: true }], r.total, 'to hit');
    expect(dice.map((d) => [d.value, d.kept])).toEqual([
      [4, false],
      [17, true],
    ]);
    expect(row.dice).toEqual([1]);
    expect(row.caption).toBe('d20 adv');
  });

  it('counts Bless as a die, and Bane as a die taken away', () => {
    const bless = roll('1d20+5+1d4', { rng: faces([10, 20], [3, 4]) });
    expect(counted([{ r: bless, known: [], test: true }], bless.total, 'to hit').row.caption).toBe('d20 + 1d4');
    const bane = roll('1d20+5-1d4', { rng: faces([10, 20], [3, 4]) });
    const { dice, row } = counted([{ r: bane, known: [], test: true }], bane.total, 'to hit');
    expect(dice[1]).toMatchObject({ sides: 4, value: 3, sign: -1 });
    expect(row.caption).toBe('d20 − 1d4');
    expect(row.bonuses).toEqual([{ label: 'BONUS', value: 5 }]);
  });
});

describe('damage rows', () => {
  it('joins several rolls into one row of dice with their bonuses summed', () => {
    const rolls = [roll('2d6+1', { rng: faces([3, 6], [4, 6]) }), roll('2d6+1', { rng: faces([5, 6], [6, 6]) }), roll('2d6+1', { rng: faces([1, 6], [2, 6]) })];
    const { dice, row } = counted(
      rolls.map((r) => ({ r, known: [], orb: true, element: 'fire' as const })),
      rolls.reduce((a, r) => a + r.total, 0),
      'fire',
      undefined,
      true,
    );
    expect(dice).toHaveLength(6);
    expect(dice.every((d) => d.orb && d.element === 'fire')).toBe(true);
    expect(row.caption).toBe('6d6 crit');
    expect(row.bonuses).toEqual([{ label: 'BONUS', value: 3 }]);
    expect(row.total).toBe(24);
  });

  it('labels what it can and calls the rest a bonus', () => {
    expect(bonusParts(3, [{ label: 'STR', value: 2 }])).toEqual([
      { label: 'STR', value: 2 },
      { label: 'BONUS', value: 1 },
    ]);
    expect(bonusParts(0, [{ label: 'MAGIC', value: 0 }])).toEqual([]);
  });
});

describe('labels from a formula’s tokens', () => {
  const c = sampleCharacter(); // Charisma 18, Proficiency Bonus +3

  it('names flat tokens', () => {
    expect(tokenParts('1d8+{MOD}', c)).toEqual([{ label: 'CHA', value: 4 }]);
    const spell = c.spells.find((s) => s.name === 'Fire Bolt')!;
    expect(tokenParts('{MOD}+1d4', c, spell)).toEqual([{ label: 'CHA', value: 4 }]);
    expect(tokenParts('2d6-{PB}', c)).toEqual([{ label: 'PROF', value: -3 }]);
  });

  it('leaves a number of dice alone', () => {
    expect(tokenParts('{PB}d4', c)).toEqual([]);
    expect(tokenParts('{LEVEL}D6 + {PB}', c)).toEqual([{ label: 'PROF', value: 3 }]);
  });
});

describe('putting rows together', () => {
  it('numbers each row’s dice within the throw', () => {
    const a = counted([{ r: roll('1d20+7', { rng: faces([12, 20]) }), known: [], test: true }], 19, 'to hit');
    const b = counted([{ r: roll('2d20kl1+7', { rng: faces([9, 20], [2, 20]) }), known: [], test: true }], 9, 'to hit');
    const phase = phaseOf([a, b]);
    expect(phase.dice).toHaveLength(3);
    expect(phase.rows.map((r) => r.dice)).toEqual([[0], [2]]);
  });

  it('calls the verdict', () => {
    expect(attackVerdict('crit', 20, null)).toEqual({ text: 'CRITICAL', tone: 'crit', note: undefined });
    expect(attackVerdict('miss', 1, 12)).toMatchObject({ text: 'MISS', note: 'natural 1' });
    expect(attackVerdict('hit', 15, 12)).toEqual({ text: 'HIT', tone: 'hit', note: 'vs AC 12' });
    expect(attackVerdict('hit', 15, null)).toBeUndefined();
    expect(captionOf([roll('1d8+2d6+3', { rng: faces([4, 8], [1, 6], [1, 6]) })])).toBe('1d8 + 2d6');
  });
});
