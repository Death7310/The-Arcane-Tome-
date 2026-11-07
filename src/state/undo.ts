// Undo: the character as it was before each of your recent changes. Changes that come in a
// quick burst (typing a number, a spell that spends a slot and starts concentration and marks
// an enemy) are one step, so one Undo puts back the whole action.

import type { Character } from '../systems/dnd5e/model';

export const UNDO_LIMIT = 30;
/** Changes closer together than this are one step. */
export const GROUP_MS = 1200;

export interface UndoStack {
  past: Character[];
  lastAt: number;
}

export const emptyStack = (): UndoStack => ({ past: [], lastAt: 0 });

/** Remembers the character as it was before a change (unless it's part of the same burst). */
export function remember(stack: UndoStack, before: Character, now: number): UndoStack {
  if (stack.past.length && now - stack.lastAt < GROUP_MS) return { ...stack, lastAt: now };
  return { past: [...stack.past, structuredClone(before)].slice(-UNDO_LIMIT), lastAt: now };
}

/** Takes back the newest step: the character to restore, and what's left to undo. */
export function takeBack(stack: UndoStack): { stack: UndoStack; restore: Character | null } {
  const restore = stack.past.at(-1) ?? null;
  return { stack: { past: stack.past.slice(0, -1), lastAt: 0 }, restore };
}
