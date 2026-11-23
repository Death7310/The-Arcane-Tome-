// A companion's own numbers, worked out like a character's but from its stat block: its
// ability modifiers and Proficiency Bonus (its own, or yours for class companions), its
// AC (worn armor or barding, else the stat block's), attacks with weapons it wields, its
// walking speed, and how much it can carry for its size.

import { ARMOR, type Ability } from './data';
import { evalFormula } from './formula';
import type { Character, Companion, CompanionAction, CompanionOrigin, Spell, Weapon } from './model';
import { abilityMod, incapacitatedBy, resolveTokens, totalLevel, type Breakdown } from './rules';

type Part = Breakdown['parts'][number];

const NAMES: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const sum = (parts: Part[]): Breakdown => ({ total: parts.reduce((a, p) => a + p.value, 0), parts: parts.filter((p) => p.value !== 0) });

export const compMod = (k: Companion, a: Ability) => abilityMod(k.abilities[a]);

// ── How it comes, and what its numbers follow ───────────────────────────────

/**
 * How it comes to you: as set, or worked out from its numbers for older sheets (one that counts
 * a class level is a class feature's, like a drake's "5 + 5 × your Ranger level").
 */
export function originOf(k: Pick<Companion, 'origin' | 'ac' | 'maxHp' | 'pb' | 'actions' | 'kind' | 'source'>): CompanionOrigin {
  if (k.origin) return k.origin;
  const all = [k.ac, k.maxHp, k.pb, ...k.actions.flatMap((a) => [a.toHit, a.damage, a.dc])].join(' ');
  const cls = /\{LEVEL:([\w-]+)\}/i.exec(all)?.[1]?.toLowerCase() ?? '';
  const kind: CompanionOrigin['kind'] = /\{SLOT\}/i.test(all) ? 'spell' : cls || /\{LEVEL\}/i.test(all) ? 'feature' : 'creature';
  return { kind, name: kind === 'creature' ? '' : k.kind, base: 1, cast: 1, forms: [], form: '', block: '', classId: cls };
}

/** The level its spell was cast at, which "{SLOT}" stands for (1 if it has no spell). */
export const slotOf = (k: Pick<Companion, 'origin'>): number => Math.max(1, k.origin?.cast || k.origin?.base || 1);

/**
 * A formula with its spell's level filled in: {SLOT} is the level it was cast at, {ABOVE:5} the
 * levels above 5th (0 at 5th or lower), {ABOVE:5:2} twice that ("2d6 for each level above 5th").
 */
export const withSlot = (text: string, k?: Pick<Companion, 'origin'> | null): string => {
  const slot = k ? slotOf(k) : 1;
  return String(text ?? '')
    .replace(/\{ABOVE:(\d)(?::(\d+))?\}/gi, (_, b: string, n?: string) => String(Math.max(0, slot - Number(b)) * Number(n ?? 1)))
    .replace(/\{SLOT\}/gi, String(slot));
};

/**
 * The spellcasting its spell was cast with, for {SPELLATK}, {SPELLDC} and {MOD}: the class that
 * cast it (a Ranger's Wisdom), or a feat's ability. Undefined: your usual spellcasting.
 */
export const castingOf = (k?: Pick<Companion, 'origin'> | null): Pick<Spell, 'abilityOverride' | 'grantedBy'> | undefined =>
  k?.origin?.castBy || k?.origin?.castAbility ? { grantedBy: k.origin.castBy ?? '', abilityOverride: k.origin.castAbility ?? null } : undefined;

/** One of its numbers worked out: your tokens (with the spellcasting that cast it) and its spell's level filled in. */
export const compEval = (k: Pick<Companion, 'origin'>, text: string, owner: Character): number | null => evalFormula(withSlot(text, k), owner, castingOf(k));

/** Its Hit Point maximum now (at least 1), from its formula. */
export const compMaxHp = (k: Companion, owner: Character): number => Math.max(1, compEval(k, k.maxHp, owner) ?? k.hp);

