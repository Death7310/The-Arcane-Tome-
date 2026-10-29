// Pure rules math for D&D 5e (2024). Every derived number is returned with the
// parts that produced it, so the sheet can show *why* a bonus is what it is.

import { addDice, multiplyDice } from '../../engine/dice';
import {
  ABILITIES,
  ABILITY_NAMES,
  ARMOR,
  FULL_CASTER_SLOTS,
  PACT_SLOTS,
  SKILLS,
  classById,
  type Ability,
  type CasterType,
  type SkillId,
} from './data';
import type { Character, Feature, Spell, UsesFormula, Weapon } from './model';

export interface Part {
  label: string;
  value: number;
}

export interface Breakdown {
  total: number;
  parts: Part[];
}

const sum = (parts: Part[]): Breakdown => ({ total: parts.reduce((a, p) => a + p.value, 0), parts: parts.filter((p) => p.value !== 0) });

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

export const totalLevel = (c: Character): number => Math.max(1, c.classes.reduce((a, k) => a + Math.max(0, k.level), 0));

export const proficiencyBonus = (level: number): number => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);

export const pb = (c: Character): number => proficiencyBonus(totalLevel(c));

export const mod = (c: Character, a: Ability): number => abilityMod(c.abilities[a]);

export const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** 2024 Exhaustion: each level imposes −2 on every d20 Test. */
export const exhaustionPenalty = (c: Character): number => -2 * Math.max(0, Math.min(6, c.exhaustion));

function d20Extras(c: Character, kind: 'save' | 'check'): Part[] {
  return [
    { label: kind === 'save' ? 'Save bonus' : 'Check bonus', value: kind === 'save' ? c.bonus.saves : c.bonus.checks },
    { label: 'Exhaustion', value: exhaustionPenalty(c) },
  ];
}

export function abilityCheck(c: Character, a: Ability): Breakdown {
  const parts: Part[] = [{ label: `${ABILITY_NAMES[a]} modifier`, value: mod(c, a) }];
  if (c.jackOfAllTrades) parts.push({ label: 'Jack of All Trades', value: Math.floor(pb(c) / 2) });
  return sum([...parts, ...d20Extras(c, 'check')]);
}

export function savingThrow(c: Character, a: Ability): Breakdown {
  return sum([
    { label: `${ABILITY_NAMES[a]} modifier`, value: mod(c, a) },
    { label: 'Proficiency', value: c.saveProfs[a] ? pb(c) : 0 },
    ...d20Extras(c, 'save'),
  ]);
}

export function skillProfLevel(c: Character, id: SkillId): number {
  const lvl = c.skills[id] ?? 0;
  if (lvl === 0 && c.jackOfAllTrades) return 0.5;
  return lvl;
}

export function skillCheck(c: Character, id: SkillId): Breakdown {
  const skill = SKILLS.find((s) => s.id === id)!;
  const lvl = skillProfLevel(c, id);
  const label = lvl === 2 ? 'Expertise' : lvl === 1 ? 'Proficiency' : 'Jack of All Trades';
  return sum([
    { label: `${ABILITY_NAMES[skill.ability]} modifier`, value: mod(c, skill.ability) },
    { label, value: Math.floor(pb(c) * lvl) },
    ...d20Extras(c, 'check'),
  ]);
}

export function passive(c: Character, id: SkillId): Breakdown {
  const check = skillCheck(c, id);
  return sum([{ label: 'Base', value: 10 }, ...check.parts]);
}

export function initiative(c: Character): Breakdown {
  return sum([
    { label: 'Dexterity modifier', value: mod(c, 'dex') },
    ...(c.jackOfAllTrades ? [{ label: 'Jack of All Trades', value: Math.floor(pb(c) / 2) }] : []),
    { label: 'Initiative bonus', value: c.bonus.initiative },
    { label: 'Exhaustion', value: exhaustionPenalty(c) },
  ]);
}

