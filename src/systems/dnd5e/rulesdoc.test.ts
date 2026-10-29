import { describe, expect, it } from 'vitest';
import { blankCharacter } from './model';
import { applyLevelUp, planLevelUp } from './leveling';
import { contentCounts, looksLikeRulesJson, readRulesDocument, readRulesJson, splitSections } from './rulesdoc';
import type { Catalog } from './srd';
import { companionFromCreature } from './statblock';
import { evalFormula } from './formula';
import { resolveItem, weaponFromResolved } from './items';

// A homebrew rules document as the PDF reader hands it over: headings marked with #.
const DOC = `# Shards of the Veil
Rules for a world where magic leaks through cracks in the sky.

## Resting
A Short Rest takes 1 hour. A Long Rest takes 8 hours.

## Spells
Veilspark
Evocation Cantrip (Shardcaller, Wizard)
Casting Time: Action
Range: 60 feet
Components: V, S
Duration: Instantaneous
You fling a splinter of sky. Make a ranged spell attack against a creature. On a hit, the target takes 1d10 Radiant damage.
Cantrip Upgrade. The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).

Skyfall
3rd-level evocation
Casting Time: 1 action
Range: 120 feet
Components: V, S, M (a pinch of glass)
Duration: Instantaneous
Shards rain on a 20-foot-radius Sphere. Each creature there makes a Dexterity saving throw, taking 6d8 Force damage on a failed save, or half as much damage on a successful one.
At Higher Levels. The damage increases by 1d8 for each slot level above 3rd.

## Feats
Sky-Touched
General Feat (Prerequisite: Level 4+)
Increase your Wisdom or Charisma score by 1, to a maximum of 20. You can see invisible creatures within 10 feet.

## Creatures
Glass Hound
Medium Construct, Unaligned
AC 15
HP 26 (4d8 + 8)
Speed 40 ft.
STR 14 DEX 14 CON 14 INT 3 WIS 12 CHA 5
CR 1
Actions
Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 7 (1d10 + 2) Slashing damage.

## Classes
Shardcaller
Hit Point Die: D8 per Shardcaller level
Primary Ability: Wisdom
Saving Throw Proficiencies: Wisdom and Charisma
Level 1: Shard Sense
You sense cracks in the Veil within 1 mile.
Level 1: Splinter
As a Bonus Action, you can use this feature a number of times equal to your Wisdom modifier. You regain all expended uses when you finish a Long Rest.
Level 2: Skyward Step
You can climb on air for a moment.
Level 3: Shardcaller Subclass
Choose a subclass.
Level 4: Ability Score Improvement
You gain the Ability Score Improvement feat.
Prism Keeper (Shardcaller Subclass)
Keepers bend light into shields.
Level 3: Prism Ward
You gain a ward of light.

## Treasures
Veilglass Rapier
Weapon (rapier), uncommon (requires attunement)
You gain a +1 bonus to attack and damage rolls made with this magic weapon. It deals an extra 1d4 radiant damage on a hit.
Skyshard Amulet
Wondrous Item, rare
While you wear this amulet, you can't be knocked Prone by wind.
`;

