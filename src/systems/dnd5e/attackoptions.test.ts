// The Attack options switches, and how they stack by the 2024 rules: Extra Attack makes the
// Attack action two attacks; the Light property adds one extra attack per turn (Nick puts it in
// the Attack action); the Two-Weapon Fighting style adds damage to that one, not attacks.
import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { extraAttackFeature, hasTwoWeaponFighting, nickWeapons, setExtraAttack, setNick, setTwoWeaponFighting, SWITCHED_ON, turnPlan } from './attackoptions';
import { applyLevelUp, planLevelUp } from './leveling';
import { attacksPerAction, lightExtraDamageBonus } from './rules';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import type { Catalog } from './srd';

const cat = { classes, subclasses, feats, spells, creatures, items } as unknown as Catalog;

describe('Anaurys’s turn, by the rules', () => {
  it('at Ranger 4: one attack plus the Nick swing, 2 in all', () => {
    expect(turnPlan(buildAnaurys(cat))).toMatchObject({ attacks: 2, light: 'nick', twf: false });
  });

  it('at Ranger 5: two attacks plus the Nick swing, 3 in all, with the Bonus Action free', () => {
    const c = buildAnaurys(cat);
    applyLevelUp(c, cat, planLevelUp(c, cat, 'ranger')!, { hpRoll: null, spells: [] });
    const plan = turnPlan(c);
    expect(plan.attacks).toBe(3);
    expect(plan.text).toBe(
      'Your Attack action is 2 attacks (Extra Attack), plus the Nick swing with your other Light weapon in the same action: 3 attacks, and your Bonus Action stays free. The off-hand swing deals its dice without your modifier (Two-Weapon Fighting would add it).',
    );
    // Two-Weapon Fighting adds damage, not attacks.
    setTwoWeaponFighting(c, true);
    expect(turnPlan(c)).toMatchObject({ attacks: 3, twf: true });
    expect(lightExtraDamageBonus(c, c.weapons[2]).bonus).toBe(3);
  });

  it('without Nick, the off-hand swing takes the Bonus Action instead', () => {
    const c = buildAnaurys(cat);
    setNick(c, false);
    expect(turnPlan(c)).toMatchObject({ attacks: 2, light: 'bonus' });
    expect(turnPlan(c).text).toContain('as your Bonus Action');
  });
});

describe('the switches', () => {
  it('Extra Attack: turns on as a feature, and off again, leaving a class’s own alone', () => {
    const c = buildAnaurys(cat);
    setExtraAttack(c, true);
    expect(attacksPerAction(c).count).toBe(2);
    expect(extraAttackFeature(c)!.source).toBe(SWITCHED_ON);
    setExtraAttack(c, true);
    expect(c.features.filter((f) => f.name === 'Extra Attack')).toHaveLength(1);
    setExtraAttack(c, false);
    expect(attacksPerAction(c).count).toBe(1);
    applyLevelUp(c, cat, planLevelUp(c, cat, 'ranger')!, { hpRoll: null, spells: [] });
    setExtraAttack(c, false);
    expect(extraAttackFeature(c)!.source).not.toBe(SWITCHED_ON);
    expect(attacksPerAction(c).count).toBe(2);
  });

  it('Two-Weapon Fighting: on and off, once', () => {
    const c = buildAnaurys(cat);
    expect(hasTwoWeaponFighting(c)).toBe(false);
    setTwoWeaponFighting(c, true);
    setTwoWeaponFighting(c, true);
    expect(c.features.filter((f) => /Two-Weapon Fighting/.test(f.name))).toHaveLength(1);
    expect(hasTwoWeaponFighting(c)).toBe(true);
    setTwoWeaponFighting(c, false);
    expect(hasTwoWeaponFighting(c)).toBe(false);
  });

  it('Nick: the scimitars’ mastery, on and off; a Light weapon without Nick isn’t touched', () => {
    const c = buildAnaurys(cat);
    c.weapons.push({ ...c.weapons[1], id: 'dg', name: 'Handaxe', properties: 'Light, Thrown (20/60)', mastery: 'Vex' });
    expect(nickWeapons(c).map((w) => w.name)).toEqual(['Scimitar', 'Scimitar (off hand)']);
    setNick(c, false);
    expect(c.weapons.map((w) => w.mastery)).toEqual(['Vex', '', '', 'Vex']);
    setNick(c, true);
    expect(c.weapons.map((w) => w.mastery)).toEqual(['Vex', 'Nick', 'Nick', 'Vex']);
  });
});
