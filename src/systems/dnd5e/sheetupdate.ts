// Updating a character from a newer copy of its sheet (a D&D Beyond PDF at the next level, a
// Word file, an AI's write-up): what differs, in sections you can tick, then only those
// applied. What the app tracks itself and the sheet can't know is never touched: companions,
// hit points right now, spent slots and uses, conditions, enemies and the fight, counters,
// game states, the portrait, tiles and dice. Spells and features keep the app's details (their
// source, element, free casts); only new ones come from the sheet.

import { ABILITIES, ARMOR, SKILLS, classById } from './data';
import { applyBackground, findBackground, isBackgroundFeature } from './backgrounds';
import { syncFeatures, subclassDef } from './leveling';
import { blankFeature, blankWeapon, uid, type Character, type Feature } from './model';
import { maxHp } from './rules';
import type { Catalog } from './srd';

export type SectionId = 'identity' | 'classes' | 'abilities' | 'hp' | 'proficiencies' | 'basics' | 'spellsAdd' | 'spellsRemove' | 'features' | 'weapons' | 'items' | 'coins' | 'notes';

export interface UpdateSection {
  id: SectionId;
  title: string;
  /** What changes, one line each. */
  lines: string[];
  /** Ticked to begin with. */
  on: boolean;
  /** Why it starts unticked, when it does. */
  note?: string;
}

export interface UpdatePlan {
  sections: UpdateSection[];
  sheet: Character;
}

/** Comparable form of a name: lower case, no notes in brackets, no punctuation, singular words. */
const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/(ies)$/, 'y').replace(/(?<!s)s$/, '') : w))
    .join(' ');

