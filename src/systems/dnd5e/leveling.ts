// Leveling up (and down). A level is planned first (what you'd gain: hit points, features,
// a subclass, an Ability Score Improvement or feat, spell slots), then applied in one step,
// and remembered so it can be undone exactly. Class and subclass features are kept in
// step with the rules: they arrive at their level, their uses and dice grow with it, and
// they leave if the level is undone. Features you've edited yourself are left alone.
//
// Rules: System Reference Document 5.2.1 (2024). Multiclassing needs 13+ in the primary
// abilities of the new class and of every class you already have; a new class grants only
// its multiclass training; HP per level is the die's average (half + 1) or a roll, plus
// your Constitution modifier, at least 1.

import { ABILITIES, ABILITY_NAMES, type Ability, type SkillId } from './data';
import { blankFeature, uid, type Character, type ClassEntry, type Feature, type FeatureOrigin, type LevelStep, type UsesFormula } from './model';
import { abilityMod, maxHp, pactSlots, spellSlots, totalLevel } from './rules';
import { stepAt, type Catalog, type ClassDef, type ClassFeatureDef, type FeatDef, type SubclassDef } from './srd';
import type { Element as FxElement, Shape } from '../../fx/types';

/** Shown elsewhere on the sheet (spellcasting) or realized through choices (ASI, boons). */
const HIDDEN = new Set(['ability-score-improvement', 'epic-boon', 'spellcasting', 'pact-magic']);
export const ABILITY_CAP = 20;
export const BOON_CAP = 30;
export const MULTICLASS_SCORE = 13;

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

export const averageRoll = (die: number) => die / 2 + 1;

export function classDef(cat: Catalog, classId: string): ClassDef | undefined {
  return cat.classes.find((c) => c.id === classId);
}

/** The entry's subclass in the rules: by its id, or by name for one typed in by hand. */
export function subclassDef(cat: Catalog, entry: ClassEntry): SubclassDef | undefined {
  if (entry.subclassId) {
    const byId = cat.subclasses.find((s) => s.id === entry.subclassId);
    if (byId) return byId;
  }
  if (!entry.subclass.trim()) return undefined;
  return cat.subclasses.find((s) => s.classId === entry.classId && norm(s.name) === norm(entry.subclass));
}

// ── Multiclassing ────────────────────────────────────────────────────────────

export interface Requirement {
  className: string;
  /** "Strength 13" or "Strength or Dexterity 13". */
  needs: string;
  met: boolean;
}

function requirement(c: Character, cls: ClassDef): Requirement {
  const all = cls.multiclass.all ?? [];
  const any = cls.multiclass.any ?? [];
  const has = (a: Ability) => c.abilities[a] >= MULTICLASS_SCORE;
  const met = (all.length === 0 || all.every(has)) && (any.length === 0 || any.some(has));
  const needs = [all.map((a) => ABILITY_NAMES[a]).join(' and '), any.map((a) => ABILITY_NAMES[a]).join(' or ')].filter(Boolean).join('; ');
  return { className: cls.name, needs: `${needs} ${MULTICLASS_SCORE}`, met };
}

/** Taking a new class needs the prerequisites of that class and of every class you have. */
export function multiclassCheck(c: Character, cat: Catalog, classId: string): { ok: boolean; requirements: Requirement[] } {
  const ids = [...new Set([classId, ...c.classes.map((k) => k.classId)])];
  const requirements = ids.flatMap((id) => {
    const cls = classDef(cat, id);
    return cls ? [requirement(c, cls)] : [];
  });
  return { ok: requirements.every((r) => r.met), requirements };
}

const ARMOR_NAMES: Record<string, string> = { light: 'Light armor', medium: 'Medium armor', heavy: 'Heavy armor', shield: 'Shields' };
const WEAPON_NAMES: Record<string, string> = { simple: 'Simple weapons', martial: 'Martial weapons' };