/** Each companion's Hit Point maximum, to compare after a level changes. */
export const companionMaxes = (d: Character): Map<string, number> => new Map(d.companions.map((k) => [k.id, compMaxHp(k, d)]));

/**
 * After your level changes: a companion whose maximum grew gains the difference (as you do when
 * you level up), and one whose maximum shrank keeps no more than it.
 */
export function followMaxHp(d: Character, before: Map<string, number>): { name: string; from: number; to: number }[] {
  const changed: { name: string; from: number; to: number }[] = [];
  for (const k of d.companions) {
    const was = before.get(k.id);
    if (was === undefined) continue;
    const now = compMaxHp(k, d);
    if (now === was) continue;
    k.hp = now > was ? Math.min(now, k.hp + (now - was)) : Math.min(k.hp, now);
    changed.push({ name: k.name, from: was, to: now });
  }
  return changed;
}

/**
 * "1d8+4+3" → "1d8+7", "2d6+3+2d6" → "4d6+3": dice of a size added together, whole numbers
 * summed after them, and none of a die ("0d6", a higher-level die not reached yet) left out.
 * Anything else stays as it is.
 */
export function tidyDice(dice: string): string {
  const d = dice.replace(/\s+/g, '');
  if (!/^[+-]?(?:\d+d\d+|\d+)(?:[+-](?:\d+d\d+|\d+))*$/i.test(d)) return d;
  const terms = d.match(/[+-]?(?:\d+d\d+|\d+)/gi) ?? [];
  const sizes = new Map<number, number>();
  let n = 0;
  for (const x of terms) {
    const m = /^([+-]?)(\d+)d(\d+)$/i.exec(x);
    if (!m) {
      n += Number(x);
      continue;
    }
    const count = Number(m[2]) * (m[1] === '-' ? -1 : 1);
    sizes.set(Number(m[3]), (sizes.get(Number(m[3])) ?? 0) + count);
  }
  const head = [...sizes]
    .filter(([, count]) => count !== 0)
    .map(([size, count], i) => `${count < 0 ? '-' : i === 0 ? '' : '+'}${Math.abs(count)}d${size}`)
    .join('');
  if (!head) return String(n);
  return n ? `${head}${n > 0 ? '+' : ''}${n}` : head;
}

/** Its Proficiency Bonus: a number from its stat block, or a formula over yours ("{PB}"). */
export const compPb = (k: Companion, owner: Character) => compEval(k, k.pb, owner) ?? 2;

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
      parts.push({ label: 'Natural armor', value: compEval(k, k.ac, owner) ?? 10 });
    }
    parts.push({ label: 'Armor enchantment', value: k.armor.magicBonus });
    if (k.armor.shield) parts.push({ label: 'Shield', value: 2 });
    const worn = [armor && armor.category !== 'none' ? armor.name : '', k.armor.shield ? 'Shield' : ''].filter(Boolean).join(' and ');
    return { ...sum(parts), worn };
  }
  const total = compEval(k, k.ac, owner) ?? 10;
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
  levelOf ? owner.classes.filter((k) => k.classId === levelOf || k.classId.endsWith(`:${levelOf}`)).reduce((n, k) => n + k.level, 0) : totalLevel(owner);

/**
 * An action's damage dice as they stand at your level, with your numbers (and its spell's level)
 * filled in: its level step if one applies, else its damage dice (or, for a boost, the dice its
 * text names).
 */
export function actionDice(a: CompanionAction, owner: Character, comp?: Pick<Companion, 'origin'> | null): string {
  const level = ownerLevel(owner, a.levelOf);
  const step = [...(a.levelDice ?? [])].filter((x) => x.dice.trim() && x.level <= level).sort((x, y) => x.level - y.level).at(-1);
  const base = step?.dice ?? (a.damage.trim() || boostOf(a)?.dice || '');
  return base ? tidyDice(resolveTokens(withSlot(base, comp), owner, castingOf(comp))) : '';
}

