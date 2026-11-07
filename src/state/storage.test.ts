import { beforeEach, describe, expect, it } from 'vitest';
import { sampleCharacter } from '../systems/dnd5e/sample';
import { load, parseImport, save, saveMakingRoom, defaultSettings, type Saved } from './storage';
import { blankCharacter, normalizeCharacter } from '../systems/dnd5e/model';

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

describe('saving when storage is full', () => {
  const point = (id: string, characterId: string, createdAt: number) => ({ id, characterId, name: id, createdAt, data: blankCharacter() });
  const state = (): Saved => ({
    characters: [blankCharacter()],
    currentId: 'x',
    settings: defaultSettings(),
    savedAt: 0,
    savePoints: [point('a1', 'a', 1), point('a2', 'a', 2), point('a3', 'a', 3), point('b1', 'b', 4), point('b2', 'b', 5)],
  });

  it('drops the oldest save points until it fits, keeping each character’s newest', () => {
    // A "storage" that fits at most 3 save points.
    const write = (s: Saved) => s.savePoints.length <= 3;
    const r = saveMakingRoom(state(), write)!;
    expect(r.dropped).toBe(2);
    expect(r.saved.savePoints.map((p) => p.id)).toEqual(['a3', 'b1', 'b2']);
  });

  it('gives up rather than delete a character’s last save point', () => {
    const r = saveMakingRoom(state(), (s) => s.savePoints.length === 0);
    expect(r).toBeNull();
  });

  it('saves as is when there is room', () => {
    expect(saveMakingRoom(state(), () => true)).toMatchObject({ dropped: 0 });
  });
});

describe('counters', () => {
  it('load from a save, with bad values made safe and old saves given none', () => {
    const c = normalizeCharacter({ ...sampleCharacter(), counters: [{ id: 'a', name: 'Arrows', value: 20, step: 1, start: 20 }, { name: 'Gold', value: 'x', step: -3 }, null] } as never);
    expect(c.counters).toEqual([
      { id: 'a', name: 'Arrows', value: 20, step: 1, start: 20 },
      { id: expect.any(String), name: 'Gold', value: 0, step: 1, start: 0 },
    ]);
    const { counters: _none, ...old } = sampleCharacter();
    expect(normalizeCharacter(old as never).counters).toEqual([]);
  });
});
