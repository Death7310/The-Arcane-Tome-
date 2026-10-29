import type { Element, Shape } from '../../fx/types';
import { ABILITIES, SKILLS, type Ability, type CasterType, type DamageType, type SkillId, type UnarmoredDefense } from './data';

export type ProfLevel = 0 | 0.5 | 1 | 2; // none, half (Jack of All Trades), proficient, expertise

export interface ClassEntry {
  id: string;
  classId: string;
  subclass: string;
  level: number;
  /** e.g. 'third' for an Eldritch Knight fighter. */
  casterOverride?: CasterType;
  hitDiceUsed: number;
}

export interface DamagePart {
  dice: string;
  type: DamageType;
}

export interface Weapon {
  id: string;
  name: string;
  damage: DamagePart[];
  /** 'auto' picks STR, DEX for ranged, or the better of the two for finesse weapons. */
  ability: Ability | 'auto';
  finesse: boolean;
  ranged: boolean;
  proficient: boolean;
  magicBonus: number;
  properties: string;
  mastery: string;
  notes: string;
}

export type SpellResolution = 'attack' | 'save' | 'auto' | 'heal' | 'utility';
export type CastingTime = 'action' | 'bonus' | 'reaction' | 'other';
export type Scaling = 'none' | 'cantrip_dice' | 'cantrip_beams';

export interface Spell {
  id: string;
  name: string;
  level: number; // 0 = cantrip
  school: string;
  castingTime: CastingTime;
  castingTimeText: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  prepared: boolean;
  resolution: SpellResolution;
  saveAbility: Ability;
  halfOnSave: boolean;
  /** Damage dice per instance; may use tokens like {MOD}. */
  damage: DamagePart[];
  /** Healing dice; may use tokens like {MOD}. */
  healing: string;
  /** Extra dice for each slot level above the spell's level. */
  upcastDice: string;
  /** Number of attack rolls / darts / rays at base level. */
  instances: number;
  upcastInstances: number;
  scaling: Scaling;
  /** Overrides the character's spellcasting ability for this spell (racial spells). */
  abilityOverride: Ability | null;
  element: Element;
  shape: Shape;
  description: string;
}

export type UsesFormula = number | 'pb' | 'level' | `mod:${Ability}` | `class:${string}`;

export interface Feature {
  id: string;
  name: string;
  source: string;
  description: string;
  usesMax: UsesFormula | null;
  usesSpent: number;
  recharge: 'short' | 'long' | 'none';
  /** Optional dice to roll when used; tokens like {PB} allowed. */
  roll: string;
  rollKind: 'damage' | 'healing' | 'other';
  castingTime: CastingTime;
  element: Element;
  shape: Shape;
}

export interface Item {
  id: string;
  name: string;
  qty: number;
  weight: number;
  notes: string;
}

export interface Turn {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  movementUsed: number;
  dashes: number;
}

