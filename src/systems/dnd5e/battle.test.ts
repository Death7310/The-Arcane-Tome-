import { describe, expect, it } from 'vitest';
import {
  allyWho,
  autoName,
  battleStats,
  battleText,
  companionWho,
  endBattle,
  enemyWho,
  eventText,
  hitRateText,
  inBattle,
  logEvent,
  openEvents,
  rangeText,
  retarget,
  settlePlan,
  settleRoll,
  withDamage,
  youWho,
} from './battle';
import { quickEnemies, tally } from './enemies';
import { blankCharacter, blankCompanion, normalizeCharacter, readBattle, type Character, type RolledDamage } from './model';

const fire = (amount: number): RolledDamage => ({ amount, type: 'fire', what: 'Fireball', who: 'you', name: '' });

function table(): Character {
  const c = blankCharacter();
  c.name = 'Anaurys';
  c.enemies = quickEnemies('Goblin', 2, [], { ac: 13, maxHp: 20 });
  return c;
}

describe('a battle starts with the first thing that happens in a fight', () => {
  it('keeps nothing with no enemies and no fight', () => {
    const c = blankCharacter();
    expect(inBattle(c)).toBe(false);
    expect(logEvent(c, { kind: 'damage', by: null, target: youWho(c), what: 'Fall', low: 3, high: 3, type: 'bludgeoning', roll: 'r' })).toBe(false);
    expect(c.battle).toBeNull();
  });

  it('starts one with everyone on the field once there are enemies', () => {
    const c = table();
    c.companions = [blankCompanion({ id: 'k1', name: 'Artex' })];
    logEvent(c, { kind: 'damage', by: allyWho('Mira'), target: enemyWho(c.enemies[0]), what: 'Sacred Flame', low: 5, high: 5, type: 'radiant', roll: 'r' });
    expect(c.battle!.combatants.map((w) => w.name)).toEqual(['Anaurys', 'Artex', 'Goblin 1', 'Goblin 2', 'Mira']);
    expect(c.battle!.events).toHaveLength(1);
  });
});

describe('a save spell nobody knows the saves for counts as a range', () => {
  it('counts half to full on each goblin, and lands what happened once the DM says', () => {
    const c = table();
    const [g1, g2] = c.enemies;
    for (const g of [g1, g2])
      logEvent(c, withDamage(c, { kind: 'save', by: youWho(c), target: enemyWho(g), what: 'Fireball', ability: 'dex', dc: 13, saved: null, half: true, pieces: [fire(12), fire(9)], roll: 'fb' }));
    expect(c.battle!.events.map((e) => [e.low, e.high])).toEqual([
      [10, 21],
      [10, 21],
    ]);
    expect(battleStats(c.battle!)[0].dealt).toEqual({ low: 20, high: 42 });
    expect(rangeText(battleStats(c.battle!)[0].dealt)).toBe('20–42');
    expect(openEvents(c.battle)).toHaveLength(2);

    settleRoll(c, 'fb', g1.id, 'saved');
    settleRoll(c, 'fb', g2.id, 'failed');
    expect(tally(c.enemies[0]).you).toBe(10); // 6 + 4, each roll halved and rounded down
    expect(tally(c.enemies[1]).you).toBe(21);
    const you = battleStats(c.battle!)[0];
    expect(you.dealt).toEqual({ low: 31, high: 31 });
    expect(you.forced).toEqual({ made: 1, failed: 1, unknown: 0 });
    expect(openEvents(c.battle)).toHaveLength(0);
  });

  it('works the range out after resistances, and none on a save for no-half spells', () => {
    const c = table();
    c.enemies[0].resist = ['fire'];
    logEvent(c, withDamage(c, { kind: 'save', by: youWho(c), target: enemyWho(c.enemies[0]), what: 'Fireball', ability: 'dex', saved: null, half: true, pieces: [fire(12)], roll: 'a' }));
    logEvent(c, withDamage(c, { kind: 'save', by: youWho(c), target: enemyWho(c.enemies[1]), what: 'Sacred Flame', ability: 'dex', saved: null, half: false, pieces: [fire(8)], roll: 'b' }));
    expect(c.battle!.events.map((e) => [e.low, e.high])).toEqual([
      [3, 6],
      [0, 8],
    ]);
  });

  it('never lands the same damage twice, whether answered on the roll or in the battle', () => {
    const c = table();
    const g = c.enemies[0];
    logEvent(c, withDamage(c, { kind: 'save', by: youWho(c), target: enemyWho(g), what: 'Fireball', ability: 'dex', saved: null, half: true, pieces: [fire(12)], roll: 'fb' }));
    settleRoll(c, 'fb', g.id, 'failed');
    expect(settlePlan(c, 'fb', g.id, 'failed', { pieces: [fire(12)], half: true })).toEqual({ land: [], events: [], already: true });
    settleRoll(c, 'fb', g.id, 'failed', { pieces: [fire(12)], half: true });
    expect(tally(c.enemies[0]).you).toBe(12);
  });

  it('falls back to the roll’s own damage when the battle has no record of it', () => {
    const c = table();
    settleRoll(c, 'old', c.enemies[0].id, 'saved', { pieces: [fire(9)], half: true });
    expect(tally(c.enemies[0]).you).toBe(4);
  });
});

