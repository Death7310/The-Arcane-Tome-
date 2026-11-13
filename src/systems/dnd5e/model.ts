import type { Element, Shape } from '../../fx/types';
import { ABILITIES, CONDITIONS, SKILLS, type Ability, type CasterType, type ConditionId, type DamageType, type SkillId, type UnarmoredDefense } from './data';

export type ProfLevel = 0 | 0.5 | 1 | 2; // none, half (Jack of All Trades), proficient, expertise

export interface ClassEntry {
  id: string;
  classId: string;
  subclass: string;
  /** The subclass's id in the rules (SRD or your library), when it came from there. */
  subclassId?: string;
  level: number;
  /** e.g. 'third' for an Eldritch Knight fighter. */
  casterOverride?: CasterType;
  hitDiceUsed: number;
  /**
   * Hit points rolled for each level of this class (index 0 = its 1st level). null, or a
   * missing entry, means the level uses the fixed average. The very first level of your
   * first class is always the full die.
   */
  hpRolls?: (number | null)[];
}

/** Where a feature on the sheet came from, so leveling can add, update and remove it. */
export interface FeatureOrigin {
  kind: 'class' | 'subclass' | 'feat';
  /** The class entry it belongs to (class and subclass features). */
  entryId?: string;
  /** Rules id, e.g. 'features.fighter.second-wind' or 'feats.alert'. */
  ref: string;
  /** Class level it arrives at. */
  level: number;
  /** Kept in step with the rules on every level change; false once you edit it yourself. */
  auto: boolean;
}

/** One level gained through Level up, remembered so it can be undone exactly. */
export interface LevelStep {
  entryId: string;
  classId: string;
  /** The class level this step reached. */
  classLevel: number;
  newClass: boolean;
  /** Hit points rolled for this level; null for the average. */
  hpRoll: number | null;
  /** Ability score increases applied. */
  asi?: Partial<Record<Ability, number>>;
  /** Features added for feats chosen at this level. */
  featFeatureIds?: string[];
  /** Spells learned at this level. */
  spellIds?: string[];
  /** Subclass chosen at this level, and what it replaced. */
  subclass?: { id?: string; name: string; previous: { id?: string; name: string } };
  /** Skill proficiencies gained (multiclassing into a Bard, Ranger or Rogue). */
  skills?: SkillId[];
  /** Training gained from multiclassing, as written into your proficiencies. */
  proficiencyNote?: string;
  /** Current HP before the level. */
  hpBefore: number;
  /** A hand-set HP maximum before this level raised it. */
  maxOverrideBefore?: number | null;
  at: number;
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
  /**
   * What gives you the spell: a class id ("ranger", "warlock"), "feat:Shadow-Touched", or ""
   * when it isn't set. A class's spells use that class's spellcasting ability.
   */
  grantedBy: string;
  /** The spell it was made from (its name in the rules), so an edited copy can be reset. */
  basedOn: string;
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
  origin?: FeatureOrigin;
}

/** Something a companion can do: an attack, a saving-throw effect, or just a rule to read. */
export interface CompanionAction {
  id: string;
  name: string;
  kind: 'trait' | 'action' | 'bonus' | 'reaction' | 'legendary';
  attack: 'melee' | 'ranged' | null;
  /** To-hit bonus: a number or a formula with your tokens, e.g. "{SPELLATK}" or "3 + {PB}". */
  toHit: string;
  /** Reach or range, as written: "5 ft." or "30/120 ft." */
  reach: string;
  /** Damage dice, tokens allowed: "1d8 + {PB}". */
  damage: string;
  damageType: string;
  save: Ability | null;
  /** Save DC: a number or a formula, e.g. "{SPELLDC}". */
  dc: string;
  text: string;
  /**
   * A reaction that adds its damage to another creature's hit, like a Drakewarden drake's
   * Infused Strikes: offered on your attack results. Unset means "read it from the text".
   */
  boost?: boolean;
  /** Its dice from a level of yours on: the last step at or below your level replaces the damage dice. */
  levelDice?: { level: number; dice: string }[];
  /** Whose level the steps count: a class id ("ranger"), or "" for your character level. */
  levelOf?: string;
  /**
   * Extra damage of the companion's essence type from a level of yours on (a Drakewarden drake's
   * Magic Fang: 1d6 from Ranger 7, 2d6 from 15): the last step at or below your level applies.
   */
  extra?: { level: number; dice: string }[];
}

