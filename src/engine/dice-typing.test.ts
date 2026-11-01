// Every half-typed state of a dice formula, as a person types or deletes it, must be safe to
// show and to roll: the sheet works out spell damage while you type, and a throw there blanks
// the screen (the bug: backspacing "1d10" to "1d1" crashed the app).
import { describe, expect, it } from 'vitest';
import { blankCharacter, blankSpell } from '../systems/dnd5e/model';
import { planSpell } from '../systems/dnd5e/rules';
import { addDice, describe as describeRoll, multiplyDice, safeRoll } from './dice';

const FORMULAS = ['1d10', '2d6+3', '1d12+{MOD}', '3d8', '1d4+1', '10d6'];
/** Every prefix of a formula: what's in the field after each keystroke or backspace. */
const prefixes = (f: string) => Array.from({ length: f.length + 1 }, (_, i) => f.slice(0, i));

describe('dice while you type them', () => {
  it('never throws when scaled, upcast or rolled half-typed', () => {
    for (const f of FORMULAS)
      for (const p of prefixes(f)) {
        expect(() => multiplyDice(p, 2), p).not.toThrow();
        expect(() => addDice(p, '1d6', 2), p).not.toThrow();
        expect(() => addDice('1d6', p, 2), p).not.toThrow();
        const r = safeRoll(p);
        expect(Number.isFinite(r.total), p).toBe(true);
        expect(() => describeRoll(r), p).not.toThrow();
      }
  });

  it('says plainly when it can’t read the dice', () => {
    const r = safeRoll('1d1');
    expect(r).toMatchObject({ total: 0, unreadable: '1d1' });
    expect(describeRoll(r)).toMatch(/Can’t read “1d1”/);
    expect(safeRoll('1d6').unreadable).toBeUndefined();
  });

  it('works out a scaling cantrip and an upcast spell at every keystroke', () => {
    const c = blankCharacter();
    c.classes = [{ id: 'd', classId: 'druid', subclass: '', level: 11, hitDiceUsed: 0 }];
    for (const f of FORMULAS)
      for (const p of prefixes(f)) {
        // Primal Savagery: a cantrip whose dice grow at levels 5, 11 and 17.
        const cantrip = blankSpell({ id: 'a', name: 'Primal Savagery', level: 0, resolution: 'attack', scaling: 'cantrip_dice', damage: [{ dice: p, type: 'acid' }] });
        expect(() => planSpell(c, cantrip, 0), p).not.toThrow();
        const upcast = blankSpell({ id: 'b', name: 'Burning Hands', level: 1, resolution: 'save', damage: [{ dice: '3d6', type: 'fire' }], upcastDice: p, healing: '' });
        expect(() => planSpell(c, upcast, 3), p).not.toThrow();
        const heal = blankSpell({ id: 'c', name: 'Cure Wounds', level: 1, resolution: 'heal', damage: [], healing: p, upcastDice: '2d8' });
        expect(() => planSpell(c, heal, 2), p).not.toThrow();
      }
    // Finished dice still scale as before.
    const done = blankSpell({ id: 'a', name: 'Primal Savagery', level: 0, resolution: 'attack', scaling: 'cantrip_dice', damage: [{ dice: '1d10', type: 'acid' }] });
    expect(planSpell(c, done, 0).damage[0].dice).toBe('3d10');
  });
});
