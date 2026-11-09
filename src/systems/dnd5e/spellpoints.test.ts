import { describe, expect, it } from 'vitest';
import { blankCharacter, normalizeCharacter, type Character } from './model';
import { casterLevel, pointSlot, SPELL_POINT_COST, SPELL_POINTS_TABLE, spellPoints, spellSlots } from './rules';

const caster = (classes: [string, number][], patch: Partial<Character['spellcasting']> = {}): Character => {
  const c = blankCharacter();
  c.classes = classes.map(([classId, level], i) => ({ id: `k${i}`, classId, subclass: '', level, hitDiceUsed: 0 }));
  c.spellcasting = { ...c.spellcasting, system: 'points', ...patch };
  return c;
};

describe('spell points (Dungeon Master’s Guide variant)', () => {
  it('follows the tables: costs, and points and highest slot by spellcaster level', () => {
    expect(SPELL_POINT_COST.slice(1)).toEqual([2, 3, 5, 6, 7, 9, 10, 11, 13]);
    expect(SPELL_POINTS_TABLE[1]).toEqual([4, 1]);
    expect(SPELL_POINTS_TABLE[5]).toEqual([27, 3]);
    expect(SPELL_POINTS_TABLE[11]).toEqual([73, 6]);
    expect(SPELL_POINTS_TABLE[20]).toEqual([133, 9]);
  });

  it('gives a Ranger 4 / Warlock 2 six points and 1st-level slots, Pact Magic apart', () => {
    const c = caster([['ranger', 4], ['warlock', 2]]);
    expect(casterLevel(c)).toBe(2);
    expect(spellPoints(c)).toEqual({ max: 6, left: 6, maxLevel: 1 });
    // The same budget as its three 1st-level slots.
    expect(spellSlots(c)[0] * SPELL_POINT_COST[1]).toBe(6);
    expect(pointSlot(c, 1)).toMatchObject({ ok: true, cost: 2 });
    expect(pointSlot(c, 2).ok).toBe(false);
  });

  it('halves a paladin’s level (rounding up, as 2024 half casters do) and adds up multiclass casters', () => {
    expect(spellPoints(caster([['paladin', 5]]))).toMatchObject({ max: 14, maxLevel: 2 });
    expect(spellPoints(caster([['wizard', 3], ['cleric', 2]]))).toMatchObject({ max: 27, maxLevel: 3 });
  });

  it('stops at zero, and makes only one slot of each level from 6th up per Long Rest', () => {
    const c = caster([['wizard', 11]], { pointsUsed: 70 });
    expect(spellPoints(c).left).toBe(3);
    expect(pointSlot(c, 2)).toMatchObject({ ok: true, cost: 3 });
    expect(pointSlot(c, 3)).toMatchObject({ ok: false, why: 'Needs 5 points; 3 left' });
    const fresh = caster([['wizard', 11]], { highUsed: [6] });
    expect(pointSlot(fresh, 6)).toMatchObject({ ok: false });
    expect(pointSlot(fresh, 7).why).toMatch(/highest slot is level 6/);
  });

  it('reads saved sheets safely: slots unless points were chosen', () => {
    const old = normalizeCharacter(JSON.parse(JSON.stringify({ ...blankCharacter(), spellcasting: { ability: null, slotsOverride: null, slotsUsed: [1], pactUsed: 0, concentratingOn: null } })));
    expect(old.spellcasting).toMatchObject({ system: 'slots', pointsUsed: 0, highUsed: [] });
    const odd = normalizeCharacter({ ...blankCharacter(), spellcasting: { ...blankCharacter().spellcasting, system: 'mana', pointsUsed: -4, highUsed: [6, 2, 'x', 9] } });
    expect(odd.spellcasting).toMatchObject({ system: 'slots', pointsUsed: 0, highUsed: [6, 9] });
  });
});
