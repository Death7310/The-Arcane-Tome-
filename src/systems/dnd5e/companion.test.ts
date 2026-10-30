import { describe, expect, it } from 'vitest';
import { carriedWeight, carryingCapacity, companionAc, companionWeaponAttack, compPb, walkSpeed } from './companion';
import { blankCharacter, blankCompanion, blankWeapon, normalizeCharacter } from './model';
import { rollMode } from './rules';

const owner = () => {
  const c = blankCharacter();
  c.classes[0] = { ...c.classes[0], classId: 'ranger', level: 5 };
  return c;
};

describe('a companion’s own numbers', () => {
  const wolf = blankCompanion({ name: 'Wolf', size: 'Medium', ac: '13', speed: '40 ft.', pb: '2', abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 } });

  it('attacks with a weapon using its own modifier and Proficiency Bonus', () => {
    const spear = blankWeapon({ name: 'Spear', damage: [{ dice: '1d6', type: 'piercing' }] });
    expect(companionWeaponAttack(wolf, spear, owner())).toMatchObject({ total: 1 + 2, parts: [{ label: 'Strength modifier', value: 1 }, { label: 'Proficiency', value: 2 }] });
    const bow = blankWeapon({ name: 'Shortbow +1', ranged: true, magicBonus: 1, damage: [{ dice: '1d6', type: 'piercing' }] });
    expect(companionWeaponAttack(wolf, bow, owner()).total).toBe(2 + 2 + 1);
    // A class companion uses your Proficiency Bonus.
    expect(compPb(blankCompanion({ pb: '{PB}' }), owner())).toBe(3);
  });

  it('works out its AC from worn armor or barding, else its stat block', () => {
    expect(companionAc(wolf, owner())).toMatchObject({ total: 13, worn: null });
    const barded = { ...wolf, armor: { armorId: 'chain_shirt', shield: false, magicBonus: 1 } };
    expect(companionAc(barded, owner())).toMatchObject({ total: 13 + 2 + 1, worn: 'Chain Shirt' });
    const shielded = { ...wolf, armor: { armorId: '', shield: true, magicBonus: 0 } };
    expect(companionAc(shielded, owner()).total).toBe(15);
  });

  it('carries by size, and knows its speed', () => {
    expect(carryingCapacity(wolf)).toBe(180);
    expect(carryingCapacity({ ...wolf, size: 'Large' })).toBe(360);
    expect(carryingCapacity({ ...wolf, size: 'Tiny' })).toBe(90);
    expect(walkSpeed({ ...wolf, speed: '30 ft., Fly 60 ft.' })).toBe(30);
    const loaded = { ...wolf, inventory: [{ id: 'a', name: 'Saddlebags', qty: 1, weight: 8, notes: '' }, { id: 'b', name: 'Rations', qty: 5, weight: 2, notes: '' }] };
    expect(carriedWeight(loaded)).toBe(18);
  });

  it('has its own conditions, which shape its rolls', () => {
    const poisoned = { ...wolf, conditions: ['poisoned' as const] };
    expect(rollMode(poisoned, { type: 'attack' }).dis).toContain('Poisoned');
    expect(rollMode({ ...wolf, conditions: ['paralyzed' as const] }, { type: 'save', ability: 'dex' }).autoFail).toBe('Paralyzed');
    expect(rollMode({ ...wolf, conditions: ['invisible' as const] }, { type: 'attack' }).adv).toContain('Invisible');
  });

  it('loads older saves without the new parts', () => {
    const c = normalizeCharacter({ ...blankCharacter(), companions: [{ name: 'Old owl', abilities: { str: 3 } }] });
    expect(c.companions[0]).toMatchObject({ conditions: [], inventory: [], weapons: [], armor: null, turn: { action: false, movementUsed: 0 } });
  });
});
