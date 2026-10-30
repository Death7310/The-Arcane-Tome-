// A companion's own numbers, worked out like a character's but from its stat block: its
// ability modifiers and Proficiency Bonus (its own, or yours for class companions), its
// AC (worn armor or barding, else the stat block's), attacks with weapons it wields, its
// walking speed, and how much it can carry for its size.

import { ARMOR, type Ability } from './data';
import { evalFormula } from './formula';
import type { Character, Companion, Weapon } from './model';
import { abilityMod, type Breakdown } from './rules';

type Part = Breakdown['parts'][number];

const NAMES: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const sum = (parts: Part[]): Breakdown => ({ total: parts.reduce((a, p) => a + p.value, 0), parts: parts.filter((p) => p.value !== 0) });

export const compMod = (k: Companion, a: Ability) => abilityMod(k.abilities[a]);

/** Its Proficiency Bonus: a number from its stat block, or a formula over yours ("{PB}"). */
export const compPb = (k: Companion, owner: Character) => evalFormula(k.pb, owner) ?? 2;

/** Its Armor Class: worn armor or barding (with its Dexterity, capped as armor caps it), else its stat block's. */
export function companionAc(k: Companion, owner: Character): Breakdown & { worn: string | null } {
  const armor = k.armor ? ARMOR.find((a) => a.id === k.armor!.armorId) : undefined;
  if (k.armor && (armor || k.armor.shield)) {
    const dex = compMod(k, 'dex');
    const parts: Part[] = [];
    if (armor && armor.category !== 'none') {
      parts.push({ label: armor.name, value: armor.base });
      if (armor.category === 'light') parts.push({ label: 'Dexterity', value: dex });
      if (armor.category === 'medium') parts.push({ label: 'Dexterity (max 2)', value: Math.min(2, dex) });
    } else {
      // A shield alone goes on top of its natural armor.
      parts.push({ label: 'Natural armor', value: evalFormula(k.ac, owner) ?? 10 });
    }
    parts.push({ label: 'Armor enchantment', value: k.armor.magicBonus });
    if (k.armor.shield) parts.push({ label: 'Shield', value: 2 });
    const worn = [armor && armor.category !== 'none' ? armor.name : '', k.armor.shield ? 'Shield' : ''].filter(Boolean).join(' and ');
    return { ...sum(parts), worn };
  }
  const total = evalFormula(k.ac, owner) ?? 10;
  return { total, parts: [{ label: 'Stat block', value: total }], worn: null };
}

/** The ability it attacks with: DEX for ranged, the better of the two for finesse, else STR. */
export function compWeaponAbility(k: Companion, w: Weapon): Ability {
  if (w.ability !== 'auto') return w.ability;
  if (w.finesse) return compMod(k, 'dex') >= compMod(k, 'str') ? 'dex' : 'str';
  return w.ranged ? 'dex' : 'str';
}

/** Its attack bonus with a weapon it wields: its modifier, its Proficiency Bonus and the weapon's magic. */
export function companionWeaponAttack(k: Companion, w: Weapon, owner: Character): Breakdown {
  const a = compWeaponAbility(k, w);
  return sum([
    { label: `${NAMES[a]} modifier`, value: compMod(k, a) },
    { label: 'Proficiency', value: w.proficient ? compPb(k, owner) : 0 },
    { label: 'Magic weapon', value: w.magicBonus },
  ]);
}

/** Its walking speed in feet: the first number in "40 ft., Fly 60 ft.". */
export const walkSpeed = (k: Companion): number => Number(/(\d+)/.exec(k.speed)?.[1] ?? 30);

/** 2024 rules: carry 15 × STR; Tiny halves it; each size above Medium doubles it. */
export function carryingCapacity(k: Companion): number {
  const size = k.size.toLowerCase();
  const factor = /tiny/.test(size) ? 0.5 : /gargantuan/.test(size) ? 8 : /huge/.test(size) ? 4 : /large/.test(size) ? 2 : 1;
  return Math.round(k.abilities.str * 15 * factor);
}

export const carriedWeight = (k: Companion): number => Math.round(k.inventory.reduce((a, i) => a + i.qty * i.weight, 0) * 100) / 100;