export function armorClass(c: Character): Breakdown {
  const armor = ARMOR.find((a) => a.id === c.armor.armorId) ?? ARMOR[0];
  const dex = mod(c, 'dex');
  const parts: Part[] = [];
  if (armor.category === 'none') {
    switch (c.armor.unarmored) {
      case 'barbarian':
        parts.push({ label: 'Base', value: 10 }, { label: 'Dexterity', value: dex }, { label: 'Constitution', value: mod(c, 'con') });
        break;
      case 'monk':
        parts.push({ label: 'Base', value: 10 }, { label: 'Dexterity', value: dex }, { label: 'Wisdom', value: mod(c, 'wis') });
        break;
      case 'draconic':
        parts.push({ label: 'Base', value: 10 }, { label: 'Dexterity', value: dex }, { label: 'Charisma', value: mod(c, 'cha') });
        break;
      case 'mage_armor':
        parts.push({ label: 'Mage Armor', value: 13 }, { label: 'Dexterity', value: dex });
        break;
      default:
        parts.push({ label: 'Base', value: 10 }, { label: 'Dexterity', value: dex });
    }
  } else {
    parts.push({ label: armor.name, value: armor.base });
    if (armor.category === 'light') parts.push({ label: 'Dexterity', value: dex });
    if (armor.category === 'medium') parts.push({ label: 'Dexterity (max 2)', value: Math.min(2, dex) });
  }
  parts.push({ label: 'Armor enchantment', value: c.armor.magicBonus });
  if (c.armor.shield) parts.push({ label: 'Shield', value: 2 });
  parts.push({ label: 'Other AC bonus', value: c.bonus.ac });
  return sum(parts);
}

export function armorWarnings(c: Character): string[] {
  const armor = ARMOR.find((a) => a.id === c.armor.armorId) ?? ARMOR[0];
  const out: string[] = [];
  if (armor.stealthDisadvantage) out.push(`${armor.name} gives Disadvantage on Stealth checks.`);
  if (armor.strength && c.abilities.str < armor.strength)
    out.push(`${armor.name} needs Strength ${armor.strength}; your Speed drops by 10 feet.`);
  return out;
}

export function speed(c: Character): Breakdown {
  const armor = ARMOR.find((a) => a.id === c.armor.armorId) ?? ARMOR[0];
  return sum([
    { label: 'Base speed', value: c.speed },
    { label: 'Speed bonus', value: c.bonus.speed },
    { label: 'Heavy armor (low Strength)', value: armor.strength && c.abilities.str < armor.strength ? -10 : 0 },
    { label: 'Exhaustion', value: -5 * Math.max(0, Math.min(6, c.exhaustion)) },
  ]);
}

export const averageHitDie = (die: number): number => die / 2 + 1;

/** Max HP using the fixed-value option: full hit die at level 1, then the average (rounded up) each level after. */
export function maxHp(c: Character): Breakdown {
  if (c.hp.maxOverride !== null && c.hp.maxOverride > 0) return { total: c.hp.maxOverride, parts: [{ label: 'Set by you', value: c.hp.maxOverride }] };
  const level = totalLevel(c);
  const parts: Part[] = [];
  c.classes.forEach((k, idx) => {
    const die = classById(k.classId).hitDie;
    if (k.level <= 0) return;
    const first = idx === 0 ? die : 0;
    const rest = (idx === 0 ? k.level - 1 : k.level) * averageHitDie(die);
    parts.push({ label: `${classById(k.classId).name} hit dice (d${die})`, value: first + rest });
  });
  parts.push({ label: `Constitution × ${level}`, value: mod(c, 'con') * level });
  parts.push({ label: `Bonus HP × ${level}`, value: c.bonus.hpPerLevel * level });
  const b = sum(parts);
  return { total: Math.max(1, b.total), parts: b.parts };
}

export interface HitDicePool {
  die: number;
  total: number;
  used: number;
  classIds: string[];
}

export function hitDice(c: Character): HitDicePool[] {
  const pools = new Map<number, HitDicePool>();
  for (const k of c.classes) {
    const die = classById(k.classId).hitDie;
    const p = pools.get(die) ?? { die, total: 0, used: 0, classIds: [] };
    p.total += k.level;
    p.used += k.hitDiceUsed;
    p.classIds.push(k.id);
    pools.set(die, p);
  }
  return [...pools.values()].sort((a, b) => b.die - a.die);
}

export const casterType = (k: Character['classes'][number]): CasterType => k.casterOverride ?? classById(k.classId).caster;

