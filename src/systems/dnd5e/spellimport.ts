// Reading spells out of pasted text or a document: a book page, a homebrew Word file, a
// copy from D&D Beyond, or notes. Every spell has a casting time, so each one is found from
// its "Casting Time" line, with its name and header read from just above it. Layouts:
//
//   2024 book   Fireball / Level 3 Evocation (Sorcerer, Wizard) / Casting Time: Action …
//   2014 book   Fireball / 3rd-level evocation / Casting Time: 1 action …
//   D&D Beyond  Fireball / LEVEL / 3rd / CASTING TIME / 1 Action / … / Available For: Sorcerer Wizard
//   notes       Frost Lance (2nd-level evocation, wizard) / Casting time: 1 action …
//               Frost Lance / Level: 2 / School: Evocation / Classes: Wizard, Sorcerer / …

import type { Ability } from './data';
import type { CastingTime } from './model';
import { readRulesJson, looksLikeRulesJson, slug, spellMechanics } from './rulesdoc';
import type { SpellDef } from './srd';

const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
const SCHOOL_RE = SCHOOLS.join('|');
const ABBR: Record<string, Ability> = { str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha', strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

/** Field labels a spell's header uses, by what they mean. */
const LABELS: [RegExp, string][] = [
  [/^level$/i, 'level'],
  [/^casting time$/i, 'time'],
  [/^range(?:\s*\/\s*area)?$/i, 'range'],
  [/^area$/i, 'area'],
  [/^components?$/i, 'components'],
  [/^duration$/i, 'duration'],
  [/^school$/i, 'school'],
  [/^(?:classes|class|spell lists?|available for|lists?)$/i, 'classes'],
  [/^attack\s*\/\s*save$/i, 'attack'],
  [/^damage\s*\/\s*effect$/i, 'effect'],
  [/^ritual$/i, 'ritual'],
  [/^(?:spell )?tags$/i, 'tags'],
  [/^source$/i, 'source'],
];
const labelOf = (s: string) => LABELS.find(([re]) => re.test(s.trim().replace(/:$/, '')))?.[1];
const LABEL_WORDS = 'LEVEL|CASTING TIME|RANGE\\/AREA|RANGE|COMPONENTS|DURATION|SCHOOL|ATTACK\\/SAVE|DAMAGE\\/EFFECT|CLASSES|AVAILABLE FOR';

const LEVEL_LINE = new RegExp(
  `^(?:level\\s*(\\d)\\s+(${SCHOOL_RE})|(\\d)(?:st|nd|rd|th)?[-\\s]level\\s+(${SCHOOL_RE})|(${SCHOOL_RE})\\s+cantrip|cantrip\\s+(${SCHOOL_RE}))\\b\\s*(?:\\(([^)]*)\\))?`,
  'i',
);
const INLINE_LEVEL = new RegExp(`\\((?:(\\d)(?:st|nd|rd|th)?[-\\s]level|level\\s*(\\d)|(cantrip))\\s*(${SCHOOL_RE})?\\s*(?:(?:,|;)\\s*([^)]*))?\\)`, 'i');

const tidy = (l: string) =>
  l
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‒–—−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

/** One "Label: value" per line, from "LABEL" / "value" pairs and D&D Beyond's one-line header row. */
function normalise(text: string): string[] {
  const raw = text.replace(/\r/g, '').split('\n').map(tidy);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i];
    if (!l) continue;
    // "LEVEL 3rd CASTING TIME 1 Action RANGE/AREA 150 ft. …" → one field per line.
    const labelsInLine = l.match(new RegExp(`\\b(?:${LABEL_WORDS})\\b`, 'g'));
    if (labelsInLine && labelsInLine.length >= 3) {
      for (const part of l.split(new RegExp(`(?=\\b(?:${LABEL_WORDS})\\b)`))) {
        const m = new RegExp(`^(${LABEL_WORDS})\\s*:?\\s*(.*)$`).exec(part.trim());
        if (m && m[2]) out.push(`${m[1]}: ${m[2].trim()}`);
      }
      continue;
    }
    // A label alone on its line, with its value on the next.
    const lab = labelOf(l);
    if (lab && raw[i + 1] && !labelOf(raw[i + 1])) {
      let value = raw[i + 1];
      let j = i + 2;
      // "Available For" lists one class per line.
      while (lab === 'classes' && raw[j] && raw[j].length < 30 && !labelOf(raw[j]) && /^[A-Z][a-z]+$/.test(raw[j])) value += `, ${raw[j++]}`;
      out.push(`${l.replace(/:$/, '')}: ${value}`);
      i = j - 1;
      continue;
    }
    out.push(l);
  }
  return out;
}

