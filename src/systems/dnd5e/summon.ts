// How a companion comes to you, read from its stat block. A spell's creature (Summon Beast's
// Bestial Spirit, Find Steed's Otherworldly Steed, Giant Insect…) keeps "the spell's level" as
// {SLOT}, the level you cast it at, so "11 + the spell's level" is 14 at 3rd level and 15 at
// 4th without reading it again; its form (Air, Land or Water; Celestial, Fey or Fiend; Centipede,
// Spider or Wasp) picks the parts of the stat block for that form. A class feature's (a drake, a
// homunculus servant, a steel defender, a primal companion) keeps "your Ranger level" as
// {LEVEL:ranger}, so it grows as you level. A creature as it is keeps its own numbers.

import { arrive, compMaxHp, originOf } from './companion';
import { emptyTurn, readOrigin, type Character, type Companion, type CompanionOrigin, type Spell } from './model';
import { spellClass } from './rules';
import { readPastedSpells, summonedCreature } from './spellimport';
import { blockLines, parseStatBlock } from './statblock';

const LIST_SPLIT = /\s*(?:,\s*or\b|,|\band\b|\bor\b)\s*/i;
const CREATURE_TYPES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The forms a stat block offers, in the order they first appear: from a type line's choice
 * ("Large Celestial, Fey, or Fiend (Your Choice)"), from "(Air only)" and "(Fiend Only;
 * Recharges after a Long Rest)" notes, and from alternatives on its AC or HP line ("HP 10
 * (Medium or smaller), 20 (Large), 40 (Huge)").
 */
