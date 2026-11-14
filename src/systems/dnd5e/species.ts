// Species on the sheet: the SRD's nine (with their lineages: Drow, Red Dragon, Fire Giant,
// Infernal…) and Aasimar, taken as they are or mixed.
//
// Mixed heritage, by the 2024 rules: a character with parents of two species uses one
// species' game traits, and can look like either or both. This app also offers a blend, picking
// traits from both, as a homebrew option for a table that wants it: it's labelled as such, and
// it says how it compares with one species' traits, so the DM can decide.
//
// Taking a species puts its traits on the sheet as features (with uses, rolls and free casts),
// its spells (a lineage's cantrip, and its level 3 and 5 spells when you get there), its Speed,
// size and extra Hit Points; taking another first clears what the last one gave.

import { blankFeature, uid, type Character, type Feature, type SpeciesPick } from './model';
import type { Ability } from './data';
import { freeCastName } from './featimport';
import { spellFromDef } from './spells';
import { stepAt, type Catalog, type LineageDef, type SpeciesDef, type SpeciesTraitDef } from './srd';
import { totalLevel } from './rules';

/** The traits that carry a species' lineage (its spells, Speed, Darkvision, damage type). */
const LINEAGE_TRAITS = ['elven-lineage', 'gnomish-lineage', 'fiendish-legacy', 'giant-ancestry', 'draconic-ancestry'];
/** Traits that only describe the lineage's damage type and use it. */
const TYPED_TRAITS = ['breath-weapon', 'damage-resistance'];

export const findSpecies = (cat: Pick<Catalog, 'species'>, id: string): SpeciesDef | undefined => cat.species?.find((s) => s.id === id);
export const findLineage = (sp: SpeciesDef | undefined, id: string): LineageDef | undefined => sp?.lineages.find((l) => l.id === id);

/** A side's name: "Aasimar", "Drow", "High Elf", "Red Dragonborn", "Fire Goliath", "Infernal Tiefling". */
export function partName(sp: SpeciesDef | undefined, lin: LineageDef | undefined): string {
  if (!sp) return '';
  if (!lin) return sp.name;
  if (lin.name.toLowerCase().includes(sp.name.toLowerCase()) || lin.name === 'Drow') return lin.name;
  const m = /^(\w+) (?:Dragon|Giant)$/.exec(lin.name);
  return m ? `${m[1]} ${sp.name}` : `${lin.name} ${sp.name}`;
}

/** The old names for some mixes: an Elf and a Human make a Half-Elf, an Orc and a Human a Half-Orc. */
const CLASSIC: Record<string, string> = { 'elf+human': 'Half-Elf', 'human+orc': 'Half-Orc' };

/** The species as the sheet names it: "Drow", or for mixed heritage "Aasimar–Drow" (or your own name for it). */
export function heritageName(cat: Pick<Catalog, 'species'>, pick: SpeciesPick): string {
  if (pick.name.trim()) return pick.name.trim();
  const a = findSpecies(cat, pick.a.species);
  const one = partName(a, findLineage(a, pick.a.lineage));
  if (!pick.b) return one;
  const b = findSpecies(cat, pick.b.species);
  const classic = CLASSIC[[pick.a.species, pick.b.species].sort().join('+')];
  return classic ?? `${one}–${partName(b, findLineage(b, pick.b.lineage))}`;
}

export interface PickedTrait {
  /** "a:luck", "b:fey-ancestry". */
  key: string;
  side: 'a' | 'b';
  trait: SpeciesTraitDef;
  species: SpeciesDef;
  lineage: LineageDef | undefined;
}

/** Every trait each side offers. */
export function sideTraits(cat: Pick<Catalog, 'species'>, pick: Pick<SpeciesPick, 'a' | 'b'>): PickedTrait[] {
  const out: PickedTrait[] = [];
  for (const side of ['a', 'b'] as const) {
    const part = pick[side];
    const sp = part ? findSpecies(cat, part.species) : undefined;
    if (!part || !sp) continue;
    const lin = findLineage(sp, part.lineage);
    for (const trait of sp.traits) out.push({ key: `${side}:${trait.key}`, side, trait, species: sp, lineage: lin });
  }
  return out;
}

