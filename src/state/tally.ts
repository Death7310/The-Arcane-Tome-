// The tally: how an attack's or spell's roll counts up hit by hit on the dice tray.
// Each roll becomes a row: its dice (each struck in turn), its flat bonuses named where
// we can (STR, PROF, MAGIC, the {MOD} in a spell's formula), the total and a verdict.
// The rows only describe the roll the dice engine already made; they never change it.

import type { RollResult } from '../engine/dice';
import type { DicePhase, DieSpec, TallyRow, Verdict } from '../fx';
import type { Element as FxElement, Outcome } from '../fx/types';
import type { Ability } from '../systems/dnd5e/data';
import type { Character, Spell } from '../systems/dnd5e/model';
import { resolveTokens, spellAbility } from '../systems/dnd5e/rules';

/**
 * The physical dice behind a roll. d20s are marked as tests so a natural 20 or 1 gets
 * its moment; a spell's dice are orbs of its element.
 */
export function diceOf(r: RollResult, element?: FxElement, test = false, orb = false): DieSpec[] {
  return r.terms.flatMap((t) =>
    t.term.kind === 'dice'
      ? t.rolls.map((d) => ({ sides: d.sides, value: d.value, kept: d.kept, element, test: test && d.sides === 20, orb, sign: t.term.sign }))
      : [],
  );
}

export const plain = (dice: DieSpec[]): DicePhase[] => [{ dice, rows: [] }];

export interface Part {
  label: string;
  value: number;
}

/** A roll's dice and its row on the tally, the row's dice numbered within `dice`. */
export interface Counted {
  dice: DieSpec[];
  row: TallyRow;
}

export const ABBR = (a: Ability) => a.toUpperCase();

/** "Strength modifier" → "STR", "Proficiency" → "PROF"… for the tally's captions. */
export function shortLabel(label: string): string {
  const ability = /^(\w{3})\w* modifier$/.exec(label);
  if (ability) return ability[1].toUpperCase();
  if (label === 'Proficiency') return 'PROF';
  if (/magic/i.test(label)) return 'MAGIC';
  if (/exhaustion/i.test(label)) return 'EXH';
  return 'BONUS';
}

export const constOf = (r: RollResult) => r.terms.reduce((a, t) => a + (t.term.kind === 'const' ? t.value : 0), 0);

/** Splits a roll's flat modifier into the parts we can name; whatever is left is "bonus". */
export function bonusParts(flat: number, known: Part[]): Part[] {
  const parts = known.filter((p) => p.value !== 0);
  const rest = flat - parts.reduce((a, p) => a + p.value, 0);
  if (rest !== 0) parts.push({ label: 'BONUS', value: rest });
  return parts;
}

/** Labels for the {MOD}, {PB}, {LEVEL}… tokens in a dice formula, with their values. */
export function tokenParts(raw: string, c: Character, spell?: Spell): Part[] {
  const out: Part[] = [];
  // Only flat terms: "{PB}d4" is a number of dice, not a bonus.
  for (const m of raw.matchAll(/(^|[+-])\s*\{(\w+)\}(?!\s*d)/gi)) {
    const v = Number(resolveTokens(`{${m[2]}}`, c, spell));
    if (!Number.isFinite(v)) continue;
    const key = m[2].toLowerCase();
    const label = key === 'pb' ? 'PROF' : key === 'level' ? 'LEVEL' : key === 'mod' ? ABBR(spellAbility(c, spell) ?? 'int') : key.toUpperCase();
    out.push({ label, value: m[1] === '-' ? -v : v });
  }
  return out;
}

/** "d20 adv", "8d6", "1d8 + 2d6", "d20 − 1d4". */
export function captionOf(rolls: RollResult[]): string {
  const counts = new Map<string, number>();
  let mode = '';
  for (const r of rolls) {
    for (const t of r.terms) {
      if (t.term.kind !== 'dice') continue;
      if (t.term.keep && t.term.sides === 20) mode = t.term.keep.mode === 'high' ? ' adv' : ' dis';
      const key = `${t.term.sign < 0 ? '−' : '+'}${t.term.sides}`;
      counts.set(key, (counts.get(key) ?? 0) + t.rolls.filter((d) => d.kept).length);
    }
  }
  return (
    [...counts]
      .map(([key, n], i) => {
        const sides = key.slice(1);
        const text = n === 1 && sides === '20' ? 'd20' : `${n}d${sides}`;
        return i === 0 ? (key[0] === '−' ? `−${text}` : text) : `${key[0] === '−' ? '−' : '+'} ${text}`;
      })
      .join(' ') + mode
  );
}

/** One row of the tally for one or more rolls: their dice, their bonuses, and the total. */
export function counted(
  rolls: { r: RollResult; known: Part[]; element?: FxElement; test?: boolean; orb?: boolean }[],
  total: number,
  unit: string,
  verdict?: Verdict,
  crit = false,
): Counted {
  const dice: DieSpec[] = [];
  const rowDice: number[] = [];
  const bonus = new Map<string, number>();
  for (const x of rolls) {
    const specs = diceOf(x.r, x.element, x.test, x.orb);
    specs.forEach((d, i) => d.kept !== false && rowDice.push(dice.length + i));
    dice.push(...specs);
    for (const b of bonusParts(constOf(x.r), x.known)) bonus.set(b.label, (bonus.get(b.label) ?? 0) + b.value);
  }
  const bonuses = [...bonus].map(([label, value]) => ({ label, value }));
  return { dice, row: { dice: rowDice, caption: captionOf(rolls.map((x) => x.r)) + (crit ? ' crit' : ''), bonuses, total, unit, verdict } };
}

/** Joins counted rolls into one throw, each keeping its own row. */
export function phaseOf(parts: Counted[]): DicePhase {
  const dice: DieSpec[] = [];
  const rows: TallyRow[] = [];
  for (const p of parts) {
    const offset = dice.length;
    dice.push(...p.dice);
    rows.push({ ...p.row, dice: p.row.dice.map((i) => i + offset) });
  }
  return { dice, rows };
}

export function attackVerdict(outcome: Outcome, nat: number | undefined, ac: number | null): Verdict | undefined {
  const note = ac !== null ? `vs AC ${ac}` : undefined;
  if (nat === 20) return { text: 'CRITICAL', tone: 'crit', note };
  if (nat === 1) return { text: 'MISS', tone: 'miss', note: 'natural 1' };
  if (ac === null) return { text: 'HIT?', tone: 'info', note: 'no target AC set' };
  return outcome === 'miss' ? { text: 'MISS', tone: 'miss', note } : { text: 'HIT', tone: 'hit', note };
}

export const unitOf = (types: string[]) => (types.length && types.every((t) => t === types[0]) ? types[0] : 'damage');