export function summonForms(block: string): string[] {
  const out: string[] = [];
  const add = (f: string) => {
    const name = f.trim().replace(/^\w/, (ch) => ch.toUpperCase());
    if (name && /^[A-Za-z' -]{2,24}$/.test(name) && !/^(?:your choice|only)$/i.test(name) && !out.some((x) => same(x, name))) out.push(name);
  };
  const lines = blockLines(block);
  for (const l of lines) {
    const m = /^(?:Tiny|Small|Medium|Large|Huge|Gargantuan)(?:\s+or\s+\w+)?\s+(.+?)\s*\(your choice\)/i.exec(l);
    if (m) m[1].split(LIST_SPLIT).forEach(add);
  }
  for (const m of lines.join('\n').matchAll(/\(([^()]*?)\s+only(?:;[^()]*)?\)/gi)) m[1].split(LIST_SPLIT).forEach(add);
  for (const l of lines) {
    if (!/^(?:AC|Armor Class|HP|Hit Points)\b/i.test(l)) continue;
    const alts = [...l.matchAll(/\b\d+\s*\(([^()]+)\)/g)].map((m) => m[1]).filter((x) => !/\bonly\b|armor|hit dice|natural|spell/i.test(x));
    if (alts.length >= 2) alts.forEach(add);
  }
  return out;
}

/** Whether a form note covers a form: "Land and Water" covers Land; "Medium or smaller" is one form. */
const forForm = (q: string, form: string) => same(q, form) || q.split(LIST_SPLIT).some((f) => same(f, form));

/** A bracket that names forms: "(Air only)", "(Fiend Only; Recharges after a Long Rest)", or a bare form, "(Fey)". */
function formNote(inner: string, forms: string[]): { forms: string; rest: string; bare: boolean } | null {
  const only = /^(.*?)\s+only(?:;\s*(.*))?$/i.exec(inner.trim());
  if (only) return { forms: only[1], rest: only[2]?.trim() ?? '', bare: false };
  if (forms.some((f) => same(f, inner))) return { forms: inner, rest: '', bare: true };
  return null;
}

/** Where a field's value starts: after "Hit Points " or "HP ". */
const labelEnd = (before: string) => /^([A-Z][A-Za-z]*(?: [A-Z][a-z]+)?\s+)/.exec(before)?.[1].length ?? 0;

/**
 * A line with only its form's parts. An item noted for another form goes, back to the separator
 * before it ("; swim 30 ft. (Water only)", "or 30 (Land and Water only)", "Radiant (Celestial),
 * Psychic (Fey), or Necrotic (Fiend)"); one for this form stays, without its note.
 */
export function lineForForm(line: string, form: string, forms: string[] = [form]): string {
  let out = line;
  let from = 0;
  for (let guard = 0; guard < 40; guard++) {
    const re = /\s*\(([^()]*)\)/g;
    re.lastIndex = from;
    const m = re.exec(out);
    if (!m) break;
    const note = formNote(m[1], forms);
    if (!note) {
      from = m.index + m[0].length;
      continue;
    }
    const before = out.slice(0, m.index);
    const after = out.slice(m.index + m[0].length);
    let head: string;
    let tail = after;
    if (forForm(note.forms, form)) {
      head = before + (note.rest ? ` (${note.rest})` : '');
    } else {
      // The list starts after its sentence or lead-in ("Hit: 1d8 plus the spell's level of
      // Radiant (Celestial), Psychic (Fey)…", "equal to 1d4 + 3 (Medium or smaller), …",
      // "increases by 1d4 (Medium or smaller), 1d6 (Large)…"), so a
      // comma before that ("…modifier, reach 5 ft.") isn't one of its separators.
      const leads = note.bare ? ['. ', ': ', ' of ', 'equal to ', 'equals ', ' is ', ' by '] : ['. ', ': '];
      const floor = Math.max(0, ...leads.map((b) => (before.lastIndexOf(b) < 0 ? 0 : before.lastIndexOf(b) + b.length)));
      const seps = note.bare ? [', ', ' or ', '; '] : ['; ', ', ', ' or ', ' + '];
      const at = Math.max(...seps.map((sep) => before.lastIndexOf(sep)));
      if (at >= floor) head = before.slice(0, at).replace(/[,;]\s*$/, '');
      else {
        // The list's first item: back to where its value starts ("of Radiant", "HP 10").
        head = before.slice(0, floor || labelEnd(before));
        tail = after.replace(/^\s*(?:,\s*or|,|or|;)\s*/, '');
      }
    }
    out = head + tail;
    from = head.length;
  }
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .trim();
}

/**
 * Its text as it reads at the level the spell was cast at: "half this spell's level (round
 * down)" at 4th is 2, "the spell's level" is 4, and "Fly 60 ft. (requires level 4+ spell)" is
 * there only from 4th.
 */
export function slotText(text: string, level: number): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/,?\s*([^,;]*?)\s*\(requires (?:a )?(?:level )?(\d)(?:st|nd|rd|th)?\+?(?:[- ]level)?\+? (?:spell|slot)(?: slot)?\)/gi, (whole: string, item: string, n: string) =>
      level >= Number(n) ? `${/^,/.test(whole) ? ', ' : ''}${item}` : '',
    )
    .replace(/\bhalf (?:of )?(?:this|the) spell'?s level(?:\s*\((?:rounded|round) down\))?/gi, String(Math.floor(level / 2)))
    .replace(/\b(?:the level of (?:the|this) spell|(?:the|this) spell'?s level|the spell level)\b/gi, String(level))
    .replace(/\s*\+\s*(\d+)\s+for each (?:spell |slot )*level above (?:the )?(\d)(?:st|nd|rd|th)?/gi, (_, n: string, b: string) => {
      const extra = Number(n) * Math.max(0, level - Number(b));
      return extra ? ` + ${extra}` : '';
    })
    .replace(/makes a number of (\w+ )?attacks equal to (\d+)/gi, (_, what: string | undefined, n: string) => `makes ${n} ${what ?? ''}attack${n === '1' ? '' : 's'}`);
}

/** Every class token in a companion's numbers, so a class feature's can follow another class (or your character level). */
export function followClass(c: Companion, classId: string) {
  const to = classId ? `{LEVEL:${classId}}` : '{LEVEL}';
  const swap = (t: string) => t.replace(/\{LEVEL(?::[\w-]+)?\}/gi, to);
  c.ac = swap(c.ac);
  c.maxHp = swap(c.maxHp);
  for (const a of c.actions) {
    a.toHit = swap(a.toHit);
    a.damage = swap(a.damage);
    a.dc = swap(a.dc);
    if (a.levelDice?.length) a.levelOf = classId;
    if (a.extra?.length) a.levelOf = classId;
  }
}

/** The class a stat block's numbers name ("your Ranger level" → "ranger"), or "". */
export function classInBlock(c: Pick<Companion, 'ac' | 'maxHp' | 'actions'>): string {
  const all = [c.ac, c.maxHp, ...c.actions.flatMap((a) => [a.toHit, a.damage, a.dc])].join(' ');
  return /\{LEVEL:([\w-]+)\}/i.exec(all)?.[1]?.toLowerCase() ?? '';
}

export type OriginChoice = Partial<CompanionOrigin> & { kind: CompanionOrigin['kind'] };

/**
 * The sentences of a spell's own text that add dice at a higher slot to its creature, which
 * its stat block doesn't say: "The creature's Slam damage increases by 1d4 (Medium or smaller),
 * 1d6 (Large), or 1d12 (Huge) for each spell slot level above 5." ('' when there are none.)
 */
export function upcastOf(spellText: string): string {
  const text = spellText.replace(/\*+/g, '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  return [...text.matchAll(/[^.]*?\b(?:damage|healing)\s+increases\s+by\s+[^.]*?\bfor each (?:spell\s+)?(?:slot\s+)?level above (?:the\s+)?\d[^.]*\./gi)].map((m) => m[0].trim()).join(' ');
}

/**
 * Its spell's higher-level dice, on the actions they name ("Slam damage increases by 1d6 for
 * each spell slot level above 5" adds {ABOVE:5}d6 to the Slam; "Its damage increases…" to each
 * of its attacks), for its form.
 */
function addUpcast(c: Companion, upcast: string, form: string, forms: string[]) {
  const text = form ? lineForForm(upcast, form, forms) : upcast;
  for (const m of text.matchAll(/(?:^|\.\s*)(?:the\s+)?(?:[\w-]+'s\s+)?([\w' -]+?)\s+(damage|healing)\s+increases\s+by\s+(\d+)d(\d+)\s+for each (?:spell\s+)?(?:slot\s+)?level above (?:the\s+)?(\d)/gi)) {
    const [, name, what, n, size, base] = m;
    const dice = `{ABOVE:${base}${n === '1' ? '' : `:${n}`}}d${size}`;
    const named = c.actions.filter((a) => same(a.name.replace(/\s*\(.*\)$/, ''), name));
    const healing = what.toLowerCase() === 'healing';
    const targets = named.length ? named : c.actions.filter((a) => (healing ? a.heal : a.attack && a.damage));
    for (const a of targets) {
      if (healing && a.heal) a.heal = `${a.heal} + ${dice}`;
      else if (!healing && a.damage) a.damage = `${a.damage} + ${dice}`;
    }
  }
}

/**
 * A companion from a stat block, for how it comes to you: a spell at the level you cast it (and
 * its form), a class feature following one of your classes, or a creature as it is. With your
 * character, it starts at its full Hit Points. Null if the text isn't a stat block.
 */
export function companionFromBlock(block: string, choice: OriginChoice, owner?: Character): Companion | null {
  const forms = summonForms(block);
  const origin = readOrigin({ ...choice, forms, form: choice.form && forms.some((f) => same(f, choice.form!)) ? forms.find((f) => same(f, choice.form!)) : (forms[0] ?? ''), block })!;
  const form = origin.form;
  const lines = blockLines(block).flatMap((l) => {
    if (!form) return [l];
    // A trait or action of some forms only: "Flyby (Air Only). …", "Fell Glare (Fiend Only; Recharges after a Long Rest). …".
    const entry = /^([^.()]{1,60}?)\s*\(([^()]*?)\s+only(?:;\s*([^()]*))?\)\.\s*(.*)$/i.exec(l);
    if (entry) return forForm(entry[2], form) ? [lineForForm(`${entry[1]}${entry[3] ? ` (${entry[3].trim()})` : ''}. ${entry[4]}`, form, forms)] : [];
    return [lineForForm(l, form, forms)];
  });
  const c = parseStatBlock(lines.join('\n'));
  if (!c) return null;
  // A Fey steed is a Fey; a Large animated object is Large.
  const type = CREATURE_TYPES.find((t) => same(t, form));
  if (type) c.type = type;
  const size = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i.exec(form)?.[1];
  if (size) c.size = size.charAt(0).toUpperCase() + size.slice(1).toLowerCase();
  if (origin.kind === 'feature') followClass(c, origin.classId);
  if (origin.upcast) addUpcast(c, origin.upcast, form, forms);
  c.origin = origin;
  c.source = origin.name ? (origin.kind === 'spell' ? `Summoned by ${origin.name}` : origin.name) : c.source;
  if (owner) c.hp = compMaxHp(c, owner);
  return c;
}

/**
 * The creature a summoning spell brings, as a companion: its stat block (from the spell's text)
 * for a form and the level you cast it at. Null if the text isn't a stat block.
 */
export function summonCompanion(
  block: string,
  opts: { spell: string; base: number; cast: number; form: string | null; upcast?: string; castBy?: string; duration?: string; concentration?: boolean },
  owner?: Character,
): Companion | null {
  const castBy = opts.castBy && owner?.classes.some((k) => k.classId === opts.castBy) ? opts.castBy : undefined;
  const k = companionFromBlock(
    block,
    { kind: 'spell', name: opts.spell, base: opts.base, cast: Math.max(opts.base, opts.cast), form: opts.form ?? '', upcast: opts.upcast ?? '', castBy, duration: opts.duration, concentration: opts.concentration },
    owner,
  );
  if (k) arrive(k);
  return k;
}

/**
 * Its spell's level or form changed (you cast it again at another level, or chose another
 * form). A new form reads its stat block again, keeping its name, element, gear and notes; a
 * new level needs nothing read, since its numbers count the spell's level themselves.
 */
export function reshape(k: Companion, next: { cast?: number; form?: string }): Companion {
  const o = originOf(k);
  const origin = readOrigin({ ...o, cast: next.cast ?? o.cast, form: next.form ?? o.form })!;
  if (o.block && !same(origin.form, o.form)) {
    const built = companionFromBlock(o.block, origin);
    if (built) return { ...built, id: k.id, name: k.name, hp: k.hp, tempHp: k.tempHp, conditions: k.conditions, turn: k.turn, essence: k.essence, inventory: k.inventory, weapons: k.weapons, armor: k.armor, notes: k.notes };
  }
  return { ...k, origin };
}

/**
 * Brought again (a new casting, or the feature used again): its form and level as chosen, at
 * full Hit Points, with no temporary Hit Points, conditions or spent turn.
 */
export function summonAgain(k: Companion, next: { cast?: number; form?: string }, owner: Character): Companion {
  const fresh: Companion = { ...reshape(k, next), tempHp: 0, conditions: [], turn: emptyTurn() };
  fresh.hp = compMaxHp(fresh, owner);
  // A spell's creature is here again, its duration starting over.
  if (originOf(fresh).kind === 'spell') arrive(fresh);
  return fresh;
}

/**
 * Casting a spell that summons a creature (Summon Beast with a Ranger's 2nd-level slot): its
 * companion summoned again at that level (full HP, cast with that spell's class), or a new one
 * from the stat block in the spell's text. Pure: the companion and where it goes (its index, or
 * -1 for a new one); null when the spell summons nothing the app can read.
 */
export function castSummon(c: Character, spell: Pick<Spell, 'name' | 'level' | 'description' | 'grantedBy' | 'abilityOverride' | 'duration' | 'concentration'>, level: number): { index: number; comp: Companion } | null {
  if (spell.level < 1) return null;
  const castBy = spellClass(c, spell) ?? undefined;
  const castAbility = spell.abilityOverride ?? undefined;
  const lasts = { duration: spell.duration, concentration: spell.concentration };
  const index = c.companions.findIndex((k) => k.origin?.kind === 'spell' && same(k.origin.name, spell.name));
  if (index >= 0) {
    const was = c.companions[index];
    const withCaster: Companion = { ...was, origin: readOrigin({ ...was.origin, castBy, castAbility, ...lasts }) };
    return { index, comp: summonAgain(withCaster, { cast: Math.max(level, withCaster.origin!.base) }, c) };
  }
  const block = summonedCreature(spell.description);
  if (!block) return null;
  const upcast = upcastOf(spell.description.slice(0, Math.max(0, spell.description.length - block.length)));
  const comp = companionFromBlock(block, { kind: 'spell', name: spell.name, base: spell.level, cast: Math.max(level, spell.level), upcast, castBy, castAbility, ...lasts }, c);
  if (!comp) return null;
  arrive(comp);
  return { index: -1, comp };
}

export interface SpellRef {
  name: string;
  level: number;
  description: string;
  /** Its duration as written, and whether it needs concentration, when known. */
  duration?: string;
  concentration?: boolean;
}

/** What a pasted stat block (or a whole spell with one) says about how its creature comes to you. */
export interface PasteReading {
  /** The stat block itself (from a whole spell, the part after its text). */
  block: string;
  /** The companion read plainly, before any choices. */
  plain: Companion;
  forms: string[];
  /** The spell it came with or names it, when there is one. */
  spell: SpellRef | null;
  /** The likeliest way it comes, from what its numbers count. */
  kind: CompanionOrigin['kind'];
  /** Its spell's level: the spell's own, else from "for each spell level above 2nd", else 1. */
  base: number;
  /** The class its numbers follow ("ranger"), or "". */
  classId: string;
  /** What its numbers follow, in words. */
  follows: string[];
  /** What its spell's text adds at a higher slot (see upcastOf), '' for none. */
  upcast: string;
}

/**
 * Reads a paste for the companion's stat block and how it comes: a whole spell (Summon Beast
 * and its Bestial Spirit), a spell's creature on its own (found in your spells or the rules by
 * its name), a class feature's (counting your Ranger level), or a creature with its own CR.
 */
export function readCompanionPaste(text: string, spells: SpellRef[] = []): PasteReading | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let block = trimmed;
  let spell: SpellRef | null = null;
  const inSpell = summonedCreature(trimmed);
  const head = inSpell ? trimmed.slice(0, trimmed.length - inSpell.length) : '';
  if (inSpell && /\b(?:Casting Time|Components|Duration)\s*:/i.test(head)) {
    block = inSpell;
    const def = readPastedSpells(trimmed)[0]?.def;
    if (def) spell = { name: def.name, level: def.level, description: def.description, duration: def.duration, concentration: def.concentration };
  }
  const plain = parseStatBlock(block);
  if (!plain) return null;
  const numbers = [plain.ac, plain.maxHp, plain.pb, ...plain.actions.flatMap((a) => [a.toHit, a.damage, a.dc, ...(a.more ?? []).map((x) => x.dice)])].join(' ');
  const slot = /\{SLOT\}/i.test(numbers) || /\bspell'?s level|level of (?:the|this) spell\b/i.test(block.replace(/[’‘]/g, "'"));
  if (!spell) {
    // "This corporeal form uses the Bestial Spirit stat block": find the spell by its creature
    // (by name alone only when its numbers count a spell's level).
    const name = plain.name.toLowerCase().replace(/[’‘]/g, "'");
    const text = (x: SpellRef) => x.description.toLowerCase().replace(/[’‘*]/g, (ch) => (ch === '*' ? '' : "'"));
    spell = spells.find((x) => x.level > 0 && text(x).includes(`${name} stat block`)) ?? (slot ? spells.find((x) => x.level > 0 && (same(x.name, plain.name) || text(x).includes(name))) : undefined) ?? null;
  }
  const above = /for each (?:spell |slot )*level above (?:the )?(\d)/i.exec(block);
  const base = spell?.level || (above ? Number(above[1]) : 1);
  const classId = classInBlock(plain);
  const kind: CompanionOrigin['kind'] = slot || spell ? 'spell' : classId || /\{LEVEL\}/.test(numbers) ? 'feature' : plain.cr && /^[\d/]+$/.test(plain.cr) ? 'creature' : /\{(?:PB|SPELLATK|SPELLDC|MOD|STR|DEX|CON|INT|WIS|CHA)\}/.test(numbers) ? 'feature' : 'creature';
  const follows: string[] = [];
  if (slot) follows.push('the level the spell is cast at');
  if (classId) follows.push(`your ${classId.charAt(0).toUpperCase()}${classId.slice(1)} level`);
  else if (/\{LEVEL\}/.test(numbers)) follows.push('your character level');
  if (/\{PB\}/.test(numbers)) follows.push('your Proficiency Bonus');
  if (/\{SPELLATK\}/.test(numbers)) follows.push('your spell attack modifier');
  if (/\{SPELLDC\}/.test(numbers)) follows.push('your spell save DC');
  const mods = [...new Set([...numbers.matchAll(/\{(MOD|STR|DEX|CON|INT|WIS|CHA)\}/g)].map((m) => m[1]))];
  for (const m of mods) follows.push(m === 'MOD' ? 'your spellcasting modifier' : `your ${{ STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' }[m]} modifier`);
  // The spell's own text (not its creature's) for dice a higher slot adds.
  const spellText = head || (spell ? spell.description.slice(0, Math.max(0, spell.description.length - (summonedCreature(spell.description)?.length ?? 0))) : '');
  const upcast = upcastOf(spellText);
  if (upcast && !follows.includes('the level the spell is cast at')) follows.unshift('the level the spell is cast at');
  return { block, plain, forms: summonForms(block), spell, kind, base: Math.max(1, Math.min(9, base)), classId, follows, upcast };
}
