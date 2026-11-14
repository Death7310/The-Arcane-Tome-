import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { EXTRA_FEATS, EXTRA_SPECIES, EXTRA_SUBCLASSES } from './extras';
import { blankCharacter, normalizeCharacter, readSpeciesPick, type Character, type SpeciesPick } from './model';
import { applyHeritage, blendBalance, clearHeritage, heritageName, heritageStats, partName, pickedTraits, singlePick, syncHeritage } from './species';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import species from './srd/species.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import type { Catalog, SpeciesDef } from './srd';

const cat = {
  classes,
  subclasses: [...subclasses, ...EXTRA_SUBCLASSES],
  feats: [...feats, ...EXTRA_FEATS],
  spells,
  creatures,
  items,
  species: [...(species as unknown as SpeciesDef[]), ...EXTRA_SPECIES],
} as unknown as Catalog;

const at = (level: number): Character => {
  const c = blankCharacter();
  c.classes[0].level = level;
  return c;
};
const feature = (c: Character, name: string) => c.features.find((f) => f.name === name);
const spell = (c: Character, name: string) => c.spells.find((s) => s.name === name);

describe('the species in the free rules, and Aasimar', () => {
  it('has the SRD’s nine with their lineages, and Aasimar from the 2024 book', () => {
    expect(cat.species!.map((s) => s.name)).toEqual(['Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling', 'Aasimar']);
    expect(cat.species!.reduce((a, s) => a + s.lineages.length, 0)).toBe(24);
    expect(cat.species!.find((s) => s.id === 'aasimar')!.source).toBe("Player's Handbook (2024)");
  });

  it('names a side for its lineage', () => {
    const sp = (id: string) => cat.species!.find((s) => s.id === id)!;
    const lin = (s: string, l: string) => sp(s).lineages.find((x) => x.id === l);
    expect(partName(sp('elf'), lin('elf', 'drow'))).toBe('Drow');
    expect(partName(sp('elf'), lin('elf', 'high-elf'))).toBe('High Elf');
    expect(partName(sp('dragonborn'), lin('dragonborn', 'red-dragon'))).toBe('Red Dragonborn');
    expect(partName(sp('goliath'), lin('goliath', 'fire-giant'))).toBe('Fire Goliath');
    expect(partName(sp('tiefling'), lin('tiefling', 'infernal'))).toBe('Infernal Tiefling');
  });
});

describe('taking a species', () => {
  it('a Drow: its traits, Darkvision 120, Dancing Lights now and Faerie Fire at level 3', () => {
    const c = at(1);
    applyHeritage(c, cat, singlePick('elf', 'drow', 'cha'));
    expect(c).toMatchObject({ species: 'Drow', speed: 30, size: 'Medium' });
    expect(c.features.filter((f) => f.origin?.kind === 'species').map((f) => f.name)).toEqual(['Darkvision', 'Elven Lineage', 'Fey Ancestry', 'Keen Senses', 'Trance']);
    expect(feature(c, 'Darkvision')!.description).toBe('You have Darkvision with a range of 120 feet.');
    expect(feature(c, 'Elven Lineage')!.description).toContain('***Drow.***');
    expect(spell(c, 'Dancing Lights')).toMatchObject({ abilityOverride: 'cha', grantedBy: 'feat:Drow' });
    expect(spell(c, 'Faerie Fire')).toBeUndefined();
    c.classes[0].level = 3;
    syncHeritage(c, cat);
    expect(spell(c, 'Faerie Fire')).toBeDefined();
    expect(feature(c, 'Faerie Fire: free cast')).toMatchObject({ usesMax: 1, recharge: 'long' });
    expect(spell(c, 'Darkness')).toBeUndefined();
  });

  it('a Dwarf’s extra Hit Points come off again when it’s swapped for a Wood Elf (Speed 35)', () => {
    const c = at(1);
    applyHeritage(c, cat, singlePick('dwarf'));
    expect(c.bonus.hpPerLevel).toBe(1);
    expect(feature(c, 'Stonecunning')).toMatchObject({ usesMax: 'pb', recharge: 'long', castingTime: 'bonus' });
    applyHeritage(c, cat, singlePick('elf', 'wood-elf', 'wis'));
    expect(c.bonus.hpPerLevel).toBe(0);
    expect(feature(c, 'Stonecunning')).toBeUndefined();
    expect(c).toMatchObject({ species: 'Wood Elf', speed: 35 });
    expect(spell(c, 'Druidcraft')).toBeDefined();
  });

  it('a Red Dragonborn breathes fire, harder at level 5, and resists it', () => {
    const c = at(1);
    applyHeritage(c, cat, singlePick('dragonborn', 'red-dragon'));
    expect(feature(c, 'Breath Weapon (Fire)')).toMatchObject({ roll: '1d10', rollKind: 'damage', usesMax: 'pb', element: 'fire' });
    expect(feature(c, 'Damage Resistance (Fire)')!.description).toMatch(/^You have Resistance to Fire damage/);
    c.classes[0].level = 5;
    syncHeritage(c, cat);
    expect(feature(c, 'Breath Weapon (Fire)')!.roll).toBe('2d10');
  });

  it('a Human or Tiefling can be Small; a Forest Gnome speaks with animals free, Proficiency Bonus times', () => {
    const c = at(1);
    applyHeritage(c, cat, { ...singlePick('tiefling', 'infernal', 'cha'), size: 'Small' });
    expect(c).toMatchObject({ species: 'Infernal Tiefling', size: 'Small' });
    expect(['Fire Bolt', 'Thaumaturgy'].every((n) => spell(c, n))).toBe(true);
    applyHeritage(c, cat, singlePick('gnome', 'forest-gnome', 'int'));
    expect(c.size).toBe('Small');
    expect(spell(c, 'Fire Bolt')).toBeUndefined();
    expect(feature(c, 'Speak with Animals: free cast')).toMatchObject({ usesMax: 'pb' });
  });

  it('replaces the Aasimar traits a sheet had from before, keeping spells it already knows', () => {
    const c = buildAnaurys(cat);
    const lights = c.spells.filter((s) => s.name === 'Light').length;
    applyHeritage(c, cat, singlePick('aasimar', '', 'cha'));
    expect(c.features.filter((f) => f.source === 'Aasimar').map((f) => f.name)).toEqual(['Celestial Resistance', 'Darkvision', 'Healing Hands', 'Light Bearer', 'Celestial Revelation']);
    expect(feature(c, 'Healing Hands')).toMatchObject({ roll: '{PB}d4', rollKind: 'healing', usesMax: 1 });
    expect(c.spells.filter((s) => s.name === 'Light')).toHaveLength(lights);
  });

  it('clearing a species takes everything it gave', () => {
    const c = at(5);
    applyHeritage(c, cat, singlePick('elf', 'high-elf', 'int'));
    clearHeritage(c);
    expect(c.features).toEqual([]);
    expect(c.spells).toEqual([]);
    expect(c.speciesPick).toBeNull();
  });
});