export function defaultSpellAbility(c: Character): Ability | null {
  for (const k of c.classes) {
    if (casterType(k) !== 'none') return classById(k.classId).spellAbility ?? 'int';
  }
  return null;
}

export const spellAbility = (c: Character, spell?: Spell): Ability | null =>
  spell?.abilityOverride ?? c.spellcasting.ability ?? defaultSpellAbility(c);

export function spellAttack(c: Character, spell?: Spell): Breakdown {
  const a = spellAbility(c, spell) ?? 'int';
  return sum([
    { label: `${ABILITY_NAMES[a]} modifier`, value: mod(c, a) },
    { label: 'Proficiency', value: pb(c) },
    { label: 'Spell attack bonus', value: c.bonus.spellAttack },
    { label: 'Exhaustion', value: exhaustionPenalty(c) },
  ]);
}

export function spellSaveDc(c: Character, spell?: Spell): Breakdown {
  const a = spellAbility(c, spell) ?? 'int';
  return sum([
    { label: 'Base', value: 8 },
    { label: `${ABILITY_NAMES[a]} modifier`, value: mod(c, a) },
    { label: 'Proficiency', value: pb(c) },
    { label: 'Save DC bonus', value: c.bonus.spellDc },
  ]);
}

/**
 * Spell slots by level (index 0 = 1st). A single caster class uses its own table;
 * several use the multiclass rule: full levels + half (round up) + third (round down).
 */
export function spellSlots(c: Character): number[] {
  if (c.spellcasting.slotsOverride) return padSlots(c.spellcasting.slotsOverride);
  const casters = c.classes.filter((k) => {
    const t = casterType(k);
    return t === 'full' || t === 'half' || t === 'third';
  });
  if (casters.length === 0) return padSlots([]);
  let casterLevel: number;
  if (casters.length === 1) {
    const k = casters[0];
    const t = casterType(k);
    casterLevel = t === 'full' ? k.level : t === 'half' ? Math.ceil(k.level / 2) : k.level < 3 ? 0 : Math.ceil(k.level / 3);
  } else {
    casterLevel = casters.reduce((acc, k) => {
      const t = casterType(k);
      return acc + (t === 'full' ? k.level : t === 'half' ? Math.ceil(k.level / 2) : Math.floor(k.level / 3));
    }, 0);
  }
  return padSlots(FULL_CASTER_SLOTS[Math.min(20, casterLevel)] ?? []);
}

const padSlots = (s: number[]): number[] => Array.from({ length: 9 }, (_, i) => Math.max(0, s[i] ?? 0));

export function pactSlots(c: Character): { count: number; level: number } {
  const lvl = c.classes.filter((k) => casterType(k) === 'pact').reduce((a, k) => a + k.level, 0);
  const [count, level] = PACT_SLOTS[Math.min(20, lvl)];
  return { count, level };
}

export const isSpellcaster = (c: Character): boolean =>
  spellSlots(c).some((n) => n > 0) || pactSlots(c).count > 0 || c.spells.length > 0;

/** 2024 cantrips gain a die (or a beam) at character levels 5, 11 and 17. */
export const cantripTier = (level: number): number => 1 + (level >= 5 ? 1 : 0) + (level >= 11 ? 1 : 0) + (level >= 17 ? 1 : 0);

/** Replaces {PB}, {LEVEL}, {MOD}, {STR}…{CHA} in a dice expression with the character's numbers. */
export function resolveTokens(expr: string, c: Character, spell?: Spell): string {
  const spellMod = mod(c, spellAbility(c, spell) ?? 'int');
  return expr.replace(/\{(\w+)\}/g, (whole, raw: string) => {
    const key = raw.toLowerCase();
    if (key === 'pb') return String(pb(c));
    if (key === 'level') return String(totalLevel(c));
    if (key === 'mod') return String(spellMod);
    if ((ABILITIES as readonly string[]).includes(key)) return String(mod(c, key as Ability));
    return whole;
  }).replace(/\+-/g, '-').replace(/-\+/g, '-').replace(/--/g, '+');
}

export interface SpellCastPlan {
  slotLevel: number;
  instances: number;
  damage: { dice: string; type: string }[];
  healing: string;
}

