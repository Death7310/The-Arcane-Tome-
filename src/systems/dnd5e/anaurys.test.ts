import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { availableBoosts, companionAc } from './companion';
import { evalFormula } from './formula';
import { normalizeCharacter } from './model';
import { armorClass, initiative, inventoryWeight, maxHp, pactSlots, passive, savingThrow, skillCheck, spellAttack, spellSaveDc, spellSlots, usesMax, weaponAttack } from './rules';
import { freeCastSources, sourceName } from './spellsource';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import type { Catalog } from './srd';

const cat = { classes, subclasses, feats, spells, creatures, items } as unknown as Catalog;

// Every expectation below is a number printed on the D&D Beyond sheet.
describe('Anaurys matches his D&D Beyond sheet', () => {
  const c = buildAnaurys(cat);
  const spell = (name: string) => c.spells.find((s) => s.name === name)!;

  it('has the sheet’s core numbers', () => {
    expect(armorClass(c).total).toBe(15);
    expect(maxHp(c).total).toBe(32);
    expect(initiative(c).total).toBe(3);
    expect(passive(c, 'perception').total).toBe(16);
    expect(passive(c, 'insight').total).toBe(13);
    expect(passive(c, 'investigation').total).toBe(13);
    expect(skillCheck(c, 'stealth').total).toBe(9);
    expect(skillCheck(c, 'survival').total).toBe(6);
    expect(skillCheck(c, 'arcana').total).toBe(3);
    expect(savingThrow(c, 'str').total).toBe(2);
    expect(savingThrow(c, 'dex').total).toBe(6);
    expect(savingThrow(c, 'con').total).toBe(-1);
    // The sheet's 131.5 lb, with his second scimitar (3 lb) in place of the shortsword (2 lb).
    expect(inventoryWeight(c)).toBe(132.5);
  });

  it('casts each spell with its source’s ability: Wisdom 14 / +6, Charisma 13 / +5', () => {
    expect(spellSaveDc(c, spell('Toll the Dead')).total).toBe(14);
    expect(spellAttack(c, spell('Ray of Frost')).total).toBe(6);
    expect(spellAttack(c, spell('Primal Savagery')).total).toBe(6);
    expect(spellAttack(c, spell('Ray of Sickness')).total).toBe(6);
    expect(spellAttack(c, spell('Eldritch Blast')).total).toBe(5);
    expect(spellAttack(c, spell('Chill Touch')).total).toBe(5);
    expect(spellSaveDc(c, spell('Hellish Rebuke')).total).toBe(13);
    expect(spellSaveDc(c, spell('Light')).total).toBe(13);
    expect(sourceName(c, spell('Toll the Dead').grantedBy)).toBe('Magic Initiate (Wizard)');
    expect(sourceName(c, spell('Invisibility').grantedBy)).toBe('Shadow Touched');
    expect(sourceName(c, spell('Guidance').grantedBy)).toBe('Druidic Warrior');
  });

  it('has 3 first-level slots and 2 Pact Magic slots', () => {
    expect(spellSlots(c)[0]).toBe(3);
    expect(spellSlots(c)[1] ?? 0).toBe(0);
    expect(pactSlots(c)).toEqual({ count: 2, level: 1 });
  });

  it('gets the Ranger and Warlock features from the rules, with Favored Enemy’s two free Hunter’s Marks', () => {
    const names = c.features.map((f) => f.name);
    for (const n of ['Favored Enemy', 'Weapon Mastery', 'Deft Explorer', 'Fighting Style', 'Eldritch Invocations', 'Magical Cunning']) expect(names).toContain(n);
    expect(names.filter((n) => n === 'Favored Enemy')).toHaveLength(1);
    expect(freeCastSources(c, { name: "Hunter's Mark" })).toEqual([expect.objectContaining({ name: 'Favored Enemy', left: 2, max: 2 })]);
    expect(freeCastSources(c, { name: 'Ray of Sickness' }).map((s) => s.name)).toEqual(['Shadow Touched', 'Magic Initiate (Wizard)']);
    expect(freeCastSources(c, { name: 'Invisibility' })).toHaveLength(1);
    expect(c.features.find((f) => f.name === 'Background: Haunted One')?.description).toMatch(/Heart of Darkness/);
    const revelation = c.features.find((f) => f.name.startsWith('Celestial Revelation'))!;
    expect(usesMax(c, revelation)).toBe(1);
  });

  it('brings Artex: AC 17, 25 HP, Bite +6, Infused Strikes adding 1d6 poison', () => {
    const artex = c.companions[0];
    expect(artex.name).toBe('Artex');
    expect(companionAc(artex, c).total).toBe(17);
    expect(evalFormula(artex.maxHp, c)).toBe(25);
    expect(evalFormula(artex.actions.find((a) => a.name === 'Bite')!.toHit, c)).toBe(6);
    expect(availableBoosts(c)[0]).toMatchObject({ dice: '1d6', type: 'poison' });
  });

  it('attacks with the bow and his two scimitars at +6, and survives a save and reload', () => {
    // His sheet lists a Shortsword; he carries two scimitars instead (his own correction).
    expect(c.weapons.map((w) => w.name)).toEqual(['Dragon Wing Shortbow', 'Scimitar', 'Scimitar (off hand)']);
    for (const w of c.weapons) expect(weaponAttack(c, w).total).toBe(6);
    expect(c.inventory.find((i) => i.name === 'Scimitar')!.qty).toBe(2);
    expect(c.inventory.some((i) => i.name === 'Shortsword')).toBe(false);
    const again = normalizeCharacter(JSON.parse(JSON.stringify(c)));
    expect(again.spells).toHaveLength(c.spells.length);
    expect(again.companions[0].essence).toBe('poison');
    expect(armorClass(again).total).toBe(15);
  });
});
