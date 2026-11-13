// Extra Attack and fighting with two Light weapons (PHB 2024 / SRD 5.2.1): Extra Attack makes the
// Attack action two attacks; attacking with a Light weapon opens one extra attack with a different
// Light weapon (a Bonus Action, or part of the Attack action with Nick), with no ability modifier
// on its damage unless it's negative or the Two-Weapon Fighting style adds it.
import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { applyLevelUp, planLevelUp } from './leveling';
import { blankFeature, emptyTurn, normalizeCharacter } from './model';
import { attacksPerAction, hasNick, isLight, lightExtraDamageBonus, weaponDamageBonus } from './rules';
import { readGameState } from './gamestate';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import type { Catalog } from './srd';

const cat = { classes, subclasses, feats, spells, creatures, items } as unknown as Catalog;

describe('Extra Attack', () => {
  it('is one attack per Attack action at Ranger 4, and two once Level up reaches Ranger 5', () => {
    const c = buildAnaurys(cat);
    expect(attacksPerAction(c)).toEqual({ count: 1, from: '' });
    const plan = planLevelUp(c, cat, 'ranger')!;
    expect(plan.classLevel).toBe(5);
    applyLevelUp(c, cat, plan, { hpRoll: null, spells: [] });
    expect(c.features.some((f) => f.name === 'Extra Attack')).toBe(true);
    expect(attacksPerAction(c)).toEqual({ count: 2, from: 'Extra Attack' });
  });

  it('counts a hand-added Extra Attack, and the Fighter’s best without adding them up', () => {
    const c = buildAnaurys(cat);
    c.features.push(blankFeature({ name: 'Extra Attack' }));
    expect(attacksPerAction(c).count).toBe(2);
    c.features.push(blankFeature({ name: 'Two Extra Attacks' }));
    expect(attacksPerAction(c)).toEqual({ count: 3, from: 'Two Extra Attacks' });
    c.features.push(blankFeature({ name: 'Three Extra Attacks' }));
    expect(attacksPerAction(c).count).toBe(4);
  });
});

describe('Two Light weapons', () => {
  const c = buildAnaurys(cat);
  const [bow, scimitar, offHand] = c.weapons;

  it('knows which weapons are Light and which have Nick set', () => {
    expect(isLight(bow)).toBe(false);
    expect(isLight(scimitar) && isLight(offHand)).toBe(true);
    // He swapped the Longsword (Sap) on his sheet for the Scimitar (Nick).
    expect(hasNick(scimitar) && hasNick(offHand)).toBe(true);
    expect(c.features.some((f) => f.name === 'Weapon Masteries: Shortbow (Vex), Scimitar (Nick)')).toBe(true);
    expect(hasNick({ ...offHand, mastery: '' })).toBe(false);
  });

  it('leaves Dexterity off the extra attack’s damage, unless Two-Weapon Fighting adds it', () => {
    expect(weaponDamageBonus(c, scimitar)).toBe(3);
    expect(lightExtraDamageBonus(c, offHand)).toMatchObject({ bonus: 0, addsMod: false });
    const twf = { ...c, features: [...c.features, blankFeature({ name: 'Fighting Style: Two-Weapon Fighting' })] };
    expect(lightExtraDamageBonus(twf, offHand)).toMatchObject({ bonus: 3, addsMod: true });
    const plain = { ...c, features: [...c.features, blankFeature({ name: 'Two-Weapon Fighting' })] };
    expect(lightExtraDamageBonus(plain, offHand).bonus).toBe(3);
  });

  it('keeps a negative modifier, and adds a magic weapon’s bonus either way', () => {
    const weak = { ...c, abilities: { ...c.abilities, dex: 8, str: 6 } };
    expect(lightExtraDamageBonus(weak, offHand)).toMatchObject({ bonus: -1, addsMod: true });
    expect(lightExtraDamageBonus(c, { ...offHand, magicBonus: 1 }).bonus).toBe(1);
  });

  it('keeps this turn’s attacks through a save, a reload and a game state, repairing bad ones', () => {
    const turn = { ...emptyTurn(), action: true, attacks: 1, lightWith: [scimitar.id] };
    const again = normalizeCharacter(JSON.parse(JSON.stringify({ ...c, turn })));
    expect(again.turn).toMatchObject({ attacks: 1, lightWith: [scimitar.id], lightExtra: false });
    const old = normalizeCharacter(JSON.parse(JSON.stringify({ ...c, turn: { action: true, bonus: false, reaction: false, movementUsed: 0, dashes: 0 } })));
    expect(old.turn).toMatchObject({ attacks: 0, lightWith: [], lightExtra: false });
    const broken = normalizeCharacter(JSON.parse(JSON.stringify({ ...c, turn: { ...turn, lightWith: 'nope' } })));
    expect(broken.turn.lightWith).toEqual([]);
    const g = readGameState({ state: { turn: { ...turn, lightExtra: true, lightWith: [scimitar.id, 7] } } });
    expect(g.state.turn).toMatchObject({ attacks: 1, lightWith: [scimitar.id], lightExtra: true });
  });
});
