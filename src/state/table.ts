// The "table": everything that happens when you click something rollable.
// Rolls dice, applies the result to the character (slots, uses, HP), and fires the
// matching animation + sound. UI components only call these functions.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { describe, naturalD20, roll, withModifier, type RollResult } from '../engine/dice';
import { centerOf, fx, perform, performAction, sound } from '../fx';
import type { ActionMotion, Element as FxElement, Outcome, Point } from '../fx/types';
import { ABILITY_NAMES, classById, STANDARD_ACTIONS, type StandardActionId } from '../systems/dnd5e/data';
import type { CastingTime, Character, Feature, Spell, Weapon } from '../systems/dnd5e/model';
import {
  maxHp,
  planSpell,
  resolveTokens,
  signed,
  speed,
  spellAbility,
  spellAttack,
  spellSaveDc,
  usesMax,
  weaponAttack,
  weaponDamageBonus,
  type Breakdown,
} from '../systems/dnd5e/rules';

export type Advantage = 'normal' | 'adv' | 'dis';

export interface RollLine {
  label: string;
  total: number;
  detail: string;
  kind: 'd20' | 'damage' | 'healing' | 'dice' | 'info';
  nat?: 20 | 1;
  outcome?: Outcome;
}

export interface RollEntry {
  id: number;
  time: number;
  title: string;
  subtitle?: string;
  lines: RollLine[];
  element?: FxElement;
  /** Total healing the reader can apply to themselves from this entry. */
  healing?: number;
}

export type SlotChoice = { kind: 'slot'; level: number } | { kind: 'pact'; level: number } | { kind: 'free'; level: number };

type Update = (fn: (c: Character) => void) => void;

let nextId = 1;