/**
 * A companion's micro sheet: a familiar, a steed, a drake, a homunculus, a summoned
 * spirit or something you made up. Numbers can be formulas over your own stats, so a
 * companion that scales with you ("AC 13 + {PB}", "HP 5 + 5 × {LEVEL:ranger}") keeps up
 * as you level.
 */
export interface Companion {
  id: string;
  name: string;
  /** What it is: "Drake companion", "Familiar (owl)". */
  kind: string;
  size: string;
  type: string;
  ac: string;
  maxHp: string;
  hp: number;
  tempHp: number;
  speed: string;
  abilities: Record<Ability, number>;
  /** Its Proficiency Bonus: a number, or "{PB}" for one that uses yours. */
  pb: string;
  saves: Ability[];
  skills: string;
  senses: string;
  languages: string;
  cr: string;
  actions: CompanionAction[];
  notes: string;
  /** Where it came from: "SRD 5.2.1", "Pasted stat block", "Made up". */
  source: string;
  /** Its own conditions, which affect its rolls like yours affect yours. */
  conditions: ConditionId[];
  /** What it has used this turn. */
  turn: Turn;
  /** What it carries. */
  inventory: Item[];
  /** Weapons it wields, rolled with its own STR or DEX and Proficiency Bonus. */
  weapons: Weapon[];
  /** Armor or barding it wears; null means its stat block's AC. */
  armor: { armorId: string; shield: boolean; magicBonus: number } | null;
  /**
   * Its element, chosen once (a drake's Draconic Essence): the damage type of its reactions
   * that add to a hit (Infused Strikes) when they don't name one themselves. "" for none.
   */
  essence: string;
}

export interface Item {
  id: string;
  name: string;
  qty: number;
  weight: number;
  notes: string;
  /** Its rules text (from the item list, a pasted stat block or an imported sheet). */
  description?: string;
}

/** A die or roll the player saved on the Dice page: a formula like "3d6+{DEX}", or a die with its own labelled faces. */
export interface CustomDie {
  id: string;
  name: string;
  kind: 'formula' | 'faces';
  formula: string;
  faces: string[];
  count: number;
  element: Element;
}

export function blankCustomDie(partial: Partial<CustomDie> = {}): CustomDie {
  return { id: uid(), name: 'New die', kind: 'formula', formula: '1d6', faces: [], count: 1, element: 'arcane', ...partial };
}

/** A temporary effect such as Bless or Shield of Faith. Rounds count down each New turn; null lasts until removed. */
export interface Effect {
  id: string;
  name: string;
  rounds: number | null;
  /** Dice or number added to the rolls below, e.g. "1d4" or "-1d4" or "2". */
  bonus: string;
  attacks: boolean;
  saves: boolean;
  checks: boolean;
  ac: number;
  note: string;
}

export function blankEffect(partial: Partial<Effect> = {}): Effect {
  return { id: uid(), name: 'Effect', rounds: null, bonus: '', attacks: false, saves: false, checks: false, ac: 0, note: '', ...partial };
}

export interface Turn {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  movementUsed: number;
  dashes: number;
  /** Attacks made with the Attack action this turn (Extra Attack allows more than one). */
  attacks: number;
  /** The Light weapons attacked with in this turn's Attack action, which open the Light property's extra attack. */
  lightWith: string[];
  /** Whether the Light property's extra attack has been made this turn. */
  lightExtra: boolean;
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
    /** Spell slots (the usual rules) or spell points (the Dungeon Master's Guide variant). */
    system: 'slots' | 'points';
    /** Spell points spent since the last Long Rest. */
    pointsUsed: number;
    /** Slot levels of 6th and up made with spell points since the last Long Rest (one of each). */
    highUsed: number[];
  };
  spells: Spell[];
  weapons: Weapon[];
  features: Feature[];
  inventory: Item[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  proficiencies: string;
  /** The languages you know, comma-separated ("Common, Elvish, Draconic"). */
  languages: string;
  /** Your own description of a language, by its key (see languageKey), replacing the built-in lore. */
  languageNotes: Record<string, string>;
  notes: string;
  turn: Turn;
  customDice: CustomDie[];
  conditions: ConditionId[];
  effects: Effect[];
  /** Small downscaled image as a data URL. */
  portrait: string | null;
  /** Levels gained with Level up, newest last, so they can be undone. */
  progression: LevelStep[];
  companions: Companion[];
  /** Tiles you made yourself (for homebrew rules or another system): notes, trackers and rolls. */
  tiles: Tile[];
  /** The foes in the current fight, as much as you know of them. */
  enemies: Enemy[];
  /** The enemy your attacks and spells go at (gold on the Enemies page), or null for none. */
  targetId: string | null;
  /** Your party's names, remembered for logging their damage. */
  party: string[];
  /** The initiative order of the current fight, or null outside a fight. */
  fight: Fight | null;
  /** Your own counters (arrows, gold, ki, a quest's days…) on the Counters page. */
  counters: Counter[];
  updatedAt: number;
}

