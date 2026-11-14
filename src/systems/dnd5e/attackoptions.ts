// The features that change how you attack, as switches in the Attacks panel: Extra Attack, the
// Two-Weapon Fighting style and the Nick mastery. Each is a real feature (or a weapon's mastery)
// on the sheet, so the attack rolls, the Action button and the battle all follow it. How they
// stack, by the 2024 rules (SRD 5.2.1):
// - Extra Attack: the Attack action is two attacks (three or four for a Fighter's later levels).
// - Light: having attacked with a Light weapon, one extra attack with a different Light weapon,
//   once per turn, as a Bonus Action, without your ability modifier on its damage.
// - Nick: that extra attack is part of the Attack action instead (still once per turn).
// - Two-Weapon Fighting: that extra attack adds your ability modifier to its damage. No attacks.

import { WEAPONS } from './data';
import { blankFeature, type Character, type Weapon } from './model';
import { attacksPerAction, hasFightingStyle, hasNick, isLight } from './rules';

/** Where a feature turned on from the Attacks panel says it came from. */
export const SWITCHED_ON = 'Turned on in Attacks';

const EXTRA_ATTACK_RULE = 'You can attack twice instead of once whenever you take the Attack action on your turn.';
const TWF_RULE =
  'Fighting Style. When you make an extra attack as a result of using a weapon that has the Light property, you can add your ability modifier to the damage of that attack if you aren’t already adding it to the damage.';

/** The feature that gives Extra Attack (the best one), or null. */
export function extraAttackFeature(c: Pick<Character, 'features'>) {
  const from = attacksPerAction(c as Character).from;
  return from ? (c.features.find((f) => f.name.trim() === from) ?? null) : null;
}

/** Turns Extra Attack on (as a feature) or off (only one turned on here: a class's stays). */
export function setExtraAttack(d: Character, on: boolean) {
  if (on && attacksPerAction(d).count === 1) d.features.push(blankFeature({ name: 'Extra Attack', source: SWITCHED_ON, description: EXTRA_ATTACK_RULE, usesMax: null, recharge: 'none' }));
  if (!on) d.features = d.features.filter((f) => !(f.source === SWITCHED_ON && /^extra attack\b/i.test(f.name.trim())));
}

export const hasTwoWeaponFighting = (c: Character) => hasFightingStyle(c, 'two-weapon fighting');

/** Turns the Two-Weapon Fighting style on or off. */
export function setTwoWeaponFighting(d: Character, on: boolean) {
  if (on && !hasTwoWeaponFighting(d)) d.features.push(blankFeature({ name: 'Fighting Style: Two-Weapon Fighting', source: SWITCHED_ON, description: TWF_RULE, usesMax: null, recharge: 'none' }));
  if (!on) d.features = d.features.filter((f) => !/^(?:fighting style\s*[:(-]\s*)?two-weapon fighting\)?$/i.test(f.name.trim()));
}

/** The base weapon a weapon is ("Scimitar (off hand)" is a Scimitar). */
const baseOf = (w: Weapon) => WEAPONS.find((x) => w.name.trim().toLowerCase().startsWith(x.name.toLowerCase()));

/** Light weapons whose mastery property is Nick (whether or not you use it now). */
export const nickWeapons = (c: Pick<Character, 'weapons'>) => c.weapons.filter((w) => isLight(w) && (hasNick(w) || baseOf(w)?.mastery === 'Nick'));

/** Uses (or stops using) the Nick mastery of those weapons. */
export function setNick(d: Character, on: boolean) {
  for (const w of nickWeapons(d)) w.mastery = on ? 'Nick' : '';
}

/** Your turn's attacks, in words, and how many: what the switches add up to. */
export function turnPlan(c: Character): { attacks: number; light: 'none' | 'bonus' | 'nick'; twf: boolean; text: string } {
  const per = attacksPerAction(c);
  const lights = c.weapons.filter(isLight);
  const light = lights.length < 2 ? 'none' : lights.some(hasNick) ? 'nick' : 'bonus';
  const twf = hasTwoWeaponFighting(c);
  // Dual Wielder (a feat): one more swing as a Bonus Action, with a different one-handed melee
  // weapon. Only with Nick is the Bonus Action still free for it.
  const dual = c.features.some((f) => /^(?:feat\s*:\s*)?dual wielder$/i.test(f.name.trim()));
  const dualSwing = dual && light === 'nick';
  const attacks = per.count + (light === 'none' ? 0 : 1) + (dualSwing ? 1 : 0);
  const action = per.count === 1 ? 'Your Attack action is one attack' : `Your Attack action is ${per.count} attacks (${per.from})`;
  const extra =
    light === 'nick'
      ? `, plus the Nick swing with your other Light weapon in the same action: ${attacks} attacks, and your Bonus Action stays free`
      : light === 'bonus'
        ? `, plus one off-hand swing with your other Light weapon as your Bonus Action: ${attacks} attacks`
        : '';
  const damage = light === 'none' ? '' : twf ? ' The off-hand swing adds your modifier to its damage (Two-Weapon Fighting).' : ' The off-hand swing deals its dice without your modifier (Two-Weapon Fighting would add it).';
  const dw = !dual
    ? ''
    : dualSwing
      ? ` Dual Wielder: one more swing as your Bonus Action with a different one-handed melee weapon, ${attacks} attacks in all (and no Bonus Action left for anything else).`
      : light === 'bonus'
        ? ' Dual Wielder’s Bonus Action swing and the off-hand swing both need your one Bonus Action: one or the other.'
        : '';
  return { attacks, light, twf, text: `${action}${dualSwing ? extra.replace(', and your Bonus Action stays free', '') : extra}.${damage}${dw}` };
}
