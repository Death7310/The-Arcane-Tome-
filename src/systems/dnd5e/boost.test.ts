import { describe, expect, it } from 'vitest';
import { safeRoll } from '../../engine/dice';
import { actionDice, actionType, availableBoosts, boostOf } from './companion';
import { blankCharacter, blankCompanion, blankCompanionAction, emptyTurn } from './model';
import { parseStatBlock, readAction } from './statblock';

// In our own words: a Drakewarden drake's reaction (Fizban's Treasury of Dragons).
const INFUSED = 'When another creature within 30 feet of the drake that it can see hits a target with a weapon attack, the drake infuses the strike with its essence, causing the attack to deal an extra 1d6 damage of the type determined by its Draconic Essence.';

const ranger = (level: number) => {
  const c = blankCharacter();
  c.classes = [
    { id: 'r', classId: 'ranger', subclass: 'Drakewarden', level, hitDiceUsed: 0 },
    { id: 'w', classId: 'warlock', subclass: '', level: 1, hitDiceUsed: 0 },
  ];
  return c;
};

describe('reactions that add damage to a hit', () => {
  it('reads Infused Strikes from its text, leaving the type to the drake’s essence', () => {
    const a = blankCompanionAction({ name: 'Infused Strikes', kind: 'reaction', text: INFUSED });
    expect(boostOf(a)).toEqual({ dice: '1d6', type: '' });
    expect(boostOf({ ...a, damageType: 'fire' })).toEqual({ dice: '1d6', type: 'fire' });
    expect(actionDice(a, ranger(7))).toBe('1d6');
  });

  it('leaves ordinary actions alone, and can be switched off', () => {
    expect(boostOf(blankCompanionAction({ name: 'Bite', kind: 'action', attack: 'melee', damage: '1d6 + {PB}', damageType: 'piercing', text: 'Hit: 1d6 plus PB Piercing damage.' }))).toBeNull();
    expect(boostOf(blankCompanionAction({ name: 'Parry', kind: 'reaction', text: 'The drake adds 2 to its AC against one melee attack that would hit it.' }))).toBeNull();
    expect(boostOf(blankCompanionAction({ kind: 'reaction', text: INFUSED, boost: false }))).toBeNull();
    expect(boostOf(blankCompanionAction({ kind: 'action', boost: true, damage: '1d8', damageType: 'cold' }))).toEqual({ dice: '1d8', type: 'cold' });
  });

  it('uses dice by level when set, counting the level you choose', () => {
    const a = blankCompanionAction({ kind: 'reaction', text: INFUSED, levelOf: 'ranger', levelDice: [{ level: 15, dice: '1d10' }, { level: 7, dice: '1d8' }] });
    expect(actionDice(a, ranger(4))).toBe('1d6');
    expect(actionDice(a, ranger(7))).toBe('1d8');
    expect(actionDice(a, ranger(15))).toBe('1d10');
    // Counting character level instead: ranger 14 + warlock 1 = 15.
    expect(actionDice({ ...a, levelOf: '' }, ranger(14))).toBe('1d10');
    expect(actionDice({ ...a, levelDice: [{ level: 5, dice: '{PB}d4' }] }, ranger(5))).toBe('3d4');
  });

  it('offers each companion’s reaction, except on its own hit, and says why one can’t', () => {
    const c = ranger(5);
    const drake = blankCompanion({ id: 'd', name: 'Ember', hp: 30, actions: [blankCompanionAction({ id: 'i', name: 'Infused Strikes', kind: 'reaction', text: INFUSED, damageType: 'fire' })] });
    const owl = blankCompanion({ id: 'o', name: 'Owl', hp: 1, actions: [blankCompanionAction({ name: 'Talons', attack: 'melee', damage: '1', damageType: 'slashing' })] });
    c.companions = [drake, owl];
    expect(availableBoosts(c).map((b) => [b.comp.name, b.action.name, b.dice, b.type, b.blocked])).toEqual([['Ember', 'Infused Strikes', '1d6', 'fire', '']]);
    expect(availableBoosts(c, 'd')).toEqual([]);
    drake.turn = { ...emptyTurn(), reaction: true };
    expect(availableBoosts(c)[0].blocked).toBe('reaction used');
    drake.turn = emptyTurn();
    drake.conditions = ['stunned'];
    expect(availableBoosts(c)[0].blocked).toMatch(/stunned/i);
    drake.conditions = [];
    drake.hp = 0;
    expect(availableBoosts(c)[0].blocked).toBe('at 0 HP');
  });

  it('rolls twice the dice on a critical hit', () => {
    const r = safeRoll('1d6', { critical: true });
    expect(r.terms[0].rolls).toHaveLength(2);
  });
});

describe('pasting a drake’s stat block', () => {
  it('sets Infused Strikes up as a reaction that adds 1d6 to a hit', () => {
    const a = readAction('Infused Strikes', INFUSED, 'reaction');
    expect(a).toMatchObject({ boost: true, damage: '1d6', damageType: '', attack: null });
    const fire = readAction('Infused Strikes', INFUSED.replace('1d6 damage of the type determined by its Draconic Essence', '1d6 Fire damage'), 'reaction');
    expect(fire).toMatchObject({ boost: true, damage: '1d6', damageType: 'fire' });
  });

  it('finds it under Reactions in a whole stat block', () => {
    const k = parseStatBlock(`Drake Companion
Small Dragon, Neutral
AC 14 plus your Proficiency Bonus
HP 5 + five times your Ranger level
Speed 40 ft.
STR 16 DEX 12 CON 15 INT 8 WIS 14 CHA 8
Actions
Bite. Melee Attack Roll: Bonus equals your spell attack modifier, reach 5 ft. Hit: 1d6 plus PB Piercing damage.
Reactions
Infused Strikes. ${INFUSED}`)!;
    const inf = k.actions.find((x) => x.name === 'Infused Strikes')!;
    expect(inf).toMatchObject({ kind: 'reaction', boost: true, damage: '1d6' });
    expect(boostOf(k.actions.find((x) => x.name === 'Bite')!)).toBeNull();
  });
});

describe('a companion’s element (Draconic Essence)', () => {
  it('is used by its Infused Strikes when the reaction names no type', () => {
    const c = ranger(4);
    const artex = blankCompanion({ id: 'a', name: 'Artex', hp: 25, essence: 'poison', actions: [blankCompanionAction({ id: 'i', name: 'Infused Strikes', kind: 'reaction', text: INFUSED })] });
    c.companions = [artex];
    expect(availableBoosts(c)[0]).toMatchObject({ dice: '1d6', type: 'poison' });
    expect(actionType(artex, artex.actions[0])).toBe('poison');
    // A type on the reaction itself still wins.
    artex.actions[0].damageType = 'cold';
    expect(availableBoosts(c)[0].type).toBe('cold');
  });
});
