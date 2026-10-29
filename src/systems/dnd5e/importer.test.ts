import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { docxText } from '../../import/extract';
import { buildCharacter, importFromText, looksLikeAiJson, readAiJson } from './importer';
import { armorClass, maxHp } from './rules';
import type { Catalog, ItemDef, SpellDef } from './srd';
import srdItems from './srd/items.json';
import srdSpells from './srd/spells.json';

const AI_MARKDOWN = `# Thalia Brightwater
*Level 5 Half-Elf Bard (College of Lore)*

**Race:** Half-Elf  **Background:** Entertainer  **Alignment:** Chaotic Good

| STR | DEX | CON | INT | WIS | CHA |
|-----|-----|-----|-----|-----|-----|
| 8 (−1) | 14 (+2) | 12 (+1) | 13 (+1) | 10 (+0) | 18 (+4) |

**Armor Class:** 14 (studded leather)
**Hit Points:** 33
**Speed:** 30 ft.
**Saving Throws:** Dex +5, Cha +7
**Skills:** Deception +7, Performance +10, Persuasion +7, Stealth +5, Insight +3
**Languages:** Common, Elvish, Gnomish

## Spells
**Cantrips:** Vicious Mockery, Light, Mage Hand
**1st level:** Healing Word, Thunderwave, Tasha's Hideous Laughter
**2nd level:** Shatter
**3rd level:** Hypnotic Pattern

## Equipment
- Rapier
- Lute
- Studded leather armor
- 15 gp

## Features & Traits
- Bardic Inspiration (d8). As a Bonus Action, inspire an ally within 60 feet.
- Jack of All Trades. Add half your Proficiency Bonus to checks you aren't proficient in.
`;

describe('importing an AI-written character', () => {
  const { character: c, warnings } = importFromText(AI_MARKDOWN);

  it('reads identity, class and subclass', () => {
    expect(c.name).toBe('Thalia Brightwater');
    expect(c.species).toBe('Half-Elf');
    expect(c.background).toBe('Entertainer');
    expect(c.alignment).toBe('Chaotic Good');
    expect(c.classes).toMatchObject([{ classId: 'bard', level: 5, subclass: 'College of Lore' }]);
  });

  it('reads an ability table with modifiers in brackets', () => {
    expect(c.abilities).toEqual({ str: 8, dex: 14, con: 12, int: 13, wis: 10, cha: 18 });
  });

  it('works out proficiency and expertise from the bonuses', () => {
    expect(c.saveProfs).toMatchObject({ dex: true, cha: true, str: false });
    expect(c.skills).toMatchObject({ deception: 1, performance: 2, persuasion: 1, stealth: 1, insight: 1, arcana: 0 });
  });

  it('finds armor, and its AC and HP agree with the sheet', () => {
    expect(c.armor.armorId).toBe('studded');
    expect(armorClass(c).total).toBe(14);
    expect(maxHp(c).total).toBe(33);
    expect(c.bonus.ac).toBe(0);
    expect(c.hp.maxOverride).toBeNull();
  });

  it('matches spells to the library and keeps unknown ones by name', () => {
    const names = c.spells.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['Vicious Mockery', 'Healing Word', 'Thunderwave', 'Shatter', "Tasha's Hideous Laughter", 'Hypnotic Pattern']));
    expect(c.spells.find((s) => s.name === 'Shatter')!.damage[0].dice).toBe('3d8');
    expect(c.spells.find((s) => s.name === 'Hypnotic Pattern')!.level).toBe(3);
    expect(warnings.join(' ')).toMatch(/Hypnotic Pattern/);
  });

  it('reads weapons, equipment, coins, features and languages', () => {
    expect(c.weapons.map((w) => w.name)).toEqual(['Rapier']);
    expect(c.inventory.map((i) => i.name)).toEqual(expect.arrayContaining(['Lute', 'Rapier']));
    expect(c.currency.gp).toBe(15);
    expect(c.features.map((f) => f.name)).toEqual(['Bardic Inspiration (d8)', 'Jack of All Trades']);
    expect(c.languages).toBe('Common, Elvish, Gnomish');
  });
});

