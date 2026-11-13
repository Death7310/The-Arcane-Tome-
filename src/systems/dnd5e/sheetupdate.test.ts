import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { EXTRA_SUBCLASSES } from './extras';
import { importFromText } from './importer';
import { blankEnemy, blankFeature, blankSpell, type Character } from './model';
import { maxHp } from './rules';
import { applyUpdate, planUpdate, sameName, type SectionId } from './sheetupdate';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import type { Catalog } from './srd';

const cat = { classes, subclasses: [...subclasses, ...EXTRA_SUBCLASSES], feats, spells, creatures, items } as unknown as Catalog;

/** Anaurys as D&D Beyond would export him at level 7 (Ranger 5): new spell, Extra Attack, a WIS bump and the sheet's HP. */
function sheetAt7(base: Character): Character {
  const s = structuredClone(base);
  s.classes.find((k) => k.classId === 'ranger')!.level = 5;
  s.abilities.wis = 18;
  s.hp.maxOverride = 41;
  s.spells.push(blankSpell({ name: 'Lesser Restoration', level: 2 }));
  // The sheet's feature list carries headings and the drake's stat block as well as real features.
  s.features.push(blankFeature({ name: 'Extra Attack', source: 'Ranger 5' }), blankFeature({ name: 'Armor Class' }), blankFeature({ name: 'Bite' }), blankFeature({ name: 'Core Ranger Traits' }));
  s.inventory.find((i) => i.name === 'Arrows')!.qty = 40;
  s.currency.gp = 150;
  return s;
}

describe('updating a character from a newer sheet', () => {
  it('matches names the way sheets write them', () => {
    expect(sameName('Fighting Style', 'Fighting Style: Druidic Warrior')).toBe(true);
    expect(sameName('Weapon Mastery', 'Weapon Masteries: Shortbow (Vex), Longsword (Sap)')).toBe(true);
    expect(sameName('Celestial Revelation', 'Celestial Revelation: Radiant Soul')).toBe(true);
    expect(sameName('Ray of Frost', 'Ray of Sickness')).toBe(false);
    expect(sameName('Extra Attack', 'Extra Attack')).toBe(true);
  });

  it('finds nothing to change when the sheet matches', () => {
    const c = buildAnaurys(cat);
    expect(planUpdate(c, structuredClone(c)).sections).toEqual([]);
  });

  it('lists what a level-up sheet changes, ticking the build and leaving gear, coins and removals for you', () => {
    const c = buildAnaurys(cat);
    const plan = planUpdate(c, sheetAt7(c));
    const by = Object.fromEntries(plan.sections.map((s) => [s.id, s]));
    expect(by.classes.lines).toEqual(['Ranger: 4 → 5']);
    expect(by.abilities.lines).toEqual(['WIS: 17 → 18']);
    expect(by.hp.lines[0]).toMatch(/^Maximum: 32 → 41 \(the sheet’s figure/);
    expect(by.spellsAdd.lines).toEqual(['Lesser Restoration (level 2)']);
    // Headings and the drake's own actions aren't features.
    expect(by.features.lines).toEqual(['Extra Attack']);
    expect([by.items.on, by.coins.on, by.classes.on, by.spellsAdd.on]).toEqual([false, false, true, true]);
    expect(by.spellsRemove).toBeUndefined();
  });

  it('applies the ticked sections and keeps play state, companions and the app’s own details', () => {
    const c = buildAnaurys(cat);
    c.hp.current = 20; // hurt
    c.spellcasting.slotsUsed[0] = 2;
    c.enemies = [blankEnemy({ id: 'g', name: 'Goblin' })];
    const artexId = c.companions[0].id;
    const huntersMark = c.spells.find((s) => s.name === "Hunter's Mark")!;
    const plan = planUpdate(c, sheetAt7(c));
    const on = new Set(plan.sections.filter((s) => s.on).map((s) => s.id));
    const done = applyUpdate(c, plan, on, cat);
    expect(done[0]).toBe('Ranger (Drakewarden) 5 / Warlock 2');
    expect(c.classes.find((k) => k.classId === 'ranger')!.level).toBe(5);
    expect(c.abilities.wis).toBe(18);
    expect(maxHp(c).total).toBe(41);
    // HP gained with the level comes with it; the damage taken stays.
    expect(c.hp.current).toBe(29);
    // Extra Attack arrives once (from the class rules), not twice.
    expect(c.features.filter((f) => f.name === 'Extra Attack')).toHaveLength(1);
    expect(c.features.some((f) => f.name === 'Armor Class' || f.name === 'Bite')).toBe(false);
    expect(c.spells.some((s) => s.name === 'Lesser Restoration')).toBe(true);
    // The app's own spell details are untouched.
    expect(c.spells.find((s) => s.name === "Hunter's Mark")).toEqual(huntersMark);
    expect(c.companions[0].id).toBe(artexId);
    expect(c.spellcasting.slotsUsed[0]).toBe(2);
    expect(c.enemies.map((e) => e.name)).toEqual(['Goblin']);
    // Gear and coins weren't ticked.
    expect(c.inventory.find((i) => i.name === 'Arrows')!.qty).toBe(20);
    expect(c.currency.gp).toBe(21);
  });

  it('takes gear, coins and removals only when ticked', () => {
    const c = buildAnaurys(cat);
    const sheet = sheetAt7(c);
    sheet.spells = sheet.spells.filter((s) => s.name !== 'Alarm');
    const plan = planUpdate(c, sheet);
    expect(plan.sections.find((s) => s.id === 'spellsRemove')).toMatchObject({ on: false, lines: ['Remove Alarm'] });
    applyUpdate(c, plan, new Set<SectionId>(['items', 'coins', 'spellsRemove']), cat);
    expect(c.inventory.find((i) => i.name === 'Arrows')!.qty).toBe(40);
    expect(c.currency.gp).toBe(150);
    expect(c.spells.some((s) => s.name === 'Alarm')).toBe(false);
    // Nothing else was ticked.
    expect(c.classes.find((k) => k.classId === 'ranger')!.level).toBe(4);
  });
});

describe('reading a D&D Beyond sheet', () => {
  const fields = {
    'CLASS  LEVEL': 'Ranger 4 / Warlock 2',
    STR: '8', DEX: '16', CON: '8', INT: '11', WIS: '17', CHA: '15',
    StrProf: '•', 'ST Strength': '+2', DexProf: '•', 'ST Dexterity': '+6', 'ST Wisdom': '+3',
    FeaturesTraits1: '* Ranger Subclass • PHB-2024 120 \n\n   | Drakewarden (FToD) \n\n* Darkvision • MotM 7 \nYou can see in dim light within 60 ft.',
    ProfBonus: '+3',
  };
  // The drake's stat block, printed in the actions box, has saving throws of its own.
  const text = 'Drake Companion • 25 / Other\n• Saving Throws: DEX +4, WIS +5\nSpell Save DC 14\nRay of Frost +6 2d8 Cold V/S';

  it('takes the character’s saves from the form, not the drake’s, finds the subclass, and doesn’t mistake Darkvision for a spell', () => {
    const r = importFromText(text, fields, { spellNames: new Set(['darkvision', 'rayoffrost']) });
    expect(Object.entries(r.character.saveProfs).filter(([, v]) => v).map(([k]) => k)).toEqual(['str', 'dex']);
    expect(r.character.classes.map((k) => [k.classId, k.subclass, k.level])).toEqual([
      ['ranger', 'Drakewarden', 4],
      ['warlock', '', 2],
    ]);
    expect(r.character.spells.map((s) => s.name)).toEqual(['Ray of Frost']);
  });
});
