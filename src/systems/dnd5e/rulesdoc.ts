// Reading a rules document (your homebrew PDF, a supplement, a Word file of house rules)
// into the rules library. Everything becomes searchable sections, and anything laid out
// the way D&D books lay things out is turned into content the sheet can use:
//
//   spells        name, then "Level 3 Evocation (Wizard)" or "3rd-level evocation", then
//                 Casting Time / Range / Components / Duration
//   creatures     name, then "Medium Beast, Unaligned", then AC / HP / Speed…
//   feats         name, then "General Feat (Prerequisite: …)"
//   classes       a "Hit Point Die: D10 per Fighter level" block with "Level 1: Feature"
//                 headings (2024 layout) or a level table (2014 layout)
//
// Free-form rules can't be read reliably by patterns, so there's also a JSON format that an
// AI chat can produce from any document (RULES_AI_PROMPT); it's validated before import.

import { ABILITIES, ABILITY_NAMES, type Ability } from './data';
import type { CastingTime, Companion } from './model';
import type { Element as FxElement, Shape } from '../../fx/types';
import type { Catalog, ClassDef, ClassFeatureDef, CreatureDef, FeatDef, SpellDef, Steps, SubclassDef } from './srd';
import { companionFromCreature, parseStatBlock, pbForCr } from './statblock';

export interface Section {
  id: string;
  title: string;
  /** 1 = chapter, 2 = section, 3 = subsection. */
  level: number;
  text: string;
}

export interface RulesContent {
  classes: ClassDef[];
  subclasses: SubclassDef[];
  feats: FeatDef[];
  spells: SpellDef[];
  creatures: CreatureDef[];
}

