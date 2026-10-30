// Reads a character out of free-form text: a fillable sheet's form fields, a PDF's text,
// a Word/Google document, or an AI's write-up. Layouts vary endlessly, so this reads
// the common patterns ("STR 16", "Strength: 16 (+3)", ability tables, "Sorcerer 5",
// "Skills: Arcana +5", spell lists by level…) and reports what it found and what to check.
// The person reviews the result before a character is created.

import type { FieldPosition } from '../../import/extract';
import { ABILITIES, ARMOR, CLASSES, DAMAGE_TYPES, SKILLS, WEAPONS, classById, type Ability, type DamageType, type SkillId } from './data';
import { inventoryFromResolved, parseItemText, resolveItem, weaponFromResolved } from './items';
import { blankCharacter, blankFeature, blankSpell, blankWeapon, uid, type CastingTime, type Character, type ProfLevel, type Spell } from './model';
import { abilityMod, armorClass, inventoryWeight, maxHp, proficiencyBonus, weaponAttack } from './rules';
import { SPELL_LIBRARY, spellFromDef, tunedSpells } from './spells';
import type { Catalog } from './srd';

export interface ImportResult {
  character: Character;
  /** What was recognised, in plain words. */
  found: string[];
  /** Things the person should check. */
  warnings: string[];
}

type Coin = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';

/** The intermediate shape both readers (text and AI JSON) fill in. */
export interface Draft {
  name?: string;
  species?: string;
  background?: string;
  alignment?: string;
  player?: string;
  xp?: number;
  classes: { classId: string; subclass: string; level: number }[];
  abilities: Partial<Record<Ability, number>>;
  /** true = listed as proficient, number = the save's total bonus. */
  saves: Partial<Record<Ability, number | true>>;
  /** true = listed, 'expertise' = listed as expertise, number = the skill's total bonus. */
  skills: Partial<Record<SkillId, number | true | 'expertise'>>;
  ac?: number;
  /** What the sheet put in brackets after its AC, e.g. "chain mail, shield". */
  acNote?: string;
  hpMax?: number;
  hpCurrent?: number;
  speed?: number;
  armorHints: string[];
  shield?: boolean;
  spells: { name: string; level?: number; prepared?: boolean; info?: SpellInfo }[];
  /** As the sheet wrote them: the name, and the attack bonus and damage if it gave them. */
  weapons: { name: string; magic?: number; attack?: number; damage?: string; notes?: string }[];
  features: { name: string; description: string; source?: string; uses?: number; recharge?: 'short' | 'long' }[];
  /**
   * `weight` is as the source wrote it: a sheet's inventory row gives the whole stack's weight
   * (10 rations, 20 lb); the AI format gives one item's (`weightEach`).
   */
  items: { name: string; qty: number; weight?: number; weightEach?: boolean }[];
  /** The total weight the sheet says you carry, to check the items against. */
  carried?: number;
  currency: Partial<Record<Coin, number>>;
  languages?: string;
  proficiencies?: string;
  notes: string[];
}

/** A spell row's columns, for spells the rules don't know. */
export interface SpellInfo {
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  /** "DEX 15" for a save, "+7" for an attack. */
  saveHit?: string;
  /** Damage or effect notes ("8d6 Fire", "D: 2d6 Fire"). */
  notes?: string;
  school?: string;
}

const emptyDraft = (): Draft => ({
  classes: [],
  abilities: {},
  saves: {},
  skills: {},
  armorHints: [],
  spells: [],
  weapons: [],
  features: [],
  items: [],
  currency: {},
  notes: [],
});

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const firstInt = (s: string | undefined): number | undefined => {
  const m = s ? /-?\d+/.exec(s.replace(/,/g, '')) : null;
  return m ? Number(m[0]) : undefined;
};
const signedInt = (s: string): number | undefined => {
  const m = /([+-])\s*(\d{1,2})/.exec(s);
  return m ? (m[1] === '-' ? -1 : 1) * Number(m[2]) : undefined;
};

const ABILITY_WORDS: Record<string, Ability> = {
  str: 'str', strength: 'str', dex: 'dex', dexterity: 'dex', con: 'con', constitution: 'con',
  int: 'int', intelligence: 'int', wis: 'wis', wisdom: 'wis', cha: 'cha', charisma: 'cha',
};
const ABILITY_RE = '(STR|DEX|CON|INT|WIS|CHA|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)';
const CLASS_NAMES = CLASSES.map((c) => c.name).join('|');
const SKILL_BY_NORM = new Map<string, SkillId>(SKILLS.map((s) => [norm(s.name), s.id]));
SKILL_BY_NORM.set('animal', 'animal_handling'); // the official fillable sheet's field name
SKILL_BY_NORM.set('sleight', 'sleight_of_hand');
const SPELL_BY_NORM = new Map(SPELL_LIBRARY.map((s) => [norm(s.name), s]));

