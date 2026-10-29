import { beforeEach, describe, expect, it } from 'vitest';
import { sampleCharacter } from '../systems/dnd5e/sample';
import { load, parseImport, save, defaultSettings } from './storage';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

describe('saves from the Arcane Folio name', () => {
  beforeEach(() => store.clear());

  it('are picked up when nothing is saved under Arcane Tome yet', () => {
    const c = sampleCharacter();
    store.set('arcane-folio:v1', JSON.stringify({ characters: [c], currentId: c.id, settings: {} }));
    expect(load()?.characters[0].name).toBe(c.name);
  });

  it('give way to newer Arcane Tome saves', () => {
    const old = sampleCharacter();
    const now = { ...sampleCharacter(), name: 'Current' };
    store.set('arcane-folio:v1', JSON.stringify({ characters: [old], currentId: old.id, settings: {} }));
    save({ characters: [now], currentId: now.id, settings: defaultSettings(), savePoints: [], savedAt: Date.now() });
    expect(load()?.characters[0].name).toBe('Current');
  });

  it('old backup files still restore', () => {
    const c = sampleCharacter();
    expect(parseImport(JSON.stringify({ format: 'arcane-folio-backup', version: 1, characters: [c] }))[0].id).toBe(c.id);
  });
});

describe('save points', async () => {
  const { addSavePoint, parseSaved, SAVE_POINTS_PER_CHARACTER } = await import('./storage');
  const { blankCharacter } = await import('../systems/dnd5e/model');

  it('keep an independent copy of the character', () => {
    const c = sampleCharacter();
    const points = addSavePoint([], c, 'Before the dragon');
    c.hp.current = 1;
    expect(points[0].data.hp.current).not.toBe(1);
    expect(points[0].name).toBe('Before the dragon');
  });

  it("keep each character's newest saves and leave other characters' alone", () => {
    const a = sampleCharacter();
    const b = blankCharacter();
    let points = addSavePoint([], b, 'B save');
    for (let i = 0; i < SAVE_POINTS_PER_CHARACTER + 5; i++) points = addSavePoint(points, a, `A ${i}`);
    const mine = points.filter((p) => p.characterId === a.id);
    expect(mine).toHaveLength(SAVE_POINTS_PER_CHARACTER);
    expect(mine[0].name).toBe(`A ${SAVE_POINTS_PER_CHARACTER + 4}`);
    expect(points.some((p) => p.name === 'B save')).toBe(true);
  });

  it('survive a save and reload, and older saves without them still load', () => {
    const c = sampleCharacter();
    const raw = JSON.stringify({ characters: [c], currentId: c.id, settings: defaultSettings(), savePoints: addSavePoint([], c, 'X'), savedAt: 5 });
    expect(parseSaved(raw)?.savePoints[0].name).toBe('X');
    expect(parseSaved(JSON.stringify({ characters: [c], currentId: c.id }))?.savePoints).toEqual([]);
  });

  it('custom dice come back from older saves as an empty list', () => {
    const c = sampleCharacter() as Partial<ReturnType<typeof sampleCharacter>>;
    delete c.customDice;
    expect(parseSaved(JSON.stringify({ characters: [c], currentId: c.id }))?.characters[0].customDice).toEqual([]);
  });
});
