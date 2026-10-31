// The D&D 5e (2024) reference data: classes and subclasses level by level, feats, the full
// spell list, the creatures and the equipment and magic items, from the System Reference Document 5.2.1 by Wizards of the
// Coast LLC (CC-BY-4.0, https://creativecommons.org/licenses/by/4.0/), built by
// scripts/srd/build.mjs. It's loaded on first use so the sheet itself opens fast.
//
// Homebrew from your rules library has the same shape, so leveling, the spell list and
// companions treat your own classes, spells and creatures exactly like the official ones.

import type { CastingTime, Companion, Spell, Weapon } from '../model';
import type { Ability } from '../data';

/** Values that change with class level, as change points: [[1, 2], [3, 3], [6, 4]…]. */
export type Steps<T = number | string> = [number, T][];

export interface ClassFeatureDef {
  key: string;
  /** Rules id, e.g. 'features.fighter.second-wind' (homebrew: 'pack:<pack>:<key>'). */
  id: string;
  name: string;
  /** Class level it arrives at. */
  level: number;
  text: string;
  /** Uses per rest, by level, or 'mod:cha' style for "your Charisma modifier (minimum 1)". */
  uses?: Steps<number> | string;
  recharge?: 'short' | 'long';
  /** Dice it rolls, by level, in app notation (tokens like {WIS} allowed). */
  roll?: Steps<string>;
  rollKind?: 'healing' | 'damage' | 'other';
  damageType?: string | null;
  castingTime: CastingTime;
  /** Numbers from the class table shown with it, e.g. Rage Damage or Martial Arts die. */
  stats?: { label: string; steps: Steps }[];
  /** This feature asks you to pick a feat of this category (fighting-style, epic-boon). */
  featCategory?: string;
}

export interface ClassDef {
  id: string;
  name: string;
  hitDie: number;
  /** Multiclassing needs 13 in all (or any) of these. */
  multiclass: { all?: Ability[]; any?: Ability[] };
  saves: Ability[];
  armor: string[];
  weapons: string[];
  multiclassArmor: string[];
  multiclassWeapons: string[];
  skills: { pick: number; from: string[] } | null;
  subclassLevel: number;
  asiLevels: number[];
  epicBoonLevel: number | null;
  cantrips: Steps<number> | null;
  prepared: Steps<number> | null;
  features: ClassFeatureDef[];
  /** Homebrew classes: how they cast spells (the SRD's are known to the sheet already). */
  caster?: 'none' | 'full' | 'half' | 'third' | 'pact' | string;
  spellAbility?: Ability | null;
  /** Where it came from: 'SRD 5.2.1' or a library pack's name. */
  source?: string;
}

export interface SubclassDef {
  id: string;
  name: string;
  classId: string;
  text: string;
  features: ClassFeatureDef[];
  source?: string;
}

/** The spells a feat grants: fixed ones, ones you choose, and how they're cast. */
export interface FeatSpells {
  /** Spells it always gives, by name ("Invisibility"). */
  fixed: string[];
  /** Spells you pick: how many, of what level (0 = cantrips), from which schools or class lists (empty: any). */
  choose: { count: number; level: number; schools: string[]; lists: string[] }[];
  /** Each can be cast once per Long Rest without a spell slot. */
  freeCast: boolean;
  /** Their spellcasting ability: the one the feat raises, your choice of INT/WIS/CHA, or a set one. */
  ability: 'raised' | 'choose' | Ability;
}

export interface FeatDef {
  id: string;
  name: string;
  /** origin, general, fighting-style, epic-boon. */
  category: string;
  repeatable: boolean;
  minLevel: number;
  /** Abilities it can raise by 1 (half-feats and boons). */
  abilities: Ability[];
  text: string;
  /** Spells it grants, when it does (read from its text when not given). */
  spells?: FeatSpells;
  source?: string;
}

export interface CreatureAction {
  kind: string;
  name: string;
  text: string;
  attack?: 'melee' | 'ranged';
  toHit?: number;
  reach?: number;
  range?: number;
  damage?: string;
  damageType?: string;
  save?: Ability;
  dc?: number;
}

