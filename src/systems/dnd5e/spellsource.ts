// Where a character's spells come from: a class (a Ranger's spells, a Warlock's), a feat
// (Shadow-Touched, Magic Initiate), or something else. A class's spells are cast with that
// class's ability; a feat's with the ability chosen for it.

import { classById } from './data';
import type { Character } from './model';
import { casterType } from './rules';
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
  for (const name of feats) out.push({ id: `feat:${name}`, name });
  return out;
}

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
