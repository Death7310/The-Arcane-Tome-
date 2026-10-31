// Feats: reading them from pasted text or a document (book layouts, D&D Beyond copies,
// notes), working out what they grant (an ability increase, spells, free casts), and taking
// one: applying it to a character.
//
//   Shadow-Touched / General Feat (Prerequisite: Level 4+) / Increase your Intelligence,
//   Wisdom, or Charisma score by 1… You learn the Invisibility spell and one level 1 spell
//   of your choice from the Illusion or Necromancy school… once without a spell slot…

import { ABILITIES, type Ability } from './data';
import { blankFeature, blankSpell, uid, type Character } from './model';
import { looksLikeRulesJson, readRulesJson, slug } from './rulesdoc';
import { spellFromDef } from './spells';
import type { FeatDef, FeatSpells, SpellDef } from './srd';

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, a: 1, an: 1 };
const ABILITY_WORD: Record<string, Ability> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const SCHOOLS = 'Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation';
const CLASSES = 'Artificer|Bard|Cleric|Druid|Paladin|Ranger|Sorcerer|Warlock|Wizard';
const flat = (t: string) => t.replace(/[‘’]/g, "'").replace(/[*_]{1,3}/g, '').replace(/\s+/g, ' ');
const count = (w: string) => WORD_NUM[w.toLowerCase()] ?? Number(w);

/** The abilities a feat raises by 1: "Increase your Intelligence, Wisdom, or Charisma score by 1". */
export function abilitiesFromText(text: string): Ability[] {
  const t = flat(text);
  if (/increase one ability score of your choice by 1|one ability score of your choice/i.test(t)) return [...ABILITIES];
  const m = /increase your ((?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:,? (?:or |and )?(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))*) score by 1/i.exec(t);
  if (!m) return [];
  return [...new Set([...m[1].matchAll(/Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma/gi)].map((x) => ABILITY_WORD[x[0].toLowerCase()]))];
}

const NOT_SPELL = /^(level|cantrip|spell|following|chosen|same|other|new|chosen level \d|feat's|this feat's)$/i;
const titleCase = (n: string) => n.replace(/\b([a-z])/g, (ch) => ch.toUpperCase()).replace(/\b(Of|And|The|From|To)\b/g, (w, _x, i) => (i ? w.toLowerCase() : w));
const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** The spells a feat's text grants, or null when it grants none. */
export function featSpellsFromText(text: string): FeatSpells | null {
  const t = flat(text);
  const fixed: string[] = [];
  const name = `([A-Za-z][\\w'-]*(?:\\s+[A-Za-z][\\w'-]*){0,3}?)`;
  for (const m of t.matchAll(new RegExp(`\\b(?:learn|have|know)\\s+the\\s+${name}\\s+spells?\\b(?!\\s+(?:slots?|list))`, 'g'))) {
    for (const n of m[1].split(/\s+and\s+(?:the\s+)?/)) if (!NOT_SPELL.test(n.trim())) fixed.push(titleCase(n.trim()));
  }
  const choose: FeatSpells['choose'] = [];
  let lastLists: string[] = [];
  const pick = /\b(one|two|three|four|an?|\d+)\s+(?:(?:level\s+(\d)|(\d)(?:st|nd|rd|th)[- ]level)\s+spells?(?!\s+slots?)|(cantrips?))\b([^.]*)(?=\.?\s*([^.]*))/gi;
  for (const m of t.matchAll(pick)) {
    // "…one level 1 spell of your choice. The level 1 spell must be from the Divination or Enchantment school."
    const rest = `${m[5] ?? ''} ${/\bmust be\b|\bfrom the\b/i.test(m[6] ?? '') ? m[6] : ''}`;
    // A heading ("Two Cantrips.") restates the sentence after it.
    if (!(m[5] ?? '').trim() && t.charAt((m.index ?? 0) + m[0].length) === '.') continue;
    const schools = [...new Set([...rest.matchAll(new RegExp(`\\b(${SCHOOLS})\\b`, 'gi'))].map((x) => capital(x[1])))];
    let lists = [...new Set([...rest.matchAll(new RegExp(`\\b(${CLASSES})\\b`, 'gi'))].map((x) => x[1].toLowerCase()))];
    if (!lists.length && /same (?:spell )?list/i.test(rest)) lists = lastLists;
    if (lists.length) lastLists = lists;
    choose.push({ count: count(m[1]), level: m[4] ? 0 : Number(m[2] ?? m[3]), schools, lists });
  }
  if (!fixed.length && !choose.length) return null;
  const raised = /ability (?:score )?(?:you )?increased (?:by|with) this feat|the ability increased by this feat|ability score you increase/i.test(t);
  const set = /\b(Intelligence|Wisdom|Charisma) is your spellcasting ability\b/.exec(t.replace(/Intelligence, Wisdom, or Charisma/g, ''));
  return { fixed: [...new Set(fixed)], choose, freeCast: /without (?:expending )?a spell slot/i.test(t), ability: raised ? 'raised' : set ? ABILITY_WORD[set[1].toLowerCase()] : 'choose' };
}