describe('mixed heritage', () => {
  const aasimarDrow = (rules: SpeciesPick['rules'], traits: string[] = []): SpeciesPick => ({ a: { species: 'aasimar', lineage: '' }, b: { species: 'elf', lineage: 'drow' }, rules, traits, ability: 'cha', size: 'Medium', name: '' });

  it('by the book: one side’s traits, named for both', () => {
    expect(heritageName(cat, aasimarDrow('a'))).toBe('Aasimar–Drow');
    expect(pickedTraits(cat, aasimarDrow('a')).map((t) => t.trait.name)).toEqual(['Celestial Resistance', 'Darkvision', 'Healing Hands', 'Light Bearer', 'Celestial Revelation']);
    const c = at(1);
    applyHeritage(c, cat, aasimarDrow('b'));
    expect(c.species).toBe('Aasimar–Drow');
    expect(feature(c, 'Fey Ancestry')!.source).toBe('Drow');
    expect(spell(c, 'Dancing Lights')).toBeDefined();
    expect(feature(c, 'Healing Hands')).toBeUndefined();
  });

  it('a blend (homebrew): traits from both, one Darkvision at the longer range, and how it compares', () => {
    const pick = aasimarDrow('blend', ['a:celestial-resistance', 'a:healing-hands', 'a:light-bearer', 'b:darkvision', 'b:elven-lineage']);
    expect(heritageStats(cat, pick)).toMatchObject({ darkvision: 120, speed: 30 });
    expect(blendBalance(cat, pick)).toEqual({ taken: 5, usual: 5, over: false });
    expect(blendBalance(cat, { ...pick, traits: [...pick.traits, 'b:fey-ancestry'] }).over).toBe(true);
    const c = at(1);
    applyHeritage(c, cat, pick);
    expect(c.features.filter((f) => f.origin?.kind === 'species').map((f) => `${f.name} (${f.source})`)).toEqual([
      'Celestial Resistance (Aasimar)',
      'Healing Hands (Aasimar)',
      'Light Bearer (Aasimar)',
      'Darkvision (Drow)',
      'Elven Lineage (Drow)',
    ]);
    expect(['Light', 'Dancing Lights'].every((n) => spell(c, n))).toBe(true);
  });

  it('gives the old names to an Elf and a Human, an Orc and a Human, and takes yours', () => {
    const halfElf: SpeciesPick = { a: { species: 'human', lineage: '' }, b: { species: 'elf', lineage: 'high-elf' }, rules: 'b', traits: [], ability: 'int', size: 'Medium', name: '' };
    expect(heritageName(cat, halfElf)).toBe('Half-Elf');
    expect(heritageName(cat, { ...halfElf, b: { species: 'orc', lineage: '' } })).toBe('Half-Orc');
    expect(heritageName(cat, { ...halfElf, name: 'Starborn' })).toBe('Starborn');
  });

  it('keeps the pick through a save, and reads a bad one as none', () => {
    const c = at(1);
    applyHeritage(c, cat, aasimarDrow('b'));
    const again = normalizeCharacter(JSON.parse(JSON.stringify(c)));
    expect(again.speciesPick).toMatchObject({ a: { species: 'aasimar' }, b: { species: 'elf', lineage: 'drow' }, rules: 'b', applied: { name: 'Aasimar–Drow' } });
    expect(readSpeciesPick({ a: 7 })).toBeNull();
    expect(normalizeCharacter({ ...JSON.parse(JSON.stringify(c)), speciesPick: 'elf' }).speciesPick).toBeNull();
  });
});
