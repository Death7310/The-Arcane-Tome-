// Reference data for D&D Fifth Edition (2024 rules), as published in the
// System Reference Document 5.2 (Wizards of the Coast, CC-BY-4.0).
// Only game mechanics live here; no rules text is reproduced.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export const SKILLS = [
  { id: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { id: 'animal_handling', name: 'Animal Handling', ability: 'wis' },
  { id: 'arcana', name: 'Arcana', ability: 'int' },
  { id: 'athletics', name: 'Athletics', ability: 'str' },
  { id: 'deception', name: 'Deception', ability: 'cha' },
  { id: 'history', name: 'History', ability: 'int' },
  { id: 'insight', name: 'Insight', ability: 'wis' },
  { id: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { id: 'investigation', name: 'Investigation', ability: 'int' },
  { id: 'medicine', name: 'Medicine', ability: 'wis' },
  { id: 'nature', name: 'Nature', ability: 'int' },
  { id: 'perception', name: 'Perception', ability: 'wis' },
  { id: 'performance', name: 'Performance', ability: 'cha' },
  { id: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { id: 'religion', name: 'Religion', ability: 'int' },
  { id: 'sleight_of_hand', name: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth', name: 'Stealth', ability: 'dex' },
  { id: 'survival', name: 'Survival', ability: 'wis' },
] as const satisfies readonly { id: string; name: string; ability: Ability }[];
export type SkillId = (typeof SKILLS)[number]['id'];

export type CasterType = 'none' | 'full' | 'half' | 'third' | 'pact';

export interface ClassDef {
  id: string;
  name: string;
  hitDie: number;
  saves: [Ability, Ability];
  caster: CasterType;
  spellAbility: Ability | null;
}

export const CLASSES: ClassDef[] = [
  { id: 'barbarian', name: 'Barbarian', hitDie: 12, saves: ['str', 'con'], caster: 'none', spellAbility: null },
  { id: 'bard', name: 'Bard', hitDie: 8, saves: ['dex', 'cha'], caster: 'full', spellAbility: 'cha' },
  { id: 'cleric', name: 'Cleric', hitDie: 8, saves: ['wis', 'cha'], caster: 'full', spellAbility: 'wis' },
  { id: 'druid', name: 'Druid', hitDie: 8, saves: ['int', 'wis'], caster: 'full', spellAbility: 'wis' },
  { id: 'fighter', name: 'Fighter', hitDie: 10, saves: ['str', 'con'], caster: 'none', spellAbility: 'int' },
  { id: 'monk', name: 'Monk', hitDie: 8, saves: ['str', 'dex'], caster: 'none', spellAbility: null },
  { id: 'paladin', name: 'Paladin', hitDie: 10, saves: ['wis', 'cha'], caster: 'half', spellAbility: 'cha' },
  { id: 'ranger', name: 'Ranger', hitDie: 10, saves: ['str', 'dex'], caster: 'half', spellAbility: 'wis' },
  { id: 'rogue', name: 'Rogue', hitDie: 8, saves: ['dex', 'int'], caster: 'none', spellAbility: 'int' },
  { id: 'sorcerer', name: 'Sorcerer', hitDie: 6, saves: ['con', 'cha'], caster: 'full', spellAbility: 'cha' },
  { id: 'warlock', name: 'Warlock', hitDie: 8, saves: ['wis', 'cha'], caster: 'pact', spellAbility: 'cha' },
  { id: 'wizard', name: 'Wizard', hitDie: 6, saves: ['int', 'wis'], caster: 'full', spellAbility: 'int' },
];

export const classById = (id: string): ClassDef => CLASSES.find((c) => c.id === id) ?? CLASSES[0];

/** Spell slots per slot level (index 0 = 1st level) for a full caster of the given caster level. */
export const FULL_CASTER_SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Warlock Pact Magic: [slot count, slot level] by warlock level. */
export const PACT_SLOTS: [number, number][] = [
  [0, 0],
  [1, 1],
  [2, 1],
  [2, 2],
  [2, 2],
  [2, 3],
  [2, 3],
  [2, 4],
  [2, 4],
  [2, 5],
  [2, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [4, 5],
  [4, 5],
  [4, 5],
  [4, 5],
];

export interface ArmorDef {
  id: string;
  name: string;
  category: 'none' | 'light' | 'medium' | 'heavy';
  base: number;
  stealthDisadvantage?: boolean;
  strength?: number;
}

export const ARMOR: ArmorDef[] = [
  { id: 'none', name: 'No armor', category: 'none', base: 10 },
  { id: 'padded', name: 'Padded', category: 'light', base: 11, stealthDisadvantage: true },
  { id: 'leather', name: 'Leather', category: 'light', base: 11 },
  { id: 'studded', name: 'Studded Leather', category: 'light', base: 12 },
  { id: 'hide', name: 'Hide', category: 'medium', base: 12 },
  { id: 'chain_shirt', name: 'Chain Shirt', category: 'medium', base: 13 },
  { id: 'scale', name: 'Scale Mail', category: 'medium', base: 14, stealthDisadvantage: true },
  { id: 'breastplate', name: 'Breastplate', category: 'medium', base: 14 },
  { id: 'half_plate', name: 'Half Plate', category: 'medium', base: 15, stealthDisadvantage: true },
  { id: 'ring', name: 'Ring Mail', category: 'heavy', base: 14, stealthDisadvantage: true },
  { id: 'chain', name: 'Chain Mail', category: 'heavy', base: 16, stealthDisadvantage: true, strength: 13 },
  { id: 'splint', name: 'Splint', category: 'heavy', base: 17, stealthDisadvantage: true, strength: 15 },
  { id: 'plate', name: 'Plate', category: 'heavy', base: 18, stealthDisadvantage: true, strength: 15 },
];

export type UnarmoredDefense = 'none' | 'barbarian' | 'monk' | 'draconic' | 'mage_armor';

export const UNARMORED_DEFENSES: { id: UnarmoredDefense; name: string; formula: string }[] = [
  { id: 'none', name: 'Standard', formula: '10 + DEX' },
  { id: 'barbarian', name: 'Barbarian Unarmored Defense', formula: '10 + DEX + CON' },
  { id: 'monk', name: 'Monk Unarmored Defense', formula: '10 + DEX + WIS' },
  { id: 'draconic', name: 'Draconic Resilience', formula: '10 + DEX + CHA' },
  { id: 'mage_armor', name: 'Mage Armor', formula: '13 + DEX' },
];

export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export interface WeaponDef {
  name: string;
  dice: string;
  type: DamageType;
  category: 'simple' | 'martial';
  ranged: boolean;
  finesse?: boolean;
  properties: string;
  mastery: string;
}

export const WEAPONS: WeaponDef[] = [
  { name: 'Club', dice: '1d4', type: 'bludgeoning', category: 'simple', ranged: false, properties: 'Light', mastery: 'Slow' },
  { name: 'Dagger', dice: '1d4', type: 'piercing', category: 'simple', ranged: false, finesse: true, properties: 'Finesse, Light, Thrown (20/60)', mastery: 'Nick' },
  { name: 'Greatclub', dice: '1d8', type: 'bludgeoning', category: 'simple', ranged: false, properties: 'Two-Handed', mastery: 'Push' },
  { name: 'Handaxe', dice: '1d6', type: 'slashing', category: 'simple', ranged: false, properties: 'Light, Thrown (20/60)', mastery: 'Vex' },
  { name: 'Javelin', dice: '1d6', type: 'piercing', category: 'simple', ranged: false, properties: 'Thrown (30/120)', mastery: 'Slow' },
  { name: 'Light Hammer', dice: '1d4', type: 'bludgeoning', category: 'simple', ranged: false, properties: 'Light, Thrown (20/60)', mastery: 'Nick' },
  { name: 'Mace', dice: '1d6', type: 'bludgeoning', category: 'simple', ranged: false, properties: '', mastery: 'Sap' },
  { name: 'Quarterstaff', dice: '1d6', type: 'bludgeoning', category: 'simple', ranged: false, properties: 'Versatile (1d8)', mastery: 'Topple' },
  { name: 'Sickle', dice: '1d4', type: 'slashing', category: 'simple', ranged: false, properties: 'Light', mastery: 'Nick' },
  { name: 'Spear', dice: '1d6', type: 'piercing', category: 'simple', ranged: false, properties: 'Thrown (20/60), Versatile (1d8)', mastery: 'Sap' },
  { name: 'Dart', dice: '1d4', type: 'piercing', category: 'simple', ranged: true, finesse: true, properties: 'Finesse, Thrown (20/60)', mastery: 'Vex' },
  { name: 'Light Crossbow', dice: '1d8', type: 'piercing', category: 'simple', ranged: true, properties: 'Ammunition (80/320), Loading, Two-Handed', mastery: 'Slow' },
  { name: 'Shortbow', dice: '1d6', type: 'piercing', category: 'simple', ranged: true, properties: 'Ammunition (80/320), Two-Handed', mastery: 'Vex' },
  { name: 'Sling', dice: '1d4', type: 'bludgeoning', category: 'simple', ranged: true, properties: 'Ammunition (30/120)', mastery: 'Slow' },
  { name: 'Battleaxe', dice: '1d8', type: 'slashing', category: 'martial', ranged: false, properties: 'Versatile (1d10)', mastery: 'Topple' },
  { name: 'Flail', dice: '1d8', type: 'bludgeoning', category: 'martial', ranged: false, properties: '', mastery: 'Sap' },
  { name: 'Glaive', dice: '1d10', type: 'slashing', category: 'martial', ranged: false, properties: 'Heavy, Reach, Two-Handed', mastery: 'Graze' },
  { name: 'Greataxe', dice: '1d12', type: 'slashing', category: 'martial', ranged: false, properties: 'Heavy, Two-Handed', mastery: 'Cleave' },
  { name: 'Greatsword', dice: '2d6', type: 'slashing', category: 'martial', ranged: false, properties: 'Heavy, Two-Handed', mastery: 'Graze' },
  { name: 'Halberd', dice: '1d10', type: 'slashing', category: 'martial', ranged: false, properties: 'Heavy, Reach, Two-Handed', mastery: 'Cleave' },
  { name: 'Lance', dice: '1d10', type: 'piercing', category: 'martial', ranged: false, properties: 'Heavy, Reach, Two-Handed (unless mounted)', mastery: 'Topple' },
  { name: 'Longsword', dice: '1d8', type: 'slashing', category: 'martial', ranged: false, properties: 'Versatile (1d10)', mastery: 'Sap' },
  { name: 'Maul', dice: '2d6', type: 'bludgeoning', category: 'martial', ranged: false, properties: 'Heavy, Two-Handed', mastery: 'Topple' },
  { name: 'Morningstar', dice: '1d8', type: 'piercing', category: 'martial', ranged: false, properties: '', mastery: 'Sap' },
  { name: 'Pike', dice: '1d10', type: 'piercing', category: 'martial', ranged: false, properties: 'Heavy, Reach, Two-Handed', mastery: 'Push' },
  { name: 'Rapier', dice: '1d8', type: 'piercing', category: 'martial', ranged: false, finesse: true, properties: 'Finesse', mastery: 'Vex' },
  { name: 'Scimitar', dice: '1d6', type: 'slashing', category: 'martial', ranged: false, finesse: true, properties: 'Finesse, Light', mastery: 'Nick' },
  { name: 'Shortsword', dice: '1d6', type: 'piercing', category: 'martial', ranged: false, finesse: true, properties: 'Finesse, Light', mastery: 'Vex' },
  { name: 'Trident', dice: '1d8', type: 'piercing', category: 'martial', ranged: false, properties: 'Thrown (20/60), Versatile (1d10)', mastery: 'Topple' },
  { name: 'Warhammer', dice: '1d8', type: 'bludgeoning', category: 'martial', ranged: false, properties: 'Versatile (1d10)', mastery: 'Push' },
  { name: 'War Pick', dice: '1d8', type: 'piercing', category: 'martial', ranged: false, properties: 'Versatile (1d10)', mastery: 'Sap' },
  { name: 'Whip', dice: '1d4', type: 'slashing', category: 'martial', ranged: false, finesse: true, properties: 'Finesse, Reach', mastery: 'Slow' },
  { name: 'Blowgun', dice: '1', type: 'piercing', category: 'martial', ranged: true, properties: 'Ammunition (25/100), Loading', mastery: 'Vex' },
  { name: 'Hand Crossbow', dice: '1d6', type: 'piercing', category: 'martial', ranged: true, properties: 'Ammunition (30/120), Light, Loading', mastery: 'Vex' },
  { name: 'Heavy Crossbow', dice: '1d10', type: 'piercing', category: 'martial', ranged: true, properties: 'Ammunition (100/400), Heavy, Loading, Two-Handed', mastery: 'Push' },
  { name: 'Longbow', dice: '1d8', type: 'piercing', category: 'martial', ranged: true, properties: 'Ammunition (150/600), Heavy, Two-Handed', mastery: 'Slow' },
  { name: 'Musket', dice: '1d12', type: 'piercing', category: 'martial', ranged: true, properties: 'Ammunition (40/120), Loading, Two-Handed', mastery: 'Slow' },
  { name: 'Pistol', dice: '1d10', type: 'piercing', category: 'martial', ranged: true, properties: 'Ammunition (30/90), Loading', mastery: 'Vex' },
];

/** The actions every creature can take in combat (2024 rules), minus Attack and Magic which have their own panels. */
export const STANDARD_ACTIONS = [
  { id: 'dash', name: 'Dash', summary: 'Gain extra movement equal to your Speed this turn.' },
  { id: 'disengage', name: 'Disengage', summary: 'Your movement does not provoke Opportunity Attacks this turn.' },
  { id: 'dodge', name: 'Dodge', summary: 'Attacks against you have Disadvantage; you have Advantage on DEX saves.' },
  { id: 'help', name: 'Help', summary: 'Give an ally Advantage on their next check or attack.' },
  { id: 'hide', name: 'Hide', summary: 'Make a DC 15 Dexterity (Stealth) check while obscured or behind cover.' },
  { id: 'influence', name: 'Influence', summary: 'Persuade, deceive or intimidate a creature that can be swayed.' },
  { id: 'ready', name: 'Ready', summary: 'Prepare an action to take with your Reaction on a trigger.' },
  { id: 'search', name: 'Search', summary: 'Make a Wisdom check to notice something.' },
  { id: 'study', name: 'Study', summary: 'Make an Intelligence check to recall or analyse something.' },
  { id: 'utilize', name: 'Utilize', summary: 'Use a nonmagical object.' },
] as const;
export type StandardActionId = (typeof STANDARD_ACTIONS)[number]['id'];
