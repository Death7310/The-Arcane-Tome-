// Reading spells out of pasted text or a document: a book page, a homebrew Word file, a
// copy from D&D Beyond, or notes. Every spell has a casting time, so each one is found from
// its "Casting Time" line, with its name and header read from just above it. Layouts:
//
//   2024 book   Fireball / Level 3 Evocation (Sorcerer, Wizard) / Casting Time: Action …
//   2014 book   Fireball / 3rd-level evocation / Casting Time: 1 action …
//   D&D Beyond  Fireball / LEVEL / 3rd / CASTING TIME / 1 Action / … / Available For: Sorcerer Wizard
//   notes       Frost Lance (2nd-level evocation, wizard) / Casting time: 1 action …
//               Frost Lance / Level: 2 / School: Evocation / Classes: Wizard, Sorcerer / …

import { DAMAGE_TYPES, type Ability, type DamageType } from './data';
import { ELEMENTS, SHAPES } from '../../fx/types';
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
    // Bold around a label ("**Range:** 60 feet") goes; bold in a description ("**AC** 15",
    // a "**Actions**" heading) stays. A bold name line is read through unbold().
    .replace(/^\*\*([^*]+?)\*\*(?=\s*:)/, '$1')
    .replace(/^\*\*([^*]+?:)\*\*/, '$1')
    .replace(/__|`/g, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

/** A line without bold around the whole of it ("**Fireball**" → "Fireball"). */
const unbold = (l: string) => l.replace(/^\*\*([^*]+)\*\*$/, '$1').trim();

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
  return ['other', text.replace(/,.*$/, '').replace(/\s+or\s+ritual$/i, '')];
}

const isNameLine = (raw: string) => {
  const l = unbold(raw);
  return l.length >= 2 && l.length <= 70 && /^[A-Z0-9'"(]/i.test(l) && !/[.!?;]$/.test(l) && !fieldOf(l) && !labelOf(l) && l.split(' ').length <= 10;
};

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
  const out = starts.map((start, k) => spellFromBlock(lines.slice(start, starts[k + 1] ?? lines.length), source).def);
  // The same spell twice (a document repeating itself) is kept once.
  return out.filter((s, i) => out.findIndex((x) => slug(x.name) === slug(s.name)) === i);
}

/** Which parts of a spell a paste actually gave (the rest are defaults). */
export type SpellPart = 'level' | 'school' | 'time' | 'range' | 'components' | 'duration' | 'classes' | 'roll' | 'damage' | 'healing' | 'upcast' | 'count' | 'scaling' | 'look';

/**
 * A spell's own "card" lines, which the app writes when you copy a spell as text, so a spell
 * pasted back (by you or anyone) comes out exactly as it was: how it's rolled, its damage,
 * healing, upcasting, how many attacks or rays, cantrip scaling and its animation.
 */
const CARD = {
  roll: /^Roll:\s*(.+)$/i,
  damage: /^Damage:\s*(.+)$/i,
  healing: /^Healing:\s*(\S+)$/i,
  upcast: /^Higher levels:\s*\+\s*(\S+)\s+per slot level$/i,
  count: /^Attacks\s*\/\s*darts\s*\/\s*rays:\s*(\d+)(?:,\s*\+(\d+)\s+per slot level)?$/i,
  scaling: /^Cantrip scaling:\s*more (dice|beams)$/i,
  look: /^Look:\s*([a-z]+)\s*,\s*([a-z]+)$/i,
};
const DICE = /^\d*d\d+(?:\s*[+-]\s*(?:\d+|\{\w+\}))*$|^\{\w+\}$/i;

type Card = Partial<Pick<SpellDef, 'resolution' | 'saveAbility' | 'halfOnSave' | 'damage' | 'healing' | 'upcastDice' | 'instances' | 'upcastInstances' | 'scaling' | 'element' | 'shape'>>;

/** Reads one card line, or returns null when the line is ordinary description. */
function cardLine(l: string): [SpellPart, Card] | null {
  let m = CARD.roll.exec(l);
  if (m) {
    const v = m[1].trim();
    const save = /^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) save(?:,\s*(half damage on a success|no damage on a success))?$/i.exec(v);
    if (save) return ['roll', { resolution: 'save', saveAbility: ABBR[save[1].toLowerCase()], halfOnSave: /half/i.test(save[2] ?? '') }];
    if (/^(?:melee |ranged )?spell attack$/i.test(v)) return ['roll', { resolution: 'attack' }];
    if (/^automatic hit$/i.test(v)) return ['roll', { resolution: 'auto' }];
    if (/^healing$/i.test(v)) return ['roll', { resolution: 'heal' }];
    if (/^none$/i.test(v)) return ['roll', { resolution: 'utility' }];
    return null;
  }
  m = CARD.damage.exec(l);
  if (m) {
    const parts = m[1].split(/\s+\+\s+(?=\d*d\d|\{)/).map((p) => /^(\S+)\s+([a-z]+)$/i.exec(p.trim()));
    if (!parts.length || parts.some((p) => !p || !DICE.test(p[1]) || !(DAMAGE_TYPES as readonly string[]).includes(p[2].toLowerCase()))) return null;
    return ['damage', { damage: parts.map((p) => ({ dice: p![1], type: p![2].toLowerCase() as DamageType })) }];
  }
  m = CARD.healing.exec(l);
  if (m && DICE.test(m[1])) return ['healing', { healing: m[1] }];
  m = CARD.upcast.exec(l);
  if (m && DICE.test(m[1])) return ['upcast', { upcastDice: m[1] }];
  m = CARD.count.exec(l);
  if (m) return ['count', { instances: Math.max(1, Number(m[1])), upcastInstances: Number(m[2] ?? 0) }];
  m = CARD.scaling.exec(l);
  if (m) return ['scaling', { scaling: m[1].toLowerCase() === 'beams' ? 'cantrip_beams' : 'cantrip_dice' }];
  m = CARD.look.exec(l);
  if (m) {
    const el = ELEMENTS.find((e) => e.id === m![1].toLowerCase());
    const sh = SHAPES.find((x) => x.id === m![2].toLowerCase());
    if (el && sh) return ['look', { element: el.id, shape: sh.id }];
  }
  return null;
}

/** One spell from its block of lines (name first), and which parts the text actually gave. */
function spellFromBlock(block: string[], source: string): { def: SpellDef; parts: Set<SpellPart> } {
  const parts = new Set<SpellPart>();
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
  let name = unbold(block[0]).replace(/\s*\[.*?\]\s*$/, '').trim();
  const inline = INLINE_LEVEL.exec(name);
  if (inline) name = name.slice(0, inline.index).trim();
  name = name.replace(/\s*[-:]\s*$/, '').replace(/\s*\((?:R|C|ritual|concentration)\)\s*$/i, '');

  // Level and school: the level line, an inline "(2nd-level evocation)", or the fields.
  const lvText = fields.get('level') ?? '';
  const levelFound = levelLine?.[1] ?? levelLine?.[3] ?? (levelLine?.[5] || levelLine?.[6] ? 0 : undefined) ?? inline?.[1] ?? inline?.[2] ?? (inline?.[3] ? 0 : undefined) ?? (/cantrip/i.test(lvText) ? 0 : /(\d)/.exec(lvText)?.[1]);
  if (levelFound !== undefined) parts.add('level');
  const level = Number(levelFound ?? 1);
  // A homebrew school ("Chronomancy") is kept as written.
  const schoolWord = levelLine?.[2] ?? levelLine?.[4] ?? levelLine?.[5] ?? levelLine?.[6] ?? inline?.[4] ?? new RegExp(SCHOOL_RE, 'i').exec(fields.get('school') ?? '')?.[0] ?? fields.get('school')?.trim() ?? '';
  if (schoolWord) parts.add('school');
  const school = schoolWord ? schoolWord.charAt(0).toUpperCase() + schoolWord.slice(1).toLowerCase() : 'Evocation';
  const classText = [levelLine?.[7] && !/^ritual$/i.test(levelLine[7]) ? levelLine[7] : '', inline?.[5] ?? '', fields.get('classes') ?? ''].filter(Boolean).join(', ');
  if (classText) parts.add('classes');

  if (fields.has('time')) parts.add('time');
  const [time, timeText] = castingTime(fields.get('time') ?? 'Action');
  const range = (fields.get('range') ?? '').replace(/\s*◯|\s*\*$/, '').trim();
  const duration = fields.get('duration') ?? '';
  for (const k of ['range', 'components', 'duration'] as const) if (fields.has(k)) parts.add(k);
  // The description: what's left after the header, minus D&D Beyond's footer lines and the card lines.
  let components = fields.get('components') ?? '';
  const desc: string[] = [];
  let card: Card = {};
  const cardParts = new Set<SpellPart>();
  for (const l of block.slice(headerEnd)) {
    const f = fieldOf(l);
    if (f && ['classes', 'tags', 'source'].includes(f[0])) continue;
    const material = /^\*\s*-\s*\((.*)\)\s*$/.exec(l);
    if (material) {
      components = components.replace(/\s*\*\s*$/, '') + ` (${material[1]})`;
      continue;
    }
    const c = cardLine(l);
    if (c) {
      parts.add(c[0]);
      cardParts.add(c[0]);
      card = { ...card, ...c[1] };
      continue;
    }
    desc.push(l);
  }
  const description = desc.join('\n').trim();
  const auto = spellMechanics(description, level, range);
  if (auto.damage.length) parts.add('damage');
  if (auto.healing) parts.add('healing');
  if (auto.upcastDice) parts.add('upcast');
  if (auto.resolution !== 'utility') parts.add('roll');
  if (auto.scaling !== 'none') parts.add('scaling');
  // D&D Beyond's "Attack/Save" and "Damage/Effect" settle what the text leaves open.
  const atk = fields.get('attack') ?? '';
  const saveAb = ABBR[(/\b(str|dex|con|int|wis|cha)\w*\b/i.exec(atk)?.[1] ?? '').toLowerCase()];
  const resolution = /melee|ranged/i.test(atk) ? 'attack' : saveAb ? 'save' : auto.resolution;
  if (atk) parts.add('roll');
  const def: SpellDef = {
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
    ...card,
    srd: `${slug(source)}:${slug(name)}`,
    source,
  };
  // A full card (copied from the app: its Roll and Look lines) says everything: what it leaves
  // out, the spell doesn't have, whatever its description suggests.
  if (cardParts.has('roll') && cardParts.has('look')) {
    Object.assign(def, { damage: card.damage ?? [], healing: card.healing ?? '', upcastDice: card.upcastDice ?? '', instances: card.instances ?? 1, upcastInstances: card.upcastInstances ?? 0, scaling: card.scaling ?? 'none' });
    for (const k of ['damage', 'healing', 'upcast', 'count', 'scaling'] as const) parts.add(k);
  }
  // Card damage without a card look: the animation follows the damage type.
  if (card.damage?.length && !card.element) def.element = card.damage[0].type;
  return { def, parts };
}

/**
 * One pasted spell (or several), read leniently: a spell without a "Casting Time" line still
 * reads, its first line as its name when it looks like one (else `fallbackName`) and what it
 * does from its description. `parts` says what the text actually gave, so filling in a spell
 * you already have changes only those.
 */
export function readPastedSpells(text: string, fallbackName = 'New spell'): { def: SpellDef; parts: Set<SpellPart> }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) {
    const all = readSpellText(trimmed, 'pasted');
    return all.map((def) => ({ def, parts: new Set<SpellPart>(['level', 'school', 'time', 'range', 'components', 'duration', 'classes', 'roll', 'damage', 'healing', 'upcast']) }));
  }
  const lines = normalise(text);
  const anchors = lines.map((l, i) => (fieldOf(l)?.[0] === 'time' ? i : -1)).filter((i) => i >= 0);
  const starts: number[] = [];
  for (const a of anchors) {
    let i = a - 1;
    while (i >= 0 && i > a - 10 && (fieldOf(lines[i]) || LEVEL_LINE.test(lines[i]))) i--;
    if (i >= 0 && isNameLine(lines[i]) && (!starts.length || i > starts[starts.length - 1])) starts.push(i);
  }
  if (starts.length) return starts.map((start, k) => spellFromBlock(lines.slice(start, starts[k + 1] ?? lines.length), 'pasted'));
  const named = lines.length > 1 && isNameLine(lines[0]) && !cardLine(lines[0]);
  return [spellFromBlock(named ? lines : [fallbackName, ...lines], 'pasted')];
}

const title = (k: string) => k.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
const ROLLS: Record<string, string> = { attack: 'spell attack', auto: 'automatic hit', heal: 'healing', utility: 'none' };
const ABILITY_WORDS: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

/**
 * A spell as text, laid out like a 2024 rulebook entry, then its card lines. Paste it back
 * into the app (yours or a friend's) and it comes out the same; other apps read the book part.
 */
export function spellToText(s: Omit<SpellDef, 'srd' | 'source'>, classes: string[] = s.classes ?? []): string {
  const known = SCHOOLS.some((x) => x.toLowerCase() === s.school.toLowerCase());
  const cls = classes.map((k) => title(k.split(':').pop()!)).join(', ');
  const head = known ? [`${s.level === 0 ? `${s.school} Cantrip` : `Level ${s.level} ${s.school}`}${cls ? ` (${cls})` : ''}`] : [`Level: ${s.level === 0 ? 'Cantrip' : s.level}`, `School: ${s.school}`, ...(cls ? [`Classes: ${cls}`] : [])];
  const time = `${s.castingTimeText || 'Action'}${s.ritual && !/ritual/i.test(s.castingTimeText) ? ' or Ritual' : ''}`;
  const duration = s.concentration && !/concentration/i.test(s.duration) ? `Concentration, ${s.duration || 'up to 1 minute'}` : s.duration;
  const roll = s.resolution === 'save' ? `${ABILITY_WORDS[s.saveAbility]} save${s.halfOnSave ? ', half damage on a success' : ''}` : ROLLS[s.resolution];
  return [
    s.name,
    ...head,
    `Casting Time: ${time}`,
    `Range: ${s.range || 'Self'}`,
    `Components: ${s.components || 'V, S'}`,
    `Duration: ${duration || 'Instantaneous'}`,
    s.description.trim() || 'No description.',
    `Roll: ${roll}`,
    ...(s.damage.length && s.resolution !== 'heal' && s.resolution !== 'utility' ? [`Damage: ${s.damage.map((d) => `${d.dice} ${d.type}`).join(' + ')}`] : []),
    ...(s.healing ? [`Healing: ${s.healing}`] : []),
    ...(s.upcastDice ? [`Higher levels: +${s.upcastDice} per slot level`] : []),
    ...(s.instances > 1 || s.upcastInstances > 0 ? [`Attacks/darts/rays: ${s.instances}${s.upcastInstances ? `, +${s.upcastInstances} per slot level` : ''}`] : []),
    ...(s.scaling !== 'none' ? [`Cantrip scaling: more ${s.scaling === 'cantrip_beams' ? 'beams' : 'dice'}`] : []),
    `Look: ${s.element}, ${s.shape}`,
  ].join('\n');
}

/** What a read spell holds, in plain words, for a preview. */
export function describeSpellDef(d: SpellDef): string[] {
  const roll = d.resolution === 'save' ? `${ABILITY_WORDS[d.saveAbility]} save${d.halfOnSave ? ', half damage on a success' : ''}` : d.resolution === 'attack' ? 'Spell attack' : ROLLS[d.resolution];
  return [
    `${d.level === 0 ? `${d.school} cantrip` : `Level ${d.level} ${d.school}`}${d.ritual ? ', ritual' : ''}${d.concentration ? ', concentration' : ''}`,
    `${d.castingTimeText} · ${d.range || 'no range given'} · ${d.components || 'no components given'} · ${d.duration || 'no duration given'}`,
    `Roll: ${roll.charAt(0).toUpperCase()}${roll.slice(1)}`,
    ...(d.damage.length ? [`Damage: ${d.damage.map((x) => `${x.dice} ${x.type}`).join(' + ')}${d.instances > 1 ? ` × ${d.instances}` : ''}`] : []),
    ...(d.healing ? [`Healing: ${d.healing}`] : []),
    ...(d.upcastDice ? [`+${d.upcastDice} per slot level above ${d.level}`] : []),
    ...(d.scaling !== 'none' ? [`Cantrip: more ${d.scaling === 'cantrip_beams' ? 'beams' : 'dice'} at levels 5, 11 and 17`] : []),
    ...(d.classes?.length ? [`Classes: ${d.classes.map(title).join(', ')}`] : []),
    `Look: ${d.element} ${d.shape}`,
  ];
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

