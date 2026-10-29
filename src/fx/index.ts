import { rollDice, setDiceSurface, type DicePhase, type DieSpec, type DiceRollOptions } from './dice';
import { fx } from './engine';
import { sound } from './sound';
import type { ActionMotion, EffectRequest, Point } from './types';

export { fx, sound, setDiceSurface, type DicePhase, type DieSpec };
export { weaponLook, type StrikeLook } from './strikes';
export type { TallyRow, Verdict } from './ledger';

export type DiceSpeed = 'full' | 'quick' | 'off';
let diceSpeed: DiceSpeed = 'full';
export const setDiceSpeed = (s: DiceSpeed) => (diceSpeed = s);
let tallyOn = true;
/** Whether attacks and spells count their rolls up hit by hit on the tray. */
export const setTally = (on: boolean) => (tallyOn = on);

/** Plays an effect's animation and its matching sound, kept in sync. Returns ms until impact. */
export function perform(req: EffectRequest): number {
  const travel = fx.play(req);
  const playSound = () => sound.element(req.element, { power: req.power, outcome: req.outcome, shape: req.shape, travel: travel / 1000 });
  if (req.delayMs) window.setTimeout(playSound, req.delayMs);
  else playSound();
  return travel;
}

export function performAction(motion: ActionMotion, from: Point, label?: string) {
  fx.action(motion, from, label);
  sound.action(motion);
}

/** Throws animated dice for a finished roll, or, with dice animation off, reveals it at once. */
export function throwDice(specs: DieSpec[], opts: Omit<DiceRollOptions, 'speed'>) {
  throwPhases([{ dice: specs, rows: [] }], opts);
}

/**
 * Throws an attack's or spell's dice one phase at a time (attack roll, then damage),
 * counting each up hit by hit when the tally is on.
 */
export function throwPhases(phases: DicePhase[], opts: Omit<DiceRollOptions, 'speed'>) {
  const all = phases.flatMap((p) => p.dice);
  if (diceSpeed === 'off' || fx.level === 'off' || all.length === 0) {
    if (all.length) sound.dice(all.length);
    const test = all.find((s) => s.test && s.kept !== false);
    if (test?.value === 20 || test?.value === 1) {
      const kind = test.value === 20 ? 'nat20' : 'nat1';
      fx.natural(opts.from ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }, kind);
      sound.natural(kind);
    }
    opts.onSettled();
    return;
  }
  rollDice(tallyOn ? phases : [{ dice: all, rows: [] }], { ...opts, speed: diceSpeed });
}

/** Centre of an element on screen, used as the origin of an effect. */
export function centerOf(el: Element | null | undefined): Point {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight * 0.7 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