/** A feat's granted spells: its own list, else read from its text. */
export const featSpells = (f: FeatDef): FeatSpells | null => f.spells ?? featSpellsFromText(f.text);

/** "Grants Invisibility and 1 level 1 spell (Illusion or Necromancy), each free once per Long Rest; …". */
export function describeGrants(g: FeatSpells): string {
  const or = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);
  const lists = (ls: string[]) => (ls.length ? ` from the ${or(ls.map((l) => l.charAt(0).toUpperCase() + l.slice(1)))} list` : '');
  const parts = [...g.fixed, ...g.choose.map((ch) => `${ch.count} ${ch.level === 0 ? `cantrip${ch.count === 1 ? '' : 's'}` : `level ${ch.level} spell${ch.count === 1 ? '' : 's'}`}${ch.schools.length ? ` (${or(ch.schools)})` : ''}${lists(ch.lists)}`)];
  const cantrips = g.choose.some((ch) => ch.level === 0);
  const free = g.freeCast ? (cantrips ? ', the leveled spells free once per Long Rest' : ', each free once per Long Rest') : '';
  const how = g.ability === 'raised' ? 'cast with the ability it raises' : g.ability === 'choose' ? 'cast with Intelligence, Wisdom or Charisma (your choice)' : `cast with ${g.ability.toUpperCase()}`;
  return `Grants ${parts.join(' and ')}${free}; ${how}.`;
}

const CATEGORY = /^(origin|general|fighting style|epic boon)\s+feat\b\s*(?:\(\s*(?:prerequisites?:\s*)?([^)]*)\))?/i;
const PREREQ = /^prerequisites?:\s*(.+)$/i;

function featFrom(name: string, category: string, prerequisite: string, body: string[], source: string): FeatDef {
  const text = body.join('\n').trim();
  const spells = featSpellsFromText(text);
  return {
    id: `${slug(source)}:${slug(name)}`,
    name,
    category: category.toLowerCase().replace(/\s+/g, '-') || 'general',
    repeatable: /\brepeatable\b/i.test(text),
    minLevel: Number(/level\s*(\d+)/i.exec(prerequisite)?.[1] ?? 1),
    abilities: abilitiesFromText(text),
    text: [prerequisite ? `Prerequisite: ${prerequisite}` : '', text].filter(Boolean).join('\n\n'),
    ...(spells ? { spells } : {}),
    source,
  };
}