describe('importing a fillable PDF sheet (form fields)', () => {
  const fields = {
    CharacterName: 'Kragg Ironfist',
    ClassLevel: 'Fighter 3',
    'Race ': 'Mountain Dwarf',
    Background: 'Soldier',
    STR: '16',
    STRmod: '+3',
    DEX: '12',
    CON: '15',
    INT: '10',
    WIS: '13',
    CHA: '8',
    AC: '18',
    HPMax: '31',
    Speed: '25',
    'ST Strength': '+5',
    'ST Constitution': '+4',
    'ST Wisdom': '+1',
    Athletics: '+5',
    Perception: '+3',
    Intimidation: '+1',
    Stealth: '+1',
    'Wpn Name': 'Longsword',
    'Wpn Name 2': 'Handaxe',
    Equipment: 'Chain mail\nShield\nLongsword\nExplorer’s pack',
    'Features and Traits': 'Second Wind: regain 1d10 + level HP as a Bonus Action.\nAction Surge: take one additional action.',
    GP: '10',
  };
  const { character: c, warnings } = importFromText('', fields);

  it('maps the official field names', () => {
    expect(c.name).toBe('Kragg Ironfist');
    expect(c.species).toBe('Mountain Dwarf');
    expect(c.classes).toMatchObject([{ classId: 'fighter', level: 3 }]);
    expect(c.abilities).toEqual({ str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 });
    expect(c.speed).toBe(25);
  });

  it('infers proficiencies from the filled-in bonuses', () => {
    expect(c.saveProfs).toMatchObject({ str: true, con: true, wis: false });
    expect(c.skills).toMatchObject({ athletics: 1, perception: 1, intimidation: 1, stealth: 0 });
  });

  it('builds armor and keeps a sheet HP that differs from the math', () => {
    expect(c.armor).toMatchObject({ armorId: 'chain', shield: true });
    expect(armorClass(c).total).toBe(18);
    expect(c.hp.maxOverride).toBe(31);
    expect(warnings.join(' ')).toMatch(/31 max HP/);
  });

  it('reads weapons, items, features and coins', () => {
    expect(c.weapons.map((w) => w.name)).toEqual(['Longsword', 'Handaxe']);
    expect(c.features.map((f) => f.name)).toEqual(['Second Wind', 'Action Surge']);
    expect(c.inventory.length).toBe(4);
    expect(c.currency.gp).toBe(10);
  });
});

describe('importing labels that a PDF ran together on one line', () => {
  it('splits them at known labels', () => {
    const { character: c } = importFromText('Name: Ada\nRace: Gnome Background: Sage Alignment: Neutral Good\nClass: Wizard 2');
    expect([c.species, c.background, c.alignment]).toEqual(['Gnome', 'Sage', 'Neutral Good']);
  });
});

describe('importing PDF text where labels and numbers sit on separate lines', () => {
  const text = `Mira Vex\nLevel 3 Tiefling Warlock\nSTRENGTH\n9\n-1\nDEXTERITY\n14\n+2\nCONSTITUTION\n13\nINTELLIGENCE\n12\nWISDOM\n10\nCHARISMA\n17\nARMOR CLASS 13\nHIT POINTS 24\nSpells Known: Eldritch Blast, Hex, Armor of Agathys`;
  const { character: c } = importFromText(text);
  it('still finds the scores and class', () => {
    expect(c.abilities).toEqual({ str: 9, dex: 14, con: 13, int: 12, wis: 10, cha: 17 });
    expect(c.classes).toMatchObject([{ classId: 'warlock', level: 3 }]);
    expect(c.spells.map((s) => s.name)).toEqual(['Eldritch Blast', 'Hex', 'Armor of Agathys']);
  });
});

describe('importing the AI prompt’s JSON', () => {
  const json = {
    name: 'Rook',
    species: 'Human',
    classes: [{ class: 'Rogue', subclass: 'Thief', level: 4 }],
    abilities: { str: 10, dex: 17, con: 12, int: 14, wis: 12, cha: 10 },
    saves: ['dex', 'int'],
    skills: { stealth: 'expertise', perception: 'proficient', 'sleight of hand': 'expertise' },
    ac: 14,
    maxHp: 27,
    armor: 'leather',
    weapons: ['Shortsword', '+1 Shortbow'],
    spells: [],
    coins: { gp: 40 },
  };
  it('is recognised and mapped exactly', () => {
    expect(looksLikeAiJson(json)).toBe(true);
    expect(looksLikeAiJson({ schema: 1, name: 'x' })).toBe(false);
    const { character: c } = buildCharacter(readAiJson(json));
    expect(c.classes).toMatchObject([{ classId: 'rogue', subclass: 'Thief', level: 4 }]);
    expect(c.skills).toMatchObject({ stealth: 2, perception: 1, sleight_of_hand: 2 });
    expect(c.armor.armorId).toBe('leather');
    expect(armorClass(c).total).toBe(14);
    expect(c.weapons.map((w) => [w.name, w.magicBonus])).toEqual([
      ['Shortsword', 0],
      ['Shortbow +1', 1],
    ]);
    expect(c.currency.gp).toBe(40);
  });
});