describe('an attack the DM hasn’t confirmed', () => {
  it('counts 0 to its damage, with a companion’s reaction riding on it, until Hit or Miss', () => {
    const c = table();
    const g = c.enemies[0];
    const slash: RolledDamage = { amount: 7, type: 'slashing', what: 'Scimitar', who: 'you', name: '' };
    const bite: RolledDamage = { amount: 4, type: 'poison', what: 'Infused Strikes', who: 'companion', name: 'Artex' };
    logEvent(c, withDamage(c, { kind: 'attack', by: youWho(c), target: enemyWho(g), what: 'Scimitar', result: 'unknown', pieces: [slash], roll: 'x' }));
    logEvent(c, withDamage(c, { kind: 'damage', by: companionWho({ id: 'k1', name: 'Artex' }), target: enemyWho(g), what: 'Infused Strikes', result: 'unknown', pieces: [bite], roll: 'x' }));
    expect(battleStats(c.battle!).find((s) => s.who.side === 'you')!.dealt).toEqual({ low: 0, high: 7 });
    settleRoll(c, 'x', g.id, 'hit');
    expect(tally(c.enemies[0]).total).toBe(11);
    const stats = battleStats(c.battle!);
    expect(stats.find((s) => s.who.side === 'you')).toMatchObject({ attacks: 1, hits: 1, dealt: { low: 7, high: 7 } });
    expect(stats.find((s) => s.who.name === 'Artex')!.dealt).toEqual({ low: 4, high: 4 });
  });

  it('deals nothing on a miss, and follows the roll to another enemy', () => {
    const c = table();
    const [g1, g2] = c.enemies;
    g2.immune = ['slashing'];
    logEvent(c, withDamage(c, { kind: 'attack', by: youWho(c), target: enemyWho(g1), what: 'Scimitar', result: 'unknown', pieces: [{ amount: 7, type: 'slashing', what: 'Scimitar', who: 'you', name: '' }], roll: 'x' }));
    retarget(c, 'x', g1.id, g2);
    expect(c.battle!.events[0]).toMatchObject({ target: { name: 'Goblin 2' }, low: 0, high: 0 });
    settleRoll(c, 'x', g2.id, 'miss');
    expect(battleStats(c.battle!)[0]).toMatchObject({ attacks: 1, misses: 1, hitRate: 0 });
  });
});

describe('battle stats', () => {
  it('counts hit rates, crits, damage both ways, saves, CON saves and concentration', () => {
    const c = table();
    const you = youWho(c);
    const g = enemyWho(c.enemies[0]);
    const atk = (result: 'hit' | 'crit' | 'miss', low: number) => logEvent(c, { kind: 'attack', by: you, target: g, what: 'Scimitar', result, low, high: low, type: 'slashing', roll: 'r' });
    atk('hit', 6);
    atk('crit', 13);
    atk('miss', 0);
    atk('hit', 5);
    logEvent(c, { kind: 'attack', by: g, target: you, what: 'Scimitar', result: 'hit', low: 5, high: 5, type: 'slashing', roll: 'r2' });
    logEvent(c, { kind: 'save', by: null, target: you, what: 'Concentration', ability: 'con', dc: 10, saved: true, concentration: true, low: 0, high: 0, type: '', roll: 'r3' });
    logEvent(c, { kind: 'save', by: null, target: you, what: 'Concentration', ability: 'con', dc: 12, saved: false, concentration: true, low: 0, high: 0, type: '', roll: 'r4' });
    logEvent(c, { kind: 'save', by: g, target: you, what: 'Poison spray', ability: 'con', saved: true, low: 0, high: 0, type: '', roll: 'r5' });
    const [me, goblin] = battleStats(c.battle!).filter((s) => s.who.side === 'you' || s.who.ref === g.ref);
    expect(me).toMatchObject({ attacks: 4, hits: 3, crits: 1, misses: 1, dealt: { low: 24, high: 24 }, taken: { low: 5, high: 5 } });
    expect(hitRateText(me)).toBe('3 of 4 (75%)');
    expect(me.saves).toEqual({ made: 2, failed: 1, unknown: 0 });
    expect(me.con).toEqual({ made: 2, failed: 1 });
    expect(me.concentration).toEqual({ kept: 1, lost: 1 });
    expect(goblin).toMatchObject({ attacks: 1, hits: 1, taken: { low: 24, high: 24 }, forced: { made: 1, failed: 0, unknown: 0 } });
    expect(eventText(c.battle!.events[1])).toBe('Anaurys → Goblin 1: Scimitar, crit, 13 slashing');
    expect(eventText(c.battle!.events[5])).toBe('Anaurys: CON concentration save (DC 10) made');
  });
});