/** "Casting Time: 1 Action" → ['time', '1 Action'], for header fields only. */
function fieldOf(l: string): [string, string] | null {
  const m = /^([A-Za-z/ ]{3,20}?)\s*:\s*(.+)$/.exec(l);
  if (!m) return null;
  const lab = labelOf(m[1]);
  return lab ? [lab, m[2].trim()] : null;
}

function castingTime(text: string): [CastingTime, string] {
  if (/bonus/i.test(text) || /^1?\s*BA\b/i.test(text)) return ['bonus', 'Bonus Action'];
  if (/reaction/i.test(text) || /^1?\s*R\b/.test(text)) return ['reaction', 'Reaction'];
  if (/^(1\s*)?(action|A)\b/i.test(text)) return ['action', 'Action'];
  return ['other', text.replace(/,.*$/, '')];
}

const isNameLine = (l: string) => l.length >= 2 && l.length <= 70 && /^[A-Z0-9'"(]/i.test(l) && !/[.!?;]$/.test(l) && !fieldOf(l) && !labelOf(l) && l.split(' ').length <= 10;

/** Class names as the library stores them: lower-case slugs ("Wizard" → "wizard"). */
export function classSlugs(text: string): string[] {
  return [...new Set(text.split(/,|;|\band\b|\s{2,}|\s(?=[A-Z][a-z]+\b)/).map((s) => slug(s.replace(/\(.*?\)/g, '')).replace(/-spells?$/, '')).filter((s) => s && s.length <= 30 && !/^(classes|spell|lists?|available|for|optional|legacy|the)$/.test(s)))];
}

/** Every spell in the text, ready for the rules library (named after `source`). */
export function readSpellText(text: string, source: string): SpellDef[] {
  // An AI's (or another app's) JSON in the library's format.
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed.replace(/^```(?:json)?|```$/g, ''));
      if (looksLikeRulesJson(data)) return readRulesJson(data, source).spells.map((s) => ({ ...s, source }));
    } catch {
      // Not JSON: read it as text.
    }
  }
  const lines = normalise(text);
  // Each spell's casting time anchors it; its header (level line, fields) and name sit just above.
  const anchors = lines.map((l, i) => (fieldOf(l)?.[0] === 'time' ? i : -1)).filter((i) => i >= 0);
  const starts: number[] = [];
  for (const a of anchors) {
    let i = a - 1;
    while (i >= 0 && i > a - 10 && (fieldOf(lines[i]) || LEVEL_LINE.test(lines[i]))) i--;
    if (i >= 0 && isNameLine(lines[i]) && (!starts.length || i > starts[starts.length - 1])) starts.push(i);
  }
  const out: SpellDef[] = [];
  starts.forEach((start, k) => {
    const end = starts[k + 1] ?? lines.length;
    const block = lines.slice(start, end);
    const fields = new Map<string, string>();
    let levelLine: RegExpExecArray | null = null;
    let headerEnd = 1;
    for (let j = 1; j < block.length; j++) {
      const f = fieldOf(block[j]);
      const lv: RegExpExecArray | null = !levelLine && j <= 4 ? LEVEL_LINE.exec(block[j]) : null;
      if (lv && j === headerEnd) (levelLine = lv), (headerEnd = j + 1);
      else if (f && j === headerEnd) {
        // The header is one unbroken run of fields under the name.
        if (!fields.has(f[0])) fields.set(f[0], f[1]);
        headerEnd = j + 1;
      } else if (f && ['classes', 'tags', 'source'].includes(f[0]) && !fields.has(f[0])) fields.set(f[0], f[1]); // a footer (D&D Beyond's "Available For")
    }
    let name = block[0].replace(/\s*\[.*?\]\s*$/, '').trim();
    const inline = INLINE_LEVEL.exec(name);
    if (inline) name = name.slice(0, inline.index).trim();
    name = name.replace(/\s*[-:]\s*$/, '').replace(/\s*\((?:R|C|ritual|concentration)\)\s*$/i, '');

    // Level and school: the level line, an inline "(2nd-level evocation)", or the fields.
    const lvText = fields.get('level') ?? '';
    const level = Number(
      levelLine?.[1] ?? levelLine?.[3] ?? (levelLine?.[5] || levelLine?.[6] ? 0 : undefined) ?? inline?.[1] ?? inline?.[2] ?? (inline?.[3] ? 0 : undefined) ?? (/cantrip/i.test(lvText) ? 0 : /(\d)/.exec(lvText)?.[1]) ?? 1,
    );
    const schoolWord = levelLine?.[2] ?? levelLine?.[4] ?? levelLine?.[5] ?? levelLine?.[6] ?? inline?.[4] ?? new RegExp(SCHOOL_RE, 'i').exec(fields.get('school') ?? '')?.[0] ?? '';
    const school = schoolWord ? schoolWord.charAt(0).toUpperCase() + schoolWord.slice(1).toLowerCase() : 'Evocation';
    const classText = [levelLine?.[7] && !/^ritual$/i.test(levelLine[7]) ? levelLine[7] : '', inline?.[5] ?? '', fields.get('classes') ?? ''].filter(Boolean).join(', ');

    const [time, timeText] = castingTime(fields.get('time') ?? 'Action');
    const range = (fields.get('range') ?? '').replace(/\s*◯|\s*\*$/, '').trim();
    const duration = fields.get('duration') ?? '';
    // The description: what's left after the header, minus D&D Beyond's footer lines.
    let components = fields.get('components') ?? '';
    const desc: string[] = [];
    for (const l of block.slice(headerEnd)) {
      const f = fieldOf(l);
      if (f && ['classes', 'tags', 'source'].includes(f[0])) continue;
      const material = /^\*\s*-\s*\((.*)\)\s*$/.exec(l);
      if (material) {
        components = components.replace(/\s*\*\s*$/, '') + ` (${material[1]})`;
        continue;
      }
      desc.push(l);
    }
    const description = desc.join('\n').trim();
    const auto = spellMechanics(description, level, range);
    // D&D Beyond's "Attack/Save" and "Damage/Effect" settle what the text leaves open.
    const atk = fields.get('attack') ?? '';
    const saveAb = ABBR[(/\b(str|dex|con|int|wis|cha)\w*\b/i.exec(atk)?.[1] ?? '').toLowerCase()];
    const resolution = /melee|ranged/i.test(atk) ? 'attack' : saveAb ? 'save' : auto.resolution;
    out.push({
      name,
      level: Math.max(0, Math.min(9, level)),
      school,
      classes: classSlugs(classText),
      castingTime: time,
      castingTimeText: timeText,
      range,
      components,
      duration,
      concentration: /concentration|^conc/i.test(duration) || /\(C\)/.test(block[0]),
      ritual: /ritual/i.test(`${levelLine?.[0] ?? ''} ${fields.get('time') ?? ''} ${fields.get('ritual') ?? ''}`) || /\((?:R|ritual)\)/i.test(block[0]),
      instances: 1,
      upcastInstances: 0,
      ...auto,
      resolution,
      saveAbility: saveAb ?? auto.saveAbility,
      description,
      srd: `${slug(source)}:${slug(name)}`,
      source,
    });
  });
  // The same spell twice (a document repeating itself) is kept once.
  return out.filter((s, i) => out.findIndex((x) => slug(x.name) === slug(s.name)) === i);
}

/** Whether a spell is on a class's list. Library classes have namespaced ids ("my-pack:shardcaller"). */
export const spellForClass = (s: Pick<SpellDef, 'classes'>, classId: string): boolean => !!s.classes?.some((k) => k === classId || classId.endsWith(`:${k}`));

export const SPELLS_AI_PROMPT = `Convert every spell below into JSON for a character-sheet app, exactly in this shape, and answer with the JSON only:

{
  "format": "arcane-tome-rules",
  "name": "<where the spells come from>",
  "spells": [ { "name": "<spell>", "level": 0, "school": "<school>", "classes": ["wizard", "sorcerer"], "castingTime": "Action",
    "range": "60 feet", "components": "V, S", "duration": "Instantaneous", "concentration": false, "ritual": false,
    "attack": "ranged | melee | null", "save": "dex | null", "halfOnSave": true,
    "damage": [ { "dice": "8d6", "type": "fire" } ], "healing": "<dice, optional>", "upcast": "<extra dice per slot level, optional>",
    "text": "<the full description>" } ]
}

Level 0 is a cantrip. List the classes that can learn each spell, in lower case.

The spells:
`;