/** The training a class grants when you multiclass into it, as a line for your proficiencies. */
export function multiclassTraining(cls: ClassDef): string {
  const parts = [...cls.multiclassArmor.map((a) => ARMOR_NAMES[a] ?? a), ...cls.multiclassWeapons.map((w) => WEAPON_NAMES[w] ?? w)];
  return parts.length ? `${cls.name} (multiclass): ${parts.join(', ')}` : '';
}

/** Bards, Rangers and Rogues teach one skill to a character who multiclasses into them. */
const MULTICLASS_SKILL = new Set(['bard', 'ranger', 'rogue']);

// ── Turning rules features into sheet features ───────────────────────────────

function elementOf(def: ClassFeatureDef): { element: FxElement; shape: Shape } {
  if (def.rollKind === 'healing') return { element: 'healing', shape: 'aura' };
  if (def.damageType) return { element: def.damageType as FxElement, shape: 'touch' };
  return { element: 'arcane', shape: 'aura' };
}

const fmt = (v: number | string | undefined) => (v === undefined ? '—' : typeof v === 'number' && v > 0 && v < 1 ? (v === 0.25 ? '1/4' : v === 0.5 ? '1/2' : String(v)) : String(v));

/** "At level 6: Rage Damage 2 · Weapons 3", for the feature's description. */
export function statsLine(def: ClassFeatureDef, level: number): string {
  if (!def.stats?.length) return '';
  return `At level ${level}: ${def.stats.map((s) => `${s.label} ${fmt(stepAt(s.steps, level))}`).join(' · ')}`;
}

function sheetFeature(def: ClassFeatureDef, origin: FeatureOrigin, source: string, classLevel: number): Omit<Feature, 'id' | 'usesSpent'> {
  const uses: UsesFormula | null = typeof def.uses === 'string' ? (def.uses as UsesFormula) : (stepAt(def.uses, classLevel) ?? null);
  const stats = statsLine(def, classLevel);
  return {
    name: def.name,
    source,
    description: [stats, def.text].filter(Boolean).join('\n\n'),
    usesMax: uses,
    recharge: uses === null ? 'none' : (def.recharge ?? 'long'),
    roll: stepAt(def.roll, classLevel) ?? '',
    rollKind: def.rollKind === 'healing' ? 'healing' : def.rollKind === 'damage' ? 'damage' : 'other',
    castingTime: def.castingTime,
    ...elementOf(def),
    origin,
  };
}

/**
 * Brings class and subclass features in line with the rules for every class's level: adds
 * what's new, updates uses, dice and descriptions, and removes what no longer applies. A
 * feature you typed in yourself with the same name is adopted rather than duplicated.
 */
export function syncFeatures(d: Character, cat: Catalog) {
  const keep = new Set<string>();
  for (const entry of d.classes) {
    const cls = classDef(cat, entry.classId);
    if (!cls) continue;
    const sub = subclassDef(cat, entry);
    const defs: { def: ClassFeatureDef; kind: 'class' | 'subclass'; source: string }[] = [
      ...cls.features.map((def) => ({ def, kind: 'class' as const, source: `${cls.name} ${def.level}` })),
      ...(sub?.features ?? []).map((def) => ({ def, kind: 'subclass' as const, source: `${sub!.name} ${def.level}` })),
    ].filter(({ def }) => def.level <= entry.level && !HIDDEN.has(def.key));
    for (const { def, kind, source } of defs) {
      let f = d.features.find((x) => x.origin?.ref === def.id && x.origin.entryId === entry.id);
      if (!f) {
        f = d.features.find((x) => !x.origin && norm(x.name) === norm(def.name));
        if (f) f.origin = { kind, entryId: entry.id, ref: def.id, level: def.level, auto: false };
      }
      if (!f) {
        f = blankFeature(sheetFeature(def, { kind, entryId: entry.id, ref: def.id, level: def.level, auto: true }, source, entry.level));
        d.features.push(f);
      } else if (f.origin?.auto) {
        const next = sheetFeature(def, f.origin, source, entry.level);
        Object.assign(f, next, { usesSpent: f.usesSpent });
      }
      keep.add(f.id);
    }
  }
  d.features = d.features.filter((f) => !f.origin || f.origin.kind === 'feat' || !f.origin.auto || keep.has(f.id));
}

