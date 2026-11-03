import { describe, expect, it } from 'vitest';
import {
  acText,
  attackAgainst,
  autoFailsSave,
  concentrationDc,
  damageTo,
  endConcentration,
  enemiesFromCreature,
  hurt,
  knownAc,
  learnAc,
  markFromSpell,
  quickEnemies,
  nextTurn,
  startFight,
  statusOf,
  tally,
} from './enemies';
import { blankCharacter, blankEnemy } from './model';
import srdCreatures from './srd/creatures.json';
import srdSpells from './srd/spells.json';
import type { CreatureDef, SpellDef } from './srd';

const creatures = srdCreatures as unknown as CreatureDef[];
const spell = (n: string) => (srdSpells as unknown as SpellDef[]).find((s) => s.name === n)!;

describe('adding enemies', () => {
  it('numbers several of a kind, carrying on from ones already there', () => {
    const first = quickEnemies('Goblin', 3, [], { ac: 15 });
    expect(first.map((e) => [e.name, e.ac])).toEqual([['Goblin 1', 15], ['Goblin 2', 15], ['Goblin 3', 15]]);
    expect(quickEnemies('Goblin', 2, first).map((e) => e.name)).toEqual(['Goblin 4', 'Goblin 5']);
    expect(quickEnemies('Bandit Captain', 1, first).map((e) => e.name)).toEqual(['Bandit Captain']);
  });

  it('keeps a creature list pick hidden: no AC or HP used until revealed', () => {
    const [g] = enemiesFromCreature(creatures.find((c) => c.name === 'Goblin Warrior')!, 1, [], false);
    expect(g.name).toBe('Goblin Warrior');
    expect(knownAc(g, creatures)).toBeNull();
    expect(acText(g, creatures)).toBe('AC ?');
    g.revealed = true;
    expect(knownAc(g, creatures)).toBe(15);
  });
});

describe('working out an unknown AC', () => {
  it('narrows from hits and misses, ignoring natural 20s and 1s, until it is known', () => {
    const e = blankEnemy({ name: 'Ogre' });
    learnAc(e, 17, true);
    expect(acText(e)).toBe('AC ≤17');
    learnAc(e, 14, false);
    expect(acText(e)).toBe('AC 15–17');
    learnAc(e, 25, true, 20);
    learnAc(e, 3, false, 1);
    expect(acText(e)).toBe('AC 15–17');
    learnAc(e, 15, true);
    expect(e.ac).toBe(15);
    expect(acText(e)).toBe('AC 15');
  });
});

describe('conditions on an enemy change your attacks (2024 rules)', () => {
  const e = (...conditions: string[]) => blankEnemy({ conditions: conditions as never });
  it('gives Advantage against Blinded, Restrained, Stunned and the like', () => {
    expect(attackAgainst(e('stunned'), false).adv).toEqual(["it's Stunned"]);
    expect(attackAgainst(e('restrained', 'blinded'), true).adv).toHaveLength(2);
  });
  it('makes Prone depend on distance', () => {
    expect(attackAgainst(e('prone'), false)).toMatchObject({ adv: ["it's Prone (within 5 ft)"], dis: [] });
    expect(attackAgainst(e('prone'), true)).toMatchObject({ adv: [], dis: ["it's Prone (beyond 5 ft)"] });
    const close = blankEnemy({ conditions: ['prone'], near: true });
    expect(attackAgainst(close, true).adv).toHaveLength(1);
  });
  it('turns hits within 5 feet on a Paralyzed or Unconscious foe into critical hits', () => {
    expect(attackAgainst(e('paralyzed'), false).autoCrit).toMatch(/critical/);
    expect(attackAgainst(e('paralyzed'), true).autoCrit).toBeNull();
  });
  it('gives Disadvantage against Invisible, and nothing for Poisoned, Frightened or Charmed', () => {
    expect(attackAgainst(e('invisible'), false).dis).toEqual(["it's Invisible"]);
    expect(attackAgainst(e('poisoned', 'frightened', 'charmed'), false)).toEqual({ adv: [], dis: [], autoCrit: null });
  });
  it('makes Stunned and Petrified foes fail Strength and Dexterity saves only', () => {
    expect(autoFailsSave(e('stunned'), 'dex')).toMatch(/fails DEX/);
    expect(autoFailsSave(e('stunned'), 'wis')).toBeNull();
    expect(autoFailsSave(e('poisoned'), 'dex')).toBeNull();
  });
});