describe('reading a Word document', () => {
  it('turns paragraphs and table rows into lines', () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Name: Ash</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>STR</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>DEX</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>15 &amp; more</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
    const text = docxText(zipSync({ 'word/document.xml': strToU8(xml) }));
    expect(text).toContain('Name: Ash');
    expect(text).toMatch(/STR\s*\n?\s*\|\s*DEX/);
    expect(text).toContain('15 & more');
  });
});

describe('importing a multi-page D&D Beyond-style export', () => {
  const catalog = {
    classes: [],
    subclasses: [],
    feats: [],
    creatures: [],
    spells: (srdSpells as SpellDef[]).map((s) => ({ ...s, source: 'SRD 5.2.1' })),
    items: (srdItems as ItemDef[]).map((i) => ({ ...i, source: 'SRD 5.2.1' })),
  } as Catalog;
  // Page 1: stats, attacks, proficiencies. Page 2: features. Page 3: spells. Page 4: inventory.
  const fields: Record<string, string> = {
    CharacterName: 'Seren Ashvale',
    'CLASS  LEVEL': 'Ranger 5',
    RACE: 'Wood Elf',
    BACKGROUND: 'Outlander',
    STR: '10',
    DEX: '18',
    CON: '14',
    INT: '12',
    WIS: '14',
    CHA: '8',
    AC: '15',
    MaxHP: '44',
    Speed: '35',
    'Wpn Name': 'Dragon Wing Shortbow',
    'Wpn1 AtkBonus': '+10',
    'Wpn1 Damage': '1d6+5 Piercing + 1d6 Fire',
    'Wpn Name 2': 'Shortsword',
    'Wpn2 AtkBonus ': '+7',
    'Wpn2 Damage ': '1d6+4 Piercing',
    'Wpn Name 3': 'Fire Bolt',
    'Wpn3 AtkBonus  ': '+4',
    'Wpn3 Damage ': '2d10 Fire',
    ProficienciesLang: '=== ARMOR ===\nLight Armor, Medium Armor, Shields\n=== WEAPONS ===\nMartial Weapons, Simple Weapons\n=== TOOLS ===\nHerbalism Kit\n=== LANGUAGES ===\nCommon, Elvish, Sylvan',
    FeaturesTraits1:
      "=== RANGER FEATURES ===\n* Favored Enemy • PHB 2024\nYou always have Hunter's Mark prepared. You can cast it without a slot.\n2 / Long Rest\n* Deft Explorer\nExpertise in one skill and two more languages.\n=== SPECIES TRAITS ===\n* Darkvision\nYou can see in dim light within 60 feet.\n* Fey Ancestry\nAdvantage on saves to avoid being Charmed.\n=== FEATS ===\n* Archery\nYou gain a +2 bonus to attack rolls you make with Ranged weapons.\n* Magic Initiate (Wizard)\nTwo cantrips and a level 1 spell.",
    FeaturesTraits2: "* Fey Ancestry\nAdvantage on saves to avoid being Charmed, and magic can't put you to sleep.\n* Keen Senses\nProficiency in the Perception skill.",
    Actions1: "=== ACTIONS ===\nActions in Combat: Attack, Dash, Disengage, Dodge, Grapple, Help, Hide\n=== BONUS ACTIONS ===\n* Hunter's Mark\nMark a creature as your quarry.",
    spellHeader0: '=== CANTRIPS ===',
    spellName0: 'Fire Bolt',
    spellSaveHit0: '+4',
    spellName1: 'Prestidigitation',
    spellHeader1: '=== 1st LEVEL ===',
    spellName2: "Hunter's Mark",
    spellCastingTime2: '1BA',
    spellName3: 'Cure Wounds',
    spellName4: 'Zephyr Strike',
    spellCastingTime4: '1BA',
    spellDuration4: 'Conc., 1 Minute',
    spellNotes4: 'D: 1d8 Force',
    spellHeader2: '=== 2nd LEVEL ===',
    spellName5: 'Pass without Trace',
    spellName6: 'Cordon of Arrows',
    spellSaveHit6: 'DEX 13',
    spellRange6: '5 ft.',
    spellNotes6: 'D: 1d6 Piercing',
    'Eq Name0': 'Dragon Wing Shortbow',
    'Eq Weight0': '2 lb.',
    'Eq Name1': 'Shortsword',
    'Eq Name2': 'Studded Leather Armor',
    'Eq Name3': 'Arrows',
    'Eq Qty3': '20',
    'Eq Name4': 'Potion of Healing',
    'Eq Qty4': '2',
    'Eq Name5': 'Rope',
    'Eq Name6': 'Rope',
    GP: '35',
  };
  // Spell rows sit under their heading on page 3, top to bottom.
  const positions: Record<string, { page: number; x: number; y: number }> = {};
  ['spellHeader0', 'spellName0', 'spellName1', 'spellHeader1', 'spellName2', 'spellName3', 'spellName4', 'spellHeader2', 'spellName5', 'spellName6'].forEach((k, i) => (positions[k] = { page: 3, x: 40, y: 700 - i * 20 }));
  const { character: c, found, warnings } = importFromText('', fields, { positions, catalog });

  it('reads the identity and scores', () => {
    expect(c.name).toBe('Seren Ashvale');
    expect(c.classes).toMatchObject([{ classId: 'ranger', level: 5 }]);
    expect(c.abilities.dex).toBe(18);
  });

  it('keeps the magic weapon’s name, its extra damage and its +1 (Archery counted)', () => {
    expect(c.weapons.map((w) => w.name)).toEqual(['Dragon Wing Shortbow', 'Shortsword']);
    const bow = c.weapons[0];
    expect(bow).toMatchObject({ ranged: true, magicBonus: 1, damage: [{ dice: '1d6', type: 'piercing' }, { dice: '1d6', type: 'fire' }] });
    expect(found.join(' ')).toMatch(/Dragon Wing Shortbow: \+1 magic bonus/);
    expect(c.weapons[1].magicBonus).toBe(0);
  });

  it('reads every spell with its level, from the SRD where it can', () => {
    const level = Object.fromEntries(c.spells.map((s) => [s.name, s.level]));
    expect(level).toEqual({ 'Fire Bolt': 0, Prestidigitation: 0, "Hunter's Mark": 1, 'Cure Wounds': 1, 'Zephyr Strike': 1, 'Pass without Trace': 2, 'Cordon of Arrows': 2 });
    expect(c.spells.find((s) => s.name === 'Cure Wounds')!.description.length).toBeGreaterThan(100);
    expect(c.spells.find((s) => s.name === 'Zephyr Strike')).toMatchObject({ castingTime: 'bonus', concentration: true, damage: [{ dice: '1d8', type: 'force' }] });
    expect(c.spells.find((s) => s.name === 'Cordon of Arrows')).toMatchObject({ resolution: 'save', saveAbility: 'dex', range: '5 ft.' });
    expect(warnings.join(' ')).toMatch(/Zephyr Strike, Cordon of Arrows/);
  });

  it('reads features from every page once, without the standard actions or spells', () => {
    const names = c.features.map((f) => f.name);
    expect(names).toEqual(['Favored Enemy', 'Deft Explorer', 'Darkvision', 'Fey Ancestry', 'Archery', 'Magic Initiate (Wizard)', 'Keen Senses']);
    expect(c.features.find((f) => f.name === 'Fey Ancestry')!.description).toMatch(/sleep/);
    expect(c.features.find((f) => f.name === 'Favored Enemy')).toMatchObject({ usesMax: 2, recharge: 'long', source: 'Ranger Features' });
  });

  it('reads the inventory with counts and SRD weights, each item once', () => {
    expect(c.inventory.map((i) => [i.name, i.qty])).toEqual([
      ['Dragon Wing Shortbow', 1],
      ['Shortsword', 1],
      ['Studded Leather Armor', 1],
      ['Arrows', 20],
      ['Potion of Healing', 2],
      ['Rope', 1],
    ]);
    expect(c.inventory.find((i) => i.name === 'Shortsword')!.weight).toBe(2);
    expect(c.inventory.find((i) => i.name === 'Potion of Healing')!.description).toMatch(/regain Hit Points/);
    expect(c.armor.armorId).toBe('studded');
    expect(c.currency.gp).toBe(35);
  });

  it('splits languages from the other proficiencies', () => {
    expect(c.languages).toBe('Common, Elvish, Sylvan');
    expect(c.proficiencies).toBe('Armor: Light Armor, Medium Armor, Shields\nWeapons: Martial Weapons, Simple Weapons\nTools: Herbalism Kit');
  });
});