// ── Planning a level ─────────────────────────────────────────────────────────

export interface LevelUpPlan {
  classId: string;
  className: string;
  /** null when this level starts a new class. */
  entryId: string | null;
  newClass: boolean;
  classLevel: number;
  totalLevel: number;
  hitDie: number;
  conMod: number;
  /** HP gained taking the average. */
  average: number;
  features: ClassFeatureDef[];
  /** Subclasses to pick from, when this is the subclass level and none is chosen yet. */
  subclassOptions: SubclassDef[] | null;
  asi: boolean;
  epicBoon: boolean;
  /** Feats this level's features ask for (Fighting Style), with the feats that fit. */
  featPicks: { feature: ClassFeatureDef; options: FeatDef[] }[];
  multiclass: { ok: boolean; requirements: Requirement[] } | null;
  training: string;
  skillPick: { count: number; from: SkillId[] } | null;
  spells: {
    slots: [number[], number[]];
    pact: [{ count: number; level: number }, { count: number; level: number }];
    cantrips: [number, number] | null;
    prepared: [number, number] | null;
  };
}

export function planLevelUp(c: Character, cat: Catalog, classId: string): LevelUpPlan | null {
  const cls = classDef(cat, classId);
  if (!cls) return null;
  const entry = c.classes.find((k) => k.classId === classId) ?? null;
  const classLevel = (entry?.level ?? 0) + 1;
  if (classLevel > 20 || totalLevel(c) >= 20) return null;
  const sub = entry ? subclassDef(cat, entry) : undefined;
  const features = [...cls.features, ...(sub?.features ?? [])].filter((f) => f.level === classLevel && !HIDDEN.has(f.key));
  const conMod = abilityMod(c.abilities.con);
  const needsSubclass = classLevel >= cls.subclassLevel && !(entry && (entry.subclass.trim() || entry.subclassId));
  const subclassOptions = needsSubclass ? cat.subclasses.filter((s) => s.classId === classId) : null;
  const newTotal = totalLevel(c) + 1;
  const held = new Set(c.features.filter((f) => f.origin?.kind === 'feat').map((f) => f.origin!.ref));
  const featPicks = features
    .filter((f) => f.featCategory && f.featCategory !== 'epic-boon')
    .map((feature) => ({ feature, options: cat.feats.filter((ft) => (feature.featCategory === 'any' || ft.category === feature.featCategory) && (ft.repeatable || !held.has(ft.id))) }));

  // Spell slots and spell counts before and after, worked out on a copy.
  const after = structuredClone(c);
  if (entry) after.classes.find((k) => k.id === entry.id)!.level = classLevel;
  else after.classes.push({ id: 'preview', classId, subclass: '', level: 1, hitDiceUsed: 0 });
  const count = (steps: ClassDef['cantrips'], level: number) => (level > 0 ? (stepAt(steps, level) ?? 0) : 0);
  return {
    classId,
    className: cls.name,
    entryId: entry?.id ?? null,
    newClass: !entry,
    classLevel,
    totalLevel: newTotal,
    hitDie: cls.hitDie,
    conMod,
    average: Math.max(1, averageRoll(cls.hitDie) + conMod),
    features,
    subclassOptions,
    asi: cls.asiLevels.includes(classLevel),
    epicBoon: cls.epicBoonLevel === classLevel,
    featPicks,
    multiclass: entry ? null : multiclassCheck(c, cat, classId),
    training: entry ? '' : multiclassTraining(cls),
    skillPick: !entry && MULTICLASS_SKILL.has(classId) && cls.skills ? { count: 1, from: cls.skills.from as SkillId[] } : null,
    spells: {
      slots: [spellSlots(c), spellSlots(after)],
      pact: [pactSlots(c), pactSlots(after)],
      cantrips: cls.cantrips ? [count(cls.cantrips, classLevel - 1), count(cls.cantrips, classLevel)] : null,
      prepared: cls.prepared ? [count(cls.prepared, classLevel - 1), count(cls.prepared, classLevel)] : null,
    },
  };
}

