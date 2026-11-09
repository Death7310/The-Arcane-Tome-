import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { applyPlay, capturePlay, gameStateFile, makeGameState, parseGameStateFile, readGameState } from './gamestate';
import { blankEnemy } from './model';
import { parseSaved } from '../../state/storage';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import type { Catalog } from './srd';

const cat = { classes, subclasses, feats, spells, creatures, items } as unknown as Catalog;

/** Anaurys mid-fight: hurt, spells spent, a goblin damaged, Artex in the order. */
function midFight() {
  const c = buildAnaurys(cat);
  c.hp.current = 19;
  c.hp.temp = 5;
  c.conditions = ['poisoned'];
  c.heroicInspiration = true;
  c.spellcasting.slotsUsed[0] = 2;
  c.spellcasting.pactUsed = 1;
  c.spellcasting.concentratingOn = "Hunter's Mark";
  c.features.find((f) => f.name === 'Favored Enemy')!.usesSpent = 1;
  c.features.find((f) => f.name === 'Ray of Sickness: free cast' && f.source === 'Magic Initiate (Wizard)')!.usesSpent = 1;
  c.classes[0].hitDiceUsed = 2;
  const goblin = blankEnemy({ id: 'g1', name: 'Goblin Boss', maxHp: 21, hits: [{ id: 'h', roll: '1', who: 'you', name: '', amount: 9, type: 'piercing', what: 'Shortbow', time: 1 }] });
  c.enemies = [goblin];
  c.targetId = 'g1';
  const artex = c.companions[0];
  artex.hp = 11;
  c.fight = { round: 3, turn: 1, order: [{ id: 'a', kind: 'you', ref: '', name: 'Anaurys', initiative: 17 }, { id: 'b', kind: 'companion', ref: artex.id, name: 'Artex', initiative: 17 }, { id: 'c', kind: 'enemy', ref: 'g1', name: 'Goblin Boss', initiative: 12 }] };
  c.counters = [{ id: 'k', name: 'Arrows', value: 14, step: 1, start: 20 }];
  c.currency.gp = 9;
  c.inventory.find((i) => i.name === 'Arrows')!.qty = 14;
  return c;
}

describe('game states', () => {
  it('carry a session onto a newer copy of the character, matching things by name', () => {
    const old = midFight();
    const g = makeGameState(old, 'Session 12');
    // A fresh build of the same character: new ids everywhere, nothing spent.
    const updated = buildAnaurys(cat);
    expect(updated.companions[0].id).not.toBe(old.companions[0].id);
    const missed = applyPlay(updated, g.state);
    expect(missed).toEqual([]);
    expect(updated.hp).toMatchObject({ current: 19, temp: 5 });
    expect(updated.conditions).toEqual(['poisoned']);
    expect(updated.heroicInspiration).toBe(true);
    expect(updated.spellcasting).toMatchObject({ pactUsed: 1, concentratingOn: "Hunter's Mark" });
    expect(updated.spellcasting.slotsUsed[0]).toBe(2);
    expect(updated.features.find((f) => f.name === 'Favored Enemy')!.usesSpent).toBe(1);
    // Two features share a name: each gets its own (matched by source).
    const rays = updated.features.filter((f) => f.name === 'Ray of Sickness: free cast');
    expect(rays.map((f) => [f.source, f.usesSpent])).toEqual([['Shadow Touched', 0], ['Magic Initiate (Wizard)', 1]]);
    expect(updated.classes[0].hitDiceUsed).toBe(2);
    expect(updated.enemies[0]).toMatchObject({ name: 'Goblin Boss', maxHp: 21 });
    expect(updated.enemies[0].hits[0].amount).toBe(9);
    expect(updated.targetId).toBe('g1');
    expect(updated.companions[0].hp).toBe(11);
    // The initiative order now points at this sheet's Artex.
    expect(updated.fight!.order[1].ref).toBe(updated.companions[0].id);
    expect(updated.counters[0].value).toBe(14);
    expect(updated.currency.gp).toBe(9);
    expect(updated.inventory.find((i) => i.name === 'Arrows')!.qty).toBe(14);
    // The build itself is untouched: his background entry is still there.
    expect(updated.features.some((f) => f.name === 'Background: Haunted One')).toBe(true);
  });

  it('report what the sheet it is loaded onto doesn’t have', () => {
    const g = makeGameState(midFight(), 'x');
    const other = buildAnaurys(cat);
    other.companions = [];
    other.features = other.features.filter((f) => f.name !== 'Favored Enemy');
    expect(applyPlay(other, g.state)).toEqual(['Favored Enemy (1 used)', 'companion Artex']);
  });

  it('go to a file and back, and survive being stored', () => {
    const g = makeGameState(midFight(), 'Goblin cave');
    const back = parseGameStateFile(gameStateFile(g));
    expect(back).toEqual(g);
    const stored = parseSaved(JSON.stringify({ characters: [midFight()], currentId: 'x', settings: {}, savePoints: [], gameStates: [g, { junk: true }], savedAt: 1 }));
    expect(stored?.gameStates.map((x) => x.name)).toEqual(['Goblin cave']);
  });

  it('refuse other files, and repair a damaged one', () => {
    expect(() => parseGameStateFile('not json')).toThrow(/valid JSON/);
    expect(() => parseGameStateFile(JSON.stringify({ format: 'arcane-tome-backup', characters: [] }))).toThrow(/isn’t an Arcane Tome game state/);
    const g = readGameState({ name: 'Odd', state: { hp: { current: 'lots' }, conditions: ['poisoned', 'cursed'], magic: { slotsUsed: [1, -2], highUsed: [6, 3] }, enemies: [{ name: 'Orc', ac: 'x' }], uses: [{ name: 'Rage', spent: 2 }, { nope: 1 }] } });
    expect(g.state.hp.current).toBe(0);
    expect(g.state.conditions).toEqual(['poisoned']);
    expect(g.state.magic.slotsUsed.slice(0, 2)).toEqual([1, 0]);
    expect(g.state.magic.highUsed).toEqual([6]);
    expect(g.state.enemies[0]).toMatchObject({ name: 'Orc', ac: null });
    expect(g.state.uses).toEqual([{ name: 'Rage', source: '', spent: 2 }]);
  });

  it('capture only play state, not the build', () => {
    const s = capturePlay(midFight());
    expect(Object.keys(s)).not.toContain('abilities');
    expect(Object.keys(s)).not.toContain('spells');
  });
});
