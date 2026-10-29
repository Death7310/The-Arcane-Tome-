import { describe as suite, expect, it } from 'vitest';
import { addDice, DiceSyntaxError, describe, format, multiplyDice, naturalD20, parse, roll, withModifier, type Rng } from './dice';

/** Deterministic RNG that yields the given die faces in order (for dice of `sides`). */
const faces = (sides: number, ...values: number[]): Rng => {
  let i = 0;
  return () => (values[i++ % values.length] - 1 + 0.5) / sides;
};

suite('parse/format', () => {
  it('round-trips common notation', () => {
    for (const e of ['1d20', '2d6+3', '4d6kh3', '2d20kl1', '8d10!', '6d10>=8', '1d8-1', '3']) {
      expect(format(parse(e))).toBe(e);
    }
  });

  it('accepts implicit counts, d%, spaces and capitals', () => {
    expect(format(parse('d20 + 5'))).toBe('1d20+5');
    expect(format(parse('D%'))).toBe('1d100');
    expect(format(parse('4d6dl1'))).toBe('4d6kh3');
    expect(format(parse('-1+1d4'))).toBe('-1+1d4');
  });

  it('rejects malformed input', () => {
    for (const e of ['', 'd', '2d6+', '2d6++1', '2d6+-1', '1d1', '0d6', '2d6kh3', 'fireball']) {
      expect(() => parse(e), e).toThrow(DiceSyntaxError);
    }
  });
});

suite('roll', () => {
  it('sums dice and constants', () => {
    const r = roll('2d6+3', { rng: faces(6, 4, 5) });
    expect(r.total).toBe(12);
    expect(describe(r)).toBe('2d6 [4, 5] + 3');
  });

  it('keeps highest for advantage and lowest for disadvantage', () => {
    expect(roll('2d20kh1', { rng: faces(20, 7, 15) }).total).toBe(15);
    const dis = roll('2d20kl1+2', { rng: faces(20, 7, 15) });
    expect(dis.total).toBe(9);
    expect(naturalD20(dis)).toBe(7);
    expect(describe(dis)).toBe('2d20 [7; dropped 15] + 2');
  });

  it('doubles damage dice, not modifiers, on a critical hit', () => {
    const r = roll('1d8+3', { rng: faces(8, 2, 6), critical: true });
    expect(r.terms[0].rolls).toHaveLength(2);
    expect(r.total).toBe(11);
  });

  it('explodes on the highest face', () => {
    const r = roll('1d6!', { rng: faces(6, 6, 6, 2) });
    expect(r.terms[0].rolls.map((d) => d.value)).toEqual([6, 6, 2]);
    expect(r.total).toBe(14);
  });

  it('counts successes for dice pools', () => {
    const r = roll('5d10>=8', { rng: faces(10, 1, 8, 10, 7, 9) });
    expect(r.successes).toBe(3);
    expect(r.total).toBe(3);
  });

  it('stays in range over many real rolls', () => {
    for (let i = 0; i < 2000; i++) {
      const v = roll('1d20').total;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

suite('transforms', () => {
  it('adds upcast dice, merging same-size dice', () => {
    expect(addDice('8d6', '1d6', 2)).toBe('10d6');
    expect(addDice('2d8+3', '2d8', 1)).toBe('4d8+3');
    expect(addDice('3d6', '1d8', 1)).toBe('3d6+1d8');
    expect(addDice('3d6', '', 4)).toBe('3d6');
  });

  it('multiplies dice for cantrip scaling', () => {
    expect(multiplyDice('1d10', 3)).toBe('3d10');
  });

  it('appends signed modifiers', () => {
    expect(withModifier('1d8', 3)).toBe('1d8+3');
    expect(withModifier('1d8', -1)).toBe('1d8-1');
    expect(withModifier('1d8', 0)).toBe('1d8');
  });
});