function cleanLine(l: string): string {
  return l
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‒–—−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\*\*|__|`/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Splits "**Race:** Half-Elf  **Background:** Entertainer" or "Race: Elf | Class: Wizard 3"
 * into one "Key: value" per line, but only when every piece looks like a labelled value.
 */
const LABELS =
  "Race|Species|Ancestry|Background|Alignment|Class(?:es)?|Level|Subclass|XP|Experience(?: Points)?|Player(?: Name)?|Speed|Armou?r Class|AC|Hit Points|HP|Initiative|Proficiency Bonus|Languages|Size|Age|Height|Weight|Deity";
const STARTS_WITH_LABEL = new RegExp(`^\\**(?:${LABELS})\\**\\s*:`, 'i');
const BEFORE_LABEL = new RegExp(`\\s+(?=\\**(?:${LABELS})\\**\\s*:)`, 'i');

function splitLabelled(raw: string): string[] {
  const parts = raw.split(/\s{2,}|\s[|·•]\s/);
  if (parts.length > 1 && parts.every((p) => /^\**[A-Z][A-Za-z ']{1,25}\**\s*:/.test(p.trim()))) return parts;
  // PDFs lose the double spaces: "Race: Half-Elf Background: Entertainer" still splits at known labels.
  if (STARTS_WITH_LABEL.test(raw.trim())) return raw.split(BEFORE_LABEL);
  return [raw];
}

const BULLET = /^(?:[-*•·◦▪]|\d+[.)])\s+/;
const stripBullet = (l: string) => l.replace(BULLET, '').trim();

/** "## Spells", "SPELLS", "Equipment:" (nothing after the colon), "**Features**" → heading text. */
function headingOf(line: string): string | null {
  let m = /^#{1,6}\s*(.+?)\s*#*$/.exec(line);
  if (m) return m[1].replace(/:$/, '').trim();
  m = /^([A-Za-z][A-Za-z0-9 &'/(),+-]{1,48}):$/.exec(line);
  if (m) return m[1].trim();
  if (/^[A-Z][A-Z0-9 &'/()-]{3,40}$/.test(line) && /[A-Z]{3}/.test(line)) return line;
  return null;
}

interface Section {
  title: string;
  lines: string[];
}

function sectionsOf(lines: string[]): Section[] {
  const out: Section[] = [{ title: '', lines: [] }];
  for (const l of lines) {
    const h = headingOf(l);
    if (h) out.push({ title: h, lines: [] });
    else out[out.length - 1].lines.push(l);
  }
  return out;
}

/** The first matching "Key: value" across the form fields and text, keyed by normalised name. */
function keyValues(lines: string[], fields: Record<string, string>): Map<string, string> {
  const kv = new Map<string, string>();
  for (const [k, v] of Object.entries(fields)) {
    const key = norm(k);
    if (v.trim() && !kv.has(key)) kv.set(key, v.trim());
  }
  for (const l of lines) {
    let m = /^([A-Za-z][A-Za-z0-9 '&/()-]{0,40}?)\s*[:=]\s*(.+)$/.exec(stripBullet(l));
    if (!m) m = /^\|?\s*([A-Za-z][A-Za-z0-9 '&/()-]{0,40}?)\s*\|\s*([^|]+?)\s*\|?\s*$/.exec(l); // two-cell table row
    if (m && !kv.has(norm(m[1]))) kv.set(norm(m[1]), m[2].trim());
  }
  return kv;
}

const get = (kv: Map<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const v = kv.get(k);
    if (v) return v;
  }
  return undefined;
};

function readClasses(candidates: string[], kv: Map<string, string>): Draft['classes'] {
  const out: Draft['classes'] = [];
  const add = (name: string, level: number | undefined, sub = '') => {
    const def = CLASSES.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!def || out.some((k) => k.classId === def.id)) return;
    out.push({ classId: def.id, subclass: sub.trim(), level: level && level >= 1 && level <= 20 ? level : 0 });
  };
  for (const text of candidates) {
    // "Sorcerer (Draconic) 5", "Wizard 3 / Fighter 2", "Rogue lvl 4"
    for (const m of text.matchAll(new RegExp(`\\b(${CLASS_NAMES})\\b\\s*(?:\\(([^)]*)\\))?\\s*(?:level|lvl\\.?)?\\s*(\\d{1,2})\\b`, 'gi'))) add(m[1], Number(m[3]), m[2]);
    // "Level 5 Sorcerer", "5th-level Aasimar Sorcerer"
    for (const m of text.matchAll(new RegExp(`\\b(?:level|lvl\\.?)\\s*(\\d{1,2})\\s+(?:[A-Za-z'-]+\\s+){0,3}?(${CLASS_NAMES})\\b(?:\\s*\\(([^)]*)\\))?`, 'gi'))) add(m[2], Number(m[1]), m[3]);
    for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)[\\s-]*level\\s+(?:[A-Za-z'-]+\\s+){0,3}?(${CLASS_NAMES})\\b(?:\\s*\\(([^)]*)\\))?`, 'gi'))) add(m[2], Number(m[1]), m[3]);
    if (out.length) break;
  }
  if (!out.length) {
    for (const text of candidates) {
      const m = new RegExp(`\\b(${CLASS_NAMES})\\b`, 'i').exec(text);
      if (m) {
        add(m[1], undefined);
        break;
      }
    }
  }
  const total = firstInt(get(kv, 'level', 'characterlevel', 'totallevel'));
  if (out.length === 1 && !out[0].level && total) out[0].level = total;
  const sub = get(kv, 'subclass', 'archetype', 'subclassname');
  if (out.length && sub && !out[0].subclass) out[0].subclass = sub;
  return out;
}

function readAbilities(lines: string[], kv: Map<string, string>, text: string): Draft['abilities'] {
  const out: Draft['abilities'] = {};
  for (const a of ABILITIES) {
    const v = firstInt(get(kv, a, `${a}score`, norm(fullName(a)), `${norm(fullName(a))}score`));
    if (v !== undefined && v >= 1 && v <= 30) out[a] = v;
  }
  // A table: a header row naming the abilities, then a row of scores.
  for (let i = 0; i < lines.length && Object.keys(out).length < 6; i++) {
    const cells = splitCells(lines[i]);
    const header = cells.map((c) => ABILITY_WORDS[norm(c)]);
    if (header.filter(Boolean).length < 4) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      if (/^[|\s:-]+$/.test(lines[j])) continue;
      const row = splitCells(lines[j]);
      const scores = row.length === cells.length ? row.map((c) => firstInt(c)) : [...lines[j].matchAll(/(\d{1,2})(?:\s*\([+-]?\d+\))?/g)].map((m) => Number(m[1]));
      header.forEach((a, k) => {
        const v = scores[k];
        if (a && v !== undefined && v >= 1 && v <= 30 && out[a] === undefined) out[a] = v;
      });
      break;
    }
  }
  // Inline: "STR 8", "Strength: 16 (+3)".
  for (const m of text.matchAll(new RegExp(`\\b${ABILITY_RE}\\b\\s*(?:score)?\\s*[:=]?\\s*(\\d{1,2})\\b(?!\\s*(?:ft|feet|lb))`, 'gi'))) {
    const a = ABILITY_WORDS[m[1].toLowerCase()];
    const v = Number(m[2]);
    if (a && out[a] === undefined && v >= 1 && v <= 30) out[a] = v;
  }
  return out;
}

