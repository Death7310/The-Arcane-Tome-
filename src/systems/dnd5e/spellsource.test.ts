// Sources on your spells that aren't your classes, and tidying them: a stray "W" typed by
// mistake, moved to where its spells belong, or renamed.
import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { blankSpell } from './model';
import { customSources, moveSource, onSheet, sourceOptions, typedSource } from './spellsource';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import type { Catalog } from './srd';

const cat = { classes, subclasses, feats, spells, creatures, items } as unknown as Catalog;

const withJunk = () => {
  const c = buildAnaurys(cat);
  c.spells.push(blankSpell({ name: 'Hex', level: 1, grantedBy: 'feat:W' }), blankSpell({ name: 'Armor of Agathys', level: 1, grantedBy: 'feat:W' }), blankSpell({ id: 'junk3', name: 'Witch Bolt', level: 1, grantedBy: 'feat:Not set' }));
  return c;
};

describe('tidying spell sources', () => {
  it('lists the sources that aren’t your classes, with their spells, and which are feats on your sheet', () => {
    const list = customSources(withJunk());
    expect(list.find((x) => x.id === 'feat:W')).toMatchObject({ name: 'W', count: 2, feature: false });
    expect(list.find((x) => x.id === 'feat:Not set')).toMatchObject({ count: 1, feature: false });
    expect(list.find((x) => x.id === 'feat:Shadow Touched')?.feature).toBe(true);
    expect(list.some((x) => x.id === 'ranger' || x.id === 'warlock')).toBe(false);
  });

  it('moving a mistaken source’s spells to Warlock takes it off the lists', () => {
    const c = withJunk();
    expect(sourceOptions(c).some((x) => x.id === 'feat:W')).toBe(true);
    expect(moveSource(c, 'feat:W', 'warlock')).toBe(2);
    expect(c.spells.filter((s) => s.grantedBy === 'warlock').map((s) => s.name)).toEqual(expect.arrayContaining(['Hex', 'Armor of Agathys']));
    expect(sourceOptions(c).some((x) => x.id === 'feat:W')).toBe(false);
    expect(customSources(c).some((x) => x.id === 'feat:W')).toBe(false);
  });

  it('to Not set, and renaming', () => {
    const c = withJunk();
    expect(moveSource(c, 'feat:Not set', '')).toBe(1);
    expect(c.spells.find((s) => s.id === 'junk3')!.grantedBy).toBe('');
    expect(moveSource(c, 'feat:W', typedSource(' Warlock Patron '))).toBe(2);
    expect(customSources(c).find((x) => x.id === 'feat:Warlock Patron')?.count).toBe(2);
    expect(typedSource('   ')).toBe('');
  });
});

describe('a source on your sheet goes by its name, loosely', () => {
  it('matches a feature’s longer or shorter name, not a stray letter', () => {
    const c = buildAnaurys(cat);
    expect(onSheet(c, 'Druidic Warrior')).toBe(true);
    expect(onSheet(c, 'Magic Initiate (Wizard)')).toBe(true);
    expect(onSheet(c, 'W')).toBe(false);
    expect(onSheet(c, 'Not set')).toBe(false);
    expect(customSources(withJunk())[0].feature).toBe(false);
  });
});
