// Reads a character out of free-form text: a fillable sheet's form fields, a PDF's text,
// a Word/Google document, or an AI's write-up. Layouts vary endlessly, so this reads
// the common patterns ("STR 16", "Strength: 16 (+3)", ability tables, "Sorcerer 5",
// "Skills: Arcana +5", spell lists by level…) and reports what it found and what to check.
// The person reviews the result before a character is created.

import { ABILITIES, ARMOR, CLASSES, SKILLS, WEAPONS, classById, type Ability, type SkillId } from './data';
import { blankCharacter, blankFeature, blankSpell, blankWeapon, uid, type Character, type ProfLevel } from './model';
import { abilityMod, armorClass, maxHp, proficiencyBonus } from './rules';
import { SPELL_LIBRARY } from './spells';

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
  spells: { name: string; level?: number }[];
  weapons: { name: string; magic: number }[];
  features: { name: string; description: string }[];
  items: { name: string; qty: number }[];
  currency: Partial<Record<Coin, number>>;
  languages?: string;
  proficiencies?: string;
  notes: string[];
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

function readSpells(lines: string[], fields: Record<string, string>): Draft['spells'] {
  const out: Draft['spells'] = [];
  const add = (raw: string, level?: number) => {
    const name = cleanSpellName(raw);
    if (name.length < 3 || name.length > 40 || /^\d+$/.test(name) || /slot|level|save dc|attack|ability/i.test(name)) return;
    if (!out.some((s) => norm(s.name) === norm(name))) out.push({ name, level });
  };
  for (const [k, v] of Object.entries(fields)) if (/^spells?\s*\d/i.test(k) || /^spellname/i.test(norm(k))) add(v);
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
  return out;
}

function readWeapons(sections: Section[], fields: Record<string, string>, text: string): Draft['weapons'] {
  const out: Draft['weapons'] = [];
  const pool = [
    ...Object.entries(fields).filter(([k]) => /wpn|weapon|attack/i.test(k)).map(([, v]) => v),
    ...sections.filter((s) => /attack|weapon|action|equipment|inventory|gear/i.test(s.title)).flatMap((s) => s.lines),
  ].join('\n');
  const sources = pool.trim() ? [pool] : [text];
  const names = [...WEAPONS].sort((a, b) => b.name.length - a.name.length);
  for (const src of sources) {
    let rest = src;
    for (const w of names) {
      const re = new RegExp(`(?:\\+(\\d)\\s+)?\\b${w.name.replace(/ /g, '\\s+')}s?\\b`, 'i');
      const m = re.exec(rest);
      if (!m) continue;
      out.push({ name: w.name, magic: m[1] ? Number(m[1]) : 0 });
      rest = rest.replace(new RegExp(re.source, 'gi'), ' '); // so "Light Crossbow" doesn't also count as a crossbow
      if (out.length >= 6) break;
    }
  }
  return out;
}

const FEATURE_SECTION = /feature|trait|feats?\b|class abilit|special abilit|racial|species/i;
const NOTE_SECTION = /personality|ideal|bond|flaw|backstory|background story|appearance|description|notes|history|allies/i;
const ITEM_SECTION = /equipment|inventory|gear|possessions|items|treasure/i;

function readFeatures(sections: Section[], kv: Map<string, string>): Draft['features'] {
  const out: Draft['features'] = [];
  const add = (line: string) => {
    const l = stripBullet(line);
    if (l.length < 3) return;
    const m = /^([^.:]{2,50}?)[.:]\s+(.+)$/.exec(l);
    const name = (m ? m[1] : l.slice(0, 50)).trim();
    const description = m ? m[2].trim() : l.length > 50 ? l : '';
    if (out.length < 40 && !out.some((f) => norm(f.name) === norm(name))) out.push({ name, description });
  };
  const formText = get(kv, 'featuresandtraits', 'feattraits', 'features', 'traits', 'feats');
  if (formText && formText.includes('\n')) formText.split('\n').forEach(add);
  for (const s of sections) {
    if (!FEATURE_SECTION.test(s.title) || /ability scores/i.test(s.title)) continue;
    // Description lines that follow a bullet belong to it.
    for (const l of s.lines) {
      if (!l) continue;
      if (!BULLET.test(l) && out.length && !/[.:]\s/.test(l.slice(0, 52)) && out[out.length - 1].description.length < 600) {
        out[out.length - 1].description = `${out[out.length - 1].description} ${l}`.trim();
      } else add(l);
    }
  }
  return out;
}