export interface CreatureDef {
  srd: string;
  name: string;
  size: string;
  type: string;
  alignment?: string;
  ac: number;
  hp: number;
  hitDice: string;
  speed: string;
  abilities: Record<Ability, number>;
  saves: Ability[];
  skills: string[];
  senses: string;
  languages: string;
  cr: number;
  actions: CreatureAction[];
  /** A library creature's full companion sheet (formulas and all), used as its template. */
  companion?: Companion;
  source?: string;
}

/** A spell from the rules: the sheet's Spell, minus the per-character fields. */
export type SpellDef = Omit<Spell, 'id' | 'prepared' | 'abilityOverride' | 'grantedBy' | 'basedOn'> & { srd?: string; classes?: string[]; source?: string };

export interface ItemWeaponStats {
  dice: string;
  type: string;
  category: 'simple' | 'martial';
  ranged: boolean;
  finesse: boolean;
  /** "Ammunition (80/320), Two-Handed", as the rules write it. */
  properties: string;
  mastery: string;
  range?: [number, number];
}

export interface ItemArmorStats {
  category: 'light' | 'medium' | 'heavy' | 'shield';
  base: number;
  maxDex?: number;
  strength?: number;
  stealth?: boolean;
}

/** What a magic weapon or armor adds to the base item it's made from. */
export interface ItemTemplate {
  applies: 'weapon' | 'armor' | 'shield' | 'ammunition';
  /** The base items it can be ("Longsword", "Shortbow"…). */
  bases: string[];
  attackBonus?: number;
  damageBonus?: number;
  acBonus?: number;
  /** Dice it adds on every hit; type 'same' means the weapon's own damage type. */
  extraDamage?: { dice: string; type: string }[];
}

export interface ItemDef {
  /** 'w:shortbow', 'a:chain-mail', 'g:rope', 't:thieves-tools', 'm:bag-of-holding' (homebrew: 'pack:<pack>:<key>'). */
  id: string;
  /** "Shortbow", or "Flame Tongue {base}" for a magic item made from a base weapon or armor. */
  name: string;
  kind: 'weapon' | 'armor' | 'gear' | 'tool' | 'magic';
  /** "Simple ranged weapon", "Heavy armor", "Wondrous item", "Potion"… */
  category: string;
  rarity?: string;
  attunement?: boolean;
  charges?: number;
  /** Pounds, and gold pieces. */
  weight?: number;
  cost?: number;
  text: string;
  weapon?: ItemWeaponStats;
  armor?: ItemArmorStats;
  template?: ItemTemplate;
  /** For an item saved from a pasted stat block: that stat block, re-read whenever it's added. */
  paste?: string;
  /** For a weapon saved from your Attacks: the weapon exactly as you set it up. */
  sheetWeapon?: Omit<Weapon, 'id'>;
  source?: string;
}

export interface Catalog {
  classes: ClassDef[];
  subclasses: SubclassDef[];
  feats: FeatDef[];
  spells: SpellDef[];
  creatures: CreatureDef[];
  items: ItemDef[];
}

/** The value at `level` from change points (the last one at or below it). */
export function stepAt<T>(steps: Steps<T> | null | undefined, level: number): T | undefined {
  if (!steps) return undefined;
  let v: T | undefined;
  for (const [l, value] of steps) if (l <= level) v = value;
  return v;
}

export const SRD_CREDIT =
  'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

let loading: Promise<Catalog> | null = null;

/** The SRD catalog, loaded once on first use. */
export function loadSrd(): Promise<Catalog> {
  loading ??= Promise.all([import('./classes.json'), import('./subclasses.json'), import('./feats.json'), import('./spells.json'), import('./creatures.json'), import('./items.json')]).then(
    ([classes, subclasses, feats, spells, creatures, items]) => ({
      classes: (classes.default as ClassDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
      subclasses: (subclasses.default as SubclassDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
      feats: (feats.default as FeatDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
      spells: (spells.default as SpellDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
      creatures: (creatures.default as unknown as CreatureDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
      items: (items.default as ItemDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
    }),
  );
  return loading;
}