/** Works out dice and instance counts for casting `spell` with a slot of `slotLevel` (0 for cantrips). */
export function planSpell(c: Character, spell: Spell, slotLevel: number): SpellCastPlan {
  const above = spell.level > 0 ? Math.max(0, slotLevel - spell.level) : 0;
  const tier = cantripTier(totalLevel(c));
  let instances = Math.max(1, spell.instances) + spell.upcastInstances * above;
  if (spell.level === 0 && spell.scaling === 'cantrip_beams') instances = Math.max(1, spell.instances) * tier;

  const scale = (dice: string, isFirst: boolean): string => {
    let d = resolveTokens(dice, c, spell);
    if (spell.level === 0 && spell.scaling === 'cantrip_dice') d = multiplyDiceOnly(d, tier);
    if (isFirst && above > 0 && spell.upcastDice) d = addDice(d, resolveTokens(spell.upcastDice, c, spell), above);
    return d;
  };
  const damage = spell.damage.filter((p) => p.dice.trim()).map((p, idx) => ({ dice: scale(p.dice, idx === 0), type: p.type }));
  let healing = spell.healing.trim() ? resolveTokens(spell.healing, c, spell) : '';
  if (healing && above > 0 && spell.upcastDice && damage.length === 0) healing = addDice(healing, resolveTokens(spell.upcastDice, c, spell), above);
  return { slotLevel, instances, damage, healing };
}

/** Like multiplyDice, but leaves flat modifiers alone ("1d8+3" ×2 → "2d8+3"). */
function multiplyDiceOnly(expr: string, factor: number): string {
  const m = /^(\d*d\d+)(.*)$/.exec(expr);
  if (!m) return multiplyDice(expr, factor);
  return multiplyDice(m[1], factor) + m[2];
}

export function weaponAbility(c: Character, w: Weapon): Ability {
  if (w.ability !== 'auto') return w.ability;
  if (w.finesse) return mod(c, 'dex') > mod(c, 'str') ? 'dex' : 'str';
  return w.ranged ? 'dex' : 'str';
}

export function weaponAttack(c: Character, w: Weapon): Breakdown {
  const a = weaponAbility(c, w);
  return sum([
    { label: `${ABILITY_NAMES[a]} modifier`, value: mod(c, a) },
    { label: 'Proficiency', value: w.proficient ? pb(c) : 0 },
    { label: 'Magic weapon', value: w.magicBonus },
    { label: 'Exhaustion', value: exhaustionPenalty(c) },
  ]);
}

export function weaponDamageBonus(c: Character, w: Weapon): number {
  return mod(c, weaponAbility(c, w)) + w.magicBonus;
}

export function usesMax(c: Character, f: Feature): number | null {
  return resolveUses(c, f.usesMax);
}

export function resolveUses(c: Character, u: UsesFormula | null): number | null {
  if (u === null) return null;
  if (typeof u === 'number') return u;
  if (u === 'pb') return pb(c);
  if (u === 'level') return totalLevel(c);
  if (u.startsWith('mod:')) return Math.max(1, mod(c, u.slice(4) as Ability));
  if (u.startsWith('class:')) return c.classes.filter((k) => k.classId === u.slice(6)).reduce((a, k) => a + k.level, 0);
  return null;
}

/** 2024: carry 15 × STR lb; drag, lift or push 30 × STR lb. Tiny creatures halve, Large+ double, etc. — not modelled. */
export const carryingCapacity = (c: Character): { carry: number; push: number } => ({
  carry: c.abilities.str * 15,
  push: c.abilities.str * 30,
});

/** Long jump (running start) = STR score in feet; high jump = 3 + STR modifier feet. */
export const jump = (c: Character): { long: number; high: number } => ({
  long: c.abilities.str,
  high: Math.max(0, 3 + mod(c, 'str')),
});

export const inventoryWeight = (c: Character): number =>
  Math.round(c.inventory.reduce((a, i) => a + i.qty * i.weight, 0) * 100) / 100;

export function classSummary(c: Character): string {
  return c.classes
    .map((k) => `${classById(k.classId).name}${k.subclass ? ` (${k.subclass})` : ''} ${k.level}`)
    .join(' / ');
}
