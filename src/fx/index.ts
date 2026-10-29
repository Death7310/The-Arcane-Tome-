import { fx } from './engine';
import { sound } from './sound';
import type { ActionMotion, EffectRequest, Point } from './types';

export { fx, sound };

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

/** Centre of an element on screen, used as the origin of an effect. */
export function centerOf(el: Element | null | undefined): Point {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight * 0.7 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