export interface LevelUpChoices {
  /** The hit-die roll for this level, or null for the average. */
  hpRoll: number | null;
  subclass?: { id?: string; name: string };
  /** Ability Score Improvement: +2 to one score, or +1 to two. */
  asi?: Partial<Record<Ability, number>>;
  /** Feats taken (instead of the ASI, for a Fighting Style, or as an Epic Boon), with the ability they raise. */
  feats?: { feat: FeatDef; ability?: Ability; boon?: boolean }[];
  /** A homebrew or unlisted feat, by name. */
  customFeat?: string;
  skills?: SkillId[];
}

/** HP this level adds: the roll (or the average) plus Constitution, at least 1. */
export function hpGain(plan: LevelUpPlan, roll: number | null): number {
  return Math.max(1, (roll ?? averageRoll(plan.hitDie)) + plan.conMod);
}

/** Applies a planned level to a draft character (inside an update). */
export function applyLevelUp(d: Character, cat: Catalog, plan: LevelUpPlan, choices: LevelUpChoices) {
  const maxBefore = maxHp(d).total;
  const step: LevelStep = { entryId: '', classId: plan.classId, classLevel: plan.classLevel, newClass: plan.newClass, hpRoll: choices.hpRoll, hpBefore: d.hp.current, at: Date.now() };
  let entry: ClassEntry;
  if (plan.newClass) {
    entry = { id: uid(), classId: plan.classId, subclass: '', level: 1, hitDiceUsed: 0, hpRolls: [choices.hpRoll] };
    d.classes.push(entry);
  } else {
    entry = d.classes.find((k) => k.id === plan.entryId)!;
    entry.level = plan.classLevel;
    const rolls = entry.hpRolls ?? [];
    while (rolls.length < plan.classLevel - 1) rolls.push(null);
    rolls[plan.classLevel - 1] = choices.hpRoll;
    entry.hpRolls = rolls;
  }
  step.entryId = entry.id;

  if (choices.subclass) {
    step.subclass = { ...choices.subclass, previous: { id: entry.subclassId, name: entry.subclass } };
    entry.subclassId = choices.subclass.id;
    entry.subclass = choices.subclass.name;
  }

  const raised: Partial<Record<Ability, number>> = {};
  const raise = (a: Ability, by: number, cap: number) => {
    const to = Math.min(cap, d.abilities[a] + by);
    const gained = to - d.abilities[a];
    if (gained <= 0) return;
    d.abilities[a] = to;
    raised[a] = (raised[a] ?? 0) + gained;
  };
  for (const a of ABILITIES) if (choices.asi?.[a]) raise(a, choices.asi[a]!, ABILITY_CAP);

  const featIds: string[] = [];
  const addFeat = (name: string, text: string, ref: string) => {
    const f = blankFeature({ name, source: `Feat (${d.classes.length > 1 ? `${plan.className} ` : 'level '}${plan.classLevel})`, description: text, origin: { kind: 'feat', ref, level: plan.classLevel, entryId: entry.id, auto: true } });
    d.features.push(f);
    featIds.push(f.id);
  };
  for (const { feat, ability, boon } of choices.feats ?? []) {
    addFeat(feat.name, feat.text, `feats.${feat.id}`);
    if (ability) raise(ability, 1, boon ? BOON_CAP : ABILITY_CAP);
  }
  if (choices.customFeat?.trim()) addFeat(choices.customFeat.trim(), 'A feat you added by name. Write what it does here.', `custom:${norm(choices.customFeat)}`);
  if (Object.keys(raised).length) step.asi = raised;
  if (featIds.length) step.featFeatureIds = featIds;

  const learned = (choices.skills ?? []).filter((s) => d.skills[s] === 0);
  learned.forEach((s) => (d.skills[s] = 1));
  if (learned.length) step.skills = learned;

  if (plan.newClass && plan.training) {
    d.proficiencies = d.proficiencies.trim() ? `${d.proficiencies.trim()}\n${plan.training}` : plan.training;
    step.proficiencyNote = plan.training;
  }

  // A hand-set HP maximum moves up by the same amount the level adds.
  if (d.hp.maxOverride !== null && d.hp.maxOverride > 0) {
    step.maxOverrideBefore = d.hp.maxOverride;
    d.hp.maxOverride += hpGain(plan, choices.hpRoll) + d.bonus.hpPerLevel;
  }

  syncFeatures(d, cat);
  const maxAfter = maxHp(d).total;
  d.hp.current = Math.min(maxAfter, d.hp.current + Math.max(0, maxAfter - maxBefore));
  d.progression.push(step);
}