/** A number you keep track of: − and + change it by its amount, Reset puts it back to its start. */
export interface Counter {
  id: string;
  name: string;
  value: number;
  /** How much − and + change it. */
  step: number;
  /** What Reset puts it back to. */
  start: number;
}

/** How hurt an enemy looks: set by hand from what the DM describes, or worked out from known HP. */
export type EnemyStatus = 'healthy' | 'bloodied' | 'badly' | 'down';

/** Something you've put on an enemy that adds damage when you hit it (Hunter's Mark, Hex…). */
export interface EnemyMark {
  id: string;
  name: string;
  /** Extra dice on each hit with an attack roll, and their type: "1d6" Force. */
  dice: string;
  type: string;
  /** The concentration spell it comes from (it ends with that spell), or "" for one you set by hand. */
  spell: string;
}

/** Damage an enemy took: yours, a companion's or a party member's. */
export interface EnemyHit {
  id: string;
  /** The roll it came from, so it can be moved to another enemy. */
  roll: string;
  who: 'you' | 'companion' | 'party';
  /** The companion's or party member's name ("" for you). */
  name: string;
  amount: number;
  type: string;
  /** What did it: "Longbow", "Hunter's Mark". */
  what: string;
  time: number;
}

/** A foe, as much as you know of it: the DM's answers, not its stat block (unless you choose to see it). */
export interface Enemy {
  id: string;
  name: string;
  /** Its Armor Class when known, else null. */
  ac: number | null;
  /** What your hits and misses have shown about an unknown AC. */
  acAtLeast: number | null;
  acAtMost: number | null;
  /** Its Hit Point maximum, if you know it. */
  maxHp: number | null;
  /** How hurt it looks (used when its HP isn't known). */
  status: EnemyStatus;
  conditions: ConditionId[];
  marks: EnemyMark[];
  /** Damage types it resists, is immune to, or is vulnerable to, as you learn them. */
  resist: string[];
  immune: string[];
  vulnerable: string[];
  /** Within 5 feet of you: yes, no, or null to go by the attack (melee close, ranged not). */
  near: boolean | null;
  hits: EnemyHit[];
  notes: string;
  /** Added from the creature list: its id there, and whether you've chosen to see and use its stats. */
  creatureId: string;
  revealed: boolean;
}

/** One place in the initiative order. */
export interface FightEntry {
  id: string;
  kind: 'you' | 'companion' | 'enemy' | 'ally';
  /** The companion's or enemy's id ("" for you and allies). */
  ref: string;
  name: string;
  initiative: number;
}

export interface Fight {
  round: number;
  /** Whose turn it is: an index into order. */
  turn: number;
  order: FightEntry[];
}

export type TileEntryKind = 'note' | 'tracker' | 'roll';

export interface TileEntry {
  id: string;
  kind: TileEntryKind;
  label: string;
  /** A note's text. */
  text: string;
  /** A tracker's current value and its maximum (null for none). */
  value: number;
  max: number | null;
  /** A roll's dice, with tokens like {STR} or {PB} allowed. */
  formula: string;
}

export interface Tile {
  id: string;
  title: string;
  entries: TileEntry[];
}

