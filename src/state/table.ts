// The "table": everything that happens when you click something rollable.
// Rolls dice, applies the result to the character (slots, uses, HP), and fires the
// matching animation + sound. UI components only call these functions.
//
// Every roll is decided up front, then thrown as animated dice; the result card, any
// HP change and the spell or attack effect are revealed once the dice come to rest.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { describe, naturalD20, roll, rollDie, withModifier, type RollResult } from '../engine/dice';
import { centerOf, fx, perform, performAction, sound, throwPhases, weaponLook, type DicePhase, type StrikeLook, type Verdict } from '../fx';
import type { ActionMotion, Element as FxElement, Outcome, Point } from '../fx/types';
import { ABILITY_NAMES, classById, STANDARD_ACTIONS, type StandardActionId } from '../systems/dnd5e/data';
import type { CastingTime, Character, CustomDie, Feature, Spell, Weapon } from '../systems/dnd5e/model';
import {
  effectDice,
  incapacitatedBy,
  maxHp,
  mod as abilityModOf,
  planSpell,
  rollMode,
  resolveTokens,
  signed,
  speed,
  spellAbility,
  spellAttack,
  spellSaveDc,
  usesMax,
  weaponAbility,
  weaponAttack,
  type Breakdown,
  type TestKind,
} from '../systems/dnd5e/rules';
import { ABBR, attackVerdict, counted, diceOf, phaseOf, plain, shortLabel, tokenParts, unitOf, type Counted, type Part } from './tally';

export type Advantage = 'normal' | 'adv' | 'dis';

export interface RollLine {
  label: string;
  total: number;
  /** Shown instead of the number, e.g. the faces a custom die landed on. */
  text?: string;
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

interface Mode {
  adv: Advantage;
  /** Why the roll has (or doesn't have) Advantage, and which effects add dice. */
  note: string;
  /** Dice from effects like Bless, e.g. "+1d4". */
  extra: string;
  autoFail: string | null;
}
const natOf = (r: RollResult): 20 | 1 | undefined => {
  const n = naturalD20(r);
  return n === 20 ? 20 : n === 1 ? 1 : undefined;
};

interface Crit {
  element?: FxElement;
  headline?: string;
}

interface Tally {
  look: StrikeLook;
  element: FxElement;
}

/** Throws the dice (an attack's in two throws: to hit, then damage), then reveals the result. */
function stage(phases: DicePhase[], origin: Point, present: () => void, crit: Crit = {}, tally?: Tally) {
  throwPhases(phases, { from: origin, critElement: crit.element, critHeadline: crit.headline, look: tally?.look, element: tally?.element, onSettled: present });
}

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

  /**
   * Works out a d20 test's Advantage from your choice plus your conditions (one of each
   * cancels out, as the rules say), and the dice effects like Bless add.
   */
  const modeFor = useCallback(
    (kind: TestKind): Mode => {
      const c = charRef.current;
      const manual = takeAdv();
      const m = rollMode(c, kind);
      const advWhy = [...(manual === 'adv' ? ['your choice'] : []), ...m.adv];
      const disWhy = [...(manual === 'dis' ? ['your choice'] : []), ...m.dis];
      const adv: Advantage = advWhy.length && disWhy.length ? 'normal' : advWhy.length ? 'adv' : disWhy.length ? 'dis' : 'normal';
      const bonus = effectDice(c, kind);
      const notes: string[] = [];
      if (advWhy.length && disWhy.length) notes.push(`Advantage (${advWhy.join(', ')}) and Disadvantage (${disWhy.join(', ')}) cancel out`);
      else if (adv === 'adv') notes.push(`Advantage: ${advWhy.join(', ')}`);
      else if (adv === 'dis') notes.push(`Disadvantage: ${disWhy.join(', ')}`);
      if (bonus.names.length) notes.push(`+ ${bonus.names.join(', ')}`);
      return { adv, note: notes.join(' · '), extra: bonus.expr, autoFail: m.autoFail };
    },
    [takeAdv],
  );

  /** A warning when a condition stops you acting, shown on the result rather than blocking the tap. */
  const actingWarning = () => {
    const by = incapacitatedBy(charRef.current);
    return by ? `${by}: you can't take actions` : '';
  };