const fullName = (a: Ability) => ({ str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' })[a];

function splitCells(line: string): string[] {
  if (line.includes('|')) return line.split('|').map((c) => c.trim()).filter((c, i, all) => c !== '' || (i > 0 && i < all.length - 1));
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  return line.split(/\s{2,}|\s(?=[A-Z]{3}\b)/).map((c) => c.trim()).filter(Boolean);
}

function readSaves(lines: string[], kv: Map<string, string>): Draft['saves'] {
  const out: Draft['saves'] = {};
  for (const a of ABILITIES) {
    const v = get(kv, `st${norm(fullName(a))}`, `${a}save`, `${norm(fullName(a))}save`, `${norm(fullName(a))}savingthrow`);
    const n = v !== undefined ? signedInt(v) ?? firstInt(v) : undefined;
    if (n !== undefined) out[a] = n;
  }
  for (const l of lines) {
    const m = /^(?:saving throws?|saves)\s*(?:proficienc(?:y|ies))?\s*[:=-]\s*(.+)$/i.exec(stripBullet(l));
    if (!m) continue;
    for (const part of m[1].split(/[,;]|\band\b/)) {
      const w = new RegExp(`\\b${ABILITY_RE}\\b`, 'i').exec(part);
      if (!w) continue;
      const a = ABILITY_WORDS[w[1].toLowerCase()];
      out[a] = signedInt(part.slice(w.index + w[0].length)) ?? true;
    }
  }
  return out;
}

function readSkills(lines: string[], kv: Map<string, string>): Draft['skills'] {
  const out: Draft['skills'] = {};
  for (const [key, v] of kv) {
    const id = SKILL_BY_NORM.get(key);
    const n = id ? signedInt(v) ?? (/^\d+$/.test(v.trim()) ? Number(v) : undefined) : undefined;
    if (id && n !== undefined) out[id] = n;
  }
  for (const l of lines) {
    const m = /^(skills?(?:\s+proficienc(?:y|ies))?|expertise)\s*[:=-]\s*(.+)$/i.exec(stripBullet(l));
    if (!m) continue;
    const expertise = /expertise/i.test(m[1]);
    for (const part of m[2].split(/[,;]/)) {
      const name = part.replace(/[+-]\s*\d+.*$/, '').replace(/\(.*?\)/g, '');
      const id = SKILL_BY_NORM.get(norm(name)) ?? [...SKILL_BY_NORM.entries()].find(([k]) => norm(name).startsWith(k))?.[1];
      if (!id) continue;
      out[id] = expertise ? 'expertise' : (signedInt(part) ?? true);
    }
  }
  return out;
}

const SPELL_HEAD =
  /^(?:#+\s*)?(cantrips?|(?:spells?|spellbook)(?:\s+(?:known|prepared|list|slots?))?|(\d)(?:st|nd|rd|th)[\s-]*level(?:\s+spells?)?|level\s*(\d)(?:\s+spells?)?)\b(?:\s*\([^)]*\))?\s*(?:[:-]\s*(.*))?$/i;

function cleanSpellName(raw: string): string {
  return stripBullet(raw)
    .replace(/\s+[-–—:].*$/, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[*†‡]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/, '')
    .trim();
}

/** What a spell-level heading means: "=== CANTRIPS ===" → 0, "1st Level (4 slots)" → 1. */
function levelOfHeading(v: string): number | undefined {
  if (/cantrip/i.test(v)) return 0;
  const m = /(\d)(?:st|nd|rd|th)?[\s-]*level|level\s*(\d)/i.exec(v);
  return m ? Number(m[1] ?? m[2]) : undefined;
}

/** Spells from numbered form fields (spellName0, spellCastingTime0…, with spellHeader fields between levels). */
function spellRows(fields: Record<string, string>, positions: Record<string, FieldPosition> | undefined): Draft['spells'] {
  const rows = new Map<string, { key: string; f: Record<string, string> }>();
  const headers: { key: string; level: number | undefined }[] = [];
  for (const [k, v] of Object.entries(fields)) {
    const m = /^spell(name|level|savehit|save|hit|castingtime|time|range|components?|comp|duration|notes|source|prepared|page|school|header)(\d+)$/.exec(norm(k));
    if (!m || !v.trim()) continue;
    if (m[1] === 'header') {
      headers.push({ key: k, level: levelOfHeading(v) });
      continue;
    }
    const row = rows.get(m[2]) ?? { key: '', f: {} };
    row.f[m[1].replace(/^components$/, 'comp').replace(/^time$/, 'castingtime')] = v.trim();
    if (m[1] === 'name') row.key = k;
    rows.set(m[2], row);
  }
  const named = [...rows.values()].filter((r) => r.key && cleanSpellName(r.f.name).length >= 2 && !/^[-–—]+$/.test(r.f.name));
  const level = new Map<string, number>();
  // Which heading each spell sits under, by reading the page top to bottom (column by column).
  if (positions && headers.length) {
    const marks = [...headers.map((h) => ({ key: h.key, level: h.level })), ...named.map((r) => ({ key: r.key, level: undefined as number | undefined, row: r }))].filter((m) => positions[m.key]);
    const pages = new Map<number, number[]>();
    for (const m of marks) pages.set(positions[m.key].page, [...(pages.get(positions[m.key].page) ?? []), positions[m.key].x]);
    const column = (key: string) => {
      const p = positions[key];
      const xs = pages.get(p.page)!;
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      return hi - lo > 250 && p.x > (lo + hi) / 2 ? 1 : 0;
    };
    marks.sort((a, b) => positions[a.key].page - positions[b.key].page || column(a.key) - column(b.key) || positions[b.key].y - positions[a.key].y || positions[a.key].x - positions[b.key].x);
    let current: number | undefined;
    for (const m of marks) {
      if (!('row' in m)) current = m.level;
      else if (current !== undefined) level.set(m.key, current);
    }
  }
  return named.map((r) => ({
    name: cleanSpellName(r.f.name),
    level: firstInt(r.f.level) ?? level.get(r.key),
    prepared: r.f.prepared ? /^(p|o|x|y|yes|✓|•|●|always|prepared|true)/i.test(r.f.prepared) : undefined,
    info: { castingTime: r.f.castingtime, range: r.f.range, components: r.f.comp, duration: r.f.duration, saveHit: r.f.savehit ?? r.f.save ?? r.f.hit, notes: r.f.notes, school: r.f.school },
  }));
}

function readSpells(lines: string[], fields: Record<string, string>, opts: ReadOptions): Draft['spells'] {
  const out: Draft['spells'] = spellRows(fields, opts.positions);
  const add = (raw: string, level?: number) => {
    const name = cleanSpellName(raw);
    if (name.length < 3 || name.length > 40 || /^\d+$/.test(name) || /slot|level|save dc|attack|ability/i.test(name)) return;
    out.push({ name, level });
  };
  // The official sheet's numbered spell lines ("Spells 1014") and other apps' "spell3" fields.
  for (const [k, v] of Object.entries(fields)) if (/^spells?\s*\d/i.test(k) || /^spell\d+$/.test(norm(k))) add(v);
  for (let i = 0; i < lines.length; i++) {
    const m = SPELL_HEAD.exec(lines[i]);
    if (!m) continue;
    const level = /^cantrip/i.test(m[1]) ? 0 : m[2] ? Number(m[2]) : m[3] ? Number(m[3]) : undefined;
    if (m[4]) for (const part of m[4].split(/[,;]/)) add(part, level);
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l || SPELL_HEAD.test(l) || headingOf(l)) break;
      if (BULLET.test(l) || (l.length <= 60 && !/[:=]\s*\S/.test(l.replace(/^[^:]*?\s[-–—]\s.*/, '')))) {
        if (/,/.test(l) && !BULLET.test(l)) l.split(/[,;]/).forEach((p) => add(p, level));
        else add(l, level);
      } else break;
    }
  }
  // Spells the rules know, wherever a line starts with one: a printed (flattened) sheet's spell
  // table has no headings the reader can rely on. One-word names (Light, Shield, Command) are
  // also ordinary words, so they only count on a line that looks like a spell row.
  const known = opts.spellNames;
  if (known?.size && /spell\s*(?:save|attack|casting)|cantrips?\b|spell slots?/i.test(lines.join('\n'))) {
    for (const l of lines) {
      if (l.length > 200 || headingOf(l)) continue;
      const words = stripBullet(l).replace(/[*†‡]/g, '').split(/\s+/);
      for (let n = Math.min(6, words.length); n >= 1; n--) {
        const name = words.slice(0, n).join(' ').replace(/[.,;:]+$/, '');
        if (!known.has(norm(name))) continue;
        const rest = words.slice(n).join(' ');
        const rowLike = /\b(?:1\s?(?:A|BA|R)|action|bonus|reaction|minute|hour)\b|\d+\s*ft|\bself\b|\btouch\b|\bV,?\s*S\b|\bconc/i.test(rest);
        if (n > 1 || rowLike) out.push({ name: cleanSpellName(name) });
        break;
      }
    }
  }
  // The same spell from two places (a field and the page text, two pages) is kept once, with the most detail.
  const merged = new Map<string, Draft['spells'][number]>();
  for (const sp of out) {
    const k = norm(sp.name);
    const had = merged.get(k);
    if (!had) merged.set(k, sp);
    else merged.set(k, { ...sp, ...had, level: had.level ?? sp.level, info: had.info ?? sp.info, prepared: had.prepared ?? sp.prepared });
  }
  return [...merged.values()];
}

/** A sheet's attack row as text: "Shortbow 80/320 +7 1d6+4 Piercing". */
const ATTACK_ROW = /^([A-Z][A-Za-z0-9' ,+()-]{1,48}?)\s+(?:\d+(?:\/\d+)?\s*(?:ft\.?)?\s+)?([+-]\d{1,2})\s+((?:\d+d\d+|\d+)(?:\s*[+-]\s*\d+)?\s+[A-Za-z]+(?:\s*\+\s*\d+d\d+\s+[A-Za-z]+)*)(.*)$/;

function readWeapons(sections: Section[], fields: Record<string, string>, lines: string[]): Draft['weapons'] {
  const out: Draft['weapons'] = [];
  // Numbered weapon fields: "Wpn Name 2", "Wpn2 AtkBonus", "Wpn2 Damage" (official sheet, D&D Beyond).
  const rows = new Map<string, Record<string, string>>();
  for (const [k, v] of Object.entries(fields)) {
    const m = /^(?:wpn|weapon|attack)(\d*)(name|atkbonus|attackbonus|atk|bonus|tohit|hit|damage|dmg|notes|properties|range|type)(\d*)$/.exec(norm(k));
    if (!m || !v.trim()) continue;
    const idx = m[1] || m[3] || '1';
    rows.set(idx, { ...rows.get(idx), [m[2].replace(/^(atkbonus|attackbonus|bonus|tohit|hit)$/, 'atk').replace('dmg', 'damage')]: v.trim() });
  }
  for (const [, r] of [...rows].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (r.name && !/^[-–—]+$/.test(r.name)) out.push({ name: r.name.replace(/\s+/g, ' ').trim(), attack: r.atk ? signedInt(r.atk) ?? firstInt(r.atk) : undefined, damage: r.damage, notes: [r.notes, r.properties, r.range].filter(Boolean).join(', ') || undefined });
  }
  // Attack rows in the page text (a printed sheet, or an AI's table).
  for (const l of lines) {
    const m = ATTACK_ROW.exec(l.replace(/\s*\|\s*/g, ' '));
    if (m && !/^(?:spell|save|attack bonus|initiative|dc)\b/i.test(m[1])) out.push({ name: m[1].trim(), attack: Number(m[2]), damage: m[3], notes: m[4].trim() || undefined });
  }
  // Otherwise, weapons named in the equipment or attack sections.
  if (!out.length) {
    const pool = sections.filter((s) => /attack|weapon|action|equipment|inventory|gear/i.test(s.title) && !/proficienc/i.test(s.title)).flatMap((s) => s.lines).join('\n');
    let rest = pool;
    const names = [...WEAPONS].sort((a, b) => b.name.length - a.name.length);
    for (const w of names) {
      const re = new RegExp(`(?:\\+(\\d)\\s+)?\\b${w.name.replace(/ /g, '\\s+')}s?\\b(?:\\s*\\+(\\d))?`, 'i');
      const m = re.exec(rest);
      if (!m) continue;
      const magic = Number(m[1] ?? m[2] ?? 0);
      out.push({ name: magic ? `${w.name} +${magic}` : w.name, magic });
      rest = rest.replace(new RegExp(re.source, 'gi'), ' '); // so "Light Crossbow" doesn't also count as a crossbow
    }
  }
  const seen = new Set<string>();
  return out.filter((w) => !seen.has(norm(w.name)) && seen.add(norm(w.name)));
}

const FEATURE_SECTION = /feature|trait|feats?\b|class abilit|special abilit|racial|species|actions?\b|boon|invocation|fighting style/i;
const NOTE_SECTION = /personality|ideal|bond|flaw|backstory|background story|appearance|description|notes|history|allies/i;
const ITEM_SECTION = /equipment|inventory|gear|possessions|items|treasure|attuned/i;
const ACTION_NAMES = new Set(['attack', 'dash', 'disengage', 'dodge', 'grapple', 'help', 'hide', 'improvise', 'influence', 'magic', 'ready', 'search', 'shove', 'study', 'utilize', 'unarmed strike', 'opportunity attack', 'two-weapon fighting']);

/**
 * Features from feature sections: bullets, "Name. What it does" lines, or a short name line
 * followed by its description (D&D Beyond's layout: "* Innate Sorcery • PHB 2024 p.142").
 */
function readFeatures(sections: Section[]): Draft['features'] {
  const out: Draft['features'] = [];
  for (const s of sections) {
    if (!FEATURE_SECTION.test(s.title) || /ability scores|proficienc|attacks?\b|spell/i.test(s.title)) continue;
    const source = /^(?:features?(?: and | & )?traits?|features|traits|feats?|actions?|features and traits)$/i.test(s.title.trim()) ? '' : s.title.replace(/\b\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
    let current: Draft['features'][number] | null = null;
    let lastEnded = true;
    // Where features are bulleted, only a bullet starts one; every other line is description.
    const bulleted = s.lines.some((l) => BULLET.test(l));
    for (const raw of s.lines) {
      if (!raw) {
        lastEnded = true;
        continue;
      }
      const bullet = BULLET.test(raw);
      const l = stripBullet(raw);
      if (/^(actions in combat|standard actions|other actions)\b/i.test(l)) continue;
      const sentence = /^(?:you|your|the|a|an|when|if|as|while|once|each|this|that|on|in|at|for|until|whenever|after|before|it|its|they|their|until)\b/i.test(l);
      const inline = sentence ? null : /^([A-Z][^.:!?]{1,50}?)(?:\s+[•·|]\s+[^.:]*?)?[.:]\s+(.+)$/.exec(l);
      const shortName = !sentence && l.length <= 60 && /^[A-Z+]/.test(l) && !/[.!?]$/.test(l) && l.split(' ').length <= 9;
      const named = bulleted ? bullet : (inline && inline[1].split(' ').length <= 7) || (shortName && (lastEnded || !current) && !(current && !current.description));
      if (named) {
        const [name, description] = inline && inline[1].split(' ').length <= 7 ? [inline[1], inline[2]] : [l, ''];
        const clean = name.replace(/\s+[•·|]\s+.*$/, '').replace(/[:.]$/, '').trim();
        if (ACTION_NAMES.has(clean.toLowerCase()) || clean.length < 2) {
          current = null;
          continue;
        }
        current = { name: clean, description: description.trim(), source };
        out.push(current);
      } else if (current && current.description.length < 3000) current.description = `${current.description}${current.description ? (lastEnded && current.description ? '\n' : ' ') : ''}${l}`;
      lastEnded = /[.!?:)]$/.test(l);
    }
  }
  // Uses per rest written into the description ("2 / Long Rest", "3 uses per Short Rest").
  for (const f of out) {
    const m = /(\d+)\s*(?:\/|uses?\s*(?:per|\/))\s*(long|short)\s*rest/i.exec(f.description) ?? /(\d+)\s*\/\s*(long|short)\b/i.exec(f.description);
    if (m) (f.uses = Number(m[1])), (f.recharge = m[2].toLowerCase() as 'long' | 'short');
  }
  // A feature listed twice (on two pages, or as a trait and an action) is kept once, with the fuller text.
  const merged = new Map<string, Draft['features'][number]>();
  for (const f of out) {
    const k = norm(f.name);
    const had = merged.get(k);
    if (!had || f.description.length > had.description.length) merged.set(k, { ...had, ...f, source: f.source || had?.source });
  }
  return [...merged.values()].slice(0, 200);
}

function readItems(sections: Section[], fields: Record<string, string>, kv: Map<string, string>): { items: Draft['items']; currency: Draft['currency'] } {
  const items: Draft['items'] = [];
  const currency: Draft['currency'] = {};
  const coin = (s: string) => {
    for (const m of s.matchAll(/(\d[\d,]*)\s*(pp|gp|ep|sp|cp)\b/gi)) currency[m[2].toLowerCase() as Coin] = Number(m[1].replace(/,/g, ''));
  };
  for (const c of ['cp', 'sp', 'ep', 'gp', 'pp'] as Coin[]) {
    const v = firstInt(kv.get(c));
    if (v !== undefined) currency[c] = v;
  }
  // Numbered equipment fields: "Eq Name0", "Eq Qty0", "Eq Weight0" (D&D Beyond) and the like.
  const rows = new Map<string, Record<string, string>>();
  for (const [k, v] of Object.entries(fields)) {
    const m = /^(?:eq|equipment|item|inventory|gear)(\d*)(name|qty|quantity|count|weight|wt)?(\d*)$/.exec(norm(k));
    if (!m || !v.trim() || !(m[1] || m[3])) continue;
    const idx = m[1] || m[3];
    rows.set(idx, { ...rows.get(idx), [(m[2] ?? 'name').replace(/^(quantity|count)$/, 'qty').replace('wt', 'weight')]: v.trim() });
  }
  for (const [, r] of [...rows].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (!r.name || /^[-–—]+$/.test(r.name) || /^=+.*=+$/.test(r.name)) continue;
    items.push({ name: r.name.replace(/\s+/g, ' ').trim(), qty: firstInt(r.qty) ?? 1, weight: r.weight ? Number(/(\d+(?:\.\d+)?)/.exec(r.weight)?.[1] ?? 0) : undefined });
  }
  const add = (raw: string) => {
    let l = stripBullet(raw);
    coin(l);
    l = l.replace(/(\d[\d,]*)\s*(pp|gp|ep|sp|cp)\b/gi, '').replace(/^[,;\s]+|[,;\s]+$/g, '');
    if (l.length < 2 || l.length > 80 || /^(name|qty|quantity|weight|equipment|inventory|attuned items?|container|other possessions|total weight|weight carried|encumbered|push,? drag|lift|coins?)\b/i.test(l)) return;
    let qty = 1;
    let weight: number | undefined;
    let m = /^(.+?)\s+(\d+)\s+(\d+(?:\.\d+)?)\s*lbs?\.?$/i.exec(l); // a printed table row: name, quantity, weight
    if (m) (l = m[1]), (qty = Number(m[2])), (weight = Number(m[3]));
    m = /^(.+?)\s+(\d+(?:\.\d+)?)\s*lbs?\.?$/i.exec(l);
    if (m) (l = m[1]), (weight = Number(m[2]));
    m = /^(\d+)\s*[x×]?\s+(.+)$/i.exec(l);
    if (m) (qty = Number(m[1])), (l = m[2]);
    m = /^(.+?)\s*(?:\((\d+)\)|[x×]\s*(\d+))$/i.exec(l);
    if (m) (qty = Number(m[2] ?? m[3])), (l = m[1]);
    items.push({ name: l.trim(), qty, weight });
  };
  for (const s of sections) {
    if (!ITEM_SECTION.test(s.title) || /proficienc/i.test(s.title)) continue;
    for (const l of s.lines) {
      if (!l) continue;
      if (!BULLET.test(l) && l.includes(',') && !/\d\s*lbs?\.?$/i.test(l)) l.split(/[,;]/).forEach(add);
      else add(l);
    }
  }
  // The same item from two places is kept once (with the larger count), not added up.
  const merged = new Map<string, Draft['items'][number]>();
  for (const it of items) {
    const k = norm(it.name);
    const had = merged.get(k);
    merged.set(k, had ? { ...had, qty: Math.max(had.qty, it.qty), weight: had.weight ?? it.weight } : it);
  }
  return { items: [...merged.values()].slice(0, 300), currency };
}

/** Long form fields (features, equipment, proficiencies…) as sections, so they're read like page text. */
function fieldBlocks(fields: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!v.includes('\n') && v.length <= 120) continue;
    const key = norm(k);
    if (/backstory|personality|ideal|bond|flaw|appearance|allies|organi[sz]ation|notes/.test(key)) continue; // kept as notes
    const prof = /proficienc|lang/.test(key);
    const title = prof ? 'Proficiencies and languages' : /feat|trait|feature|action|boon/.test(key) ? 'Features and traits' : /equip|inventor|gear|item|possession|treasure/.test(key) ? 'Equipment' : /attack|weapon/.test(key) ? 'Attacks' : /spell/.test(key) ? 'Spells' : k.trim();
    out.push(`## ${title}`);
    for (const raw of v.split(/\r?\n/)) {
      const l = raw.trim();
      const h = /^=+\s*(.+?)\s*=+$/.exec(l) ?? (prof ? /^([A-Za-z ]{3,30}):\s*$/.exec(l) : null);
      out.push(h ? `### ${prof ? 'Proficiency: ' : ''}${h[1]}` : l);
    }
    out.push('');
  }
  return out;
}

/** Languages and the other proficiencies, from labelled lines or "Languages" sections. */
function readProficiencies(lines: string[], sections: Section[], kv: Map<string, string>): { languages?: string; proficiencies?: string } {
  const langs: string[] = [];
  const addLangs = (s: string) => s.split(/[,;\n]/).map((x) => x.replace(/^languages?\s*[:=-]?\s*/i, '').trim()).filter((x) => x && x.length <= 40).forEach((x) => !langs.some((y) => norm(y) === norm(x)) && langs.push(x));
  const fromKv = get(kv, 'languages', 'language');
  if (fromKv && !fromKv.includes('\n')) addLangs(fromKv);
  for (const s of sections) if (/language/i.test(s.title)) s.lines.filter(Boolean).forEach(addLangs);
  const profs: string[] = [];
  const addProf = (l: string) => !profs.includes(l) && profs.push(l);
  for (const l of lines.map(stripBullet)) {
    if (/^(armou?r|weapons?|tools?|tool proficienc(?:y|ies)|other proficiencies)\s*(?:proficienc(?:y|ies))?\s*[:=]/i.test(l)) addProf(l);
    else if (/^languages?\s*[:=]/i.test(l)) addLangs(l);
  }
  for (const s of sections) {
    const m = /^Proficiency:\s*(.+)$/i.exec(s.title);
    if (m && !/language/i.test(m[1]) && s.lines.some(Boolean)) addProf(`${m[1].replace(/\b\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase())}: ${s.lines.filter(Boolean).join(', ')}`);
    if (/^Proficiencies and languages$/i.test(s.title)) for (const l of s.lines.filter(Boolean)) if (!/^languages?\b/i.test(l) && !profs.some((p) => p.includes(l))) addProf(l);
  }
  return { languages: langs.join(', ') || undefined, proficiencies: profs.join('\n') || undefined };
}

export interface ReadOptions {
  /** Where each form field sits on its page (from the PDF reader). */
  positions?: Record<string, FieldPosition>;
  /** The spells the rules know (normalised names), so a spell is recognised wherever it's written. */
  spellNames?: Set<string>;
}

/** Reads a document's text (and any form fields) into a Draft. */
export function readText(text: string, fields: Record<string, string> = {}, opts: ReadOptions = {}): Draft {
  const d = emptyDraft();
  const fieldLines = Object.entries(fields).flatMap(([k, v]) => (v.includes('\n') || v.length > 120 ? [] : [`${k}: ${v}`]));
  const textLines = text.split(/\r?\n/).flatMap(splitLabelled).map(cleanLine);
  const lines = [...fieldLines.map(cleanLine), ...textLines, '', ...fieldBlocks(fields).map(cleanLine)];
  const all = lines.join('\n');
  const kv = keyValues(lines, fields);
  const sections = sectionsOf(lines);

  d.name = get(kv, 'charactername', 'name', 'charactername2', 'pcname');
  if (!d.name) {
    const h = textLines.find((l) => /^#\s/.test(l)) ?? textLines.find((l) => l && l.length <= 40 && !/[:|]/.test(l) && !headingOf(l));
    if (h) d.name = h.replace(/^#+\s*/, '').trim();
  }
  d.species = get(kv, 'species', 'race', 'ancestry', 'lineage', 'heritage');
  d.background = get(kv, 'background');
  d.player = get(kv, 'playername', 'player');
  d.alignment = get(kv, 'alignment') ?? /\b(lawful|neutral|chaotic)\s+(good|neutral|evil)\b|\btrue neutral\b/i.exec(all)?.[0];
  d.xp = firstInt(get(kv, 'xp', 'experiencepoints', 'experience', 'exp'));

  const classLines = [get(kv, 'classlevel', 'class', 'classes', 'classandlevel', 'classlevels'), ...lines.slice(0, 40).filter((l) => new RegExp(`\\b(${CLASS_NAMES})\\b`, 'i').test(l)), all].filter(
    (x): x is string => !!x,
  );
  d.classes = readClasses(classLines, kv);
  d.abilities = readAbilities(lines, kv, all);
  d.saves = readSaves(lines, kv);
  d.skills = readSkills(lines, kv);

  const acText = get(kv, 'ac', 'armorclass') ?? /\b(?:AC|Armou?r Class)\b\s*[:=]?\s*(\d{1,2}[^\n]*)/i.exec(all)?.[1];
  d.ac = firstInt(acText);
  d.acNote = acText ? /\((.*?)\)/.exec(acText)?.[1] : undefined;
  const hpText =
    get(kv, 'hpmax', 'maxhp', 'hitpointmaximum', 'maxhitpoints', 'hitpoints', 'hp') ?? /\b(?:HP|Hit Points)\b\s*[:=]?\s*(\d{1,3}(?:\s*\/\s*\d{1,3})?)/i.exec(all)?.[1];
  const hp = hpText ? /(\d{1,3})(?:\s*\/\s*(\d{1,3}))?/.exec(hpText) : null;
  if (hp) {
    d.hpMax = Number(hp[2] ?? hp[1]);
    d.hpCurrent = firstInt(get(kv, 'hpcurrent', 'currenthp')) ?? (hp[2] ? Number(hp[1]) : undefined);
  }
  d.speed = firstInt(get(kv, 'speed', 'walkingspeed') ?? /\bSpeed\b\s*[:=]?\s*(\d{1,3})/i.exec(all)?.[1]);

  d.spells = readSpells(textLines.concat(fieldBlocks(fields).map(cleanLine)), fields, opts);
  const spellSet = new Set(d.spells.map((x) => norm(x.name)));
  // Spell attacks listed with the weapons (Fire Bolt +7 1d10 fire) are spells, not weapons.
  d.weapons = readWeapons(sections, fields, lines).filter((w) => !spellSet.has(norm(w.name)) && !opts.spellNames?.has(norm(w.name)));
  d.features = readFeatures(sections).filter((f) => !spellSet.has(norm(f.name)));
  const inv = readItems(sections, fields, kv);
  d.items = inv.items;
  const carried = get(kv, 'weightcarried', 'totalweight', 'carriedweight', 'carryingweight') ?? /\bweight carried\b\s*[:=]?\s*(\d+(?:\.\d+)?)/i.exec(all)?.[1];
  if (carried && /\d/.test(carried)) d.carried = Number(/(\d+(?:\.\d+)?)/.exec(carried)![1]);
  d.currency = inv.currency;
  d.armorHints.push(...sections.filter((s) => (ITEM_SECTION.test(s.title) || /armou?r/i.test(s.title)) && !/proficienc/i.test(s.title)).flatMap((s) => s.lines), ...d.items.map((i) => i.name), get(kv, 'armor', 'armour') ?? '');
  d.shield = [d.acNote ?? '', ...d.armorHints].some((h) => /\bshield\b(?!\s+(?:spell|of faith))/i.test(h));
  const p = readProficiencies(lines, sections, kv);
  d.languages = p.languages;
  d.proficiencies = p.proficiencies;
  for (const s of sections) if (NOTE_SECTION.test(s.title) && !FEATURE_SECTION.test(s.title) && s.lines.some(Boolean)) d.notes.push(`${s.title}\n${s.lines.filter(Boolean).join('\n')}`);
  for (const k of ['personalitytraits', 'ideals', 'bonds', 'flaws', 'backstory', 'characterbackstory', 'appearance', 'alliesorganizations', 'treasure']) {
    const v = kv.get(k);
    if (v) d.notes.push(`${k.replace('characterbackstory', 'backstory').replace('alliesorganizations', 'allies & organizations').replace('personalitytraits', 'personality traits')}: ${v}`);
  }
  return d;
}

/** The JSON shape the AI conversion prompt asks for. */
export const AI_PROMPT = `Convert this D&D 5e character into JSON for the Arcane Tome app.
Reply with only the JSON, using exactly these keys, and leave out anything the character sheet doesn't say:
{
  "name": "", "species": "", "background": "", "alignment": "",
  "classes": [{ "class": "Wizard", "subclass": "", "level": 1 }],
  "abilities": { "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10 },
  "saves": ["con", "cha"],
  "skills": { "arcana": "proficient", "stealth": "expertise" },
  "ac": 0, "maxHp": 0, "currentHp": 0, "speed": 30, "armor": "", "shield": false,
  "spells": [{ "name": "Fire Bolt", "level": 0 }],
  "weapons": [{ "name": "Dagger", "attackBonus": 5, "damage": "1d4+3 piercing", "notes": "Finesse, Light, Thrown (20/60)" }],
  "features": [{ "name": "", "description": "", "uses": 0, "recharge": "long" }],
  "equipment": [{ "name": "Explorer's pack", "qty": 1, "weight": 0 }],
  "coins": { "gp": 0 },
  "languages": "", "proficiencies": "", "notes": ""
}

Include every spell, weapon, item and feature on every page of the sheet, each once. Write magic items by their full name (e.g. "Flame Tongue Longsword"). An item's "weight" is the weight of one of it in pounds (10 rations: "qty": 10, "weight": 2).

Character:
`;

/** True for the AI prompt's JSON shape (as opposed to an Arcane Tome export). */
export function looksLikeAiJson(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const o = data as Record<string, unknown>;
  return !('schema' in o) && !('format' in o) && ('abilities' in o || 'classes' in o) && !('saveProfs' in o);
}

export function readAiJson(data: Record<string, unknown>): Draft {
  const d = emptyDraft();
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? firstInt(v) : undefined);
  d.name = str(data.name);
  d.species = str(data.species) ?? str(data.race);
  d.background = str(data.background);
  d.alignment = str(data.alignment);
  d.xp = num(data.xp);
  const classes = Array.isArray(data.classes) ? data.classes : [];
  for (const k of classes as Record<string, unknown>[]) {
    const def = CLASSES.find((c) => c.name.toLowerCase() === String(k?.class ?? k?.name ?? '').toLowerCase().trim());
    if (def) d.classes.push({ classId: def.id, subclass: str(k.subclass) ?? '', level: num(k.level) ?? 1 });
  }
  const ab = (data.abilities ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(ab)) {
    const a = ABILITY_WORDS[norm(k)];
    const n = num(v);
    if (a && n !== undefined) d.abilities[a] = n;
  }
  for (const s of Array.isArray(data.saves) ? data.saves : []) {
    const a = ABILITY_WORDS[norm(String(s))];
    if (a) d.saves[a] = true;
  }
  for (const [k, v] of Object.entries((data.skills ?? {}) as Record<string, unknown>)) {
    const id = SKILL_BY_NORM.get(norm(k));
    if (id) d.skills[id] = /expert/i.test(String(v)) ? 'expertise' : true;
  }
  d.ac = num(data.ac);
  d.hpMax = num(data.maxHp);
  d.hpCurrent = num(data.currentHp);
  d.speed = num(data.speed);
  d.acNote = str(data.armor);
  d.shield = data.shield === true;
  for (const s of Array.isArray(data.spells) ? data.spells : []) {
    const o = typeof s === 'string' ? { name: s } : (s as Record<string, unknown>);
    if (str(o.name)) d.spells.push({ name: str(o.name)!, level: num(o.level) });
  }
  for (const w of Array.isArray(data.weapons) ? data.weapons : []) {
    const o = (typeof w === 'string' ? { name: w } : w) as Record<string, unknown>;
    if (str(o?.name)) d.weapons.push({ name: str(o.name)!, attack: num(o.attackBonus), damage: str(o.damage), notes: str(o.notes) });
  }
  for (const f of Array.isArray(data.features) ? data.features : []) {
    const o = f as Record<string, unknown>;
    if (str(o?.name)) d.features.push({ name: str(o.name)!, description: str(o.description) ?? '', uses: num(o.uses) || undefined, recharge: o.recharge === 'short' ? 'short' : o.recharge === 'long' ? 'long' : undefined });
  }
  for (const e of Array.isArray(data.equipment) ? data.equipment : []) {
    const o = (typeof e === 'string' ? { name: e } : e) as Record<string, unknown>;
    if (str(o?.name)) d.items.push({ name: str(o.name)!, qty: num(o.qty) ?? 1, weight: num(o.weight) || undefined, weightEach: true });
  }
  for (const [k, v] of Object.entries((data.coins ?? {}) as Record<string, unknown>)) {
    if (['cp', 'sp', 'ep', 'gp', 'pp'].includes(k) && num(v) !== undefined) d.currency[k as Coin] = num(v)!;
  }
  d.languages = str(data.languages);
  d.proficiencies = str(data.proficiencies);
  if (str(data.notes)) d.notes.push(str(data.notes)!);
  return d;
}

const profFrom = (v: number | true | 'expertise' | undefined, mod: number, pb: number): ProfLevel => {
  if (v === undefined) return 0;
  if (v === 'expertise') return 2;
  if (v === true) return 1;
  const delta = v - mod;
  return delta >= 2 * pb ? 2 : delta >= pb ? 1 : 0;
};

/** Turns a Draft into a character, checking the sheet's numbers against the app's own math. */
export function buildCharacter(d: Draft, catalog?: Catalog): ImportResult {
  const c = blankCharacter();
  const found: string[] = [];
  const warnings: string[] = [];
  c.name = d.name || 'Imported character';
  if (d.name) found.push(`Name: ${d.name}`);
  else warnings.push('No name found.');
  if (d.species) (c.species = d.species), found.push(`Species: ${d.species}`);
  if (d.background) c.background = d.background;
  if (d.alignment) c.alignment = d.alignment;
  if (d.player) c.player = d.player;
  if (d.xp !== undefined) c.xp = d.xp;

  if (d.classes.length) {
    c.classes = d.classes.map((k) => ({ id: uid(), classId: k.classId, subclass: k.subclass, level: k.level || 1, hitDiceUsed: 0 }));
    if (d.classes.some((k) => !k.level)) warnings.push('A class level wasn’t found, so it was set to 1. Check Character → Edit.');
    found.push(`Class: ${c.classes.map((k) => `${classById(k.classId).name}${k.subclass ? ` (${k.subclass})` : ''} ${k.level}`).join(' / ')}`);
    const first = classById(c.classes[0].classId);
    ABILITIES.forEach((a) => (c.saveProfs[a] = first.saves.includes(a)));
  } else warnings.push('No class found. It was set to Fighter 1; change it in Character → Edit.');

  const scores = ABILITIES.filter((a) => d.abilities[a] !== undefined);
  for (const a of scores) c.abilities[a] = d.abilities[a]!;
  if (scores.length === 6) found.push(`Ability scores: ${ABILITIES.map((a) => `${a.toUpperCase()} ${c.abilities[a]}`).join(', ')}`);
  else if (scores.length) warnings.push(`Only found ${scores.length} of 6 ability scores; the rest are 10.`);
  else warnings.push('No ability scores found; they are all 10. Enter them on the Stats page.');

  const pb = proficiencyBonus(c.classes.reduce((a, k) => a + k.level, 0));
  const savesListed = ABILITIES.filter((a) => d.saves[a] !== undefined);
  if (savesListed.length) {
    ABILITIES.forEach((a) => (c.saveProfs[a] = profFrom(d.saves[a], abilityMod(c.abilities[a]), pb) > 0));
    found.push(`Save proficiencies: ${ABILITIES.filter((a) => c.saveProfs[a]).map((a) => a.toUpperCase()).join(', ') || 'none'}`);
  }
  let skillCount = 0;
  for (const s of SKILLS) {
    const lvl = profFrom(d.skills[s.id], abilityMod(c.abilities[s.ability]), pb);
    c.skills[s.id] = lvl;
    if (lvl) skillCount++;
  }
  if (skillCount) found.push(`${skillCount} skill proficienc${skillCount === 1 ? 'y' : 'ies'}`);

  // Armor: named next to the AC, or in the equipment. A one-word name ("Leather", "Plate")
  // only counts next to the AC or written as "leather armor", so a leather pouch isn't armor.
  const hints = d.armorHints.join('\n');
  const near = d.acNote ?? '';
  const armor = [...ARMOR]
    .filter((a) => a.id !== 'none')
    .sort((a, b) => b.name.length - a.name.length)
    .find((a) => {
      const name = a.name.replace(/ /g, '\\s+');
      if (new RegExp(`\\b${name}\\b`, 'i').test(near)) return true;
      const distinctive = a.name.includes(' ') || a.name === 'Breastplate';
      return new RegExp(distinctive ? `\\b${name}\\b` : `\\b${name}\\s+armou?r\\b`, 'i').test(hints);
    });
  const unarmoredHint = `${near}\n${hints}\n${d.features.map((f) => f.name).join('\n')}`;
  if (armor) (c.armor.armorId = armor.id), found.push(`Armor: ${armor.name}`);
  else if (/draconic resilience/i.test(unarmoredHint)) c.armor.unarmored = 'draconic';
  else if (/mage armou?r/i.test(near)) c.armor.unarmored = 'mage_armor';
  else if (c.classes.some((k) => k.classId === 'barbarian')) c.armor.unarmored = 'barbarian';
  else if (c.classes.some((k) => k.classId === 'monk')) c.armor.unarmored = 'monk';
  if (d.shield) (c.armor.shield = true), found.push('Shield');

  if (d.speed) c.speed = d.speed;

  // Features first: fighting styles (Archery, Defense) count in the attack and AC checks below.
  for (const f of d.features) c.features.push(blankFeature({ name: f.name, description: f.description, source: f.source ?? '', usesMax: f.uses ?? null, recharge: f.uses ? (f.recharge ?? 'long') : 'none' }));
  if (c.features.length) found.push(`${c.features.length} feature${c.features.length === 1 ? '' : 's'} and traits`);
  // Weapons keep the sheet's name ("Dragon Wing Shortbow"); their stats come from the catalog
  // (an SRD magic weapon), the base weapon in the name, or the damage the sheet wrote.
  const items = catalog?.items ?? [];
  const attackChecks: [number, number][] = [];
  for (const w of d.weapons) {
    let name = w.name;
    const pre = /^\+(\d)\s+(.+)$/.exec(name);
    if (pre && WEAPONS.some((x) => x.name.toLowerCase() === pre[2].trim().toLowerCase())) name = `${pre[2].trim()} +${pre[1]}`;
    const r = resolveItem(name, items);
    if (w.magic && !r.bonus) r.bonus = w.magic;
    let weapon = r.weapon || r.def?.weapon ? weaponFromResolved(r) : null;
    if (!weapon && (w.damage || w.notes)) weapon = parseItemText([name, w.damage && `Damage: ${w.damage}`, w.notes && `Properties: ${w.notes}`].filter(Boolean).join('\n'), items).weapon ?? null;
    const flat = !weapon && w.damage ? new RegExp(`^(\\d+)\\s+(${DAMAGE_TYPES.join('|')})`, 'i').exec(w.damage.trim()) : null;
    if (flat) weapon = blankWeapon({ name, damage: [{ dice: flat[1], type: flat[2].toLowerCase() as DamageType }] });
    if (!weapon) {
      warnings.push(`${name}: no damage was found for it, so it wasn’t added to Attacks. Add it with Attacks → More… → Paste.`);
      continue;
    }
    weapon.name = name;
    // Extra damage the sheet wrote after the main damage ("1d6+4 Piercing + 1d6 Fire").
    for (const m of (w.damage ?? '').matchAll(new RegExp(`\\+\\s*(\\d+d\\d+)\\s+(${DAMAGE_TYPES.join('|')})`, 'gi'))) {
      const part = { dice: m[1].toLowerCase(), type: m[2].toLowerCase() as DamageType };
      if (!weapon.damage.slice(1).some((x) => x.dice === part.dice && x.type === part.type)) weapon.damage.push(part);
    }
    c.weapons.push(weapon);
    if (w.attack !== undefined) attackChecks.push([c.weapons.length - 1, w.attack]);
  }
  // The sheet's attack bonus tells what the name doesn't: a magic +1, or a weapon you aren't proficient with.
  for (const [i, atk] of attackChecks) {
    const w = c.weapons[i];
    const diff = atk - weaponAttack(c, w).total;
    if (!diff) continue;
    if (!w.magicBonus && diff >= 1 && diff <= 3) {
      w.magicBonus = diff;
      found.push(`${w.name}: +${diff} magic bonus (from the sheet’s attack bonus of +${atk})`);
    } else if (diff === -pb && w.proficient) w.proficient = false;
    else warnings.push(`${w.name}: your sheet gives ${atk >= 0 ? '+' : ''}${atk} to hit; the app works out ${signedText(weaponAttack(c, w).total)}. Check the weapon’s ability, proficiency and magic bonus in Attacks.`);
  }
  if (c.weapons.length) found.push(`Weapons: ${c.weapons.map((w) => w.name).join(', ')}`);

  // Spells: the full SRD (with the app's tuned dice), then the built-in list; anything else keeps the sheet's own details.
  const known = catalog ? new Map(tunedSpells(catalog.spells).map((x) => [norm(x.name), x])) : null;
  const unknown: string[] = [];
  for (const sp of d.spells) {
    const def = known?.get(norm(sp.name));
    const lib = SPELL_BY_NORM.get(norm(sp.name));
    let spell: Spell;
    if (def) spell = spellFromDef(def, uid());
    else if (lib) spell = { ...structuredClone(lib), id: uid() };
    else {
      unknown.push(sp.name);
      spell = spellFromInfo(sp.name, sp.level, sp.info);
    }
    if (sp.prepared !== undefined) spell.prepared = sp.prepared || spell.level === 0;
    c.spells.push(spell);
  }
  if (c.spells.length) found.push(`${c.spells.length} spell${c.spells.length === 1 ? '' : 's'} (${c.spells.length - unknown.length} from the rules with dice ready)`);
  if (unknown.length) warnings.push(`These spells aren’t in the rules the app has, so they were added from what your sheet says about them: ${unknown.join(', ')}. Add the book to your rules library, or open Edit spell to fill in the rest.`);
  if (c.spells.length && !c.spellcasting.ability) {
    const caster = c.classes.map((k) => classById(k.classId)).find((k) => k.caster !== 'none');
    if (caster?.spellAbility) c.spellcasting.ability = caster.spellAbility;
  }

  // Items keep the sheet's names and counts, with the catalog's weight and description where it knows them.
  // The inventory stores the weight of one item (the total is count × weight), so a sheet's
  // weight for a whole stack is divided by the count.
  for (const i of d.items) {
    const r = resolveItem(i.name, items);
    const base = inventoryFromResolved(r, items);
    c.inventory.push({ ...base, id: uid(), name: i.name, qty: i.qty, weight: unitWeight(i, base.weight) });
    if (r.armor && r.armor.id === c.armor.armorId && r.bonus) c.armor.magicBonus = r.bonus;
  }
  if (c.inventory.length) found.push(`${c.inventory.length} item${c.inventory.length === 1 ? '' : 's'} (${inventoryWeight(c)} lb)`);
  if (d.carried !== undefined && c.inventory.length && Math.abs(inventoryWeight(c) - d.carried) > 1)
    warnings.push(`Your sheet says you carry ${d.carried} lb; the items add up to ${inventoryWeight(c)} lb. On the Gear page, each item’s weight box is the weight of one: check any item with a count above 1.`);
  Object.assign(c.currency, d.currency);
  if (d.languages) c.languages = d.languages;
  if (d.proficiencies) c.proficiencies = d.proficiencies;
  if (d.notes.length) c.notes = d.notes.join('\n\n');

  // Check the sheet's own numbers against the app's math and keep the sheet's where they differ.
  const ac = armorClass(c).total;
  if (d.ac !== undefined && d.ac !== ac) {
    c.bonus.ac = d.ac - ac;
    warnings.push(`Your sheet says AC ${d.ac}; the app worked out ${ac}. Added ${c.bonus.ac > 0 ? '+' : ''}${c.bonus.ac} as “Other AC” so it matches. Check the armor in Vitals.`);
  } else if (d.ac !== undefined) found.push(`AC ${ac} (matches your sheet)`);
  const hp = maxHp(c).total;
  if (d.hpMax !== undefined && d.hpMax > 0 && d.hpMax !== hp) {
    c.hp.maxOverride = d.hpMax;
    warnings.push(`Your sheet says ${d.hpMax} max HP; the app’s fixed-value math gives ${hp}. Kept ${d.hpMax} as a Max HP override.`);
  } else if (d.hpMax) found.push(`Max HP ${hp} (matches your sheet)`);
  c.hp.current = d.hpCurrent !== undefined ? Math.min(d.hpCurrent, maxHp(c).total) : maxHp(c).total;
  return { character: c, found, warnings };
}

/** Reads a document straight into a character. Pass the catalog so spells and items are matched against the full rules. */
export const importFromText = (text: string, fields: Record<string, string> = {}, opts: ReadOptions & { catalog?: Catalog } = {}) =>
  buildCharacter(readText(text, fields, { ...opts, spellNames: opts.spellNames ?? (opts.catalog ? new Set(opts.catalog.spells.map((x) => norm(x.name))) : undefined) }), opts.catalog);

const signedText = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The weight of one item. A sheet's inventory row gives the stack's weight (D&D Beyond: 10
 * rations, 20 lb), so it's divided by the count. Where the rules know the item's weight, that
 * decides which reading fits ("20 lb" for 10 rations is the stack; "2 lb" is one each).
 */
export function unitWeight(i: { qty: number; weight?: number; weightEach?: boolean }, known: number): number {
  const w = i.weight;
  if (w === undefined || !(w > 0)) return known;
  if (i.qty <= 1) return w;
  const each = known > 0 ? Math.abs(w - known) <= Math.abs(w - known * i.qty) : !!i.weightEach;
  return each ? w : Math.round((w / i.qty) * 10000) / 10000;
}

const CASTING: [RegExp, CastingTime, string][] = [
  [/^1?\s*(?:BA\b|bonus)/i, 'bonus', 'Bonus Action'],
  [/^1?\s*(?:R\b|reaction)/i, 'reaction', 'Reaction'],
  [/^1?\s*(?:A\b|action)/i, 'action', 'Action'],
];

/** A spell the rules don't know, from its row on the sheet: casting time, range, save or attack, damage. */
function spellFromInfo(name: string, level: number | undefined, info: SpellInfo | undefined): Spell {
  const ct = info?.castingTime?.trim() ?? '';
  const time = CASTING.find(([re]) => re.test(ct));
  const saveHit = info?.saveHit?.trim() ?? '';
  const save = /\b(STR|DEX|CON|INT|WIS|CHA)\b/i.exec(saveHit);
  const attack = /^[+-]\d/.test(saveHit);
  const notes = info?.notes ?? '';
  const damage = [...notes.matchAll(new RegExp(`(\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)\\s*(${DAMAGE_TYPES.join('|')})`, 'gi'))].map((m) => ({ dice: m[1].replace(/\s+/g, ''), type: m[2].toLowerCase() as DamageType }));
  const healing = /heal|hit points|\bH:/i.test(notes) ? (/(\d+d\d+(?:\s*[+-]\s*\d+)?)/.exec(notes)?.[1]?.replace(/\s+/g, '') ?? '') : '';
  return blankSpell({
    name,
    level: level ?? 1,
    castingTime: time?.[1] ?? (ct ? 'other' : 'action'),
    castingTimeText: time?.[2] ?? (ct || 'Action'),
    range: info?.range ?? '',
    components: info?.components ?? '',
    duration: info?.duration ?? '',
    concentration: /conc/i.test(info?.duration ?? ''),
    school: info?.school ?? '',
    resolution: healing ? 'heal' : attack ? 'attack' : save ? 'save' : damage.length ? 'auto' : 'utility',
    saveAbility: save ? (save[1].toLowerCase() as Ability) : 'dex',
    halfOnSave: !!save && damage.length > 0,
    damage,
    healing,
    element: damage[0]?.type ?? (healing ? 'healing' : 'arcane'),
    shape: attack ? 'bolt' : save ? 'burst' : 'aura',
    description: [notes && `From your sheet: ${notes}`, 'Imported from your sheet. Open Edit spell to check its dice, range and effect.'].filter(Boolean).join('\n'),
  });
}