describe('damage to an enemy', () => {
  it('applies resistance, immunity, vulnerability and Petrified', () => {
    const e = blankEnemy({ resist: ['fire'], immune: ['poison'], vulnerable: ['radiant'] });
    expect(damageTo(e, 9, 'fire').amount).toBe(4);
    expect(damageTo(e, 9, 'poison').amount).toBe(0);
    expect(damageTo(e, 9, 'radiant').amount).toBe(18);
    expect(damageTo(blankEnemy({ conditions: ['petrified'] }), 9, 'piercing')).toMatchObject({ amount: 4, note: expect.stringMatching(/Petrified/) });
  });

  it('keeps a running tally by you, your companions and your party, and works out Bloodied from known HP', () => {
    const e = blankEnemy({ maxHp: 40 });
    hurt(e, { roll: 'a', who: 'you', name: '', amount: 12, type: 'piercing', what: 'Longbow' });
    hurt(e, { roll: 'a', who: 'you', name: '', amount: 4, type: 'force', what: "Hunter's Mark" });
    hurt(e, { roll: 'b', who: 'companion', name: 'Artex', amount: 6, type: 'piercing', what: 'Bite' });
    hurt(e, { roll: 'c', who: 'party', name: 'Thorn', amount: 9, type: 'slashing', what: 'Greataxe' });
    expect(tally(e)).toEqual({ you: 16, companions: [['Artex', 6]], party: [['Thorn', 9]], total: 31 });
    expect(statusOf(e)).toBe('badly');
    // Unknown HP: the status is whatever you set.
    expect(statusOf(blankEnemy({ status: 'bloodied' }))).toBe('bloodied');
  });
});

describe('marks and concentration', () => {
  it('reads Hunter’s Mark and Hex as extra damage on your hits, tied to concentration', () => {
    expect(markFromSpell(spell("Hunter's Mark"))).toEqual({ name: "Hunter's Mark", dice: '1d6', type: 'force', spell: "Hunter's Mark" });
    expect(markFromSpell(spell('Hex'))).toEqual({ name: 'Hex', dice: '1d6', type: 'necrotic', spell: 'Hex' });
    expect(markFromSpell(spell('Fire Bolt'))).toBeNull();
  });

  it('works out the DC: 10, or half the damage, up to 30', () => {
    expect(concentrationDc(9)).toBe(10);
    expect(concentrationDc(30)).toBe(15);
    expect(concentrationDc(99)).toBe(30);
  });

  it('ending concentration removes that spell’s marks from every enemy, and only those', () => {
    const c = blankCharacter();
    c.spellcasting.concentratingOn = "Hunter's Mark";
    c.enemies = [
      blankEnemy({ name: 'A', marks: [{ id: '1', name: "Hunter's Mark", dice: '1d6', type: 'force', spell: "Hunter's Mark" }] }),
      blankEnemy({ name: 'B', marks: [{ id: '2', name: 'Blessed blade', dice: '1d4', type: 'radiant', spell: '' }] }),
    ];
    expect(endConcentration(c)).toBe("Hunter's Mark");
    expect(c.spellcasting.concentratingOn).toBeNull();
    expect(c.enemies.map((e) => e.marks.length)).toEqual([0, 1]);
    expect(endConcentration(c)).toBeNull();
  });
});

describe('initiative', () => {
  const setup = () => {
    const c = blankCharacter();
    c.name = 'Vex';
    c.companions = [{ id: 'artex', name: 'Artex' } as never];
    c.enemies = [blankEnemy({ id: 'g1', name: 'Goblin 1' }), blankEnemy({ id: 'g2', name: 'Goblin 2' })];
    return c;
  };

  it('orders everyone by initiative, with your companion right after you', () => {
    const c = setup();
    const f = startFight(c, 14, { enemies: { g1: 17, g2: 9 }, allies: [['Thorn', 12]] });
    expect(f.order.map((x) => x.name)).toEqual(['Goblin 1', 'Vex', 'Artex', 'Thorn', 'Goblin 2']);
    expect(f).toMatchObject({ round: 1, turn: 0 });
  });

  it('moves turn by turn, skipping enemies that are down, and counts rounds', () => {
    const c = setup();
    let f = startFight(c, 14, { enemies: { g1: 17, g2: 9 }, allies: [] });
    // Goblin 1 → Vex → Artex → Goblin 2 → (round 2) Goblin 1
    const names: string[] = [];
    c.enemies[1].status = 'down';
    for (let i = 0; i < 4; i++) {
      const r = nextTurn(f, c.enemies);
      f = r.fight;
      names.push(`${f.round}:${f.order[f.turn].name}`);
    }
    expect(names).toEqual(['1:Vex', '1:Artex', '2:Goblin 1', '2:Vex']);
  });
});