export interface ReadResult extends RulesContent {
  sections: Section[];
  notes: string[];
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ABILITY_WORD: Record<string, Ability> = Object.fromEntries(ABILITIES.map((a) => [ABILITY_NAMES[a].toLowerCase(), a])) as Record<string, Ability>;
const DAMAGE = 'Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder';
const SCHOOLS = 'Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation';
const SCHOOL_ELEMENT: Record<string, FxElement> = { abjuration: 'arcane', conjuration: 'force', divination: 'arcane', enchantment: 'psychic', evocation: 'arcane', illusion: 'shadow', necromancy: 'necrotic', transmutation: 'nature' };

// ── Sections ─────────────────────────────────────────────────────────────────

function headingLevel(line: string): number {
  const md = /^(#{1,6})\s+\S/.exec(line);
  if (md) return Math.min(3, md[1].length);
  return 0;
}

/** Splits a document into titled sections at its headings (Markdown #, or the PDF reader's). */
export function splitSections(text: string): Section[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: Section[] = [];
  // Text before the first heading becomes an "Introduction"; a heading with no text of its own is kept (it may head subsections).
  let cur: Section = { id: 's0', title: 'Introduction', level: 1, text: '' };
  let implicit = true;
  const flush = () => {
    cur.text = cur.text.trim();
    if (cur.text || !implicit) out.push(cur);
  };
  for (const raw of lines) {
    const level = headingLevel(raw.trim());
    if (level) {
      flush();
      implicit = false;
      cur = { id: `s${out.length}`, title: raw.trim().replace(/^#+\s*/, '').replace(/\s*#+$/, ''), level, text: '' };
    } else cur.text += `${raw}\n`;
  }
  flush();
  return out.filter((s, i) => s.text || out[i + 1]?.level > s.level || out.length === 1);
}

// ── Spells ───────────────────────────────────────────────────────────────────

const LEVEL_2024 = new RegExp(`^(?:Level (\\d) (${SCHOOLS})|(${SCHOOLS}) Cantrip)\\b\\s*(?:\\(([^)]*)\\))?`, 'i');
const LEVEL_2014 = new RegExp(`^(?:(\\d)(?:st|nd|rd|th)-level (${SCHOOLS})|(${SCHOOLS}) cantrip)\\b\\s*(\\(ritual\\))?`, 'i');

const field = (lines: string[], name: string) => {
  const l = lines.find((x) => new RegExp(`^${name}:\\s*`, 'i').test(x));
  return l ? l.replace(new RegExp(`^${name}:\\s*`, 'i'), '').trim() : '';
};

function castingTimeOf(text: string): [CastingTime, string] {
  if (/bonus action/i.test(text)) return ['bonus', 'Bonus Action'];
  if (/reaction/i.test(text)) return ['reaction', 'Reaction'];
  if (/^(1 )?action\b/i.test(text)) return ['action', 'Action'];
  return ['other', text.replace(/,.*$/, '')];
}

/** What a spell does, read from its text: attack or save, damage, healing, upcasting. */
export function spellMechanics(desc: string, level: number, range: string) {
  const attack = (/make a (ranged|melee) spell attack/i.exec(desc) ?? [])[1]?.toLowerCase();
  const saveWord = (/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(desc) ?? [])[1];
  const save = saveWord ? ABILITY_WORD[saveWord.toLowerCase()] : undefined;
  const dmg = new RegExp(`(\\d+d\\d+(?:\\s*\\+\\s*\\d+)?) (${DAMAGE}) damage`, 'i').exec(desc);
  const damage = dmg ? [{ dice: dmg[1].replace(/\s+/g, ''), type: dmg[2].toLowerCase() as never }] : [];
  const heal = /regains? (?:a number of )?Hit Points (?:equal to )?(\d+d\d+)(?: plus your spellcasting ability modifier)?/i.exec(desc);
  const healing = heal ? `${heal[1]}${/plus your spellcasting ability modifier/i.test(heal[0]) ? '+{MOD}' : ''}` : '';
  const upcast = /(?:increases|Healing increases) by (\d+d\d+) for each (?:spell )?slot level above/i.exec(desc);
  const resolution = healing ? 'heal' : attack ? 'attack' : save ? 'save' : damage.length ? 'auto' : 'utility';
  const element: FxElement = damage[0]?.type ?? (healing ? 'healing' : 'arcane');
  const area = /(Cone|Line|Sphere|Cube|Cylinder|Emanation)\b/.exec(desc)?.[1]?.toLowerCase();
  const self = /^self/i.test(range);
  const shape: Shape = area
    ? area === 'cone'
      ? 'cone'
      : area === 'line'
        ? 'line'
        : area === 'emanation' || self
          ? 'aura'
          : area === 'cylinder'
            ? 'rain'
            : 'burst'
    : /^touch/i.test(range) || attack === 'melee'
      ? 'touch'
      : self
        ? 'aura'
        : attack
          ? 'bolt'
          : save
            ? 'ray'
            : 'bolt';
  return {
    resolution,
    saveAbility: save ?? 'dex',
    halfOnSave: /half as much damage on a successful/i.test(desc),
    damage,
    healing,
    upcastDice: upcast ? upcast[1] : '',
    scaling: level === 0 && damage.length && /Cantrip Upgrade|increases by \d+d\d+ when you reach (?:levels? )?5/i.test(desc) ? 'cantrip_dice' : 'none',
    element,
    shape,
  } as const;
}

/** Finds spells written in either edition's layout. */
export function readSpells(lines: string[], source: string): SpellDef[] {
  const starts: number[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if ((LEVEL_2024.test(lines[i + 1]) || LEVEL_2014.test(lines[i + 1])) && lines.slice(i + 2, i + 8).some((l) => /^Casting Time:/i.test(l)) && lines[i].length < 60) starts.push(i);
  }
  return starts.map((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : Math.min(lines.length, start + 80);
    const block = lines.slice(start, end).filter((l) => !headingLevel(l));
    const name = block[0].replace(/^#+\s*/, '').trim();
    const m24 = LEVEL_2024.exec(block[1]);
    const m14 = LEVEL_2014.exec(block[1]);
    const level = Number(m24?.[1] ?? m14?.[1] ?? 0);
    const school = (m24?.[2] ?? m24?.[3] ?? m14?.[2] ?? m14?.[3] ?? 'Evocation').replace(/^./, (c) => c.toUpperCase());
    const classes = (m24?.[4] ?? '').split(',').map((s) => slug(s)).filter(Boolean);
    const [castingTime, castingTimeText] = castingTimeOf(field(block, 'Casting Time'));
    const range = field(block, 'Range');
    const duration = field(block, 'Duration');
    const fieldsEnd = Math.max(...['Casting Time', 'Range', 'Components', 'Duration'].map((f) => block.findIndex((l) => new RegExp(`^${f}:`, 'i').test(l))));
    const description = block.slice(fieldsEnd + 1).join('\n');
    return {
      name,
      level,
      school,
      classes,
      castingTime,
      castingTimeText,
      range,
      components: field(block, 'Components'),
      duration,
      concentration: /concentration/i.test(duration),
      ritual: /ritual/i.test(block[1]) || /ritual/i.test(field(block, 'Casting Time')),
      instances: 1,
      upcastInstances: 0,
      ...spellMechanics(description, level, range),
      description,
      srd: `${slug(source)}:${slug(name)}`,
      source,
    } satisfies SpellDef;
  });
}

// ── Feats ────────────────────────────────────────────────────────────────────

const FEAT_LINE = /^(Origin|General|Fighting Style|Epic Boon) Feat\b\s*(?:\(Prerequisites?:\s*([^)]+)\))?/i;

export function readFeats(lines: string[], source: string): FeatDef[] {
  const out: FeatDef[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const m = FEAT_LINE.exec(lines[i + 1]);
    if (!m || lines[i].length > 60) continue;
    const body: string[] = [];
    for (let j = i + 2; j < lines.length && !(j + 1 < lines.length && FEAT_LINE.test(lines[j + 1])) && !headingLevel(lines[j]); j++) body.push(lines[j]);
    const prereq = m[2] ?? '';
    const abilities = ABILITIES.filter((a) => new RegExp(`Increase your[^.]*\\b${ABILITY_NAMES[a]}\\b`, 'i').test(body.join(' ')));
    out.push({
      id: `${slug(source)}:${slug(lines[i])}`,
      name: lines[i].replace(/^#+\s*/, ''),
      category: slug(m[1]),
      repeatable: /\brepeatable\b/i.test(body.join(' ')),
      minLevel: Number((/Level (\d+)\+/i.exec(prereq) ?? [0, 1])[1]),
      abilities,
      text: [prereq ? `Prerequisite: ${prereq}` : '', ...body].filter(Boolean).join('\n'),
      source,
    });
  }
  return out;
}

// ── Creatures ────────────────────────────────────────────────────────────────

const TYPE_LINE = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b.*\b(Aberration|Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Monstrosity|Ooze|Plant|Undead)\b/i;

/** A rules creature from a parsed companion (library creatures keep the companion as their template). */
export function creatureFromCompanion(c: Companion, source: string): CreatureDef {
  const cr = c.cr ? (c.cr.includes('/') ? Number(c.cr.split('/')[0]) / Number(c.cr.split('/')[1]) : Number(c.cr)) : 0;
  return {
    srd: `${slug(source)}:${slug(c.name)}`,
    name: c.name,
    size: c.size,
    type: c.type.toLowerCase(),
    ac: Number(c.ac) || 0,
    hp: Number(c.maxHp) || c.hp,
    hitDice: '',
    speed: c.speed,
    abilities: { ...c.abilities },
    saves: c.saves,
    skills: c.skills ? c.skills.split(/,\s*/) : [],
    senses: c.senses,
    languages: c.languages,
    cr: Number.isFinite(cr) ? cr : 0,
    actions: c.actions.map((a) => ({ kind: a.kind, name: a.name, text: a.text })),
    companion: { ...c, source },
    source,
  };
}

export function readCreatures(lines: string[], source: string): CreatureDef[] {
  const starts: number[] = [];
  for (let i = 0; i + 1 < lines.length; i++) if (TYPE_LINE.test(lines[i + 1]) && lines[i].length < 60 && lines.slice(i + 2, i + 6).some((l) => /^(AC|Armor Class|HP|Hit Points)\b/i.test(l))) starts.push(i);
  return starts.flatMap((start, k) => {
    let end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const heading = lines.slice(start + 1, end).findIndex((l) => headingLevel(l) > 0);
    if (heading >= 0) end = start + 1 + heading;
    const parsed = parseStatBlock(lines.slice(start, end).join('\n'));
    return parsed ? [creatureFromCompanion(parsed, source)] : [];
  });
}

// ── Classes ──────────────────────────────────────────────────────────────────

const HIT_DIE = /^Hit (?:Point )?Dic?e:\s*(?:1)?[dD](\d+)\s+per\s+(.+?)\s+level/i;

function usesFrom(text: string): Steps<number> | string | undefined {
  const words: Record<string, number> = { once: 1, twice: 2, two: 2, three: 3, four: 4, five: 5 };
  const n = /use (?:this feature|it) (once|twice|two|three|four|five|\d+)(?: times)?\b/i.exec(text);
  if (n) return [[1, words[n[1].toLowerCase()] ?? Number(n[1])]];
  const mod = /a number of times equal to your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier/i.exec(text);
  if (mod) return `mod:${ABILITY_WORD[mod[1].toLowerCase()]}`;
  if (/a number of times equal to your Proficiency Bonus/i.test(text)) return 'pb';
  return undefined;
}

function featureDef(id: string, name: string, level: number, text: string): ClassFeatureDef {
  const uses = usesFrom(text);
  const recharge = /Short or Long Rest|finish a Short Rest/i.test(text) ? 'short' : /Long Rest/i.test(text) ? 'long' : undefined;
  return {
    key: slug(name),
    id,
    name,
    level,
    text,
    ...(uses ? { uses } : {}),
    ...(uses && recharge ? { recharge } : {}),
    castingTime: /\bBonus Action\b/.test(text) ? 'bonus' : /\bReaction\b/.test(text) ? 'reaction' : /\bMagic action\b|\bas an action\b/i.test(text) ? 'action' : 'other',
  };
}

/**
 * Classes laid out like the 2024 rules: a "Hit Point Die: D10 per <Class> level" line, the
 * saving throws and primary ability, and features under "Level N: Name". Subclasses are
 * headed "<Name> (<Class> Subclass)" or "<Class> Subclass: <Name>".
 */
export function readClasses(lines: string[], source: string): { classes: ClassDef[]; subclasses: SubclassDef[] } {
  const classes: ClassDef[] = [];
  const subclasses: SubclassDef[] = [];
  const starts = lines.map((l, i) => (HIT_DIE.test(l) ? i : -1)).filter((i) => i >= 0);
  starts.forEach((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const hd = HIT_DIE.exec(lines[start])!;
    const name = hd[2].replace(/^the\s+/i, '').trim();
    const block = lines.slice(start, end);
    const id = `${slug(source)}:${slug(name)}`;
    const abilitiesIn = (s: string) => ABILITIES.filter((a) => new RegExp(`\\b${ABILITY_NAMES[a]}\\b`, 'i').test(s));
    const saves = abilitiesIn(field(block, 'Saving Throw Proficiencies') || field(block, 'Saving Throws'));
    const primaryText = field(block, 'Primary Ability');
    const primary = abilitiesIn(primaryText);
    const cls: ClassDef = {
      id,
      name: name.replace(/^./, (c) => c.toUpperCase()),
      hitDie: Number(hd[1]),
      multiclass: / or /i.test(primaryText) ? { any: primary } : { all: primary },
      saves,
      armor: [],
      weapons: [],
      multiclassArmor: [],
      multiclassWeapons: [],
      skills: null,
      subclassLevel: 3,
      asiLevels: [],
      epicBoonLevel: null,
      cantrips: null,
      prepared: null,
      features: [],
      source,
    };
    let target: ClassDef | SubclassDef = cls;
    let feature: { name: string; level: number; text: string[] } | null = null;
    const close = () => {
      if (!feature) return;
      const fid = `${target.id}:${slug(feature.name)}`;
      target.features.push(featureDef(fid, feature.name, feature.level, feature.text.join('\n').trim()));
      if (/Ability Score Improvement/i.test(feature.name) && target === cls) cls.asiLevels.push(feature.level);
      if (/Subclass/i.test(feature.name) && target === cls) cls.subclassLevel = Math.min(cls.subclassLevel, feature.level);
      feature = null;
    };
    for (const raw of block.slice(1)) {
      const l = raw.replace(/^#+\s*/, '');
      const sub = /^(.+?)\s*\((\w+) Subclass\)$/i.exec(l) ?? (/^(\w+) Subclass:\s*(.+)$/i.exec(l) && [l, /^(\w+) Subclass:\s*(.+)$/i.exec(l)![2], name]);
      if (sub) {
        close();
        const s: SubclassDef = { id: `${slug(source)}:${slug(sub[1])}`, name: sub[1].trim(), classId: id, text: '', features: [], source };
        subclasses.push(s);
        target = s;
        continue;
      }
      const lvl = /^Level (\d+):\s*(.+)$/i.exec(l);
      if (lvl) {
        close();
        feature = { name: lvl[2].trim(), level: Number(lvl[1]), text: [] };
        continue;
      }
      if (feature) feature.text.push(raw);
      else if (target !== cls && !(target as SubclassDef).text) (target as SubclassDef).text = l;
    }
    close();
    // Features titled "Ability Score Improvement" stand for the ASI levels, not sheet features.
    cls.features = cls.features.map((f) => (/Ability Score Improvement/i.test(f.name) ? { ...f, key: 'ability-score-improvement' } : f));
    classes.push(cls);
  });
  return { classes, subclasses };
}

// ── A whole document ─────────────────────────────────────────────────────────

const lineList = (text: string) =>
  text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\*\*|__/g, '').replace(/[‘’]/g, "'").replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

export function readRulesDocument(text: string, source: string): ReadResult {
  const lines = lineList(text);
  const { classes, subclasses } = readClasses(lines, source);
  const result: ReadResult = {
    sections: splitSections(text),
    classes,
    subclasses,
    feats: readFeats(lines, source),
    spells: readSpells(lines, source),
    creatures: readCreatures(lines, source),
    notes: [],
  };
  if (!classes.length && !result.spells.length && !result.creatures.length && !result.feats.length) {
    result.notes.push('No spells, creatures, feats or classes were laid out in a way the reader recognises. The text is still searchable; for the rest, use the AI conversion.');
  }
  return result;
}

// ── The AI bridge ────────────────────────────────────────────────────────────

export const RULES_AI_PROMPT = `Convert the tabletop RPG rules below into JSON for a character-sheet app, exactly in this shape. Include only what the rules actually define; leave out empty lists. Keep rules text faithful (you may shorten long passages). Use these lowercase ability ids: str, dex, con, int, wis, cha.

{
  "format": "arcane-tome-rules",
  "name": "<the game or book's name>",
  "rules": [ { "title": "<section title>", "text": "<rules text>" } ],
  "classes": [ {
    "name": "<class>", "hitDie": 10, "primaryAbilities": ["str"], "primaryAny": false,
    "savingThrows": ["str", "con"], "subclassLevel": 3, "asiLevels": [4, 8, 12, 16],
    "spellcasting": { "ability": "int", "progression": "full | half | third | pact | none",
      "cantrips": [<20 numbers, one per level>], "prepared": [<20 numbers>] },
    "features": [ { "level": 1, "name": "<feature>", "text": "<what it does>",
      "uses": <number, or "pb", or an ability id for "uses equal to that modifier">,
      "recharge": "short | long", "roll": "<dice like 1d10 + {LEVEL}, optional>" } ]
  } ],
  "subclasses": [ { "name": "<subclass>", "class": "<class name>", "features": [ <same as class features> ] } ],
  "feats": [ { "name": "<feat>", "category": "origin | general | fighting-style | epic-boon", "prerequisite": "<text>", "abilities": ["str"], "text": "<what it does>" } ],
  "spells": [ { "name": "<spell>", "level": 0, "school": "<school>", "classes": ["wizard"], "castingTime": "Action",
    "range": "60 feet", "components": "V, S", "duration": "Instantaneous", "concentration": false, "ritual": false,
    "attack": "ranged | melee | null", "save": "dex | null", "halfOnSave": true,
    "damage": [ { "dice": "8d6", "type": "fire" } ], "healing": "<dice, optional>", "upcast": "<extra dice per slot level, optional>",
    "text": "<description>" } ],
  "creatures": [ { "name": "<creature>", "size": "Medium", "type": "Beast", "ac": "13", "hp": "22",
    "speed": "30 ft.", "abilities": { "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10 },
    "saves": ["dex"], "skills": "Perception +3", "senses": "", "languages": "", "cr": 1,
    "actions": [ { "kind": "trait | action | bonus | reaction | legendary", "name": "<name>", "text": "<what it does>",
      "attack": "melee | ranged | null", "toHit": "5", "reach": "5 ft.", "damage": "1d8 + 3", "damageType": "piercing",
      "save": "con | null", "dc": "12" } ] } ]
}

Where a number depends on the character (a companion's AC, a feature's uses), write it with these tokens: {PB} proficiency bonus, {LEVEL} character level, {LEVEL:<class>} that class's level, {SPELLATK} spell attack bonus, {SPELLDC} spell save DC, {STR} … {CHA} ability modifiers. Answer with the JSON only.

The rules:
`;

export const looksLikeRulesJson = (data: unknown): boolean => !!data && typeof data === 'object' && (data as { format?: unknown }).format === 'arcane-tome-rules';

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const ability = (v: unknown): Ability | undefined => (typeof v === 'string' && (ABILITIES as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as Ability) : undefined);
const per20 = (v: unknown): Steps<number> | null => {
  const a = arr<number>(v).map(Number);
  if (a.length !== 20 || a.some((n) => !Number.isFinite(n))) return null;
  const out: Steps<number> = [];
  a.forEach((n, i) => (!out.length || out[out.length - 1][1] !== n) && out.push([i + 1, n]));
  return out;
};

/** Validates an AI's JSON and turns it into library content. Unknown fields are ignored. */
export function readRulesJson(data: unknown, fallbackName: string): ReadResult & { name: string } {
  const d = data as Record<string, unknown>;
  const name = str(d.name, fallbackName) || fallbackName;
  const source = name;
  const features = (owner: string, list: unknown): ClassFeatureDef[] =>
    arr<Record<string, unknown>>(list).map((f) => {
      const fname = str(f.name, 'Feature');
      const def = featureDef(`${owner}:${slug(fname)}`, fname, Math.max(1, Math.min(20, Number(f.level) || 1)), str(f.text));
      const uses = f.uses;
      if (typeof uses === 'number') def.uses = [[1, uses]];
      else if (uses === 'pb') def.uses = 'pb';
      else if (ability(uses)) def.uses = `mod:${ability(uses)}`;
      if (def.uses) def.recharge = f.recharge === 'short' ? 'short' : 'long';
      if (typeof f.roll === 'string' && f.roll.trim()) def.roll = [[1, f.roll.replace(/\s+/g, '')]];
      if (/Ability Score Improvement/i.test(fname)) def.key = 'ability-score-improvement';
      return def;
    });
  const classes: (ClassDef & { caster?: string; spellAbility?: Ability | null })[] = arr<Record<string, unknown>>(d.classes).map((k) => {
    const id = `${slug(source)}:${slug(str(k.name, 'class'))}`;
    const sc = (k.spellcasting ?? {}) as Record<string, unknown>;
    const primary = arr<string>(k.primaryAbilities).map(ability).filter((a): a is Ability => !!a);
    return {
      id,
      name: str(k.name, 'Class'),
      hitDie: [4, 6, 8, 10, 12, 20].includes(Number(k.hitDie)) ? Number(k.hitDie) : 8,
      multiclass: k.primaryAny ? { any: primary } : { all: primary },
      saves: arr<string>(k.savingThrows).map(ability).filter((a): a is Ability => !!a),
      armor: [],
      weapons: [],
      multiclassArmor: [],
      multiclassWeapons: [],
      skills: null,
      subclassLevel: Number(k.subclassLevel) || 3,
      asiLevels: arr<number>(k.asiLevels).map(Number).filter((n) => n >= 1 && n <= 20),
      epicBoonLevel: null,
      cantrips: per20(sc.cantrips),
      prepared: per20(sc.prepared),
      features: features(id, k.features),
      caster: ['full', 'half', 'third', 'pact'].includes(str(sc.progression)) ? str(sc.progression) : 'none',
      spellAbility: ability(sc.ability) ?? null,
      source,
    };
  });
  const subclasses: SubclassDef[] = arr<Record<string, unknown>>(d.subclasses).map((s) => {
    const id = `${slug(source)}:${slug(str(s.name, 'subclass'))}`;
    const cls = classes.find((k) => k.name.toLowerCase() === str(s.class).toLowerCase());
    return { id, name: str(s.name, 'Subclass'), classId: cls?.id ?? slug(str(s.class)), text: str(s.text), features: features(id, s.features), source };
  });
  const feats: FeatDef[] = arr<Record<string, unknown>>(d.feats).map((f) => ({
    id: `${slug(source)}:${slug(str(f.name, 'feat'))}`,
    name: str(f.name, 'Feat'),
    category: ['origin', 'general', 'fighting-style', 'epic-boon'].includes(str(f.category)) ? str(f.category) : 'general',
    repeatable: !!f.repeatable,
    minLevel: Number((/Level (\d+)/i.exec(str(f.prerequisite)) ?? [0, 1])[1]),
    abilities: arr<string>(f.abilities).map(ability).filter((a): a is Ability => !!a),
    text: [str(f.prerequisite) ? `Prerequisite: ${str(f.prerequisite)}` : '', str(f.text)].filter(Boolean).join('\n'),
    source,
  }));
  const spells: SpellDef[] = arr<Record<string, unknown>>(d.spells).map((s) => {
    const level = Math.max(0, Math.min(9, Number(s.level) || 0));
    const text = str(s.text);
    const range = str(s.range);
    const auto = spellMechanics(text, level, range);
    const damage = arr<Record<string, unknown>>(s.damage)
      .map((p) => ({ dice: str(p.dice).replace(/\s+/g, ''), type: str(p.type).toLowerCase() as never }))
      .filter((p) => /^\d*d\d+/.test(p.dice));
    const save = ability(s.save);
    const attack = s.attack === 'ranged' || s.attack === 'melee' ? s.attack : undefined;
    const healing = str(s.healing).replace(/\s+/g, '');
    const [castingTime, castingTimeText] = castingTimeOf(str(s.castingTime, 'Action'));
    return {
      name: str(s.name, 'Spell'),
      level,
      school: str(s.school, 'Evocation'),
      classes: arr<string>(s.classes).map(slug),
      castingTime,
      castingTimeText,
      range,
      components: str(s.components),
      duration: str(s.duration),
      concentration: !!s.concentration,
      ritual: !!s.ritual,
      resolution: healing ? 'heal' : attack ? 'attack' : save ? 'save' : damage.length ? 'auto' : auto.resolution,
      saveAbility: save ?? auto.saveAbility,
      halfOnSave: s.halfOnSave === undefined ? auto.halfOnSave : !!s.halfOnSave,
      damage: damage.length ? damage : [...auto.damage],
      healing: healing || auto.healing,
      upcastDice: str(s.upcast).replace(/\s+/g, '') || auto.upcastDice,
      instances: 1,
      upcastInstances: 0,
      scaling: auto.scaling,
      element: ((damage[0]?.type as string) || (healing ? 'healing' : SCHOOL_ELEMENT[str(s.school).toLowerCase()] ?? auto.element)) as FxElement,
      shape: auto.shape,
      description: text,
      srd: `${slug(source)}:${slug(str(s.name))}`,
      source,
    };
  });
  const creatures: CreatureDef[] = arr<Record<string, unknown>>(d.creatures).map((k) => {
    const abilities = Object.fromEntries(ABILITIES.map((a) => [a, Number((k.abilities as Record<string, unknown> | undefined)?.[a]) || 10])) as Record<Ability, number>;
    const cr = Number(k.cr) || 0;
    const comp = companionFromCreature({
      srd: slug(str(k.name)),
      name: str(k.name, 'Creature'),
      size: str(k.size, 'Medium'),
      type: str(k.type, 'beast').toLowerCase(),
      ac: Number(k.ac) || 10,
      hp: Number(k.hp) || 1,
      hitDice: '',
      speed: str(k.speed, '30 ft.'),
      abilities,
      saves: arr<string>(k.saves).map(ability).filter((a): a is Ability => !!a),
      skills: str(k.skills) ? str(k.skills).split(/,\s*/) : [],
      senses: str(k.senses),
      languages: str(k.languages),
      cr,
      actions: arr<Record<string, unknown>>(k.actions).map((a) => ({
        kind: str(a.kind, 'action'),
        name: str(a.name, 'Action'),
        text: str(a.text),
        ...(a.attack === 'melee' || a.attack === 'ranged' ? { attack: a.attack } : {}),
        ...(ability(a.save) ? { save: ability(a.save) } : {}),
      })),
      source,
    });
    // Formulas (AC 13 + {PB}) and the action numbers come through as written.
    comp.ac = str(k.ac, comp.ac);
    comp.maxHp = str(k.hp, comp.maxHp);
    comp.pb = str(k.pb, cr ? String(pbForCr(cr)) : comp.pb);
    arr<Record<string, unknown>>(k.actions).forEach((a, i) => {
      const act = comp.actions[i];
      if (!act) return;
      if (a.toHit !== undefined) act.toHit = str(a.toHit);
      if (a.reach !== undefined) act.reach = str(a.reach);
      if (a.damage !== undefined) act.damage = str(a.damage);
      if (a.damageType !== undefined) act.damageType = str(a.damageType).toLowerCase();
      if (a.dc !== undefined) act.dc = str(a.dc);
    });
    return creatureFromCompanion(comp, source);
  });
  const sections: Section[] = arr<Record<string, unknown>>(d.rules).map((r, i) => ({ id: `s${i}`, title: str(r.title, `Section ${i + 1}`), level: 2, text: str(r.text) }));
  return { name, sections, classes, subclasses, feats, spells, creatures, notes: [] };
}

/** Counts for a summary line. */
export const contentCounts = (c: Partial<RulesContent>) => ({
  classes: c.classes?.length ?? 0,
  subclasses: c.subclasses?.length ?? 0,
  feats: c.feats?.length ?? 0,
  spells: c.spells?.length ?? 0,
  creatures: c.creatures?.length ?? 0,
});

export type { Catalog };