/** An action's extra damage at your level (a drake's Magic Fang), or '' if none applies yet. */
export function actionExtra(a: CompanionAction, owner: Character, comp?: Pick<Companion, 'origin'> | null): string {
  const level = ownerLevel(owner, a.levelOf);
  const step = [...(a.extra ?? [])].filter((x) => x.dice.trim() && x.level <= level).sort((x, y) => x.level - y.level).at(-1);
  return step ? tidyDice(resolveTokens(withSlot(step.dice, comp), owner, castingOf(comp))) : '';
}

/** The healing an action gives at your level and its spell's ("2d8 + {SLOT}" at 3rd → "2d8+3"), or ''. */
export function actionHeal(a: CompanionAction, owner: Character, comp?: Pick<Companion, 'origin'> | null): string {
  return typeof a.heal === 'string' && a.heal.trim() ? tidyDice(resolveTokens(withSlot(a.heal, comp), owner, castingOf(comp))) : '';
}

/** More damage on the same hit, each of its own type (a Poison Jab's "plus 1d4 Poison damage"). */
export function actionMore(a: CompanionAction, owner: Character, comp?: Pick<Companion, 'origin'> | null): { dice: string; type: string }[] {
  return (Array.isArray(a.more) ? a.more : [])
    .filter((x) => x && typeof x.dice === 'string' && x.dice.trim())
    .map((x) => ({ dice: tidyDice(resolveTokens(withSlot(x.dice, comp), owner, castingOf(comp))), type: typeof x.type === 'string' ? x.type : '' }));
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
    // A summon that's gone can't react.
    if (!isHere(comp)) continue;
    for (const action of comp.actions) {
      const b = boostOf(action);
      if (!b) continue;
      const by = incapacitatedBy(comp);
      const blocked = comp.hp <= 0 ? 'at 0 HP' : by ? by : comp.turn.reaction ? 'reaction used' : '';
      out.push({ comp, action, dice: actionDice(action, owner, comp), type: b.type || comp.essence, blocked });
    }
  }
  return out;
}

// ── A summoned creature's stay ──────────────────────────────────────────────
// A spell's creature is here for its spell's duration: until you dismiss it, your concentration
// on its spell ends, it drops to 0 Hit Points (Summon Beast: "The creature disappears when it
// drops to 0 hit points or when the spell ends"), or the duration runs out. A gone creature's
// attacks, reactions and commands drop out of the sheet until it's summoned again.

/** Whether it's here: a spell's creature that's gone isn't; every other companion is. */
export const isHere = (k: Pick<Companion, 'up'>): boolean => k.up?.active !== false;

/** Whether it comes and goes by a spell (and has a here-or-gone switch). */
export const isSummon = (k: Pick<Companion, 'origin' | 'ac' | 'maxHp' | 'pb' | 'actions' | 'kind' | 'source'>): boolean => originOf(k).kind === 'spell';

/** Rounds in a duration: "1 minute" is 10, "Concentration, up to 1 hour" 600; null for "Instantaneous" or "Until dispelled". */
export function roundsOf(duration: string): number | null {
  const m = /(\d+)\s*(round|minute|hour|day)s?\b/i.exec(duration);
  if (!m) return null;
  const per = { round: 1, minute: 10, hour: 600, day: 14400 }[m[2].toLowerCase() as 'round' | 'minute' | 'hour' | 'day'];
  return Number(m[1]) * per;
}

/** "600 rounds (1 hour)", "9 rounds (about 1 minute)": rounds left, with the time they come to. */
export function roundsText(rounds: number): string {
  const minutes = rounds / 10;
  const exact = Number.isInteger(minutes) || minutes < 1;
  const whole = Math.round(minutes);
  const hours = Math.round((minutes / 60) * 10) / 10;
  const time = whole >= 60 ? `${hours} hour${hours === 1 ? '' : 's'}` : minutes >= 1 ? `${whole} minute${whole === 1 ? '' : 's'}` : `${rounds * 6} seconds`;
  return `${rounds} round${rounds === 1 ? '' : 's'} (${exact ? '' : 'about '}${time})`;
}