describe('ending a battle', () => {
  it('keeps it newest first, named for its enemies, with how each one ended up', () => {
    const c = table();
    c.fight = { round: 3, turn: 0, order: [{ id: 'f', kind: 'you', ref: '', name: 'Anaurys', initiative: 15 }] };
    logEvent(c, { kind: 'attack', by: youWho(c), target: enemyWho(c.enemies[0]), what: 'Scimitar', result: 'hit', low: 20, high: 20, type: 'slashing', roll: 'r' });
    c.enemies[0].hits.push({ id: 'h', roll: 'r', who: 'you', name: '', amount: 20, type: 'slashing', what: 'Scimitar', time: 0 });
    const kept = endBattle(c);
    expect(kept).toMatchObject({ name: 'Goblin ×2', rounds: 3 });
    expect(kept!.enemies).toEqual([
      { ref: c.enemies[0].id, name: 'Goblin 1', status: 'down' },
      { ref: c.enemies[1].id, name: 'Goblin 2', status: 'healthy' },
    ]);
    expect(c.battle).toBeNull();
    expect(c.battles[0].id).toBe(kept!.id);
    expect(battleText(kept!)).toContain('Anaurys: hit 1 of 1 (100%); dealt 20');
  });

  it('keeps only the last 50, without the rolls of settled events', () => {
    const c = table();
    for (let i = 0; i < 55; i++) {
      logEvent(c, withDamage(c, { kind: 'attack', by: youWho(c), target: enemyWho(c.enemies[0]), what: `Swing ${i}`, result: 'hit', pieces: [fire(3)], roll: `r${i}` }));
      endBattle(c);
    }
    expect(c.battles).toHaveLength(50);
    expect(c.battles[0].events[0]).toMatchObject({ what: 'Swing 54', low: 3, high: 3 });
    expect(c.battles[0].events[0].pieces).toBeUndefined();
  });

  it('keeps nothing from a battle where nothing happened', () => {
    const c = table();
    c.battle = { id: 'b', name: '', started: 0, ended: null, rounds: 0, combatants: [], events: [], enemies: [] };
    expect(endBattle(c)).toBeNull();
    expect(c.battles).toEqual([]);
  });

  it('names a battle with many kinds of foe in short', () => {
    const who = (name: string) => ({ side: 'enemy' as const, name, ref: name });
    expect(autoName({ combatants: ['Goblin 1', 'Goblin 2', 'Wolf', 'Bugbear', 'Ogre', 'Hag'].map(who) })).toBe('Goblin ×2, Wolf, Bugbear, Ogre…');
    expect(autoName({ combatants: [] })).toBe('Battle');
  });
});

describe('saved battles survive a reload and a bad file', () => {
  it('reads them back, repairing what it can', () => {
    const c = table();
    logEvent(c, withDamage(c, { kind: 'save', by: youWho(c), target: enemyWho(c.enemies[0]), what: 'Fireball', ability: 'dex', saved: null, half: true, pieces: [fire(12)], roll: 'fb' }));
    endBattle(c);
    const again = normalizeCharacter(JSON.parse(JSON.stringify(c)));
    expect(again.battles[0].events[0]).toMatchObject({ kind: 'save', saved: null, low: 6, high: 12, pieces: [{ amount: 12, type: 'fire' }] });
    expect(readBattle({ events: [{ kind: 'nope' }, { kind: 'attack', low: -4, high: 'x', by: { side: 'boss' }, result: 'maybe' }] })).toMatchObject({
      events: [{ kind: 'attack', low: 0, high: 0, by: null }],
    });
    expect(readBattle({ name: 'no events' })).toBeNull();
    expect(normalizeCharacter({ ...JSON.parse(JSON.stringify(c)), battles: 'junk', battle: 7 })).toMatchObject({ battles: [], battle: null });
  });
});
