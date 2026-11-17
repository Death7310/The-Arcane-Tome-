// Making a companion's printed numbers follow you. D&D Beyond (and many sheets) print a class
// companion's numbers worked out for your level: "AC 17, HP 25, Bite +6, 1d6 + 3". Here you pick
// the rule each one follows (your Proficiency Bonus, your Ranger level, the spell's level, a
// modifier), and the constant is fitted so today's number stays the same: 25 HP at Ranger 4 as
// "5 + 5 × your Ranger level". Or take a known companion's rules whole.

import { actionDice, compEval, compMaxHp } from './companion';
import type { Ability } from './data';
import { readOrigin, type Character, type Companion, type CompanionAction } from './model';

export type AddRule = { kind: 'pb' } | { kind: 'slot' } | { kind: 'mod'; ability: Ability };
export type HpRule = { kind: 'class'; per: number; classId: string; ability: Ability | '' } | { kind: 'above'; per: number; base: number } | { kind: 'per'; per: number };

const tok = (a: Ability) => `{${a.toUpperCase()}}`;

/** What a number adds that follows you: "{PB}", "{SLOT}", "{WIS}". */
export const addPart = (r: AddRule): string => (r.kind === 'pb' ? '{PB}' : r.kind === 'slot' ? '{SLOT}' : tok(r.ability));

/** What Hit Points add that follow you: "5 * {LEVEL:ranger} + {INT}", "5 * max(0, {SLOT} - 2)", "10 * {SLOT}". */
export function hpPart(r: HpRule): string {
  if (r.kind === 'class') return [`${r.per} * ${r.classId ? `{LEVEL:${r.classId}}` : '{LEVEL}'}`, r.ability ? tok(r.ability) : ''].filter(Boolean).join(' + ');
  if (r.kind === 'above') return `${r.per} * max(0, {SLOT} - ${r.base})`;
  return `${r.per} * {SLOT}`;
}

/** A constant joined to the part that follows you: "5 + rest", "rest - 2", or the rest alone. */
export function withConstant(a: number, rest: string): string {
  if (!rest) return String(a);
  return a === 0 ? rest : a > 0 ? `${a} + ${rest}` : `${rest} - ${-a}`;
}

/** The constant that keeps a number where it is now (25 HP at Ranger 4 with "5 × your Ranger level" is 5). */
export function fitConstant(now: number, rest: string, k: Companion, owner: Character): number {
  return rest ? now - (compEval(k, rest, owner) ?? 0) : now;
}

/** An attack's damage as it reads now, split into its dice and its flat number: "1d6+3" → 1d6 and 3. */
export function splitDamage(a: CompanionAction, k: Companion, owner: Character): { dice: string; flat: number } {
  const now = actionDice({ ...a, levelDice: [] }, owner, k);
  const terms = now.match(/[+-]?(?:\d+d\d+|\d+)/gi) ?? [];
  const dice = terms
    .filter((x) => /d/i.test(x))
    .map((x, i) => (i === 0 ? x.replace(/^\+/, '') : /^[+-]/.test(x) ? x : `+${x}`))
    .join('')
    .replace(/([+-])/g, ' $1 ')
    .trim();
  return { dice, flat: terms.filter((x) => !/d/i.test(x)).reduce((n, x) => n + Number(x), 0) };
}

/** Damage dice with a constant and what follows you: "1d6 + {PB}", "1d8 + 4 + {SLOT}". */
export const damageFormula = (dice: string, a: number, rule: AddRule) => [dice, withConstant(a, addPart(rule))].filter((x) => x && x !== '0').join(' + ').replace(/\+ -/g, '- ');

// ── Known companions' rules ──────────────────────────────────────────────────

export interface RuleSet {
  id: string;
  name: string;
  /** The book its rules are from. */
  source: string;
  /** Names it goes by. */
  match: RegExp;
  classId: string;
  ac: string;
  maxHp: string;
  /** Its attack: which one, and its numbers. */
  attack: { match: RegExp; name: string; toHit: string; damage: string };
}

/**
 * Class companions whose rules are settled and well known. Their numbers are rules, not text:
 * check them against your book, since a later printing or a DM can change them.
 */
export const RULE_SETS: RuleSet[] = [
  {
    id: 'drake',
    name: 'Drakewarden drake',
    source: "Fizban's Treasury of Dragons (Drakewarden)",
    match: /\bdrake\b/i,
    classId: 'ranger',
    ac: '14 + {PB}',
    maxHp: '5 + 5 * {LEVEL:ranger}',
    attack: { match: /\bbite\b/i, name: 'Bite', toHit: '{SPELLATK}', damage: '1d6 + {PB}' },
  },
  {
    id: 'homunculus',
    name: 'Homunculus servant',
    source: "Tasha's Cauldron of Everything (Artificer)",
    match: /\bhomunculus\b/i,
    classId: 'artificer',
    ac: '13',
    maxHp: '1 + {INT} + {LEVEL:artificer}',
    attack: { match: /force strike/i, name: 'Force Strike', toHit: '{SPELLATK}', damage: '1d4 + {PB}' },
  },
  {
    id: 'steel-defender',
    name: 'Steel defender',
    source: "Tasha's Cauldron of Everything (Battle Smith)",
    match: /\bsteel defender\b/i,
    classId: 'artificer',
    ac: '15',
    maxHp: '2 + {INT} + 5 * {LEVEL:artificer}',
    attack: { match: /\brend\b/i, name: 'Force-Empowered Rend', toHit: '{SPELLATK}', damage: '1d8 + {PB}' },
  },
];

/** The known companion a name is, if any ("Artex the drake" → the Drakewarden drake). */
export const ruleSetFor = (name: string): RuleSet | undefined => RULE_SETS.find((r) => r.match.test(name));

/**
 * Takes a known companion's rules (on a draft): its AC, HP and Proficiency Bonus, its attack's
 * numbers (the one it names, else its first attack), and a class feature's origin following
 * that class. With your character, one at full HP stays at full; one hurt keeps no more than its new maximum.
 */
export function applyRuleSet(k: Companion, r: RuleSet, owner?: Character) {
  const wasFull = owner ? k.hp >= compMaxHp(k, owner) : false;
  k.ac = r.ac;
  k.maxHp = r.maxHp;
  k.pb = '{PB}';
  const atk = k.actions.find((a) => a.attack && r.attack.match.test(a.name)) ?? k.actions.find((a) => a.attack);
  if (atk) {
    atk.toHit = r.attack.toHit;
    atk.damage = r.attack.damage;
  }
  const o = k.origin;
  k.origin = readOrigin({ kind: 'feature', name: o?.kind === 'feature' && o.name ? o.name : r.name, classId: r.classId, base: 1, cast: 1, forms: o?.forms ?? [], form: o?.form ?? '', block: o?.block ?? '', upcast: o?.upcast });
  if (owner) {
    const max = compMaxHp(k, owner);
    k.hp = wasFull ? max : Math.min(k.hp, max);
  }
}

/** A rule set in words: "AC 14 + your PB · HP 5 + 5 × your Ranger level · Bite: your spell attack, 1d6 + your PB". */
export const ruleSetLine = (r: RuleSet) =>
  `AC ${r.ac} · HP ${r.maxHp} · ${r.attack.name}: ${r.attack.toHit === '{SPELLATK}' ? 'your spell attack' : r.attack.toHit}, ${r.attack.damage}`;