describe('reading a homebrew rules document', () => {
  const r = readRulesDocument(DOC, 'Shards of the Veil');

  it('splits it into searchable sections', () => {
    expect(splitSections(DOC).map((s) => s.title)).toEqual(['Shards of the Veil', 'Resting', 'Spells', 'Feats', 'Creatures', 'Classes', 'Treasures']);
    expect(r.sections.find((s) => s.title === 'Resting')!.text).toMatch(/8 hours/);
  });

  it('finds spells in both editions’ layouts, with their mechanics', () => {
    expect(r.spells.map((s) => s.name)).toEqual(['Veilspark', 'Skyfall']);
    expect(r.spells[0]).toMatchObject({ level: 0, school: 'Evocation', classes: ['shardcaller', 'wizard'], resolution: 'attack', damage: [{ dice: '1d10', type: 'radiant' }], scaling: 'cantrip_dice' });
    expect(r.spells[1]).toMatchObject({ level: 3, resolution: 'save', saveAbility: 'dex', halfOnSave: true, damage: [{ dice: '6d8', type: 'force' }], upcastDice: '1d8', shape: 'burst', components: 'V, S, M (a pinch of glass)' });
  });

  it('finds feats and creatures', () => {
    expect(r.feats).toMatchObject([{ name: 'Sky-Touched', category: 'general', minLevel: 4, abilities: ['wis', 'cha'] }]);
    expect(r.creatures).toHaveLength(1);
    const hound = companionFromCreature(r.creatures[0]);
    expect(hound).toMatchObject({ name: 'Glass Hound', ac: '15', maxHp: '26', cr: '1' });
    expect(hound.actions[0]).toMatchObject({ name: 'Bite', attack: 'melee', toHit: '4', damage: '1d10 + 2', damageType: 'slashing' });
  });

  it('finds a class, its features by level and its subclass', () => {
    expect(r.classes).toHaveLength(1);
    const cls = r.classes[0];
    expect(cls).toMatchObject({ name: 'Shardcaller', hitDie: 8, saves: ['wis', 'cha'], multiclass: { all: ['wis'] }, subclassLevel: 3, asiLevels: [4] });
    expect(cls.features.map((f) => [f.level, f.name])).toEqual([
      [1, 'Shard Sense'],
      [1, 'Splinter'],
      [2, 'Skyward Step'],
      [3, 'Shardcaller Subclass'],
      [4, 'Ability Score Improvement'],
    ]);
    expect(cls.features[1]).toMatchObject({ uses: 'mod:wis', recharge: 'long', castingTime: 'bonus' });
    expect(r.subclasses).toMatchObject([{ name: 'Prism Keeper', classId: cls.id, features: [{ name: 'Prism Ward', level: 3 }] }]);
    expect(contentCounts(r)).toEqual({ classes: 1, subclasses: 1, feats: 1, spells: 2, creatures: 1, items: 2 });
  });

  it('levels a character in the homebrew class', () => {
    const cat: Catalog = { classes: r.classes, subclasses: r.subclasses, feats: r.feats, spells: r.spells, creatures: r.creatures, items: r.items };
    const c = blankCharacter();
    c.abilities.wis = 14;
    c.classes[0] = { ...c.classes[0], classId: r.classes[0].id, level: 2 };
    const plan = planLevelUp(c, cat, r.classes[0].id)!;
    expect(plan.subclassOptions!.map((s) => s.name)).toEqual(['Prism Keeper']);
    applyLevelUp(c, cat, plan, { hpRoll: null, subclass: { id: r.subclasses[0].id, name: 'Prism Keeper' } });
    expect(c.features.map((f) => f.name)).toEqual(expect.arrayContaining(['Shard Sense', 'Splinter', 'Skyward Step', 'Prism Ward']));
  });

  it('finds magic items, and they work as weapons on the sheet', () => {
    expect(r.items.map((i) => i.name)).toEqual(['Veilglass Rapier', 'Skyshard Amulet']);
    const w = weaponFromResolved(resolveItem('Veilglass Rapier', r.items))!;
    expect(w).toMatchObject({ magicBonus: 1, finesse: true, damage: [{ dice: '1d8', type: 'piercing' }, { dice: '1d4', type: 'radiant' }] });
    expect(r.items[1]).toMatchObject({ kind: 'magic', rarity: 'Rare', text: expect.stringMatching(/knocked Prone/) });
  });

  it('says when nothing structured was found', () => {
    const plain = readRulesDocument('# House rules\nCrits do maximum damage.\nFlanking gives Advantage.', 'House rules');
    expect(plain.notes[0]).toMatch(/AI conversion/);
    expect(plain.sections[0].title).toBe('House rules');
  });
});