  /** Ability checks, saves, skills, initiative. */
  const test = useCallback(
    (title: string, b: Breakdown, originEl?: Element | null, subtitle?: string, kind: TestKind = { type: 'check', ability: 'str' }) => {
      const mode = modeFor(kind);
      if (mode.autoFail) {
        push({
          title,
          subtitle,
          lines: [{ label: 'Automatic failure', total: 0, detail: `${mode.autoFail}: you automatically fail Strength and Dexterity saving throws.`, kind: 'info' }],
        });
        return;
      }
      const r = roll(d20Expr(b.total, mode.adv) + mode.extra);
      const entry = {
        title,
        subtitle: [subtitle, mode.note].filter(Boolean).join(' · ') || undefined,
        lines: [{ label: title, total: r.total, detail: describe(r), kind: 'd20' as const, nat: natOf(r) }],
      };
      stage(plain(diceOf(r, undefined, true)), centerOf(originEl), () => push(entry), { headline: 'NATURAL 20!' });
    },
    [push, modeFor],
  );

  const freeRoll = useCallback(
    (expression: string, label?: string, originEl?: Element | null, element?: FxElement) => {
      const r = roll(expression);
      const single = naturalD20(r) !== undefined;
      const entry = {
        title: label ?? expression,
        lines: [{ label: r.successes !== undefined ? 'Successes' : 'Total', total: r.total, detail: describe(r), kind: 'dice' as const, nat: natOf(r) }],
        element,
      };
      stage(plain(diceOf(r, element, single)), centerOf(originEl), () => push(entry), { element, headline: 'NATURAL 20!' });
    },
    [push],
  );

  /** A saved die from the Dice page: a formula, or a die with its own labelled faces. */
  const rollCustom = useCallback(
    (die: CustomDie, originEl?: Element | null) => {
      if (die.kind === 'formula') {
        freeRoll(resolveTokens(die.formula, charRef.current), die.name, originEl, die.element);
        return;
      }
      const faces = die.faces.filter((f) => f.trim());
      if (faces.length < 2) return;
      const count = Math.max(1, Math.min(10, die.count));
      const landed = Array.from({ length: count }, () => faces[rollDie(faces.length) - 1]);
      const entry = {
        title: die.name,
        element: die.element,
        lines: [{ label: count > 1 ? `${count} dice` : 'Result', total: 0, text: landed.join(', '), detail: `${count}× d${faces.length} [${faces.join(' / ')}]`, kind: 'dice' as const }],
      };
      const specs = landed.map((v) => ({ sides: faces.length, value: v, faces, element: die.element }));
      stage(plain(specs), centerOf(originEl), () => push(entry));
    },
    [freeRoll, push],
  );

  /**
   * One attack roll (+ damage on a hit). Shared by weapons and attack spells. Returns the
   * result lines, and the attack and damage rolls for the tally.
   */
  const attackOnce = (
    toHit: Breakdown,
    mode: Mode,
    damage: { dice: string; type: string; known: Part[] }[],
    dmgBonus: number,
    look: { element?: FxElement; orb: boolean },
  ) => {
    const atk = roll(d20Expr(toHit.total, mode.adv) + mode.extra);
    const nat = naturalD20(atk);
    const ac = acRef.current;
    let outcome: Outcome = nat === 20 ? 'crit' : nat === 1 ? 'miss' : ac !== null ? (atk.total >= ac ? 'hit' : 'miss') : 'hit';
    const lines: RollLine[] = [
      { label: 'Attack', total: atk.total, detail: describe(atk) + (ac !== null ? ` vs AC ${ac}` : ''), kind: 'd20', nat: natOf(atk), outcome },
    ];
    const known = toHit.parts.map((p) => ({ label: shortLabel(p.label), value: p.value }));
    const attackRow = counted([{ r: atk, known, element: look.element, test: true, orb: look.orb }], atk.total, 'to hit', attackVerdict(outcome, nat, ac));
    const hits: { r: RollResult; known: Part[]; element: FxElement; orb: boolean }[] = [];
    let dealt = 0;
    if (outcome !== 'miss') {
      damage.forEach((d, i) => {
        const r = roll(i === 0 ? withModifier(d.dice, dmgBonus) : d.dice, { critical: outcome === 'crit' });
        dealt += Math.max(0, r.total);
        lines.push({ label: `${capital(d.type)} damage`, total: Math.max(0, r.total), detail: describe(r), kind: 'damage', outcome });
        hits.push({ r, known: d.known, element: d.type as FxElement, orb: look.orb });
      });
    }
    if (nat === 1) outcome = 'miss';
    return { lines, outcome, dealt, attackRow, hits };
  };