/** Every feat in pasted text or a document. A single feat with no category line still reads (its first line is its name). */
export function readFeatText(raw: string, source: string): FeatDef[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed.replace(/^```(?:json)?|```$/g, ''));
      if (looksLikeRulesJson(data)) return readRulesJson(data, source).feats.map((f) => ({ ...f, source, spells: f.spells ?? featSpellsFromText(f.text) ?? undefined }));
    } catch {
      // Not JSON: read it as text.
    }
  }
  const lines = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\*\*|__|`/g, '').replace(/^#{1,6}\s*/, '').replace(/[‘’]/g, "'").replace(/[‒–—−]/g, '-').trim())
    .filter(Boolean);
  const starts = lines.map((l, i) => (i > 0 && (CATEGORY.test(l) || PREREQ.test(l)) && lines[i - 1].length <= 60 && !/[.:]$/.test(lines[i - 1]) ? i - 1 : -1)).filter((i) => i >= 0);
  if (!starts.length) {
    if (!lines.length) return [];
    const name = lines[0].replace(/[:.]$/, '');
    return name.length <= 60 && lines.length > 1 ? [featFrom(name, 'general', '', lines.slice(1), source)] : [];
  }
  return starts.map((start, k) => {
    const end = starts[k + 1] ?? lines.length;
    const head = lines[start + 1];
    const cat = CATEGORY.exec(head);
    const pre = cat?.[2] ?? PREREQ.exec(head)?.[1] ?? '';
    return featFrom(lines[start], cat?.[1] ?? 'general', pre.trim(), lines.slice(start + 2, end), source);
  });
}

/** The feature that tracks a feat's free cast of a spell. */
export const freeCastName = (spell: string) => `${spell}: free cast`;

export interface FeatChoices {
  /** The ability it raises by 1. */
  ability?: Ability;
  /** The casting ability, when the feat lets you choose. */
  spellAbility?: Ability;
  /** The spells chosen for its "one level 1 spell of your choice" parts, by name. */
  picks: string[];
}

/**
 * Takes a feat: adds it as a feature (unless it's already on the sheet), raises the chosen
 * ability, adds its spells (marked as granted by the feat, cast with its ability) and a
 * once-per-Long-Rest free cast for each leveled one. Returns what changed, in plain words.
 */
export function applyFeat(d: Character, feat: FeatDef, choice: FeatChoices, spellDefs: SpellDef[], opts: { addFeature: boolean; raise: boolean }): string[] {
  const done: string[] = [];
  if (opts.addFeature && !d.features.some((f) => f.name.toLowerCase() === feat.name.toLowerCase())) {
    d.features.push(blankFeature({ name: feat.name, source: `Feat${feat.category ? ` (${feat.category.replace(/-/g, ' ')})` : ''}`, description: feat.text, usesMax: null, recharge: 'none' }));
    done.push(`${feat.name} added to your features`);
  }
  if (opts.raise && choice.ability) {
    const cap = feat.category === 'epic-boon' ? 30 : 20;
    const before = d.abilities[choice.ability];
    d.abilities[choice.ability] = Math.min(cap, before + 1);
    if (d.abilities[choice.ability] > before) done.push(`${choice.ability.toUpperCase()} ${before} → ${d.abilities[choice.ability]}`);
  }
  const g = featSpells(feat);
  if (!g) return done;
  const castWith = g.ability === 'raised' ? choice.ability : g.ability === 'choose' ? choice.spellAbility : g.ability;
  const from = `feat:${feat.name}`;
  for (const name of [...g.fixed, ...choice.picks].filter(Boolean)) {
    const def = spellDefs.find((s) => s.name.toLowerCase() === name.toLowerCase());
    const spell = def ? spellFromDef(def, uid(), from) : blankSpell({ id: uid(), name, grantedBy: from, description: `From ${feat.name}.` });
    spell.abilityOverride = castWith ?? null;
    spell.prepared = true;
    if (!d.spells.some((s) => s.name.toLowerCase() === spell.name.toLowerCase() && s.grantedBy === from)) {
      d.spells.push(spell);
      done.push(`${spell.name} added to your spells`);
    }
    const freeName = freeCastName(spell.name);
    if (g.freeCast && spell.level > 0 && !d.features.some((f) => f.name === freeName)) {
      d.features.push(blankFeature({ name: freeName, source: feat.name, description: `From ${feat.name}: cast ${spell.name} once without a spell slot. You regain this when you finish a Long Rest.`, usesMax: 1, recharge: 'long' }));
    }
  }
  if (g.freeCast) done.push('a free cast of each, once per Long Rest');
  return done;
}

export const FEATS_AI_PROMPT = `Convert every feat below into JSON for a character-sheet app, exactly in this shape, and answer with the JSON only:

{
  "format": "arcane-tome-rules",
  "name": "<where the feats come from>",
  "feats": [ { "name": "<feat>", "category": "origin | general | fighting-style | epic-boon", "prerequisite": "<text, e.g. Level 4+>",
    "abilities": ["int", "wis", "cha"], "repeatable": false,
    "text": "<the full description, including any spells it grants and how they're cast>" } ]
}

"abilities" lists the abilities the feat can raise by 1 (leave it empty if none).

The feats:
`;