describe('importing an AI’s JSON conversion', () => {
  const json = {
    format: 'arcane-tome-rules',
    name: 'Ember Isles',
    rules: [{ title: 'Heat', text: 'Each hour in the caldera, make a DC 12 Constitution save.' }],
    classes: [
      {
        name: 'Ashwalker',
        hitDie: 10,
        primaryAbilities: ['con'],
        savingThrows: ['con', 'wis'],
        subclassLevel: 3,
        asiLevels: [4, 8, 12, 16],
        spellcasting: { ability: 'wis', progression: 'half', cantrips: Array(20).fill(2), prepared: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15] },
        features: [{ level: 1, name: 'Cinder Skin', text: 'Resistance to Fire damage.' }, { level: 2, name: 'Flare', text: 'Burst of flame.', uses: 'pb', recharge: 'long', roll: '2d6 + {CON}' }],
      },
    ],
    subclasses: [{ name: 'Path of Embers', class: 'Ashwalker', features: [{ level: 3, name: 'Ember Heart', text: 'Your heart burns.' }] }],
    spells: [{ name: 'Lava Lash', level: 1, school: 'Evocation', castingTime: 'Bonus Action', range: '30 feet', attack: 'melee', damage: [{ dice: '2d8', type: 'fire' }], upcast: '1d8', text: 'A whip of lava.' }],
    items: [
      { name: 'Emberbrand', type: 'weapon', base: 'Scimitar', rarity: 'rare', attunement: true, bonus: 1, extraDamage: [{ dice: '1d6', type: 'fire' }], text: 'Glows like coals.' },
      { name: 'Ash Cloak', type: 'wondrous item', rarity: 'uncommon', text: 'Resistance to Fire damage.' },
    ],
    creatures: [{ name: 'Cinder Drake', size: 'Small', type: 'Dragon', ac: '14 + {PB}', hp: '5 + 5 * {LEVEL:ashwalker}', pb: '{PB}', abilities: { str: 12, dex: 14, con: 14, int: 6, wis: 12, cha: 8 }, actions: [{ kind: 'action', name: 'Bite', attack: 'melee', toHit: '{SPELLATK}', reach: '5 ft.', damage: '1d6 + {PB}', damageType: 'fire', text: 'A burning bite.' }] }],
    unknownField: 'ignored',
  };

  it('is recognised and validated into library content', () => {
    expect(looksLikeRulesJson(json)).toBe(true);
    expect(looksLikeRulesJson({ format: 'arcane-tome-backup' })).toBe(false);
    const r = readRulesJson(json, 'fallback');
    expect(r.name).toBe('Ember Isles');
    expect(r.sections[0]).toMatchObject({ title: 'Heat' });
    expect(r.classes[0]).toMatchObject({ name: 'Ashwalker', hitDie: 10, caster: 'half', spellAbility: 'wis', prepared: expect.arrayContaining([[1, 2]]) });
    expect(r.classes[0].features[1]).toMatchObject({ uses: 'pb', recharge: 'long', roll: [[1, '2d6+{CON}']] });
    expect(r.subclasses[0].classId).toBe(r.classes[0].id);
    expect(r.spells[0]).toMatchObject({ name: 'Lava Lash', castingTime: 'bonus', resolution: 'attack', damage: [{ dice: '2d8', type: 'fire' }], upcastDice: '1d8', element: 'fire' });
    const brand = weaponFromResolved(resolveItem('Emberbrand', r.items))!;
    expect(brand).toMatchObject({ name: 'Emberbrand', magicBonus: 1, finesse: true, damage: [{ dice: '1d6', type: 'slashing' }, { dice: '1d6', type: 'fire' }] });
    expect(r.items[1]).toMatchObject({ kind: 'magic', category: 'Wondrous item', rarity: 'Uncommon' });
  });

  it('keeps a companion’s scaling formulas', () => {
    const r = readRulesJson(json, 'fallback');
    const drake = companionFromCreature(r.creatures[0]);
    const owner = blankCharacter();
    owner.classes[0] = { ...owner.classes[0], classId: r.classes[0].id, level: 4 };
    expect(drake.ac).toBe('14 + {PB}');
    expect(evalFormula(drake.ac, owner)).toBe(16);
    expect(evalFormula(drake.maxHp, owner)).toBe(25);
    expect(drake.actions[0]).toMatchObject({ toHit: '{SPELLATK}', damage: '1d6 + {PB}', damageType: 'fire' });
  });
});