/** The traits a pick gives: one side's (a single species, or the book's rule), or a blend's chosen ones. */
export function pickedTraits(cat: Pick<Catalog, 'species'>, pick: SpeciesPick): PickedTrait[] {
  const all = sideTraits(cat, pick);
  if (!pick.b || pick.rules === 'a') return all.filter((t) => t.side === 'a');
  if (pick.rules === 'b') return all.filter((t) => t.side === 'b');
  return all.filter((t) => pick.traits.includes(t.key));
}

/** How a blend compares with taking one species' traits: as many traits, or more. */
export function blendBalance(cat: Pick<Catalog, 'species'>, pick: SpeciesPick): { taken: number; usual: number; over: boolean } {
  const all = sideTraits(cat, pick);
  const usual = Math.max(all.filter((t) => t.side === 'a').length, all.filter((t) => t.side === 'b').length);
  const taken = pickedTraits(cat, pick).length;
  return { taken, usual, over: taken > usual };
}

/** The side whose body it is: size and Speed come from it (a blend: the first). */
const bodyOf = (pick: SpeciesPick) => (pick.b && pick.rules === 'b' ? pick.b : pick.a);

/** What a pick comes to: name, size, Speed, Darkvision, extra Hit Points, traits. */
export function heritageStats(cat: Pick<Catalog, 'species'>, pick: SpeciesPick) {
  const body = bodyOf(pick);
  const sp = findSpecies(cat, body.species);
  const traits = pickedTraits(cat, pick);
  // A lineage counts when the trait that carries it was taken (in a blend, maybe from the other side).
  const lineages = traits.filter((t) => LINEAGE_TRAITS.includes(t.trait.key) && t.lineage).map((t) => t.lineage!);
  const darkvision = Math.max(0, ...traits.filter((t) => /^darkvision/.test(t.trait.key)).map((t) => t.species.darkvision), ...lineages.map((l) => (traits.some((t) => /^darkvision/.test(t.trait.key)) ? l.darkvision : 0)));
  const size = sp?.size === 'Medium or Small' ? (pick.size === 'Small' ? 'Small' : 'Medium') : (sp?.size ?? 'Medium');
  return {
    name: heritageName(cat, pick),
    size,
    speed: (sp?.speed ?? 30) + lineages.reduce((a, l) => a + l.speed, 0),
    darkvision,
    hpPerLevel: traits.some((t) => t.trait.key === 'dwarven-toughness') ? 1 : 0,
    traits,
    lineages,
  };
}

/** The sheet feature for a trait: its text (with its lineage's), uses, roll and damage type. */
function traitFeature(t: PickedTrait, level: number, darkvision: number, sideName: string): Feature {
  const lin = t.lineage;
  const typed = TYPED_TRAITS.includes(t.trait.key) && lin?.damageType;
  const type = typed ? lin!.damageType : '';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  let text = t.trait.text;
  if (LINEAGE_TRAITS.includes(t.trait.key) && lin) text += `\n\n***${lin.name}.*** ${lin.text}`;
  if (/^darkvision/.test(t.trait.key) && darkvision) text = `You have Darkvision with a range of ${darkvision} feet.`;
  if (type && t.trait.key === 'damage-resistance') text = `You have Resistance to ${cap(type)} damage (${lin!.name}).\n\n${text}`;
  return blankFeature({
    name: type ? `${t.trait.name} (${cap(type)})` : /^darkvision/.test(t.trait.key) ? 'Darkvision' : t.trait.name,
    source: sideName,
    description: text,
    usesMax: t.trait.uses ?? null,
    recharge: t.trait.uses === undefined ? 'none' : (t.trait.recharge ?? 'long'),
    roll: stepAt(t.trait.roll, level) ?? '',
    rollKind: t.trait.rollKind ?? 'other',
    castingTime: t.trait.castingTime,
    element: (type || (t.trait.rollKind === 'healing' ? 'healing' : 'arcane')) as Feature['element'],
    shape: t.trait.key === 'breath-weapon' ? 'cone' : t.trait.rollKind === 'healing' ? 'touch' : 'aura',
    origin: { kind: 'species', ref: t.key, level: t.trait.level ?? 1, auto: true },
  });
}

