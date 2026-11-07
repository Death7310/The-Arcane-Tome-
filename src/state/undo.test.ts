import { describe, expect, it } from 'vitest';
import { blankCharacter } from '../systems/dnd5e/model';
import { emptyStack, GROUP_MS, remember, takeBack, UNDO_LIMIT } from './undo';

const at = (hp: number) => {
  const c = blankCharacter();
  c.hp.current = hp;
  return c;
};

describe('undo', () => {
  it('takes back changes one step at a time, newest first', () => {
    let s = emptyStack();
    s = remember(s, at(30), 0);
    s = remember(s, at(25), GROUP_MS * 2);
    let r = takeBack(s);
    expect(r.restore?.hp.current).toBe(25);
    r = takeBack(r.stack);
    expect(r.restore?.hp.current).toBe(30);
    expect(takeBack(r.stack).restore).toBeNull();
  });

  it('counts a quick burst of changes as one step, restoring the state before the burst', () => {
    let s = emptyStack();
    s = remember(s, at(30), 1000);
    s = remember(s, at(29), 1300);
    s = remember(s, at(28), 1700);
    expect(s.past).toHaveLength(1);
    expect(takeBack(s).restore?.hp.current).toBe(30);
  });

  it('keeps its own copy, and only the most recent steps', () => {
    const c = at(10);
    let s = remember(emptyStack(), c, 0);
    c.hp.current = 99;
    expect(s.past[0].hp.current).toBe(10);
    for (let i = 1; i <= UNDO_LIMIT + 5; i++) s = remember(s, at(i), i * GROUP_MS * 2);
    expect(s.past).toHaveLength(UNDO_LIMIT);
  });
});
