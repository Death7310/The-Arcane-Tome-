import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { docxText } from '../../import/extract';
import { buildCharacter, importFromText, looksLikeAiJson, readAiJson } from './importer';
import { armorClass, maxHp } from './rules';

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