function d20Expr(mod: number, adv: Advantage): string {
  const base = adv === 'adv' ? '2d20kh1' : adv === 'dis' ? '2d20kl1' : '1d20';
  return withModifier(base, mod);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function useTableState(char: Character, update: Update) {
  const [log, setLog] = useState<RollEntry[]>([]);
  const [latest, setLatest] = useState<RollEntry | null>(null);
  const [adv, setAdv] = useState<Advantage>('normal');
  const [targetAc, setTargetAc] = useState<number | null>(null);
  const charRef = useRef(char);
  charRef.current = char;
  const advRef = useRef(adv);
  advRef.current = adv;
  const acRef = useRef(targetAc);
  acRef.current = targetAc;

  const push = useCallback((e: Omit<RollEntry, 'id' | 'time'>) => {
    const entry: RollEntry = { ...e, id: nextId++, time: Date.now() };
    setLog((l) => [entry, ...l].slice(0, 200));
    setLatest(entry);
    return entry;
  }, []);

  /** Consumes the one-shot advantage toggle. */
  const takeAdv = useCallback((): Advantage => {
    const a = advRef.current;
    if (a !== 'normal') setAdv('normal');
    return a;
  }, []);

  const spendTime = useCallback(
    (t: CastingTime) => {
      if (t === 'other') return;
      update((c) => {
        if (t === 'action') c.turn.action = true;
        if (t === 'bonus') c.turn.bonus = true;
        if (t === 'reaction') c.turn.reaction = true;
      });
    },
    [update],
  );

  const natFx = (r: RollResult, origin: Point) => {
    const nat = naturalD20(r);
    if (nat === 20) {
      fx.natural(origin, 'nat20');
      sound.natural('nat20');
    } else if (nat === 1) {
      fx.natural(origin, 'nat1');
      sound.natural('nat1');
    }
    return nat === 20 ? 20 : nat === 1 ? 1 : undefined;
  };

  /** Ability checks, saves, skills, initiative. */
  const test = useCallback(
    (title: string, b: Breakdown, originEl?: Element | null, subtitle?: string) => {
      const a = takeAdv();
      const r = roll(d20Expr(b.total, a));
      sound.dice(a === 'normal' ? 1 : 2);
      const nat = natFx(r, centerOf(originEl));
      return push({
        title,
        subtitle: [subtitle, a === 'adv' ? 'Advantage' : a === 'dis' ? 'Disadvantage' : ''].filter(Boolean).join(' · ') || undefined,
        lines: [{ label: title, total: r.total, detail: describe(r), kind: 'd20', nat }],
      });
    },
    [push, takeAdv],
  );

  const freeRoll = useCallback(
    (expression: string, label?: string, originEl?: Element | null) => {
      const r = roll(expression);
      sound.dice(r.terms.reduce((a, t) => a + t.rolls.length, 0));
      const nat = natFx(r, centerOf(originEl));
      return push({
        title: label ?? expression,
        lines: [{ label: r.successes !== undefined ? 'Successes' : 'Total', total: r.total, detail: describe(r), kind: 'dice', nat }],
      });
    },
    [push],
  );

  /** One attack roll (+ damage on a hit). Shared by weapons and attack spells. */
  const attackOnce = (toHit: number, a: Advantage, damage: { dice: string; type: string }[], dmgBonus: number) => {
    const atk = roll(d20Expr(toHit, a));
    const nat = naturalD20(atk);
    const ac = acRef.current;
    let outcome: Outcome = nat === 20 ? 'crit' : nat === 1 ? 'miss' : ac !== null ? (atk.total >= ac ? 'hit' : 'miss') : 'hit';
    const lines: RollLine[] = [
      {
        label: 'Attack',
        total: atk.total,
        detail: describe(atk) + (ac !== null ? ` vs AC ${ac}` : ''),
        kind: 'd20',
        nat: nat === 20 ? 20 : nat === 1 ? 1 : undefined,
        outcome,
      },
    ];
    let dealt = 0;
    let firstType = damage[0]?.type ?? '';
    if (outcome !== 'miss') {
      damage.forEach((d, i) => {
        const r = roll(i === 0 ? withModifier(d.dice, dmgBonus) : d.dice, { critical: outcome === 'crit' });
        dealt += Math.max(0, r.total);
        lines.push({ label: `${capital(d.type)} damage`, total: Math.max(0, r.total), detail: describe(r), kind: 'damage', outcome });
      });
    }
    if (nat === 1) outcome = 'miss';
    return { lines, outcome, dealt, firstType };
  };

  const label = (outcome: Outcome, dealt: number, type: string) =>
    outcome === 'miss' ? 'MISS' : outcome === 'crit' ? `CRIT! ${dealt}` : `${dealt}${type ? ` ${type}` : ''}`;

  const attack = useCallback(
    (w: Weapon, originEl?: Element | null) => {
      const c = charRef.current;
      const a = takeAdv();
      const res = attackOnce(weaponAttack(c, w).total, a, w.damage, weaponDamageBonus(c, w));
      sound.dice(a === 'normal' ? 1 : 2);
      const from = centerOf(originEl);
      const to = fx.defaultTarget(from);
      const element = (w.damage[0]?.type ?? 'bludgeoning') as FxElement;
      perform({ element, shape: w.ranged ? 'bolt' : 'touch', from: w.ranged ? from : to, to, power: 0, outcome: res.outcome, label: label(res.outcome, res.dealt, ''), delayMs: 120 });
      spendTime('action');
      return push({
        title: w.name,
        subtitle: [a === 'adv' ? 'Advantage' : a === 'dis' ? 'Disadvantage' : '', w.mastery ? `Mastery: ${w.mastery}` : ''].filter(Boolean).join(' · ') || undefined,
        lines: res.lines,
        element,
      });
    },
    [push, spendTime, takeAdv],
  );

  /** Spell slots the spell can be cast with right now, lowest first. */
  const slotChoices = useCallback((spell: Spell, slots: number[], pact: { count: number; level: number }): SlotChoice[] => {
    const c = charRef.current;
    if (spell.level === 0) return [{ kind: 'free', level: 0 }];
    const out: SlotChoice[] = [];
    for (let lvl = spell.level; lvl <= 9; lvl++) {
      if (slots[lvl - 1] - (c.spellcasting.slotsUsed[lvl - 1] ?? 0) > 0) out.push({ kind: 'slot', level: lvl });
    }
    if (pact.count - c.spellcasting.pactUsed > 0 && pact.level >= spell.level) out.push({ kind: 'pact', level: pact.level });
    return out;
  }, []);

  const cast = useCallback(
    (spell: Spell, choice: SlotChoice, originEl?: Element | null) => {
      const c = charRef.current;
      const slotLevel = choice.kind === 'free' && spell.level > 0 ? spell.level : choice.level;
      const plan = planSpell(c, spell, slotLevel);
      const from = centerOf(originEl);
      const selfCentred = /^self/i.test(spell.range) && (spell.shape === 'burst' || spell.shape === 'aura');
      const to = selfCentred ? from : fx.defaultTarget(from);
      const power = spell.level === 0 ? 0 : slotLevel;
      const lines: RollLine[] = [];
      let healing: number | undefined;
      const a = spell.resolution === 'attack' ? takeAdv() : 'normal';
      const levelText = spell.level === 0 ? 'Cantrip' : `${ordinal(slotLevel)}-level ${choice.kind === 'pact' ? 'pact slot' : choice.kind === 'free' ? '(no slot)' : 'slot'}`;
      const ability = spellAbility(c, spell);

      update((d) => {
        if (choice.kind === 'slot') d.spellcasting.slotsUsed[choice.level - 1] = (d.spellcasting.slotsUsed[choice.level - 1] ?? 0) + 1;
        if (choice.kind === 'pact') d.spellcasting.pactUsed += 1;
        if (spell.concentration) d.spellcasting.concentratingOn = spell.name;
      });
      spendTime(spell.castingTime);

      const stagger = spell.shape === 'ray' ? 230 : 300;
      const typeOf = plan.damage[0]?.type ?? '';

      if (spell.resolution === 'attack') {
        for (let i = 0; i < plan.instances; i++) {
          const res = attackOnce(spellAttack(c, spell).total, a, plan.damage, 0);
          const prefix = plan.instances > 1 ? `#${i + 1} ` : '';
          res.lines.forEach((l) => lines.push({ ...l, label: prefix + l.label }));
          perform({ element: spell.element, shape: spell.shape, from, to: spell.shape === 'touch' ? undefined : to, power, outcome: res.outcome, label: label(res.outcome, res.dealt, typeOf), delayMs: i * stagger });
        }
        sound.dice(plan.instances * (a === 'normal' ? 1 : 2));
      } else if (spell.resolution === 'save' || spell.resolution === 'auto') {
        const dc = spellSaveDc(c, spell).total;
        if (spell.resolution === 'save') {
          lines.push({ label: `${ABILITY_NAMES[spell.saveAbility]} save`, total: dc, detail: `DC ${dc}${spell.halfOnSave ? ' · half damage on a success' : ' · no damage on a success'}`, kind: 'info' });
        }
        for (let i = 0; i < plan.instances; i++) {
          let dealt = 0;
          plan.damage.forEach((d) => {
            const r = roll(d.dice);
            dealt += Math.max(0, r.total);
            const half = spell.resolution === 'save' && spell.halfOnSave ? ` (save: ${Math.floor(Math.max(0, r.total) / 2)})` : '';
            lines.push({ label: `${plan.instances > 1 ? `#${i + 1} ` : ''}${capital(d.type)} damage${half}`, total: Math.max(0, r.total), detail: describe(r), kind: 'damage' });
          });
          perform({ element: spell.element, shape: spell.shape, from, to: spell.shape === 'touch' ? undefined : to, power, outcome: 'hit', label: plan.damage.length ? `${dealt} ${typeOf}` : undefined, delayMs: i * stagger });
        }
        if (plan.damage.length) sound.dice(plan.instances);
      } else if (spell.resolution === 'heal') {
        const r = roll(plan.healing || '0');
        healing = Math.max(0, r.total);
        lines.push({ label: 'Healing', total: healing, detail: describe(r), kind: 'healing' });
        perform({ element: spell.element, shape: spell.shape, from, to: spell.shape === 'touch' ? undefined : to, power, outcome: 'hit', label: `+${healing}` });
        sound.dice(1);
      } else {
        perform({ element: spell.element, shape: spell.shape, from, to: spell.shape === 'touch' ? undefined : to, power, label: spell.name });
        lines.push({ label: spell.castingTimeText || 'Cast', total: 0, detail: spell.description || 'Cast.', kind: 'info' });
      }

      return push({
        title: spell.name,
        subtitle: [levelText, ability ? `${ABILITY_NAMES[ability]} spell` : '', spell.concentration ? 'Concentration' : '', a === 'adv' ? 'Advantage' : a === 'dis' ? 'Disadvantage' : '']
          .filter(Boolean)
          .join(' · '),
        lines,
        element: spell.element,
        healing,
      });
    },
    [push, spendTime, takeAdv, update],
  );

  const useFeature = useCallback(
    (f: Feature, originEl?: Element | null) => {
      const c = charRef.current;
      const max = usesMax(c, f);
      if (max !== null && f.usesSpent >= max) {
        sound.click();
        return push({ title: f.name, lines: [{ label: 'No uses left', total: 0, detail: `Recharges on a ${f.recharge === 'short' ? 'Short or Long' : 'Long'} Rest.`, kind: 'info' }] });
      }
      update((d) => {
        const target = d.features.find((x) => x.id === f.id);
        if (target && max !== null) target.usesSpent += 1;
      });
      spendTime(f.castingTime);
      const from = centerOf(originEl);
      const lines: RollLine[] = [];
      let healing: number | undefined;
      let fxLabel: string | undefined;
      if (f.roll.trim()) {
        const r = roll(resolveTokens(f.roll, c));
        const total = Math.max(0, r.total);
        lines.push({ label: f.rollKind === 'healing' ? 'Healing' : f.rollKind === 'damage' ? 'Damage' : 'Result', total, detail: describe(r), kind: f.rollKind === 'healing' ? 'healing' : f.rollKind === 'damage' ? 'damage' : 'dice' });
        if (f.rollKind === 'healing') healing = total;
        fxLabel = f.rollKind === 'healing' ? `+${total}` : String(total);
        sound.dice(r.terms.reduce((a, t) => a + t.rolls.length, 0));
      } else {
        lines.push({ label: 'Used', total: 0, detail: f.description || f.name, kind: 'info' });
      }
      perform({ element: f.element, shape: f.shape, from, power: 1, outcome: 'hit', label: fxLabel ?? f.name });
      return push({ title: f.name, subtitle: f.source || undefined, lines, element: f.element, healing });
    },
    [push, spendTime, update],
  );

  const standardAction = useCallback(
    (id: StandardActionId, originEl?: Element | null) => {
      const def = STANDARD_ACTIONS.find((a) => a.id === id)!;
      const from = centerOf(originEl);
      const motion: ActionMotion = (['dash', 'dodge', 'disengage', 'hide', 'help', 'search'] as const).includes(id as never) ? (id as ActionMotion) : 'generic';
      performAction(motion, from, def.name);
      update((d) => {
        d.turn.action = true;
        if (id === 'dash') d.turn.dashes += 1;
      });
      return push({ title: def.name, lines: [{ label: 'Action', total: 0, detail: def.summary, kind: 'info' }] });
    },
    [push, update],
  );

  const move = useCallback(
    (feet: number, originEl?: Element | null) => {
      const c = charRef.current;
      const budget = speed(c).total * (1 + c.turn.dashes);
      const left = budget - c.turn.movementUsed - feet;
      performAction('move', centerOf(originEl), `${feet} ft`);
      update((d) => {
        d.turn.movementUsed += feet;
      });
      return push({ title: `Move ${feet} ft`, lines: [{ label: 'Movement left', total: Math.max(0, left), detail: left < 0 ? `${-left} ft over your Speed this turn.` : `${left} of ${budget} ft remaining this turn.`, kind: 'info' }] });
    },
    [push, update],
  );

  const newTurn = useCallback(() => {
    update((d) => {
      d.turn = { action: false, bonus: false, reaction: false, movementUsed: 0, dashes: 0 };
    });
    sound.click();
  }, [update]);

  const damageSelf = useCallback(
    (amount: number, originEl?: Element | null) => {
      if (amount <= 0) return;
      const c = charRef.current;
      const max = maxHp(c).total;
      let rest = amount;
      const fromTemp = Math.min(c.hp.temp, rest);
      rest -= fromTemp;
      const newHp = Math.max(0, c.hp.current - rest);
      const overflow = rest - c.hp.current;
      update((d) => {
        d.hp.temp -= fromTemp;
        d.hp.current = newHp;
        if (c.hp.current === 0 && rest > 0) d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 1);
      });
      fx.hurt(centerOf(originEl), amount);
      sound.hurt(amount);
      const notes: string[] = [];
      if (fromTemp) notes.push(`${fromTemp} absorbed by temporary HP`);
      if (newHp === 0 && overflow >= max) notes.push('Massive damage: the excess equals or exceeds your HP maximum — instant death.');
      else if (newHp === 0) notes.push('You drop to 0 HP and fall Unconscious. Start making Death Saving Throws.');
      if (c.hp.current === 0 && rest > 0) notes.push('Damage at 0 HP counts as a failed death save.');
      if (c.spellcasting.concentratingOn) notes.push(`Concentration check: DC ${Math.min(30, Math.max(10, Math.floor(amount / 2)))} Constitution save.`);
      return push({ title: 'Took damage', lines: [{ label: 'Damage', total: amount, detail: notes.join(' ') || `${newHp} HP left.`, kind: 'damage' }] });
    },
    [push, update],
  );

  const healSelf = useCallback(
    (amount: number, originEl?: Element | null) => {
      if (amount <= 0) return;
      const c = charRef.current;
      const max = maxHp(c).total;
      update((d) => {
        if (d.hp.current === 0) d.deathSaves = { successes: 0, failures: 0 };
        d.hp.current = Math.min(max, d.hp.current + amount);
      });
      fx.healed(centerOf(originEl), amount);
      sound.element('healing', { power: 1 });
    },
    [update],
  );

  const deathSave = useCallback(
    (originEl?: Element | null) => {
      const r = roll('1d20');
      const nat = naturalD20(r);
      sound.dice(1);
      natFx(r, centerOf(originEl));
      const c = charRef.current;
      let detail: string;
      update((d) => {
        if (nat === 20) {
          d.hp.current = 1;
          d.deathSaves = { successes: 0, failures: 0 };
        } else if (nat === 1) d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 2);
        else if (r.total >= 10) d.deathSaves.successes = Math.min(3, d.deathSaves.successes + 1);
        else d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 1);
      });
      if (nat === 20) detail = 'Natural 20: you regain 1 Hit Point.';
      else if (nat === 1) detail = 'Natural 1: two failures.';
      else if (r.total >= 10) detail = c.deathSaves.successes + 1 >= 3 ? 'Third success: you are Stable.' : 'Success.';
      else detail = c.deathSaves.failures + 1 >= 3 ? 'Third failure: you die.' : 'Failure.';
      return push({ title: 'Death saving throw', lines: [{ label: 'd20', total: r.total, detail: `${describe(r)} — ${detail}`, kind: 'd20', nat: nat === 20 ? 20 : nat === 1 ? 1 : undefined }] });
    },
    [push, update],
  );

  const spendHitDie = useCallback(
    (die: number, originEl?: Element | null) => {
      const c = charRef.current;
      const k = c.classes.find((x) => classById(x.classId).hitDie === die && x.hitDiceUsed < x.level);
      if (!k) return;
      const con = Math.floor((c.abilities.con - 10) / 2);
      const r = roll(withModifier(`1d${die}`, con));
      const gained = Math.max(0, r.total);
      const max = maxHp(c).total;
      update((d) => {
        const kk = d.classes.find((x) => x.id === k.id)!;
        kk.hitDiceUsed += 1;
        d.hp.current = Math.min(max, d.hp.current + gained);
      });
      sound.dice(1);
      fx.healed(centerOf(originEl), gained);
      return push({ title: `Hit Die (d${die})`, subtitle: 'Short Rest', lines: [{ label: 'Hit Points regained', total: gained, detail: describe(r), kind: 'healing' }] });
    },
    [push, update],
  );

  const rest = useCallback(
    (kind: 'short' | 'long') => {
      const c = charRef.current;
      update((d) => {
        d.spellcasting.pactUsed = 0;
        d.features.forEach((f) => {
          if (f.recharge === 'short' || (kind === 'long' && f.recharge === 'long')) f.usesSpent = 0;
        });
        d.turn = { action: false, bonus: false, reaction: false, movementUsed: 0, dashes: 0 };
        if (kind === 'long') {
          d.hp.current = maxHp(c).total;
          d.hp.temp = 0;
          d.spellcasting.slotsUsed = d.spellcasting.slotsUsed.map(() => 0);
          d.spellcasting.concentratingOn = null;
          d.classes.forEach((k) => (k.hitDiceUsed = 0));
          d.deathSaves = { successes: 0, failures: 0 };
          d.exhaustion = Math.max(0, d.exhaustion - 1);
        }
      });
      sound.element('healing', { power: kind === 'long' ? 3 : 1 });
      fx.healed({ x: window.innerWidth / 2, y: window.innerHeight * 0.4 }, 0);
      return push({
        title: kind === 'long' ? 'Long Rest' : 'Short Rest',
        lines: [
          {
            label: 'Recovered',
            total: 0,
            detail:
              kind === 'long'
                ? 'HP, spell slots, Hit Point Dice and Long Rest features restored; Exhaustion reduced by 1.'
                : 'Pact slots and Short Rest features restored. Spend Hit Point Dice to heal.',
            kind: 'info',
          },
        ],
      });
    },
    [push, update],
  );

  const preview = useCallback((element: FxElement, shape: Spell['shape'], power: number, originEl?: Element | null) => {
    const from = centerOf(originEl);
    perform({ element, shape, from, to: shape === 'touch' ? undefined : fx.defaultTarget(from), power, outcome: 'hit', label: 'Preview' });
  }, []);

  return useMemo(
    () => ({
      log,
      latest,
      dismissLatest: () => setLatest(null),
      clearLog: () => setLog([]),
      adv,
      setAdv,
      targetAc,
      setTargetAc,
      test,
      freeRoll,
      attack,
      cast,
      slotChoices,
      useFeature,
      standardAction,
      move,
      newTurn,
      damageSelf,
      healSelf,
      deathSave,
      spendHitDie,
      rest,
      preview,
    }),
    [log, latest, adv, targetAc, test, freeRoll, attack, cast, slotChoices, useFeature, standardAction, move, newTurn, damageSelf, healSelf, deathSave, spendHitDie, rest, preview],
  );
}

export type Table = ReturnType<typeof useTableState>;

export const TableContext = createContext<Table | null>(null);

export function useTable(): Table {
  const t = useContext(TableContext);
  if (!t) throw new Error('useTable outside TableContext');
  return t;
}

export function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

export { signed };