export function blankTileEntry(kind: TileEntryKind, partial: Partial<TileEntry> = {}): TileEntry {
  return { id: uid(), kind, label: kind === 'note' ? 'Notes' : kind === 'tracker' ? 'Tracker' : 'Roll', text: '', value: 0, max: kind === 'tracker' ? 10 : null, formula: kind === 'roll' ? '1d20' : '', ...partial };
}

export function blankTile(partial: Partial<Tile> = {}): Tile {
  return { id: uid(), title: 'New tile', entries: [blankTileEntry('note')], ...partial };
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const emptyTurn = (): Turn => ({ action: false, bonus: false, reaction: false, movementUsed: 0, dashes: 0, attacks: 0, lightWith: [], lightExtra: false });

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
    grantedBy: '',
    basedOn: '',
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
    spellcasting: { ability: null, slotsOverride: null, slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactUsed: 0, concentratingOn: null, system: 'slots', pointsUsed: 0, highUsed: [] },
    spells: [],
    weapons: [],
    features: [],
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    proficiencies: '',
    languages: 'Common',
    notes: '',
    turn: emptyTurn(),
    customDice: [],
    conditions: [],
    effects: [],
    portrait: null,
    progression: [],
    companions: [],
    enemies: [],
    targetId: null,
    party: [],
    fight: null,
    counters: [],
    tiles: [],
    languageNotes: {},
    updatedAt: Date.now(),
  };
}

export function blankCompanionAction(partial: Partial<CompanionAction> = {}): CompanionAction {
  return { id: uid(), name: 'New action', kind: 'action', attack: null, toHit: '', reach: '', damage: '', damageType: '', save: null, dc: '', text: '', ...partial };
}

export function blankCompanion(partial: Partial<Companion> = {}): Companion {
  return {
    id: uid(),
    name: 'New companion',
    kind: '',
    size: 'Small',
    type: 'Beast',
    ac: '12',
    maxHp: '10',
    hp: 10,
    tempHp: 0,
    speed: '30 ft.',
    abilities: allAbilities(10),
    pb: '2',
    saves: [],
    skills: '',
    senses: '',
    languages: '',
    cr: '',
    notes: '',
    source: 'Made up',
    ...partial,
    essence: typeof partial.essence === 'string' ? partial.essence : '',
    actions: (partial.actions ?? []).map((a) => blankCompanionAction(a)),
    conditions: Array.isArray(partial.conditions) ? partial.conditions : [],
    turn: { ...emptyTurn(), ...partial.turn },
    inventory: Array.isArray(partial.inventory) ? partial.inventory.map((i): Item => ({ ...{ id: uid(), name: '', qty: 1, weight: 0, notes: '' }, ...(i as Partial<Item>) })) : [],
    weapons: Array.isArray(partial.weapons) ? partial.weapons.map((w) => blankWeapon(w)) : [],
    armor: partial.armor && typeof partial.armor.armorId === 'string' ? { ...{ shield: false, magicBonus: 0 }, ...(partial.armor as Partial<NonNullable<Companion['armor']>>), armorId: partial.armor.armorId } : null,
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
    turn: { ...base.turn, ...c.turn, lightWith: Array.isArray(c.turn?.lightWith) ? c.turn.lightWith.filter((x) => typeof x === 'string') : [] },
    classes: Array.isArray(c.classes) && c.classes.length ? c.classes.map((k) => ({ ...base.classes[0], ...k })) : base.classes,
    spells: Array.isArray(c.spells) ? c.spells.map((s) => blankSpell(s)) : [],
    weapons: Array.isArray(c.weapons) ? c.weapons.map((w) => blankWeapon(w)) : [],
    features: Array.isArray(c.features) ? c.features.map((f) => blankFeature(f)) : [],
    customDice: Array.isArray(c.customDice) ? c.customDice.map((d) => blankCustomDie(d)) : [],
    conditions: Array.isArray(c.conditions) ? c.conditions.filter((x): x is ConditionId => CONDITIONS.some((k) => k.id === x)) : [],
    effects: Array.isArray(c.effects) ? c.effects.map((e) => blankEffect(e)) : [],
    portrait: typeof c.portrait === 'string' && c.portrait.startsWith('data:image/') ? c.portrait : null,
    progression: Array.isArray(c.progression) ? c.progression.filter((p) => p && typeof p.entryId === 'string' && typeof p.classLevel === 'number') : [],
    companions: Array.isArray(c.companions) ? c.companions.map((k) => blankCompanion({ ...k, abilities: { ...allAbilities(10), ...k.abilities } })) : [],
    enemies: Array.isArray(c.enemies) ? c.enemies.map((e) => blankEnemy(e)) : [],
    targetId: typeof c.targetId === 'string' && Array.isArray(c.enemies) && c.enemies.some((e) => e?.id === c.targetId) ? c.targetId : null,
    party: Array.isArray(c.party) ? c.party.filter((n): n is string => typeof n === 'string' && !!n.trim()) : [],
    fight: normalizeFight(c.fight),
    counters: Array.isArray(c.counters) ? c.counters.filter((k) => k && typeof k === 'object').map((k) => blankCounter(k)) : [],
    tiles: Array.isArray(c.tiles)
      ? c.tiles.filter((t) => t && typeof t.id === 'string').map((t) => blankTile({ ...t, entries: Array.isArray(t.entries) ? t.entries.map((e) => blankTileEntry(e?.kind ?? 'note', e)) : [] }))
      : [],
    languageNotes: c.languageNotes && typeof c.languageNotes === 'object' && !Array.isArray(c.languageNotes) ? Object.fromEntries(Object.entries(c.languageNotes).filter(([, v]) => typeof v === 'string')) : {},
    inventory: Array.isArray(c.inventory) ? c.inventory.map((i): Item => ({ ...{ id: uid(), name: '', qty: 1, weight: 0, notes: '' }, ...(i as Partial<Item>) })) : [],
  };
  while (merged.spellcasting.slotsUsed.length < 9) merged.spellcasting.slotsUsed.push(0);
  const sc = merged.spellcasting;
  sc.system = sc.system === 'points' ? 'points' : 'slots';
  sc.pointsUsed = Number.isFinite(sc.pointsUsed) ? Math.max(0, sc.pointsUsed) : 0;
  sc.highUsed = Array.isArray(sc.highUsed) ? sc.highUsed.filter((n) => Number.isInteger(n) && n >= 6 && n <= 9) : [];
  return merged;
}