export interface Character {
  schema: 1;
  id: string;
  system: 'dnd5e-2024';
  isExample?: boolean;
  name: string;
  player: string;
  species: string;
  background: string;
  alignment: string;
  xp: number;
  classes: ClassEntry[];
  abilities: Record<Ability, number>;
  saveProfs: Record<Ability, boolean>;
  skills: Record<SkillId, ProfLevel>;
  jackOfAllTrades: boolean;
  bonus: {
    ac: number;
    initiative: number;
    saves: number;
    checks: number;
    spellAttack: number;
    spellDc: number;
    hpPerLevel: number;
    speed: number;
  };
  armor: { armorId: string; shield: boolean; magicBonus: number; unarmored: UnarmoredDefense };
  speed: number;
  size: string;
  hp: { current: number; temp: number; maxOverride: number | null };
  deathSaves: { successes: number; failures: number };
  exhaustion: number;
  heroicInspiration: boolean;
  spellcasting: {
    ability: Ability | null;
    slotsOverride: number[] | null;
    slotsUsed: number[]; // index 0 = 1st level
    pactUsed: number;
    concentratingOn: string | null;
  };
  spells: Spell[];
  weapons: Weapon[];
  features: Feature[];
  inventory: Item[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  proficiencies: string;
  languages: string;
  notes: string;
  turn: Turn;
  updatedAt: number;
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const emptyTurn = (): Turn => ({ action: false, bonus: false, reaction: false, movementUsed: 0, dashes: 0 });

export function blankSpell(partial: Partial<Spell> = {}): Spell {
  return {
    id: uid(),
    name: 'New spell',
    level: 1,
    school: 'Evocation',
    castingTime: 'action',
    castingTimeText: 'Action',
    range: '60 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    prepared: true,
    resolution: 'attack',
    saveAbility: 'dex',
    halfOnSave: true,
    damage: [],
    healing: '',
    upcastDice: '',
    instances: 1,
    upcastInstances: 0,
    scaling: 'none',
    abilityOverride: null,
    element: 'arcane',
    shape: 'bolt',
    description: '',
    ...partial,
  };
}

export function blankWeapon(partial: Partial<Weapon> = {}): Weapon {
  return {
    id: uid(),
    name: 'New weapon',
    damage: [{ dice: '1d6', type: 'slashing' }],
    ability: 'auto',
    finesse: false,
    ranged: false,
    proficient: true,
    magicBonus: 0,
    properties: '',
    mastery: '',
    notes: '',
    ...partial,
  };
}

export function blankFeature(partial: Partial<Feature> = {}): Feature {
  return {
    id: uid(),
    name: 'New feature',
    source: '',
    description: '',
    usesMax: null,
    usesSpent: 0,
    recharge: 'long',
    roll: '',
    rollKind: 'other',
    castingTime: 'action',
    element: 'arcane',
    shape: 'aura',
    ...partial,
  };
}

const allAbilities = <T,>(v: T): Record<Ability, T> =>
  Object.fromEntries(ABILITIES.map((a) => [a, v])) as Record<Ability, T>;

export function blankCharacter(): Character {
  return {
    schema: 1,
    id: uid(),
    system: 'dnd5e-2024',
    name: 'New Adventurer',
    player: '',
    species: '',
    background: '',
    alignment: '',
    xp: 0,
    classes: [{ id: uid(), classId: 'fighter', subclass: '', level: 1, hitDiceUsed: 0 }],
    abilities: allAbilities(10),
    saveProfs: { ...allAbilities(false), str: true, con: true },
    skills: Object.fromEntries(SKILLS.map((s) => [s.id, 0])) as Record<SkillId, ProfLevel>,
    jackOfAllTrades: false,
    bonus: { ac: 0, initiative: 0, saves: 0, checks: 0, spellAttack: 0, spellDc: 0, hpPerLevel: 0, speed: 0 },
    armor: { armorId: 'none', shield: false, magicBonus: 0, unarmored: 'none' },
    speed: 30,
    size: 'Medium',
    hp: { current: 10, temp: 0, maxOverride: null },
    deathSaves: { successes: 0, failures: 0 },
    exhaustion: 0,
    heroicInspiration: false,
    spellcasting: { ability: null, slotsOverride: null, slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactUsed: 0, concentratingOn: null },
    spells: [],
    weapons: [],
    features: [],
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    proficiencies: '',
    languages: 'Common',
    notes: '',
    turn: emptyTurn(),
    updatedAt: Date.now(),
  };
}

/** Fills in any fields missing from older or hand-edited saves so the sheet never crashes on import. */
export function normalizeCharacter(raw: unknown): Character {
  const base = blankCharacter();
  if (!raw || typeof raw !== 'object') throw new Error('That file is not a character.');
  const c = raw as Partial<Character>;
  if (c.system && c.system !== 'dnd5e-2024') throw new Error(`Unsupported game system "${c.system}".`);
  const merged: Character = {
    ...base,
    ...c,
    id: typeof c.id === 'string' ? c.id : base.id,
    abilities: { ...base.abilities, ...c.abilities },
    saveProfs: { ...base.saveProfs, ...c.saveProfs },
    skills: { ...base.skills, ...c.skills },
    bonus: { ...base.bonus, ...c.bonus },
    armor: { ...base.armor, ...c.armor },
    hp: { ...base.hp, ...c.hp },
    deathSaves: { ...base.deathSaves, ...c.deathSaves },
    spellcasting: { ...base.spellcasting, ...c.spellcasting },
    currency: { ...base.currency, ...c.currency },
    turn: { ...base.turn, ...c.turn },
    classes: Array.isArray(c.classes) && c.classes.length ? c.classes.map((k) => ({ ...base.classes[0], ...k })) : base.classes,
    spells: Array.isArray(c.spells) ? c.spells.map((s) => blankSpell(s)) : [],
    weapons: Array.isArray(c.weapons) ? c.weapons.map((w) => blankWeapon(w)) : [],
    features: Array.isArray(c.features) ? c.features.map((f) => blankFeature(f)) : [],
    inventory: Array.isArray(c.inventory) ? c.inventory.map((i): Item => ({ ...{ id: uid(), name: '', qty: 1, weight: 0, notes: '' }, ...(i as Partial<Item>) })) : [],
  };
  while (merged.spellcasting.slotsUsed.length < 9) merged.spellcasting.slotsUsed.push(0);
  return merged;
}
