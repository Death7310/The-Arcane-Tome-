import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { featureForSheet, levelFor, libraryFeatures, matches, onSheet, usesLine } from './featurelib';
import { applyLevelUp, planLevelUp } from './leveling';
import { attacksPerAction } from './rules';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import { EXTRA_FEATS, EXTRA_SUBCLASSES } from './extras';
import type { Catalog } from './srd';

const cat = { classes, subclasses: [...subclasses, ...EXTRA_SUBCLASSES], feats: [...feats, ...EXTRA_FEATS], spells, creatures, items } as unknown as Catalog;
const all = libraryFeatures(cat);
const find = (name: string, cls: string) => all.find((e) => e.def.name === name && e.classId === cls)!;

describe('the Feature library', () => {
  it('holds every class and subclass feature, the Drakewarden’s too', () => {
    expect(all.length).toBe(225); // 220 in the SRD's classes and subclasses, 5 the Drakewarden's
    expect(new Set(all.map((e) => e.classId)).size).toBe(12);
    expect(find('Rage', 'barbarian').source).toBe('Barbarian 1');
    expect(all.find((e) => e.def.name === 'Drake Companion')).toMatchObject({ className: 'Ranger', subclass: 'Drakewarden', source: 'Drakewarden 3' });
    expect(new Set(all.map((e) => e.key)).size).toBe(all.length);
  });

  it('finds a feature by its name, class or words', () => {
    expect(all.filter((e) => matches(e, 'sneak attack')).map((e) => e.def.name)).toContain('Sneak Attack');
    expect(all.filter((e) => matches(e, 'drakewarden')).length).toBe(5);
  });

  it('puts Rage on a Ranger’s sheet with its uses at the level it arrives, and stays put through Level up', () => {
    const c = buildAnaurys(cat);
    const rage = find('Rage', 'barbarian');
    expect(levelFor(c, rage)).toBe(1);
    expect(usesLine(c, rage)).toBe('2 per Short or Long Rest');
    c.features.push(featureForSheet(c, rage));
    expect(onSheet(c, rage)).toBe('same');
    expect(c.features.at(-1)).toMatchObject({ name: 'Rage', source: 'Barbarian 1', usesMax: 2, recharge: 'short' });
    applyLevelUp(c, cat, planLevelUp(c, cat, 'ranger')!, { hpRoll: null, spells: [] });
    expect(c.features.some((f) => f.name === 'Rage')).toBe(true);
  });

  it('reads a feature of your own class at your level, and Extra Attack from it counts', () => {
    const c = buildAnaurys(cat);
    const ea = find('Extra Attack', 'ranger');
    expect(onSheet(c, ea)).toBeNull();
    c.features.push(featureForSheet(c, ea));
    expect(attacksPerAction(c).count).toBe(2);
    expect(levelFor(c, find('Favored Enemy', 'ranger'))).toBe(4);
  });

  it('has the Dual Wielder feat among the feats', () => {
    const dw = cat.feats.find((f) => f.name === 'Dual Wielder')!;
    expect(dw).toMatchObject({ category: 'general', minLevel: 4, abilities: ['str', 'dex'], source: "Player's Handbook (2024)" });
    expect(dw.text).toContain('Enhanced Dual Wielding');
  });
});