/**
 * Undoes the most recent level. Levels gained through Level up are reversed exactly (HP
 * roll, subclass, ability scores, feats, skills, training); a level set by hand is simply
 * taken off the last class. Returns a short account, or null if there's nothing to undo.
 */
export function levelDown(d: Character, cat: Catalog): string | null {
  const step = d.progression.pop();
  if (step) {
    const idx = d.classes.findIndex((k) => k.id === step.entryId);
    const entry = d.classes[idx];
    if (entry) {
      if (step.newClass && entry.level <= 1) d.classes.splice(idx, 1);
      else {
        entry.level = Math.max(1, step.classLevel - 1);
        entry.hpRolls = entry.hpRolls?.slice(0, entry.level);
        entry.hitDiceUsed = Math.min(entry.hitDiceUsed, entry.level);
      }
      if (step.subclass) {
        entry.subclassId = step.subclass.previous.id;
        entry.subclass = step.subclass.previous.name;
      }
    }
    for (const a of ABILITIES) if (step.asi?.[a]) d.abilities[a] -= step.asi[a]!;
    if (step.featFeatureIds) d.features = d.features.filter((f) => !step.featFeatureIds!.includes(f.id));
    step.skills?.forEach((s) => (d.skills[s] = 0));
    if (step.proficiencyNote) d.proficiencies = d.proficiencies.split('\n').filter((l) => l !== step.proficiencyNote).join('\n');
    if (step.maxOverrideBefore !== undefined) d.hp.maxOverride = step.maxOverrideBefore;
    syncFeatures(d, cat);
    d.hp.current = Math.min(d.hp.current, maxHp(d).total);
    const cls = classDef(cat, step.classId);
    return `${cls?.name ?? step.classId} ${step.classLevel} undone`;
  }
  // No record: take a level off the last class that has more than one.
  const entry = [...d.classes].reverse().find((k) => k.level > 1) ?? (d.classes.length > 1 ? d.classes[d.classes.length - 1] : undefined);
  if (!entry) return null;
  if (entry.level <= 1) d.classes.splice(d.classes.indexOf(entry), 1);
  else {
    entry.level -= 1;
    entry.hpRolls = entry.hpRolls?.slice(0, entry.level);
    entry.hitDiceUsed = Math.min(entry.hitDiceUsed, entry.level);
  }
  syncFeatures(d, cat);
  d.hp.current = Math.min(d.hp.current, maxHp(d).total);
  return `${classDef(cat, entry.classId)?.name ?? entry.classId} level removed`;
}

/** Cantrips and prepared spells each of your classes allows at its level. */
export function spellCounts(c: Character, cat: Catalog): { className: string; cantrips: number | null; prepared: number | null }[] {
  return c.classes.flatMap((k) => {
    const cls = classDef(cat, k.classId);
    if (!cls || (!cls.cantrips && !cls.prepared)) return [];
    return [{ className: cls.name, cantrips: cls.cantrips ? (stepAt(cls.cantrips, k.level) ?? 0) : null, prepared: cls.prepared ? (stepAt(cls.prepared, k.level) ?? 0) : null }];
  });
}
