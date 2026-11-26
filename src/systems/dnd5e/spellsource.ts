// Where a character's spells come from: a class (a Ranger's spells, a Warlock's), a feat
// (Shadow-Touched, Magic Initiate), or something else. A class's spells are cast with that
// class's ability; a feat's with the ability chosen for it.

import { classById } from './data';
import type { Character, Spell } from './model';
import { casterType, usesMax } from './rules';
import { freeCastName } from './featimport';
import { spellForClass } from './spellimport';
import type { SpellDef } from './srd';

export interface SpellSource {
  /** What a spell's grantedBy holds: a class id, "feat:Name", or "" for not set. */
  id: string;
  name: string;
}

/** A source's name: the class's, the feat's, or "Not set". */
export function sourceName(c: Character, grantedBy: string): string {
  if (!grantedBy) return 'Not set';
  if (grantedBy.startsWith('feat:')) return grantedBy.slice(5);
  return c.classes.some((k) => k.classId === grantedBy) ? classById(grantedBy).name : grantedBy;
}

/** Your spellcasting classes, in sheet order (a class whose subclass casts counts). */
export function casterClasses(c: Character): SpellSource[] {
  const out: SpellSource[] = [];
  for (const k of c.classes) if (casterType(k) !== 'none' && !out.some((x) => x.id === k.classId)) out.push({ id: k.classId, name: classById(k.classId).name });
  return out;
}

/**
 * Where a spell can come from on this sheet: your spellcasting classes, then the feats that
 * give spells (already on a spell, or taken as features), in that order.
 */
export function sourceOptions(c: Character): SpellSource[] {
  const out = casterClasses(c);
  const feats = new Set<string>();
  for (const s of c.spells) if (s.grantedBy.startsWith('feat:')) feats.add(s.grantedBy.slice(5));
  for (const f of c.features) if (f.origin?.kind === 'feat' || /^feat\b/i.test(f.source)) feats.add(f.name);
  // A name nothing on your sheet has (typed in by hand, maybe by mistake) shows in quotes:
  // “W”, and “Not set” typed in isn't taken for Not set.
  for (const name of feats) out.push({ id: `feat:${name}`, name: onSheet(c, name) ? name : `“${name}”` });
  return out;
}

/**
 * Whether a feature (a feat, a class or species feature) on your sheet goes by this name:
 * "Druidic Warrior" is "Fighting Style: Druidic Warrior", "Magic Initiate (Wizard)" is "Magic Initiate".
 */
export function onSheet(c: Pick<Character, 'features'>, name: string): boolean {
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = key(name);
  if (want.length < 3) return false;
  return c.features.some((f) => {
    const have = key(f.name);
    return have === want || (have.length >= 4 && want.includes(have)) || (want.length >= 4 && have.includes(want));
  });
}

/**
 * Sources set on your spells that aren't one of your spellcasting classes: feats, and anything
 * typed in by hand (a stray "W"), with how many spells each has, and whether it's a feat on your
 * sheet. These are the ones you can tidy away.
 */
export function customSources(c: Character): { id: string; name: string; count: number; feature: boolean }[] {
  const classes = casterClasses(c).map((k) => k.id);
  const ids = [...new Set(c.spells.map((s) => s.grantedBy).filter((g) => g && !classes.includes(g)))];
  const out = ids.map((id) => {
    const name = sourceName(c, id);
    return {
      id,
      name,
      count: c.spells.filter((s) => s.grantedBy === id).length,
      feature: onSheet(c, name),
    };
  });
  // Typed in (nothing on your sheet has the name) first: the likely mistakes.
  return [...out.filter((x) => !x.feature), ...out.filter((x) => x.feature)];
}

/** Moves every spell from one source to another ("" for Not set, "feat:Name" for a feat). Returns how many moved. */
export function moveSource(d: Character, from: string, to: string): number {
  let n = 0;
  for (const s of d.spells)
    if (s.grantedBy === from && from !== to) {
      s.grantedBy = to;
      n++;
    }
  return n;
}

/** A source typed by hand, as a spell holds it: "Shadow-Touched" → "feat:Shadow-Touched"; blank → Not set. */
export const typedSource = (name: string): string => (name.trim() ? `feat:${name.trim()}` : '');

/**
 * For spells that don't say where they come from: the one class of yours whose spell list
 * has the spell, when exactly one does (Hunter's Mark → Ranger, Hex → Warlock). Spells on
 * several of your lists, or none, are left for you to set.
 */
export function inferSources(c: Character, defs: SpellDef[]): Record<string, string> {
  const casters = casterClasses(c).map((k) => k.id);
  const out: Record<string, string> = {};
  if (!casters.length) return out;
  for (const s of c.spells) {
    if (s.grantedBy) continue;
    const def = defs.find((d) => d.name.toLowerCase() === (s.basedOn || s.name).toLowerCase());
    if (!def?.classes?.length) continue;
    const hits = casters.filter((id) => spellForClass(def, id));
    if (hits.length === 1) out[s.id] = hits[0];
  }
  return out;
}

/**
 * The ways you can cast a spell without a slot: a feat's free cast ("Invisibility: free cast")
 * and class features that grant it (a Ranger's Favored Enemy: "cast Hunter's Mark … without
 * expending a spell slot"), each with its uses left.
 */
export function freeCastSources(c: Character, spell: Pick<Spell, 'name'>): { idx: number; name: string; left: number; max: number }[] {
  const plain = (t: string) => t.replace(/[*_]/g, '').replace(/[‘’]/g, "'").toLowerCase();
  const name = plain(spell.name);
  return c.features.flatMap((f, idx) => {
    const named = f.name === freeCastName(spell.name);
    const text = plain(f.description);
    const grants = !named && f.usesMax !== null && text.includes(name) && /without (?:expending )?a spell slot/.test(text);
    if (!named && !grants) return [];
    const max = usesMax(c, f) ?? 1;
    return [{ idx, name: named ? f.source || f.name : f.name, left: Math.max(0, max - Math.min(max, f.usesSpent)), max }];
  });
}
