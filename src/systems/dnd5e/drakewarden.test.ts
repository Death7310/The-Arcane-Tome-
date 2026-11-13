import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { actionDice, actionExtra } from './companion';
import { DRAKEWARDEN, EXTRA_SUBCLASSES } from './extras';
import { applyLevelUp, classSpellLevel, learnableSpells, levelDown, planLevelUp } from './leveling';
import { usesMax } from './rules';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import type { Catalog } from './srd';
import type { Character } from './model';

const cat = { classes, subclasses: [...subclasses, ...EXTRA_SUBCLASSES], feats, spells, creatures, items } as unknown as Catalog;

/** Takes Ranger levels with Level up (average HP, no other choices) until the Ranger is at `to`. */
function rangerTo(c: Character, to: number, spellsAt: Record<number, string[]> = {}) {
  while (c.classes.find((k) => k.classId === 'ranger')!.level < to) {
    const plan = planLevelUp(c, cat, 'ranger')!;
    applyLevelUp(c, cat, plan, { hpRoll: null, ...(plan.asi ? { asi: { dex: 1, wis: 1 } } : {}), spells: spellsAt[plan.classLevel] });
  }
}

const artex = (c: Character) => c.companions[0];
const bite = (c: Character) => artex(c).actions.find((a) => a.name === 'Bite')!;
const feature = (c: Character, name: string) => c.features.find((f) => f.name === name);

describe('levelling a Drakewarden', () => {
  it('knows the subclass, and how high each class casts', () => {
    expect(DRAKEWARDEN.features.map((f) => [f.level, f.name])).toEqual([
      [3, 'Draconic Gift'],
      [3, 'Drake Companion'],
      [7, 'Bond of Fang and Scale'],
      [11, "Drake's Breath"],
      [15, 'Perfected Bond'],
    ]);
    expect([classSpellLevel('ranger', 4), classSpellLevel('ranger', 5), classSpellLevel('warlock', 2), classSpellLevel('warlock', 3), classSpellLevel('wizard', 5)]).toEqual([1, 2, 1, 2, 3]);
  });

  it('Ranger 5 offers a new 2nd-level spell, adds it, and undoing the level removes it', () => {
    const c = buildAnaurys(cat);
    const plan = planLevelUp(c, cat, 'ranger')!;
    expect(plan.learn).toMatchObject({ maxLevel: 2, newLevel: true });
    const options = learnableSpells(c, cat, 'ranger', 2, false);
    const second = options.find((s) => s.level === 2)!;
    expect(options.some((s) => s.name === "Hunter's Mark")).toBe(false); // already on the sheet
    applyLevelUp(c, cat, plan, { hpRoll: null, spells: [second.name] });
    expect(c.spells.find((s) => s.name === second.name)).toMatchObject({ grantedBy: 'ranger', prepared: true, level: 2 });
    expect(c.features.some((f) => f.name === 'Extra Attack')).toBe(true);
    levelDown(c, cat);
    expect(c.spells.some((s) => s.name === second.name)).toBe(false);
  });

  it('Ranger 7 brings Bond of Fang and Scale: Artex grows, flies and bites for an extra 1d6 poison', () => {
    const c = buildAnaurys(cat);
    expect(actionExtra(bite(c), c)).toBe('');
    expect(artex(c)).toMatchObject({ size: 'Small', speed: '40 ft.' });
    rangerTo(c, 7);
    expect(feature(c, 'Bond of Fang and Scale')).toBeTruthy();
    expect(actionExtra(bite(c), c)).toBe('1d6');
    expect(artex(c)).toMatchObject({ size: 'Medium', speed: '40 ft., fly 40 ft. (not while ridden)' });
    // Infused Strikes stays 1d6 (the book changes only the Bite).
    expect(actionDice(artex(c).actions.find((a) => a.name === 'Infused Strikes')!, c)).toBe('1d6');
    // Back down to 6: the bond goes again.
    levelDown(c, cat);
    expect(feature(c, 'Bond of Fang and Scale')).toBeUndefined();
    expect(artex(c)).toMatchObject({ size: 'Small', speed: '40 ft.' });
  });

  it('Ranger 11 adds Drake’s Breath (8d6), and Ranger 15 the Perfected Bond (10d6 breath, 2d6 bite)', () => {
    const c = buildAnaurys(cat);
    rangerTo(c, 11);
    expect(feature(c, "Drake's Breath")).toMatchObject({ roll: '8d6', rollKind: 'damage', usesMax: 1, recharge: 'long' });
    rangerTo(c, 15);
    expect(feature(c, "Drake's Breath")!.roll).toBe('10d6');
    const bond = feature(c, 'Perfected Bond')!;
    expect(usesMax(c, bond)).toBe(6); // Proficiency Bonus at character level 17 (Ranger 15 / Warlock 2)
    expect(actionExtra(bite(c), c)).toBe('2d6');
    expect(artex(c)).toMatchObject({ size: 'Large', speed: '40 ft., fly 40 ft.' });
  });
});