/** Whether two names are the same thing: "Fighting Style" and "Fighting Style: Druidic Warrior", "Weapon Mastery" and "Weapon Masteries". */
export function sameName(a: string, b: string): boolean {
  const x = key(a);
  const y = key(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 5 && long.startsWith(`${short} `);
}

/** Whether two texts name the same things, whatever their order or punctuation ("Armor: Light, Medium" and "Light Armor, Medium Armor"). */
const sameWords = (a: string, b: string) => {
  const words = (x: string) => new Set(key(x).split(' ').filter((w) => w.length > 2 && !['and', 'the', 'all'].includes(w)));
  const x = words(a);
  const y = words(b);
  return x.size === y.size && [...x].every((w) => y.has(w));
};

/** Headings and stat lines a sheet's feature list carries that aren't features of their own. */
const NOT_A_FEATURE = /^(?:armor class|saving throws?|hit points?|speed|size|senses?|skills?|languages?|creature type|ability score (?:increases?|improvements?)|proficienc(?:y|ies)|spellcasting|pact magic|core \w+ traits|\w+ subclass|damage (?:resistances?|immunities)|condition immunities)$/i;

const classLine = (c: Character) => c.classes.map((k) => `${classById(k.classId).name}${k.subclass ? ` (${k.subclass})` : ''} ${k.level}`).join(' / ');

/** The character with the sheet's classes and ability scores, to work out its hit point maximum. */
function withClasses(cur: Character, sheet: Character): Character {
  const sim = structuredClone(cur);
  applyClasses(sim, sheet);
  for (const a of ABILITIES) sim.abilities[a] = sheet.abilities[a];
  sim.hp.maxOverride = null;
  return sim;
}

function applyClasses(d: Character, sheet: Character, cat?: Catalog) {
  for (const k of sheet.classes) {
    let entry = d.classes.find((x) => x.classId === k.classId);
    if (!entry) {
      entry = { id: uid(), classId: k.classId, subclass: '', level: 0, hitDiceUsed: 0 };
      d.classes.push(entry);
    }
    if (k.level > entry.level && entry.hpRolls) while (entry.hpRolls.length < k.level) entry.hpRolls.push(null);
    entry.level = k.level;
    entry.hpRolls = entry.hpRolls?.slice(0, entry.level);
    entry.hitDiceUsed = Math.min(entry.hitDiceUsed, entry.level);
    if (k.subclass.trim() && key(k.subclass) !== key(entry.subclass)) {
      entry.subclass = k.subclass.trim();
      entry.subclassId = undefined;
      if (cat) entry.subclassId = subclassDef(cat, entry)?.id;
    }
  }
}

export function planUpdate(cur: Character, sheet: Character): UpdatePlan {
  const sections: UpdateSection[] = [];
  const add = (s: UpdateSection) => s.lines.length && sections.push(s);
  const change = (label: string, from: string | number, to: string | number) => `${label}: ${from === '' ? '—' : from} → ${to === '' ? '—' : to}`;

  // Who they are.
  const id: string[] = [];
  for (const [label, k] of [['Name', 'name'], ['Species', 'species'], ['Background', 'background'], ['Alignment', 'alignment'], ['Player', 'player'], ['Size', 'size']] as const) {
    const to = String(sheet[k] ?? '').trim();
    if (to && to !== String(cur[k] ?? '').trim()) id.push(change(label, cur[k], to));
  }
  if (sheet.xp && sheet.xp !== cur.xp) id.push(change('XP', cur.xp, sheet.xp));
  add({ id: 'identity', title: 'Who they are', lines: id, on: true });

  // Classes and levels.
  const cls: string[] = [];
  for (const k of sheet.classes) {
    const mine = cur.classes.find((x) => x.classId === k.classId);
    const name = classById(k.classId).name;
    if (!mine) cls.push(`New class: ${name} ${k.level}`);
    else {
      if (mine.level !== k.level) cls.push(change(name, mine.level, k.level));
      if (k.subclass.trim() && key(k.subclass) !== key(mine.subclass)) cls.push(change(`${name} subclass`, mine.subclass, k.subclass));
    }
  }
  for (const k of cur.classes) if (!sheet.classes.some((x) => x.classId === k.classId)) cls.push(`${classById(k.classId).name} ${k.level}: not on the sheet, so it’s kept`);
  add({ id: 'classes', title: `Classes and levels (${classLine(cur)} → ${classLine(sheet)})`, lines: cls, on: true, note: undefined });

  add({
    id: 'abilities',
    title: 'Ability scores',
    lines: ABILITIES.filter((a) => sheet.abilities[a] !== cur.abilities[a]).map((a) => change(a.toUpperCase(), cur.abilities[a], sheet.abilities[a])),
    on: true,
  });

  // Hit point maximum: the app's own math at the new level, unless the sheet says otherwise.
  const sheetMax = maxHp(sheet).total;
  const appMax = maxHp(withClasses(cur, sheet)).total;
  const nowMax = maxHp(cur).total;
  const hp: string[] = [];
  if (sheetMax !== appMax) hp.push(`Maximum: ${nowMax} → ${sheetMax} (the sheet’s figure; the app’s math gives ${appMax}, so it’s set by hand)`);
  else if (appMax !== nowMax) hp.push(`Maximum: ${nowMax} → ${appMax}`);
  else if (cur.hp.maxOverride !== null) hp.push(`Maximum stays ${appMax}, now from the app’s math rather than set by hand`);
  add({ id: 'hp', title: 'Hit points', lines: hp, on: true, note: undefined });

  // Proficiencies: saves and skills.
  const prof: string[] = [];
  const level = (n: number) => (n >= 2 ? 'expertise' : n >= 1 ? 'proficient' : n > 0 ? 'half' : 'none');
  for (const a of ABILITIES) if (!!sheet.saveProfs[a] !== !!cur.saveProfs[a]) prof.push(change(`${a.toUpperCase()} save`, level(+cur.saveProfs[a]), level(+sheet.saveProfs[a])));
  for (const s of SKILLS) if ((sheet.skills[s.id] ?? 0) !== (cur.skills[s.id] ?? 0)) prof.push(change(s.name, level(cur.skills[s.id] ?? 0), level(sheet.skills[s.id] ?? 0)));
  add({ id: 'proficiencies', title: 'Saving throws and skills', lines: prof, on: true });

  // Armor, speed, languages, training.
  const basics: string[] = [];
  const armorName = (id: string) => ARMOR.find((a) => a.id === id)?.name ?? id;
  if (sheet.armor.armorId !== cur.armor.armorId) basics.push(change('Armor', armorName(cur.armor.armorId), armorName(sheet.armor.armorId)));
  if (sheet.armor.shield !== cur.armor.shield) basics.push(change('Shield', cur.armor.shield ? 'yes' : 'no', sheet.armor.shield ? 'yes' : 'no'));
  if (sheet.speed && sheet.speed !== cur.speed) basics.push(change('Speed', `${cur.speed} ft.`, `${sheet.speed} ft.`));
  const langs = (s: string) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const newLangs = langs(sheet.languages).filter((l) => !langs(cur.languages).some((m) => sameName(l, m)));
  if (newLangs.length) basics.push(`Languages: adds ${newLangs.join(', ')}`);
  if (sheet.proficiencies.trim() && !sameWords(sheet.proficiencies, cur.proficiencies)) basics.push(`Training: ${sheet.proficiencies.replace(/=+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}`);
  add({ id: 'basics', title: 'Armor, speed, languages and training', lines: basics, on: true });

  // Spells: new ones from the sheet; ones the sheet no longer lists, only if you say so.
  const newSpells = sheet.spells.filter((s) => !cur.spells.some((m) => sameName(m.name, s.name) && key(m.name) === key(s.name)));
  add({ id: 'spellsAdd', title: `New spells (${newSpells.length})`, lines: newSpells.map((s) => `${s.name} (${s.level ? `level ${s.level}` : 'cantrip'})`), on: true });
  const gone = cur.spells.filter((m) => !sheet.spells.some((s) => key(s.name) === key(m.name)));
  add({
    id: 'spellsRemove',
    title: `Spells not on the sheet (${gone.length})`,
    lines: gone.map((s) => `Remove ${s.name}`),
    on: false,
    note: 'Left unticked: the sheet may list them under another name. Tick to remove them.',
  });

  // Features: only new ones (not a heading, not one of your companion's actions, not one you have).
  const companionBits = cur.companions.flatMap((k) => k.actions.map((a) => a.name));
  const newFeatures = newFeatureList(cur.features, sheet.features, companionBits);
  add({ id: 'features', title: `New features (${newFeatures.length})`, lines: newFeatures.map((f) => f.name), on: true });

  const newWeapons = sheet.weapons.filter((w) => !cur.weapons.some((m) => key(m.name) === key(w.name)));
  add({ id: 'weapons', title: `New weapons (${newWeapons.length})`, lines: newWeapons.map((w) => w.name), on: true });

  // Gear and coins change in play, so they're left as the app has them unless ticked.
  const items: string[] = [];
  for (const it of sheet.inventory) {
    const mine = cur.inventory.find((m) => key(m.name) === key(it.name));
    if (!mine) items.push(`Add ${it.name}${it.qty > 1 ? ` ×${it.qty}` : ''}`);
    else if (mine.qty !== it.qty) items.push(change(it.name, mine.qty, it.qty));
  }
  add({ id: 'items', title: 'Gear', lines: items, on: false, note: 'Left unticked: you track these in play. Tick to take the sheet’s.' });
  const coins = (['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((k) => sheet.currency[k] !== cur.currency[k]).map((k) => change(k.toUpperCase(), cur.currency[k], sheet.currency[k]));
  add({ id: 'coins', title: 'Coins', lines: coins, on: false, note: 'Left unticked: you track these in play.' });

  if (sheet.notes.trim() && !cur.notes.includes(sheet.notes.trim())) add({ id: 'notes', title: 'Notes', lines: ['Add the sheet’s notes below yours'], on: false });

  return { sections, sheet };
}

/** Features on the sheet that the character doesn't have yet. */
function newFeatureList(mine: Feature[], theirs: Feature[], companionBits: string[]): Feature[] {
  const out: Feature[] = [];
  for (const f of theirs) {
    const name = f.name.trim();
    if (!name || NOT_A_FEATURE.test(name)) continue;
    if (companionBits.some((n) => key(n) === key(name))) continue;
    if (mine.some((m) => sameName(m.name, name)) || out.some((m) => sameName(m.name, name))) continue;
    out.push(f);
  }
  return out;
}

/** Applies the ticked sections to a draft of the character. Returns a short account of what changed. */
export function applyUpdate(d: Character, plan: UpdatePlan, on: Set<SectionId>, cat?: Catalog): string[] {
  const s = plan.sheet;
  const done: string[] = [];
  const has = (id: SectionId) => on.has(id) && plan.sections.some((x) => x.id === id);
  const maxBefore = maxHp(d).total;

  if (has('identity')) {
    for (const k of ['name', 'species', 'alignment', 'player', 'size'] as const) if (s[k].trim()) d[k] = s[k].trim();
    if (s.xp) d.xp = s.xp;
    if (s.background.trim() && s.background.trim() !== d.background.trim()) {
      d.background = s.background.trim();
      if (d.features.some(isBackgroundFeature)) applyBackground(d, findBackground(d.background));
    }
    done.push('who they are');
  }
  if (has('classes')) {
    applyClasses(d, s, cat);
    done.push(classLine(d));
  }
  if (has('abilities')) {
    for (const a of ABILITIES) d.abilities[a] = s.abilities[a];
    done.push('ability scores');
  }
  // Class and subclass features for the new levels (the drake keeps pace too).
  if (has('classes') && cat) syncFeatures(d, cat);
  if (has('hp')) {
    d.hp.maxOverride = null;
    const appMax = maxHp(d).total;
    const sheetMax = maxHp(s).total;
    if (sheetMax !== appMax) d.hp.maxOverride = sheetMax;
    done.push(`max HP ${maxHp(d).total}`);
  }
  // Hit points gained with the new maximum come with it; you keep any damage you've taken.
  const maxAfter = maxHp(d).total;
  d.hp.current = Math.min(maxAfter, d.hp.current + Math.max(0, maxAfter - maxBefore));
  if (has('proficiencies')) {
    for (const a of ABILITIES) d.saveProfs[a] = !!s.saveProfs[a];
    for (const sk of SKILLS) d.skills[sk.id] = s.skills[sk.id] ?? 0;
    done.push('saves and skills');
  }
  if (has('basics')) {
    d.armor = { ...d.armor, armorId: s.armor.armorId, shield: s.armor.shield };
    if (s.speed) d.speed = s.speed;
    const langs = (x: string) => x.split(/[,;]/).map((l) => l.trim()).filter(Boolean);
    const extra = langs(s.languages).filter((l) => !langs(d.languages).some((m) => sameName(l, m)));
    if (extra.length) d.languages = [...langs(d.languages), ...extra].join(', ');
    if (s.proficiencies.trim()) d.proficiencies = s.proficiencies;
    done.push('armor, speed, languages');
  }
  if (has('spellsAdd')) {
    const fresh = s.spells.filter((x) => !d.spells.some((m) => key(m.name) === key(x.name)));
    d.spells.push(...fresh.map((x) => ({ ...structuredClone(x), id: uid() })));
    if (fresh.length) done.push(`${fresh.length} new spell${fresh.length === 1 ? '' : 's'}`);
  }
  if (has('spellsRemove')) {
    const before = d.spells.length;
    d.spells = d.spells.filter((m) => s.spells.some((x) => key(x.name) === key(m.name)));
    if (before !== d.spells.length) done.push(`${before - d.spells.length} spell${before - d.spells.length === 1 ? '' : 's'} removed`);
  }
  if (has('features')) {
    // Compared again now: the class features just added may already cover some of them.
    const fresh = newFeatureList(d.features, s.features, d.companions.flatMap((k) => k.actions.map((a) => a.name)));
    d.features.push(...fresh.map((f) => blankFeature({ ...structuredClone(f), id: uid(), usesSpent: 0, origin: undefined })));
    if (fresh.length) done.push(`${fresh.length} new feature${fresh.length === 1 ? '' : 's'}`);
  }
  if (has('weapons')) {
    const fresh = s.weapons.filter((w) => !d.weapons.some((m) => key(m.name) === key(w.name)));
    d.weapons.push(...fresh.map((w) => blankWeapon({ ...structuredClone(w), id: uid() })));
    if (fresh.length) done.push(`${fresh.length} new weapon${fresh.length === 1 ? '' : 's'}`);
  }
  if (has('items')) {
    for (const it of s.inventory) {
      const mine = d.inventory.find((m) => key(m.name) === key(it.name));
      if (mine) mine.qty = it.qty;
      else d.inventory.push({ ...structuredClone(it), id: uid() });
    }
    done.push('gear');
  }
  if (has('coins')) {
    d.currency = { ...s.currency };
    done.push('coins');
  }
  if (has('notes')) {
    d.notes = d.notes.trim() ? `${d.notes.trim()}\n\nFrom the sheet:\n${s.notes.trim()}` : s.notes.trim();
    done.push('notes');
  }
  return done;
}