function readItems(sections: Section[], kv: Map<string, string>): { items: Draft['items']; currency: Draft['currency'] } {
  const items: Draft['items'] = [];
  const currency: Draft['currency'] = {};
  const coin = (s: string) => {
    for (const m of s.matchAll(/(\d[\d,]*)\s*(pp|gp|ep|sp|cp)\b/gi)) currency[m[2].toLowerCase() as Coin] = Number(m[1].replace(/,/g, ''));
  };
  for (const c of ['cp', 'sp', 'ep', 'gp', 'pp'] as Coin[]) {
    const v = firstInt(kv.get(c));
    if (v !== undefined) currency[c] = v;
  }
  const add = (raw: string) => {
    let l = stripBullet(raw);
    coin(l);
    l = l.replace(/(\d[\d,]*)\s*(pp|gp|ep|sp|cp)\b/gi, '').replace(/^[,;\s]+|[,;\s]+$/g, '');
    if (l.length < 2 || l.length > 80) return;
    let qty = 1;
    let m = /^(\d+)\s*[x×]?\s+(.+)$/i.exec(l);
    if (m) (qty = Number(m[1])), (l = m[2]);
    m = /^(.+?)\s*(?:\((\d+)\)|[x×]\s*(\d+))$/i.exec(l);
    if (m) (qty = Number(m[2] ?? m[3])), (l = m[1]);
    items.push({ name: l.trim(), qty });
  };
  const form = kv.get('equipment');
  if (form && form.includes('\n')) form.split('\n').forEach(add);
  for (const s of sections) {
    if (!ITEM_SECTION.test(s.title)) continue;
    for (const l of s.lines) {
      if (!l) continue;
      if (!BULLET.test(l) && l.includes(',')) l.split(/[,;]/).forEach(add);
      else add(l);
    }
  }
  return { items: items.slice(0, 60), currency };
}

