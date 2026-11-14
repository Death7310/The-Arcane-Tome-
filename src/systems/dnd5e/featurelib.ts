// The Feature library: every class and subclass feature the rules hold (the SRD's twelve classes
// and their subclasses, the Drakewarden, and any pack in your rules library), to read and to put
// on any character's sheet: a Barbarian's Rage, a Rogue's Sneak Attack, a Fighter's Second Wind.

import { blankFeature, type Character, type Feature } from './model';
import { featureFromRules } from './leveling';
import type { Catalog, ClassFeatureDef } from './srd';

export interface LibraryFeature {
  key: string;
  def: ClassFeatureDef;
  classId: string;
  className: string;
  /** The subclass's name, for a subclass feature. */
  subclass: string;
  /** "Barbarian 1", "Drakewarden 3": where it comes from, as the sheet writes it. */
  source: string;
}

/** Every feature in the rules: each class's in level order, then its subclasses'. */
export function libraryFeatures(cat: Catalog): LibraryFeature[] {
  const out: LibraryFeature[] = [];
  for (const cls of cat.classes) {
    for (const def of [...cls.features].sort((a, b) => a.level - b.level)) out.push({ key: `${cls.id}:${def.id || def.key}`, def, classId: cls.id, className: cls.name, subclass: '', source: `${cls.name} ${def.level}` });
    for (const sub of cat.subclasses.filter((s) => s.classId === cls.id))
      for (const def of [...sub.features].sort((a, b) => a.level - b.level))
        out.push({ key: `${sub.id}:${def.id || def.key}`, def, classId: cls.id, className: cls.name, subclass: sub.name, source: `${sub.name} ${def.level}` });
  }
  return out;
}

/** Matches a search: the feature's name, its class or subclass, or its text. */
export function matches(e: LibraryFeature, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [e.def.name, e.className, e.subclass].some((t) => t.toLowerCase().includes(q)) || e.def.text.toLowerCase().includes(q);
}

/**
 * The level its uses and dice are read at: yours in that class (at least the level the feature
 * arrives at), or the level it arrives at for a class you don't have.
 */
export function levelFor(c: Pick<Character, 'classes'>, e: LibraryFeature): number {
  const mine = c.classes.filter((k) => k.classId === e.classId).reduce((a, k) => a + k.level, 0);
  return Math.max(e.def.level, mine);
}

/** The feature as it goes on the sheet. */
export function featureForSheet(c: Pick<Character, 'classes'>, e: LibraryFeature): Feature {
  return blankFeature(featureFromRules(e.def, e.source, levelFor(c, e)));
}

/** Whether the sheet has it: the same feature from the same place, or the same name from another. */
export function onSheet(c: Pick<Character, 'features'>, e: LibraryFeature): 'same' | 'other' | null {
  const named = c.features.filter((f) => f.name.trim().toLowerCase() === e.def.name.toLowerCase());
  if (named.some((f) => f.source.trim().toLowerCase() === e.source.toLowerCase())) return 'same';
  return named.length ? 'other' : null;
}

/** A short line about its uses: "2 per Long Rest at 1st level". */
export function usesLine(c: Pick<Character, 'classes'>, e: LibraryFeature): string {
  const f = featureFromRules(e.def, e.source, levelFor(c, e));
  if (f.usesMax === null) return '';
  const per = f.recharge === 'short' ? 'Short or Long Rest' : 'Long Rest';
  const u = f.usesMax;
  const n = typeof u === 'number' ? String(u) : u === 'pb' ? 'Proficiency Bonus' : u === 'level' ? 'your level' : u.startsWith('mod:') ? `${u.slice(4).toUpperCase()} modifier` : `your ${u.slice(6)} level`;
  return `${n} per ${per}`;
}
