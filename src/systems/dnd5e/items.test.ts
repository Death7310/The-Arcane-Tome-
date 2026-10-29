import { describe, expect, it } from 'vitest';
import { itemName, parseItemText, resolveItem, weaponFromResolved } from './items';
import type { ItemDef } from './srd';
import srdItems from './srd/items.json';

const ITEMS = srdItems as ItemDef[];

describe('finding items by name', () => {
  it('knows base weapons, +N weapons and SRD magic weapons', () => {
    expect(resolveItem('Shortbow', ITEMS)).toMatchObject({ weapon: { name: 'Shortbow' }, bonus: 0 });
    const plus = resolveItem('Longsword +1', ITEMS);
    expect(plus).toMatchObject({ bonus: 1, weapon: { name: 'Longsword' } });
    expect(plus.def?.name).toBe('{base} +1');
    expect(resolveItem('+2 Dagger', ITEMS)).toMatchObject({ bonus: 2, weapon: { name: 'Dagger' } });
    const flame = weaponFromResolved(resolveItem('Flame Tongue Longsword', ITEMS))!;
    expect(flame.damage).toEqual([
      { dice: '1d8', type: 'slashing' },
      { dice: '2d6', type: 'fire' },
    ]);
    expect(flame.notes).toMatch(/^Rare · requires attunement/);
    const vicious = weaponFromResolved(resolveItem('Vicious Rapier', ITEMS))!;
    expect(vicious.damage[1]).toEqual({ dice: '2d6', type: 'piercing' });
    expect(weaponFromResolved(resolveItem('Dragon Slayer Greatsword', ITEMS))).toMatchObject({ magicBonus: 1, damage: [{ dice: '2d6', type: 'slashing' }] });
    expect(resolveItem('Oathbow', ITEMS).weapon?.name).toBe('Longbow');
  });

  it('finds the base weapon inside a magic item that isn’t in the SRD', () => {
    const r = resolveItem('Dragon Wing Shortbow', ITEMS);
    expect(r.def).toBeUndefined();
    expect(weaponFromResolved(r)).toMatchObject({ name: 'Dragon Wing Shortbow', ranged: true, damage: [{ dice: '1d6', type: 'piercing' }], mastery: 'Vex' });
  });

  it('knows armor, shields and gear', () => {
    expect(resolveItem('Mithral Chain Shirt', ITEMS)).toMatchObject({ armor: { id: 'chain_shirt' }, def: { name: 'Mithral {base}' } });
    expect(resolveItem('Shield +1', ITEMS)).toMatchObject({ shield: true, bonus: 1 });
    expect(resolveItem('Plate Armor', ITEMS).armor?.id).toBe('plate');
    expect(resolveItem('Leather pouch', ITEMS).armor).toBeUndefined();
    const bag = resolveItem('Bag of Holding', ITEMS);
    expect(bag).toMatchObject({ def: { kind: 'magic', weight: 5 } });
    expect(bag.weapon).toBeUndefined();
    expect(itemName(ITEMS.find((d) => d.name === '{base} +1')!)).toMatch(/\+1$/);
  });
});

describe('reading a pasted stat block', () => {
  it('reads a magic weapon written book-style', () => {
    const p = parseItemText(
      `Dragon Wing Shortbow
Weapon (shortbow), rare (requires attunement)
This bow is strung with a dragon's wing sinew. You gain a +1 bonus to attack and damage rolls made with this magic weapon. When you hit with an arrow fired from it, the target takes an extra 1d6 damage of the dragon's type (acid, cold, fire, lightning, or poison).`,
      ITEMS,
    );
    expect(p.kind).toBe('weapon');
    expect(p.weapon).toMatchObject({
      name: 'Dragon Wing Shortbow',
      magicBonus: 1,
      ranged: true,
      properties: 'Ammunition (80/320), Two-Handed',
      mastery: 'Vex',
      damage: [
        { dice: '1d6', type: 'piercing' },
        { dice: '1d6', type: 'acid' },
      ],
    });
    expect(p.weapon!.notes).toMatch(/^Rare · requires attunement\n\nThis bow/);
    expect(p.check.join(' ')).toMatch(/acid, cold, fire, lightning, poison/);
    expect(p.rarity).toBe('rare');
  });

  it('reads labelled fields', () => {
    const p = parseItemText(
      `Frostbite Rapier
Martial Melee Weapon
Damage: 1d8 piercing + 1d4 cold
Properties: Finesse
Mastery: Vex
Weight: 2 lb.
Cost: 400 gp
A blade rimed with frost that never melts.`,
      ITEMS,
    );
    expect(p.weapon).toMatchObject({ finesse: true, mastery: 'Vex', damage: [{ dice: '1d8', type: 'piercing' }, { dice: '1d4', type: 'cold' }] });
    expect(p.item).toMatchObject({ weight: 2 });
    expect(p.weapon!.notes).toBe('A blade rimed with frost that never melts.');
  });

  it('reads a sheet’s attack row', () => {
    const p = parseItemText('Longsword +1  +7  1d8+5 Slashing  Versatile, Sap', ITEMS);
    expect(p.weapon).toMatchObject({ name: 'Longsword +1', magicBonus: 1, properties: 'Versatile (1d10)', damage: [{ dice: '1d8', type: 'slashing' }] });
    const bow = parseItemText('Dragon Wing Shortbow 80/320 +7 1d6+4 Piercing + 1d6 Fire', ITEMS);
    expect(bow.weapon).toMatchObject({ name: 'Dragon Wing Shortbow', damage: [{ dice: '1d6', type: 'piercing' }, { dice: '1d6', type: 'fire' }] });
  });

  it('reads a homebrew weapon with no base weapon', () => {
    const p = parseItemText(
      `Stormcaller Harpoon
Weapon (martial, melee), uncommon
Damage: 1d10 piercing
Properties: Heavy, Reach, Thrown (20/60)
Mastery: Topple
On a hit, the target takes an extra 1d6 lightning damage.`,
      ITEMS,
    );
    expect(p.weapon).toMatchObject({ ranged: false, properties: 'Heavy, Reach, Thrown (20/60)', mastery: 'Topple', damage: [{ dice: '1d10', type: 'piercing' }, { dice: '1d6', type: 'lightning' }] });
  });

  it('reads wondrous items and armor', () => {
    const cloak = parseItemText(
      `Cloak of the Ember Moth
Wondrous item, uncommon (requires attunement)
While wearing this cloak you have Resistance to Fire damage.`,
      ITEMS,
    );
    expect(cloak).toMatchObject({ kind: 'item', name: 'Cloak of the Ember Moth', attunement: true, item: { description: expect.stringMatching(/^Uncommon · requires attunement\n\nWhile wearing/) } });
    const shirt = parseItemText('Mithral Chain Shirt +1\nArmor (chain shirt), uncommon', ITEMS);
    expect(shirt).toMatchObject({ kind: 'armor', armor: { armorId: 'chain_shirt', magicBonus: 1 } });
    expect(parseItemText('Shield of the Dawn\nArmor (shield), rare', ITEMS)).toMatchObject({ kind: 'armor', armor: { shield: true } });
  });

  it('fills an SRD item from the catalog when only its name is pasted', () => {
    const p = parseItemText('Frost Brand Scimitar', ITEMS);
    expect(p.weapon!.damage).toEqual([
      { dice: '1d6', type: 'slashing' },
      { dice: '1d6', type: 'cold' },
    ]);
    expect(p.weapon!.notes).toMatch(/Very rare · requires attunement/);
    expect(parseItemText('Rope', ITEMS)).toMatchObject({ kind: 'item', item: { name: 'Rope' } });
  });
});
