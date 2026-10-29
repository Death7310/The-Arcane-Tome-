import { beforeAll, describe, expect, it } from 'vitest';
import { evalFormula } from './formula';
import { blankCharacter, type Character } from './model';
import { loadSrd, type Catalog } from './srd';
import { companionFromCreature, parseStatBlock, pbForCr, tokenize } from './statblock';

let cat: Catalog;
let ranger: Character;
beforeAll(async () => {
  cat = await loadSrd();
  ranger = blankCharacter();
  ranger.abilities.wis = 16;
  ranger.classes[0] = { ...ranger.classes[0], classId: 'ranger', level: 7 };
  ranger.spellcasting.ability = 'wis';
});

describe('formulas over your stats', () => {
  it('fills in your numbers and does the arithmetic', () => {
    // Level 7: Proficiency Bonus +3; Wisdom 16: +3; spell attack +6, save DC 14.
    expect(evalFormula('13 + {PB}', ranger)).toBe(16);
    expect(evalFormula('5 + 5 * {LEVEL:ranger}', ranger)).toBe(40);
    expect(evalFormula('5 + 5 × {LEVEL:ranger}', ranger)).toBe(40);
    expect(evalFormula('{SPELLATK}', ranger)).toBe(6);
    expect(evalFormula('{SPELLDC}', ranger)).toBe(14);
    expect(evalFormula('max(1, {WIS}) + floor({LEVEL} / 2)', ranger)).toBe(6);
    expect(evalFormula('{LEVEL:wizard}', ranger)).toBe(0);
  });

  it('refuses anything that isn’t arithmetic', () => {
    expect(evalFormula('alert(1)', ranger)).toBeNull();
    expect(evalFormula('2 +', ranger)).toBeNull();
    expect(evalFormula('', ranger)).toBeNull();
  });

  it('turns owner phrases into tokens', () => {
    expect(tokenize('13 plus your Proficiency Bonus')).toBe('13 + {PB}');
    expect(tokenize('5 + five times your Ranger level')).toBe('5 + 5 * {LEVEL:ranger}');
    expect(tokenize('equals your spell save DC')).toBe('{SPELLDC}');
  });
});

describe('reading a pasted stat block', () => {
  it('reads a 2014-style block', () => {
    const c = parseStatBlock(`Ember Hound
Medium Monstrosity, unaligned
Armor Class 13 (natural armor)
Hit Points 22 (4d8 + 4)
Speed 40 ft.
STR DEX CON INT WIS CHA
14 (+2) 15 (+2) 12 (+1) 3 (-4) 12 (+1) 6 (-2)
Skills Perception +3, Stealth +4
Senses passive Perception 13
Languages —
Challenge 1 (200 XP)
Keen Smell. The hound has advantage on Wisdom (Perception) checks that rely on smell.
Actions
Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage.
Fire Breath (Recharge 5-6). The hound exhales fire in a 15-foot cone. Each creature in that area must make a DC 11 Dexterity saving throw, taking 10 (3d6) fire damage on a failed save, or half as much on a success.`)!;
    expect(c).toMatchObject({ name: 'Ember Hound', size: 'Medium', type: 'Monstrosity', ac: '13', maxHp: '22', hp: 22, speed: '40 ft.', cr: '1', pb: '2' });
    expect(c.abilities).toEqual({ str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 });
    expect(c.actions.map((a) => [a.name, a.kind])).toEqual([
      ['Keen Smell', 'trait'],
      ['Bite', 'action'],
      ['Fire Breath (Recharge 5-6)', 'action'],
    ]);
    expect(c.actions[1]).toMatchObject({ attack: 'melee', toHit: '4', reach: 'reach 5 ft', damage: '2d4 + 2', damageType: 'piercing' });
    expect(c.actions[2]).toMatchObject({ save: 'dex', dc: '11', damage: '3d6', damageType: 'fire' });
  });

  it('reads a 2024-style companion that scales with you', () => {
    const c = parseStatBlock(`Thornling
Small Plant, Neutral
AC 13 plus your Proficiency Bonus
HP 5 + five times your Ranger level (the thornling has a number of Hit Dice [d6s] equal to your Ranger level)
Speed 30 ft., Climb 30 ft.
STR 12 DEX 14 CON 14 INT 6 WIS 12 CHA 6
Senses Darkvision 60 ft., Passive Perception 11
Languages Understands the languages you know
Actions
Lash. Melee Attack Roll: Bonus equals your spell attack modifier, reach 10 ft. Hit: 1d8 + 2 plus your Proficiency Bonus Piercing damage.
Bonus Actions
Spore Cloud. Constitution Saving Throw: DC equals your spell save DC, each creature in a 5-foot Emanation. Failure: 1d6 Poison damage.`)!;
    expect(c.ac).toBe('13 + {PB}');
    expect(c.maxHp).toBe('5 + 5 * {LEVEL:ranger}');
    expect(evalFormula(c.ac, ranger)).toBe(16);
    expect(evalFormula(c.maxHp, ranger)).toBe(40);
    expect(c.abilities).toEqual({ str: 12, dex: 14, con: 14, int: 6, wis: 12, cha: 6 });
    const [lash, spores] = c.actions;
    expect(lash).toMatchObject({ kind: 'action', attack: 'melee', toHit: '{SPELLATK}', reach: 'reach 10 ft', damage: '1d8 + 2 + {PB}', damageType: 'piercing' });
    expect(evalFormula(lash.toHit, ranger)).toBe(6);
    expect(spores).toMatchObject({ kind: 'bonus', save: 'con', dc: '{SPELLDC}', damage: '1d6', damageType: 'poison' });
  });

  it('says no to text that isn’t a stat block', () => {
    expect(parseStatBlock('Just some notes about my character.\nNothing here.\nReally.')).toBeNull();
  });
});

describe('companions from the SRD', () => {
  it('turns a creature into a ready-to-roll companion', () => {
    const owl = cat.creatures.find((c) => c.name === 'Owl')!;
    const c = companionFromCreature(owl);
    expect(c.name).toBe('Owl');
    const talons = c.actions.find((a) => /talon/i.test(a.name))!;
    expect(talons.attack).toBe('melee');
    expect(Number(talons.toHit)).toBeGreaterThan(0);
    expect(talons.damage).not.toBe('');
    const homunculus = companionFromCreature(cat.creatures.find((c) => c.name === 'Homunculus')!);
    expect(homunculus.actions.find((a) => a.name === 'Bite')).toMatchObject({ attack: 'melee', toHit: '4', save: 'con', dc: '12' });
  });

  it('uses the CR proficiency table', () => {
    expect([0, 4, 5, 9, 13, 17, 21, 30].map(pbForCr)).toEqual([2, 2, 3, 4, 5, 6, 7, 9]);
  });
});