/** It comes (a casting): here now, its duration starting. */
export function arrive(k: Companion) {
  k.up = { active: true, since: Date.now(), rounds: roundsOf(k.origin?.duration ?? ''), why: '' };
}

/** It goes, and why. */
export function depart(k: Companion, why: string) {
  k.up = { active: false, since: k.up?.since ?? Date.now(), rounds: k.up?.rounds ?? null, why };
}

/** A spell's creature at 0 Hit Points disappears. Call after its HP changes; true if it went. */
export function goneAtZero(k: Companion): boolean {
  if (k.hp > 0 || !isHere(k) || !isSummon(k)) return false;
  depart(k, 'Dropped to 0 Hit Points');
  return true;
}

/** Your spell's creatures that are here (Summon Beast's Bestial Spirit while you concentrate on it). */
export const summonsOf = (c: Pick<Character, 'companions'>, spell: string): Companion[] =>
  c.companions.filter((k) => isHere(k) && k.origin?.kind === 'spell' && k.origin.name.trim().toLowerCase() === spell.trim().toLowerCase());

/** Your concentration on a spell ended: its creatures go. Returns their names. */
export function endSummons(d: Character, spell: string): string[] {
  const gone = summonsOf(d, spell);
  for (const k of gone) depart(k, `Concentration on ${spell} ended`);
  return gone.map((k) => k.name);
}

/**
 * Time passes (a New turn is a round; a Short Rest an hour, a Long Rest 8): each summon's
 * duration counts down that many rounds, and one that runs out goes. Returns their names.
 */
export function passSummons(d: Character, rounds: number): string[] {
  const out: string[] = [];
  for (const k of d.companions) {
    if (!isHere(k) || !k.up || k.up.rounds === null) continue;
    k.up.rounds = Math.max(0, k.up.rounds - rounds);
    if (k.up.rounds === 0) {
      depart(k, 'Its duration ran out');
      out.push(k.name);
    }
  }
  return out;
}

/** A New turn: one round for each summon's duration. */
export const tickSummons = (d: Character): string[] => passSummons(d, 1);

/** "10 minutes", "1 hour", "8 hours": rounds as time. */
export function timeText(rounds: number): string {
  const minutes = rounds / 10;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  if (minutes >= 1 && Number.isInteger(minutes)) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${rounds} round${rounds === 1 ? '' : 's'}`;
}

/**
 * Time passes for everything that counts it: your timed effects (Bless) and your summons'
 * durations. Returns what ended, by name. Effects whose rounds aren't counted stay.
 */
export function passTime(d: Character, rounds: number): { effects: string[]; summons: string[] } {
  const effects = d.effects.filter((e) => e.rounds !== null && e.rounds <= rounds).map((e) => e.name);
  d.effects = d.effects.flatMap((e) => (e.rounds === null ? [e] : e.rounds <= rounds ? [] : [{ ...e, rounds: e.rounds - rounds }]));
  return { effects, summons: passSummons(d, rounds) };
}

/**
 * The duration a spell's creature lasts: its own, else its spell's in your spells or the rules
 * (a summon from before durations were kept), with whether it needs concentration.
 */
export function durationFor(k: Pick<Companion, 'origin'>, spells: { name: string; duration?: string; concentration?: boolean }[]): { duration: string; concentration: boolean } | null {
  if (k.origin?.duration) return { duration: k.origin.duration, concentration: !!k.origin.concentration };
  const name = k.origin?.kind === 'spell' ? k.origin.name.trim().toLowerCase() : '';
  const sp = name ? spells.find((x) => x.name.trim().toLowerCase() === name && x.duration) : undefined;
  return sp?.duration ? { duration: sp.duration, concentration: !!sp.concentration } : null;
}