export function blankEnemy(partial: Partial<Enemy> = {}): Enemy {
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    id: uid(),
    name: 'Enemy',
    notes: '',
    creatureId: '',
    ...partial,
    ac: num(partial.ac),
    acAtLeast: num(partial.acAtLeast),
    acAtMost: num(partial.acAtMost),
    maxHp: num(partial.maxHp),
    status: (['healthy', 'bloodied', 'badly', 'down'] as const).includes(partial.status as EnemyStatus) ? (partial.status as EnemyStatus) : 'healthy',
    conditions: list<ConditionId>(partial.conditions).filter((x) => CONDITIONS.some((k) => k.id === x)),
    marks: list<EnemyMark>(partial.marks).map((m) => ({ ...{ id: uid(), name: 'Mark', dice: '', type: '', spell: '' }, ...m })),
    resist: list<string>(partial.resist),
    immune: list<string>(partial.immune),
    vulnerable: list<string>(partial.vulnerable),
    near: typeof partial.near === 'boolean' ? partial.near : null,
    hits: list<EnemyHit>(partial.hits).filter((h) => h && Number.isFinite(h.amount)),
    revealed: !!partial.revealed,
  };
}

function normalizeFight(raw: unknown): Fight | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Partial<Fight>;
  const order = Array.isArray(f.order)
    ? f.order
        .filter((x) => x && typeof x.name === 'string')
        .map((x) => ({ id: typeof x.id === 'string' ? x.id : uid(), kind: x.kind ?? 'ally', ref: typeof x.ref === 'string' ? x.ref : '', name: x.name, initiative: Number(x.initiative) || 0 }))
    : [];
  if (!order.length) return null;
  return { round: Math.max(1, Number(f.round) || 1), turn: Math.min(order.length - 1, Math.max(0, Number(f.turn) || 0)), order };
}

export function blankCounter(partial: Partial<Counter> = {}): Counter {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    id: typeof partial.id === 'string' ? partial.id : uid(),
    name: typeof partial.name === 'string' ? partial.name : 'Counter',
    value: num(partial.value, 0),
    step: Math.max(1, num(partial.step, 1)),
    start: num(partial.start, num(partial.value, 0)),
  };
}