/** The spells a pick gives at a level: lineage spells (with free casts) and a trait's own (Thaumaturgy, Light). */
export function heritageSpells(cat: Pick<Catalog, 'species'>, pick: SpeciesPick, level: number): { name: string; free: boolean; uses: number | 'pb'; ability: Ability }[] {
  const out: { name: string; free: boolean; uses: number | 'pb'; ability: Ability }[] = [];
  const { traits, lineages } = heritageStats(cat, pick);
  for (const l of lineages)
    for (const s of l.spells)
      if (s.level <= level && !out.some((x) => x.name === s.name))
        // A Forest Gnome casts Speak with Animals free as many times as their Proficiency Bonus.
        out.push({ name: s.name, free: s.free, uses: s.free && s.level === 1 ? 'pb' : 1, ability: pick.ability });
  for (const t of traits)
    for (const name of t.trait.spells)
      if (!out.some((x) => x.name === name)) out.push({ name, free: false, uses: 1, ability: t.trait.key === 'light-bearer' ? 'cha' : pick.ability });
  return out;
}

const sourceOf = (name: string) => `feat:${name}`;

/** Takes a species (or mixed heritage) onto the sheet, clearing what the last one gave. */
export function applyHeritage(d: Character, cat: Pick<Catalog, 'species' | 'spells'>, pick: SpeciesPick) {
  clearHeritage(d);
  const stats = heritageStats(cat, pick);
  const level = Math.max(1, totalLevel(d));
  const seen = new Set<string>();
  for (const t of stats.traits) {
    const sideName = partName(t.species, t.lineage);
    const f = traitFeature(t, level, stats.darkvision, pick.b ? sideName : stats.name);
    // Both sides' Darkvision is one Darkvision (the longer range).
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    d.features.push(f);
  }
  addHeritageSpells(d, cat, pick, level, stats.name);
  d.species = stats.name;
  d.size = stats.size;
  d.speed = stats.speed;
  d.bonus.hpPerLevel += stats.hpPerLevel;
  d.speciesPick = { ...pick, applied: { hpPerLevel: stats.hpPerLevel, name: stats.name } };
}

function addHeritageSpells(d: Character, cat: Pick<Catalog, 'species' | 'spells'>, pick: SpeciesPick, level: number, name: string) {
  for (const s of heritageSpells(cat, pick, level)) {
    const def = cat.spells.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
    if (def && !d.spells.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) d.spells.push({ ...spellFromDef(def, uid(), sourceOf(name)), abilityOverride: s.ability, prepared: true });
    if (s.free && !d.features.some((f) => f.name === freeCastName(s.name)))
      d.features.push(
        blankFeature({
          name: freeCastName(s.name),
          source: name,
          description: `You can cast ${s.name} without a spell slot ${s.uses === 'pb' ? 'a number of times equal to your Proficiency Bonus' : 'once'}, and regain ${s.uses === 'pb' ? 'all uses' : 'the use'} when you finish a Long Rest.`,
          usesMax: s.uses,
          recharge: 'long',
          origin: { kind: 'species', ref: `spell:${s.name}`, level: 1, auto: true },
        }),
      );
  }
}

/** Clears what a species gave: its traits, its spells and free casts, its extra Hit Points. */
export function clearHeritage(d: Character) {
  const prev = d.speciesPick;
  const oldName = (prev?.applied?.name ?? d.species).trim().toLowerCase();
  // Traits put on by this app, and (on a sheet from before species) the ones named for the species.
  d.features = d.features.filter((f) => f.origin?.kind !== 'species' && !(oldName && !prev && f.source.trim().toLowerCase() === oldName));
  if (oldName) d.spells = d.spells.filter((s) => s.grantedBy.toLowerCase() !== sourceOf(oldName).toLowerCase());
  if (prev?.applied) d.bonus.hpPerLevel -= prev.applied.hpPerLevel;
  d.speciesPick = null;
}

/** After a level change: the lineage spells and free casts you've reached, and Breath Weapon's dice. */
export function syncHeritage(d: Character, cat: Pick<Catalog, 'species' | 'spells'>) {
  const pick = d.speciesPick;
  if (!pick || !cat.species?.length) return;
  const level = Math.max(1, totalLevel(d));
  addHeritageSpells(d, cat, pick, level, pick.applied?.name ?? heritageName(cat, pick));
  for (const t of heritageStats(cat, pick).traits) {
    if (!t.trait.roll) continue;
    const f = d.features.find((x) => x.origin?.kind === 'species' && x.origin.ref === t.key);
    if (f) f.roll = stepAt(t.trait.roll, level) ?? f.roll;
  }
}

/** A pick for one species, with sensible choices filled in. */
export function singlePick(species: string, lineage = '', ability: Ability = 'wis', size = 'Medium'): SpeciesPick {
  return { a: { species, lineage }, b: null, rules: 'a', traits: [], ability, size, name: '' };
}
