// A companion's own numbers, worked out like a character's but from its stat block: its
// ability modifiers and Proficiency Bonus (its own, or yours for class companions), its
// AC (worn armor or barding, else the stat block's), attacks with weapons it wields, its
// walking speed, and how much it can carry for its size.

import { ARMOR, type Ability } from './data';
import { evalFormula } from './formula';
import type { Character, Companion, CompanionAction, Weapon } from './model';
import { abilityMod, incapacitatedBy, resolveTokens, totalLevel, type Breakdown } from './rules';

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

// ── Reactions that add damage to a hit (Infused Strikes) ────────────────────

const TYPES = 'acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';

/**
 * Whether an action adds its damage to someone else's hit, and its dice and type as written.
 * Set by hand (boost), or read from a reaction's text: "When another creature … hits … the
 * attack deals an extra 1d6 damage …". The type may be blank when the text leaves it to a
 * choice (a drake's Draconic Essence).
 */
export function boostOf(a: CompanionAction): { dice: string; type: string } | null {
  if (a.boost === false) return null;
  const text = a.text.replace(/\s+/g, ' ');
  const read = new RegExp(`\\bextra\\s+(\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)(?:\\s+(${TYPES}))?\\s+damage`, 'i').exec(text);
  const fromText = a.kind === 'reaction' && /\bhits?\b/i.test(text) && !!read;
  if (!a.boost && !fromText) return null;
  const dice = a.damage.trim() || read?.[1] || '';
  if (!dice) return null;
  return { dice, type: a.damageType || read?.[2]?.toLowerCase() || '' };
}

/** The damage type a companion's action deals: its own, else the companion's element (its essence). */
export const actionType = (comp: Pick<Companion, 'essence'>, a: CompanionAction): string => a.damageType || boostOf(a)?.type || (boostOf(a) ? comp.essence : '') || '';

/** Whether a companion has an element to choose: a reaction that adds to hits, or a Draconic Essence trait. */
export const hasEssence = (comp: Companion): boolean => comp.actions.some((a) => boostOf(a) || /draconic essence/i.test(a.text)) || /draconic essence/i.test(comp.notes);

/** Your level that an action's level steps count: one class's, or your character level. */
export const ownerLevel = (owner: Character, levelOf = '') =>
  levelOf ? owner.classes.filter((k) => k.classId === levelOf).reduce((n, k) => n + k.level, 0) : totalLevel(owner);

/**
 * An action's damage dice as they stand at your level, with your numbers filled in: its level
 * step if one applies, else its damage dice (or, for a boost, the dice its text names).
 */
export function actionDice(a: CompanionAction, owner: Character): string {
  const level = ownerLevel(owner, a.levelOf);
  const step = [...(a.levelDice ?? [])].filter((x) => x.dice.trim() && x.level <= level).sort((x, y) => x.level - y.level).at(-1);
  const base = step?.dice ?? (a.damage.trim() || boostOf(a)?.dice || '');
  return base ? resolveTokens(base, owner).replace(/\s+/g, '') : '';
}

/** An action's extra damage at your level (a drake's Magic Fang), or '' if none applies yet. */
export function actionExtra(a: CompanionAction, owner: Character): string {
  const level = ownerLevel(owner, a.levelOf);
  const step = [...(a.extra ?? [])].filter((x) => x.dice.trim() && x.level <= level).sort((x, y) => x.level - y.level).at(-1);
  return step ? resolveTokens(step.dice, owner).replace(/\s+/g, '') : '';
}

export interface Boost {
  comp: Companion;
  action: CompanionAction;
  dice: string;
  type: string;
  /** Why it can't be used right now, if it can't (its reaction is spent, it's incapacitated, at 0 HP). */
  blocked: string;
}

/** Every reaction your companions could add to a hit, except the attacker's own. */
export function availableBoosts(owner: Character, attackerId = ''): Boost[] {
  const out: Boost[] = [];
  for (const comp of owner.companions) {
    if (comp.id === attackerId) continue;
    for (const action of comp.actions) {
      const b = boostOf(action);
      if (!b) continue;
      const by = incapacitatedBy(comp);
      const blocked = comp.hp <= 0 ? 'at 0 HP' : by ? by : comp.turn.reaction ? 'reaction used' : '';
      out.push({ comp, action, dice: actionDice(action, owner), type: b.type || comp.essence, blocked });
    }
  }
  return out;
}
