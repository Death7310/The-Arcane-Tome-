import { describe, expect, it } from 'vitest';
import { blankCharacter, normalizeCharacter, uid, type Character } from './model';
import {
  abilityMod,
  armorClass,
  initiative,
  maxHp,
  pactSlots,
  passive,
  planSpell,
  proficiencyBonus,
  resolveTokens,
  savingThrow,
  skillCheck,
  speed,
  spellAttack,
  spellSaveDc,
  spellSlots,
  weaponAttack,
} from './rules';
import { sampleCharacter } from './sample';
import { SPELL_LIBRARY } from './spells';

const lib = (name: string) => SPELL_LIBRARY.find((s) => s.name === name)!;

const withClasses = (...entries: [string, number, Character['classes'][number]['casterOverride']?][]): Character => {
  const c = blankCharacter();
  c.classes = entries.map(([classId, level, casterOverride]) => ({ id: uid(), classId, subclass: '', level, hitDiceUsed: 0, casterOverride }));
  return c;
};

describe('core numbers', () => {
  it('ability modifiers follow floor((score − 10) / 2)', () => {
    expect([1, 3, 8, 9, 10, 11, 12, 15, 18, 20, 30].map(abilityMod)).toEqual([-5, -4, -1, -1, 0, 0, 1, 2, 4, 5, 10]);
  });

  it('proficiency bonus rises every four levels', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
});

describe('sample sorcerer (level 5, CHA 18, DEX 14, CON 14)', () => {
  const c = sampleCharacter();
  it('derives combat numbers', () => {
    expect(armorClass(c).total).toBe(16); // Draconic Resilience 10 + 2 + 4
    expect(initiative(c).total).toBe(2);
    expect(maxHp(c).total).toBe(37); // 6 + 4×4 + 2×5 + 1×5
    expect(speed(c).total).toBe(30);
  });

  it('derives saves, skills and passives', () => {
    expect(savingThrow(c, 'cha').total).toBe(7);
    expect(savingThrow(c, 'str').total).toBe(-1);
    expect(skillCheck(c, 'arcana').total).toBe(3);
    expect(skillCheck(c, 'stealth').total).toBe(2);
    expect(passive(c, 'perception').total).toBe(11);
  });

  it('derives spellcasting', () => {
    expect(spellSaveDc(c).total).toBe(15);
    expect(spellAttack(c).total).toBe(7);
    expect(spellSlots(c).slice(0, 4)).toEqual([4, 3, 2, 0]);
  });

  it('scales cantrips and upcasts leveled spells', () => {
    expect(planSpell(c, lib('Fire Bolt'), 0).damage[0].dice).toBe('2d10');
    expect(planSpell(c, lib('Fireball'), 5).damage[0].dice).toBe('10d6');
    expect(planSpell(c, lib('Scorching Ray'), 3).instances).toBe(4);
    expect(planSpell(c, lib('Magic Missile'), 1).instances).toBe(3);
    expect(planSpell(c, lib('Cure Wounds'), 2).healing).toBe('4d8+4');
    expect(planSpell(c, lib('Eldritch Blast'), 0).instances).toBe(2);
  });

  it('applies 2024 exhaustion to d20 tests and speed', () => {
    const tired = { ...c, exhaustion: 2 };
    expect(skillCheck(tired, 'arcana').total).toBe(-1);
    expect(spellAttack(tired).total).toBe(3);
    expect(speed(tired).total).toBe(20);
    expect(spellSaveDc(tired).total).toBe(15); // a DC is not a d20 Test
  });

  it('picks the better ability for finesse weapons', () => {
    expect(weaponAttack(c, c.weapons[0]).total).toBe(5); // DEX +2, PB +3
  });
});

describe('armor', () => {
  it('caps DEX for medium armor and ignores it for heavy', () => {
    const c = blankCharacter();
    c.abilities.dex = 18;
    c.armor = { armorId: 'half_plate', shield: true, magicBonus: 1, unarmored: 'none' };
    expect(armorClass(c).total).toBe(15 + 2 + 1 + 2);
    c.armor.armorId = 'plate';
    expect(armorClass(c).total).toBe(18 + 1 + 2);
  });

  it('slows heavy-armor wearers below the Strength requirement', () => {
    const c = blankCharacter();
    c.abilities.str = 13;
    c.armor.armorId = 'plate';
    expect(speed(c).total).toBe(20);
  });
});

describe('spell slots', () => {
  it('uses the single-class tables', () => {
    expect(spellSlots(withClasses(['wizard', 20])).slice(0, 9)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
    expect(spellSlots(withClasses(['paladin', 1]))[0]).toBe(2);
    expect(spellSlots(withClasses(['paladin', 5])).slice(0, 2)).toEqual([4, 2]);
    expect(spellSlots(withClasses(['fighter', 2, 'third']))[0]).toBe(0);
    expect(spellSlots(withClasses(['fighter', 3, 'third']))[0]).toBe(2);
    expect(spellSlots(withClasses(['fighter', 4, 'third']))[0]).toBe(3);
    expect(spellSlots(withClasses(['barbarian', 10])).every((n) => n === 0)).toBe(true);
  });

  it('combines multiclass caster levels', () => {
    // Wizard 3 + Paladin 3 (rounds up to 2) = caster level 5
    expect(spellSlots(withClasses(['wizard', 3], ['paladin', 3])).slice(0, 3)).toEqual([4, 3, 2]);
  });

  it('keeps pact magic separate', () => {
    const c = withClasses(['warlock', 5], ['sorcerer', 1]);
    expect(pactSlots(c)).toEqual({ count: 2, level: 3 });
    expect(spellSlots(c)[0]).toBe(2);
  });
});

describe('tokens and import', () => {
  it('substitutes character numbers into dice', () => {
    const c = sampleCharacter();
    expect(resolveTokens('{PB}d4', c)).toBe('3d4');
    expect(resolveTokens('2d8+{MOD}', c)).toBe('2d8+4');
    c.abilities.cha = 8;
    expect(resolveTokens('2d8+{MOD}', c)).toBe('2d8-1');
  });

  it('fills gaps in partial saves and rejects non-characters', () => {
    const c = normalizeCharacter({ name: 'Partial', abilities: { str: 16 } });
    expect(c.abilities.str).toBe(16);
    expect(c.abilities.dex).toBe(10);
    expect(c.spellcasting.slotsUsed).toHaveLength(9);
    expect(() => normalizeCharacter('nope')).toThrow();
    expect(() => normalizeCharacter({ system: 'coc7' })).toThrow();
  });
});

describe('backups', async () => {
  const { makeBackup, mergeCharacters, parseImport } = await import('../../state/storage');
  it('round-trips a full backup and a single character', () => {
    const a = sampleCharacter();
    const b = blankCharacter();
    expect(parseImport(JSON.stringify(makeBackup([a, b]))).map((c) => c.name)).toEqual([a.name, b.name]);
    expect(parseImport(JSON.stringify(a))[0].id).toBe(a.id);
    expect(() => parseImport('{oops')).toThrow(/valid JSON/);
  });

  it('keeps whichever copy was edited last', () => {
    const old = { ...sampleCharacter(), updatedAt: 1 };
    const newer = { ...old, name: 'Renamed', updatedAt: 2 };
    expect(mergeCharacters([old], [newer]).characters[0].name).toBe('Renamed');
    const r = mergeCharacters([newer], [old, blankCharacter()]);
    expect(r).toMatchObject({ added: 1, updated: 0, kept: 1 });
    expect(r.characters[0].name).toBe('Renamed');
  });
});