/** Reads a document's text (and any form fields) into a Draft. */
export function readText(text: string, fields: Record<string, string> = {}): Draft {
  const d = emptyDraft();
  const fieldLines = Object.entries(fields).flatMap(([k, v]) => (v.includes('\n') ? [] : [`${k}: ${v}`]));
  const lines = [...fieldLines, ...text.split(/\r?\n/).flatMap(splitLabelled)].map(cleanLine);
  const all = lines.join('\n');
  const kv = keyValues(lines, fields);
  const sections = sectionsOf(lines);

  d.name = get(kv, 'charactername', 'name', 'charactername2', 'pcname');
  if (!d.name) {
    const h = lines.find((l) => /^#\s/.test(l)) ?? lines.find((l) => l && l.length <= 40 && !/[:|]/.test(l) && !headingOf(l));
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

  d.armorHints.push(...sections.filter((s) => ITEM_SECTION.test(s.title) || /armou?r/i.test(s.title)).flatMap((s) => s.lines), get(kv, 'equipment', 'armor', 'armour') ?? '');
  d.shield = [d.acNote ?? '', ...d.armorHints].some((h) => /\bshield\b(?!\s+(?:spell|of faith))/i.test(h));
  d.spells = readSpells(lines, fields);
  d.weapons = readWeapons(sections, fields, all);
  d.features = readFeatures(sections, kv);
  const inv = readItems(sections, kv);
  d.items = inv.items;
  d.currency = inv.currency;
  d.languages = get(kv, 'languages', 'language');
  const profs = lines
    .map(stripBullet)
    .filter((l) => /^(armou?r|weapons?|tools?|tool proficienc(?:y|ies)|other proficiencies)\s*(?:proficienc(?:y|ies))?\s*[:=]/i.test(l));
  const formProfs = get(kv, 'proficiencieslang', 'otherproficienciesandlanguages', 'proficiencies');
  d.proficiencies = [...profs, ...(formProfs ? [formProfs] : [])].join('\n') || undefined;
  for (const s of sections) if (NOTE_SECTION.test(s.title) && s.lines.some(Boolean)) d.notes.push(`${s.title}\n${s.lines.filter(Boolean).join('\n')}`);
  for (const k of ['personalitytraits', 'ideals', 'bonds', 'flaws', 'backstory', 'characterbackstory', 'appearance']) {
    const v = kv.get(k);
    if (v) d.notes.push(`${k.replace('characterbackstory', 'backstory')}: ${v}`);
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
  "weapons": ["Dagger"],
  "features": [{ "name": "", "description": "" }],
  "equipment": ["Explorer's pack"],
  "coins": { "gp": 0 },
  "languages": "", "proficiencies": "", "notes": ""
}

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
    const name = typeof w === 'string' ? w : str((w as Record<string, unknown>)?.name);
    const def = name ? WEAPONS.find((x) => new RegExp(`\\b${x.name}\\b`, 'i').test(name)) : undefined;
    if (def) d.weapons.push({ name: def.name, magic: firstInt(/\+(\d)/.exec(name!)?.[1]) ?? 0 });
  }
  for (const f of Array.isArray(data.features) ? data.features : []) {
    const o = f as Record<string, unknown>;
    if (str(o?.name)) d.features.push({ name: str(o.name)!, description: str(o.description) ?? '' });
  }
  for (const e of Array.isArray(data.equipment) ? data.equipment : []) if (str(e)) d.items.push({ name: str(e)!, qty: 1 });
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
export function buildCharacter(d: Draft): ImportResult {
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

  for (const w of d.weapons) {
    const def = WEAPONS.find((x) => x.name === w.name)!;
    c.weapons.push(blankWeapon({ name: w.magic ? `${def.name} +${w.magic}` : def.name, damage: [{ dice: def.dice, type: def.type }], finesse: !!def.finesse, ranged: def.ranged, properties: def.properties, mastery: def.mastery, magicBonus: w.magic }));
  }
  if (c.weapons.length) found.push(`Weapons: ${c.weapons.map((w) => w.name).join(', ')}`);

  const unknown: string[] = [];
  for (const s of d.spells) {
    const lib = SPELL_BY_NORM.get(norm(s.name));
    if (lib) c.spells.push({ ...structuredClone(lib), id: uid() });
    else {
      unknown.push(s.name);
      c.spells.push(blankSpell({ name: s.name, level: s.level ?? 1, resolution: 'utility', element: 'arcane', shape: 'aura', description: 'Imported by name. Open Edit spell to add its dice, range and effect.' }));
    }
  }
  if (c.spells.length) found.push(`${c.spells.length} spell${c.spells.length === 1 ? '' : 's'} (${c.spells.length - unknown.length} with dice ready)`);
  if (unknown.length) warnings.push(`These spells aren’t in the built-in list, so they were added by name only: ${unknown.join(', ')}.`);
  if (c.spells.length && !c.spellcasting.ability) {
    const caster = c.classes.map((k) => classById(k.classId)).find((k) => k.caster !== 'none');
    if (caster?.spellAbility) c.spellcasting.ability = caster.spellAbility;
  }

  for (const f of d.features) c.features.push(blankFeature({ name: f.name, description: f.description, usesMax: null, recharge: 'none' }));
  if (c.features.length) found.push(`${c.features.length} feature${c.features.length === 1 ? '' : 's'} and traits`);
  for (const i of d.items) c.inventory.push({ id: uid(), name: i.name, qty: i.qty, weight: 0, notes: '' });
  if (c.inventory.length) found.push(`${c.inventory.length} item${c.inventory.length === 1 ? '' : 's'}`);
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

export const importFromText = (text: string, fields: Record<string, string> = {}) => buildCharacter(readText(text, fields));
