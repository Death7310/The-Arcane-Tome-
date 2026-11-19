// The Attack options switches, and how they stack by the 2024 rules: Extra Attack makes the
// Attack action two attacks; the Light property adds one extra attack per turn (Nick puts it in
// the Attack action); the Two-Weapon Fighting style adds damage to that one, not attacks.
import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { extraAttackFeature, hasTwoWeaponFighting, nickWeapons, setExtraAttack, setNick, setTwoWeaponFighting, SWITCHED_ON, turnPlan } from './attackoptions';
import { applyLevelUp, planLevelUp } from './leveling';
import { attacksPerAction, lightAfterNick, lightExtraDamageBonus } from './rules';
import { blankFeature, normalizeCharacter } from './model';
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

describe('the Dual Wielder feat, if a character takes it', () => {
  it('with Nick: a fourth attack on the Bonus Action; without: the Bonus Action is one or the other', () => {
    const c = buildAnaurys(cat);
    applyLevelUp(c, cat, planLevelUp(c, cat, 'ranger')!, { hpRoll: null, spells: [] });
    c.features.push({ ...c.features[0], id: 'dw', name: 'Dual Wielder', source: 'Feat' });
    expect(turnPlan(c).attacks).toBe(4);
    expect(turnPlan(c).text).toContain('4 attacks in all');
    setNick(c, false);
    expect(turnPlan(c).attacks).toBe(3);
    expect(turnPlan(c).text).toContain('one or the other');
  });
});

describe('your DM’s ruling: an off-hand Bonus Action swing after Nick’s', () => {
  const ranger5 = () => {
    const c = buildAnaurys(cat);
    applyLevelUp(c, cat, planLevelUp(c, cat, 'ranger')!, { hpRoll: null, spells: [] });
    return c;
  };

  it('is off by the rules as written: 3 attacks at Ranger 5', () => {
    const c = ranger5();
    expect(lightAfterNick(c)).toBe(false);
    expect(turnPlan(c)).toMatchObject({ attacks: 3, ruling: false });
  });

  it('on: Extra Attack, the Nick swing and one more off-hand swing as the Bonus Action, 4 attacks', () => {
    const c = ranger5();
    c.rulings = { lightAfterNick: true };
    expect(lightAfterNick(c)).toBe(true);
    const plan = turnPlan(c);
    expect(plan).toMatchObject({ attacks: 4, light: 'nick', ruling: true });
    expect(plan.text).toContain('one more off-hand swing as your Bonus Action by your DM’s ruling: 4 attacks');
    expect(plan.text).toContain('no Bonus Action left');
    expect(plan.text).toContain('this is your table’s ruling');
  });

  it('needs Nick: without it the off-hand swing is the Bonus Action already, so nothing changes', () => {
    const c = ranger5();
    c.rulings = { lightAfterNick: true };
    setNick(c, false);
    expect(lightAfterNick(c)).toBe(false);
    expect(turnPlan(c)).toMatchObject({ attacks: 3, light: 'bonus', ruling: false });
  });

  it('with Dual Wielder too, the two Bonus Action swings are one or the other', () => {
    const c = ranger5();
    c.rulings = { lightAfterNick: true };
    c.features.push(blankFeature({ name: 'Dual Wielder', source: 'Feat', description: '', usesMax: null, recharge: 'none' }));
    expect(turnPlan(c).attacks).toBe(4);
    expect(turnPlan(c).text).toContain('one or the other');
  });

  it('is kept through a save, and reads anything else as off', () => {
    const c = ranger5();
    c.rulings = { lightAfterNick: true };
    expect(normalizeCharacter(JSON.parse(JSON.stringify(c))).rulings).toEqual({ lightAfterNick: true });
    expect(normalizeCharacter({ ...JSON.parse(JSON.stringify(c)), rulings: { lightAfterNick: 'yes' } }).rulings).toEqual({});
  });
});
