// The D&D 5e (2024) reference data: classes and subclasses level by level, feats, the full
// spell list and the creatures, from the System Reference Document 5.2.1 by Wizards of the
// Coast LLC (CC-BY-4.0, https://creativecommons.org/licenses/by/4.0/), built by
// scripts/srd/build.mjs. It's loaded on first use so the sheet itself opens fast.
//
// Homebrew from your rules library has the same shape, so leveling, the spell list and
// companions treat your own classes, spells and creatures exactly like the official ones.

import type { CastingTime, Companion, Spell } from '../model';
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
export type SpellDef = Omit<Spell, 'id' | 'prepared' | 'abilityOverride'> & { srd?: string; classes?: string[]; source?: string };

export interface Catalog {
  classes: ClassDef[];
  subclasses: SubclassDef[];
  feats: FeatDef[];
  spells: SpellDef[];
  creatures: CreatureDef[];
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
  loading ??= Promise.all([import('./classes.json'), import('./subclasses.json'), import('./feats.json'), import('./spells.json'), import('./creatures.json')]).then(
    ([classes, subclasses, feats, spells, creatures]) => ({
      classes: (classes.default as ClassDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
      subclasses: (subclasses.default as SubclassDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
      feats: (feats.default as FeatDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
      spells: (spells.default as SpellDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
      creatures: (creatures.default as unknown as CreatureDef[]).map((c) => ({ ...c, source: 'SRD 5.2.1' })),
    }),
  );
  return loading;
}