  const label = (outcome: Outcome, dealt: number, type: string) =>
    outcome === 'miss' ? 'MISS' : outcome === 'crit' ? `CRIT! ${dealt}` : `${dealt}${type ? ` ${type}` : ''}`;

  const attack = useCallback(
    (w: Weapon, originEl?: Element | null) => {
      const c = charRef.current;
      const mode = modeFor({ type: 'attack' });
      const ability = weaponAbility(c, w);
      const mod = abilityModOf(c, ability);
      const damage = w.damage.map((d, i) => ({ ...d, known: i === 0 ? [{ label: ABBR(ability), value: mod }, { label: 'MAGIC', value: w.magicBonus }] : [] }));
      const element = (w.damage[0]?.type ?? 'bludgeoning') as FxElement;
      const res = attackOnce(weaponAttack(c, w), mode, damage, mod + w.magicBonus, { orb: false });
      const warn = actingWarning();
      const from = centerOf(originEl);
      const to = fx.defaultTarget(from);
      spendTime('action');
      const phases = [phaseOf([res.attackRow])];
      if (res.hits.length) phases.push(phaseOf([counted(res.hits, res.dealt, unitOf(w.damage.map((d) => d.type)), undefined, res.outcome === 'crit')]));
      stage(
        phases,
        from,
        () => {
          perform({ element, shape: w.ranged ? 'bolt' : 'touch', from: w.ranged ? from : to, to, power: 0, outcome: res.outcome, label: label(res.outcome, res.dealt, '') });
          push({
            title: w.name,
            subtitle: [warn, mode.note, w.mastery ? `Mastery: ${w.mastery}` : ''].filter(Boolean).join(' · ') || undefined,
            lines: res.lines,
            element,
          });
        },
        { element, headline: 'CRITICAL!' },
        { look: weaponLook(w.name, w.damage[0]?.type ?? '', w.ranged), element },
      );
    },
    [push, spendTime, modeFor],
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
      const target = spell.shape === 'touch' ? undefined : to;
      const power = spell.level === 0 ? 0 : slotLevel;
      const lines: RollLine[] = [];
      const effects: (() => void)[] = [];
      // The tally: the attack rolls in one throw, then every die of damage (or healing) in the next.
      const attackRows: Counted[] = [];
      const amounts: { r: RollResult; known: Part[]; element: FxElement; orb: boolean }[] = [];
      let amount = 0;
      let verdict: Verdict | undefined;
      let crit = false;
      let healing: number | undefined;
      const mode: Mode = spell.resolution === 'attack' ? modeFor({ type: 'attack' }) : { adv: 'normal', note: '', extra: '', autoFail: null };
      const warn = spell.castingTime === 'other' ? '' : actingWarning();
      const levelText = spell.level === 0 ? 'Cantrip' : `${ordinal(slotLevel)}-level ${choice.kind === 'pact' ? 'pact slot' : choice.kind === 'free' ? '(no slot)' : 'slot'}`;
      const ability = spellAbility(c, spell);
      const raw = spell.damage.filter((p) => p.dice.trim());
      const damage = plan.damage.map((d, i) => ({ ...d, known: tokenParts(raw[i]?.dice ?? '', c, spell) }));

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
          const res = attackOnce(spellAttack(c, spell), mode, damage, 0, { element: spell.element, orb: true });
          const prefix = plan.instances > 1 ? `#${i + 1} ` : '';
          res.lines.forEach((l) => lines.push({ ...l, label: prefix + l.label }));
          attackRows.push(plan.instances > 1 ? { ...res.attackRow, row: { ...res.attackRow.row, caption: `${res.attackRow.row.caption} · #${i + 1}` } } : res.attackRow);
          amounts.push(...res.hits);
          amount += res.dealt;
          crit ||= res.outcome === 'crit';
          effects.push(() => perform({ element: spell.element, shape: spell.shape, from, to: target, power, outcome: res.outcome, label: label(res.outcome, res.dealt, typeOf), delayMs: i * stagger }));
        }
      } else if (spell.resolution === 'save' || spell.resolution === 'auto') {
        const dc = spellSaveDc(c, spell).total;
        if (spell.resolution === 'save') {
          lines.push({ label: `${ABILITY_NAMES[spell.saveAbility]} save`, total: dc, detail: `DC ${dc}${spell.halfOnSave ? ' · half damage on a success' : ' · no damage on a success'}`, kind: 'info' });
          verdict = { text: `DC ${dc}`, tone: 'info', note: `${ABBR(spell.saveAbility)} save${spell.halfOnSave ? ', half' : ''}` };
        }
        for (let i = 0; i < plan.instances; i++) {
          let dealt = 0;
          damage.forEach((d) => {
            const r = roll(d.dice);
            dealt += Math.max(0, r.total);
            const half = spell.resolution === 'save' && spell.halfOnSave ? ` (save: ${Math.floor(Math.max(0, r.total) / 2)})` : '';
            lines.push({ label: `${plan.instances > 1 ? `#${i + 1} ` : ''}${capital(d.type)} damage${half}`, total: Math.max(0, r.total), detail: describe(r), kind: 'damage' });
            amounts.push({ r, known: d.known, element: d.type as FxElement, orb: true });
          });
          amount += dealt;
          effects.push(() => perform({ element: spell.element, shape: spell.shape, from, to: target, power, outcome: 'hit', label: plan.damage.length ? `${dealt} ${typeOf}` : undefined, delayMs: i * stagger }));
        }
      } else if (spell.resolution === 'heal') {
        const r = roll(plan.healing || '0');
        healing = Math.max(0, r.total);
        lines.push({ label: 'Healing', total: healing, detail: describe(r), kind: 'healing' });
        amounts.push({ r, known: tokenParts(spell.healing, c, spell), element: 'healing', orb: true });
        amount = healing;
        const healed = healing;
        effects.push(() => perform({ element: spell.element, shape: spell.shape, from, to: target, power, outcome: 'hit', label: `+${healed}` }));
      } else {
        effects.push(() => perform({ element: spell.element, shape: spell.shape, from, to: target, power, label: spell.name }));
        lines.push({ label: spell.castingTimeText || 'Cast', total: 0, detail: spell.description || 'Cast.', kind: 'info' });
      }

      const entry = {
        title: spell.name,
        subtitle: [warn, levelText, ability ? `${ABILITY_NAMES[ability]} spell` : '', spell.concentration ? 'Concentration' : '', mode.note].filter(Boolean).join(' · '),
        lines,
        element: spell.element,
        healing,
      };
      const present = () => {
        effects.forEach((e) => e());
        push(entry);
      };
      const phases: DicePhase[] = [];
      if (attackRows.length) phases.push(phaseOf(attackRows));
      if (amounts.length) {
        const unit = spell.resolution === 'heal' ? 'healing' : unitOf(plan.damage.map((d) => d.type));
        phases.push(phaseOf([counted(amounts, amount, unit, verdict, crit)]));
      }
      if (phases.length) stage(phases, from, present, { element: spell.element, headline: 'CRITICAL!' }, { look: 'orb', element: spell.element });
      else present();
    },
    [push, spendTime, modeFor, update],
  );

  const useFeature = useCallback(
    (f: Feature, originEl?: Element | null) => {
      const c = charRef.current;
      const max = usesMax(c, f);
      if (max !== null && f.usesSpent >= max) {
        sound.click();
        push({ title: f.name, lines: [{ label: 'No uses left', total: 0, detail: `Recharges on a ${f.recharge === 'short' ? 'Short or Long' : 'Long'} Rest.`, kind: 'info' }] });
        return;
      }
      update((d) => {
        const target = d.features.find((x) => x.id === f.id);
        if (target && max !== null) target.usesSpent += 1;
      });
      spendTime(f.castingTime);
      const from = centerOf(originEl);
      if (!f.roll.trim()) {
        perform({ element: f.element, shape: f.shape, from, power: 1, outcome: 'hit', label: f.name });
        push({ title: f.name, subtitle: f.source || undefined, lines: [{ label: 'Used', total: 0, detail: f.description || f.name, kind: 'info' }], element: f.element });
        return;
      }
      const r = roll(resolveTokens(f.roll, c));
      const total = Math.max(0, r.total);
      const kind = f.rollKind === 'healing' ? 'healing' : f.rollKind === 'damage' ? 'damage' : 'dice';
      const entry = {
        title: f.name,
        subtitle: f.source || undefined,
        lines: [{ label: f.rollKind === 'healing' ? 'Healing' : f.rollKind === 'damage' ? 'Damage' : 'Result', total, detail: describe(r), kind } as RollLine],
        element: f.element,
        healing: f.rollKind === 'healing' ? total : undefined,
      };
      const unit = f.rollKind === 'healing' ? 'healing' : f.rollKind === 'damage' ? 'damage' : 'total';
      const tally = phaseOf([counted([{ r, known: tokenParts(f.roll, c), element: f.element, orb: true }], total, unit)]);
      stage(
        [tally],
        from,
        () => {
          perform({ element: f.element, shape: f.shape, from, power: 1, outcome: 'hit', label: f.rollKind === 'healing' ? `+${total}` : String(total) });
          push(entry);
        },
        {},
        { look: 'orb', element: f.element },
      );
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
      push({ title: def.name, lines: [{ label: 'Action', total: 0, detail: def.summary, kind: 'info' }] });
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
      push({ title: `Move ${feet} ft`, lines: [{ label: 'Movement left', total: Math.max(0, left), detail: left < 0 ? `${-left} ft over your Speed this turn.` : `${left} of ${budget} ft remaining this turn.`, kind: 'info' }] });
    },
    [push, update],
  );

  const newTurn = useCallback(() => {
    const ended = charRef.current.effects.filter((e) => e.rounds !== null && e.rounds <= 1).map((e) => e.name);
    update((d) => {
      d.turn = { action: false, bonus: false, reaction: false, movementUsed: 0, dashes: 0 };
      d.effects = d.effects.flatMap((e) => (e.rounds === null ? [e] : e.rounds <= 1 ? [] : [{ ...e, rounds: e.rounds - 1 }]));
    });
    sound.click();
    if (ended.length) push({ title: 'New turn', lines: [{ label: 'Ended', total: 0, detail: `${ended.join(', ')} ${ended.length === 1 ? 'has' : 'have'} worn off.`, kind: 'info' }] });
  }, [push, update]);

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
      push({ title: 'Took damage', lines: [{ label: 'Damage', total: amount, detail: notes.join(' ') || `${newHp} HP left.`, kind: 'damage' }] });
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
      const c = charRef.current;
      let detail: string;
      if (nat === 20) detail = 'Natural 20: you regain 1 Hit Point.';
      else if (nat === 1) detail = 'Natural 1: two failures.';
      else if (r.total >= 10) detail = c.deathSaves.successes + 1 >= 3 ? 'Third success: you are Stable.' : 'Success.';
      else detail = c.deathSaves.failures + 1 >= 3 ? 'Third failure: you die.' : 'Failure.';
      stage(
        plain(diceOf(r, undefined, true)),
        centerOf(originEl),
        () => {
          update((d) => {
            if (nat === 20) {
              d.hp.current = 1;
              d.deathSaves = { successes: 0, failures: 0 };
            } else if (nat === 1) d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 2);
            else if (r.total >= 10) d.deathSaves.successes = Math.min(3, d.deathSaves.successes + 1);
            else d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 1);
          });
          push({ title: 'Death saving throw', lines: [{ label: 'd20', total: r.total, detail: `${describe(r)} — ${detail}`, kind: 'd20', nat: natOf(r) }] });
        },
        { element: 'radiant', headline: 'BACK ON YOUR FEET!' },
      );
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
      const origin = centerOf(originEl);
      // Mark the die spent now so a double tap can't spend two.
      update((d) => {
        d.classes.find((x) => x.id === k.id)!.hitDiceUsed += 1;
      });
      stage(plain(diceOf(r, 'healing')), origin, () => {
        update((d) => {
          d.hp.current = Math.min(max, d.hp.current + gained);
        });
        fx.healed(origin, gained);
        push({ title: `Hit Die (d${die})`, subtitle: 'Short Rest', lines: [{ label: 'Hit Points regained', total: gained, detail: describe(r), kind: 'healing' }] });
      });
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
      push({
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
      rollCustom,
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
    [log, latest, adv, targetAc, test, freeRoll, rollCustom, attack, cast, slotChoices, useFeature, standardAction, move, newTurn, damageSelf, healSelf, deathSave, spendHitDie, rest, preview],
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
