// Turns creature stat blocks into companions: from the SRD's creatures, or from text you
// paste (2014 and 2024 layouts both read: "Melee Weapon Attack: +5 to hit" and "Melee
// Attack Roll: +5"). Phrases that tie a companion to you become tokens, so it scales:
// "your Proficiency Bonus" → {PB}, "your spell attack modifier" → {SPELLATK},
// "your spell save DC" → {SPELLDC}, "your Ranger level" → {LEVEL:ranger}.

import { ABILITIES, type Ability } from './data';
import { readText } from './importer';
import { blankCompanion, blankCompanionAction, type Companion, type CompanionAction } from './model';
import type { CreatureDef } from './srd';

const ABILITY_WORD: Record<string, Ability> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const NUMBER_WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Proficiency Bonus by Challenge Rating (2024 rules). */
export function pbForCr(cr: number): number {
  return cr < 5 ? 2 : cr < 9 ? 3 : cr < 13 ? 4 : cr < 17 ? 5 : cr < 21 ? 6 : cr < 25 ? 7 : cr < 29 ? 8 : 9;
}

const crText = (cr: number) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));

/**
 * "plus your Proficiency Bonus", "your Wisdom modifier", "your Ranger level", "the spell's
 * level"… as tokens: {PB}, {WIS}, {LEVEL:ranger}, {SLOT} (the level the spell was cast at).
 * "+ 5 for each spell level above 2nd" becomes "+ 5 * max(0, {SLOT} - 2)", "10 per spell level"
 * "10 * {SLOT}", and "half this spell's level (round down)" "floor({SLOT} / 2)".
 */
export function tokenize(phrase: string): string {
  return phrase
    .replace(/[’‘]/g, "'")
    .replace(/\s*\+\s*(?:your\s+)?(?:Proficiency Bonus|PB)\b/gi, ' + {PB}')
    .replace(/\bplus\s+(?:your\s+)?(?:Proficiency Bonus|PB)\b/gi, '+ {PB}')
    .replace(/\b(?:equals?|equal to)?\s*your spell attack modifier\b/gi, '{SPELLATK}')
    .replace(/\b(?:equals?|equal to)?\s*your spell save DC\b/gi, '{SPELLDC}')
    .replace(/\byour spellcasting (?:ability )?modifier\b/gi, '{MOD}')
    .replace(/\byour (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier\b/gi, (_, a: string) => `{${ABILITY_WORD[a.toLowerCase()].toUpperCase()}}`)
    .replace(/\bhalf (?:of )?your (\w+) level(?:\s*\((?:rounded|round) (?:down|up)\))?/gi, (m: string, cls: string) => `${/up\)$/i.test(m) ? 'ceil' : 'floor'}(${cls.toLowerCase() === 'character' ? '{LEVEL}' : `{LEVEL:${cls.toLowerCase()}}`} / 2)`)
    .replace(/\b(\w+) times your (\w+) level\b/gi, (_, n: string, cls: string) => `${NUMBER_WORD[n.toLowerCase()] ?? n} * ${cls.toLowerCase() === 'character' ? '{LEVEL}' : `{LEVEL:${cls.toLowerCase()}}`}`)
    .replace(/\byour character level\b/gi, '{LEVEL}')
    .replace(/\byour (\w+) level\b/gi, (_, cls: string) => `{LEVEL:${cls.toLowerCase()}}`)
    // The level a spell was cast at.
    .replace(/\s*\+\s*(\d+)\s+for each (?:spell |slot )*level above (?:the )?(\d)(?:st|nd|rd|th)?/gi, (_, n: string, b: string) => ` + ${n} * max(0, {SLOT} - ${b})`)
    .replace(/\b(\d+)\s+(?:per|for each) (?:spell |slot )+level\b/gi, (_, n: string) => (n === '1' ? '{SLOT}' : `${n} * {SLOT}`))
    .replace(/\bhalf (?:of )?(?:this|the) spell'?s level(?:\s*\((?:rounded|round) down\))?/gi, 'floor({SLOT} / 2)')
    .replace(/\b(?:the level of (?:the|this) spell|(?:the|this) spell'?s level|the spell level)\b/gi, '{SLOT}')
    // "13 plus {WIS}", "1d8 plus {SLOT}".
    .replace(/\s+plus\s+(?=[{\d(]|floor|ceil|max)/gi, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TYPE_WORDS = 'Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder';

/** The mechanics of one action from its text: attack bonus, reach, damage, save. */
export function readAction(name: string, text: string, kind: CompanionAction['kind']): CompanionAction {
  const t = text.replace(/\*/g, '').replace(/\s+/g, ' ');
  const a: Partial<CompanionAction> = { name, kind, text };
  const atk = /(Melee|Ranged)(?: or Ranged)?(?: Weapon| Spell)? Attack(?: Roll)?:\s*([^,]+?)(?:\s+to hit)?,\s*(reach|range)\s*([^,.]+(?:\/\d+ ft\.?)?)/i.exec(t);
  if (atk) {
    a.attack = atk[1].toLowerCase() === 'ranged' ? 'ranged' : 'melee';
    // "+5", "Bonus equals your spell attack modifier", "+3 plus PB": keep the number or formula.
    a.toHit = tokenize(atk[2]).replace(/^[^{\d-]*(?=[{\d-])/, '').replace(/\s*\+\s*/g, ' + ');
    a.reach = `${atk[3].toLowerCase() === 'reach' ? 'reach' : 'range'} ${atk[4].trim()}`;
  }
  // "Hit: 7 (1d8 + 3) Piercing damage", "Hit: 1d8 + 3 + PB Piercing damage", "Hit: 1 Piercing
  // damage", "Hit: 1d8 plus the spell's level of Psychic damage", "Hit: Force damage equal to
  // 2d6 + 3", and a choice of types ("Bludgeoning, Piercing, or Slashing damage": the first).
  const types = `(?:${TYPE_WORDS})(?:,?\\s+(?:or\\s+)?(?:${TYPE_WORDS}))*`;
  const hit = new RegExp(`Hit:\\s*(?:(\\d+)\\s*\\(([^)]+)\\)|([^.]*?))(?:\\s+of)?\\s+(${types}) damage`, 'i').exec(t);
  const typeFirst = new RegExp(`Hit:\\s*(${types}) damage equal to ([^.;(]+)`, 'i').exec(t);
  const firstType = (list: string) => list.split(/,?\s+(?:or\s+)?/)[0].toLowerCase();
  if (typeFirst) {
    a.damage = tokenize(typeFirst[2].trim()).replace(/\s*\+\s*/g, ' + ');
    a.damageType = firstType(typeFirst[1]);
  } else if (hit) {
    const dice = (hit[2] ?? hit[3] ?? hit[1] ?? '').trim();
    a.damage = tokenize(dice).replace(/\s*\+\s*/g, ' + ');
    a.damageType = firstType(hit[4]);
  } else {
    const dmg = new RegExp(`\\b(\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)\\s*\\)?\\s*(${TYPE_WORDS}) damage`, 'i').exec(t);
    // "Failure: 2d6 damage of a type this spirit has Resistance to": the dice, its type to choose.
    const untyped = /\b(?:Failure|Hit):\s*(?:\d+\s*\()?(\d+d\d+(?:\s*[+-]\s*\d+)?)\)?\s+damage\b/i.exec(t);
    if (dmg) (a.damage = dmg[1]), (a.damageType = dmg[2].toLowerCase());
    else if (untyped) a.damage = untyped[1].replace(/\s*\+\s*/g, ' + ');
  }
  // More damage on the same hit: "… Piercing damage plus 1d4 Poison damage", "… plus 7 (2d6) Fire damage".
  if (a.damage && (hit || typeFirst)) {
    const after = t.slice(((hit ?? typeFirst)!.index ?? 0) + (hit ?? typeFirst)![0].length);
    const more: { dice: string; type: string }[] = [];
    for (const m of after.matchAll(new RegExp(`^,?\\s*(?:plus|and)\\s+(?:\\d+\\s*\\()?(\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)\\)?\\s+(${TYPE_WORDS}) damage`, 'gi'))) more.push({ dice: m[1].replace(/\s+/g, ''), type: m[2].toLowerCase() });
    if (more.length) a.more = more;
  }
  // A reaction that adds damage to someone else's hit: "When another creature … hits …, the
  // attack deals an extra 1d6 damage of the type …" (a Drakewarden drake's Infused Strikes).
  const extra = /\bextra\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)(?:\s+(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder))?\s+damage/i.exec(t);
  if (kind === 'reaction' && !a.attack && extra && /\bhits?\b/i.test(t)) {
    a.boost = true;
    a.damage = extra[1].replace(/\s+/g, '');
    a.damageType = extra[2]?.toLowerCase() ?? '';
  }
  const save24 = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*(?:DC\s*)?([^,.]+)/i.exec(t);
  const save14 = /DC\s*(\d+|equals? your spell save DC)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(t);
  if (save24) (a.save = ABILITY_WORD[save24[1].toLowerCase()]), (a.dc = tokenize(save24[2]));
  else if (save14) (a.save = ABILITY_WORD[save14[2].toLowerCase()]), (a.dc = tokenize(save14[1]));
  return blankCompanionAction(a);
}

const SECTION: Record<string, CompanionAction['kind']> = { traits: 'trait', actions: 'action', 'bonus actions': 'bonus', reactions: 'reaction', 'legendary actions': 'legendary' };

/**
 * A stat block's lines, tidied: markdown's bold and italics, table bars and bullets gone ("| Str |
 * 18 | +4 | +4 |" reads "Str 18 +4 +4"), and "AC 15; HP 10; Speed 30 ft." split into its fields.
 */
export function blockLines(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) =>
      l
        .replace(/\*+/g, '')
        .replace(/\|/g, ' ')
        .replace(/^\s*(?:[#>•]+|-\s)+/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((l) => l && !/^[-:\s]+$/.test(l))
    .flatMap((l) => (/^(?:AC|Armor Class)\b/i.test(l) && /;\s*(?:HP|Hit Points|Speed)\b/i.test(l) ? l.split(/;\s*(?=(?:HP|Hit Points|Speed|Initiative)\b)/i) : [l]))
    // "Animated Object. Huge or Smaller Construct, Unaligned": its name, then its type line.
    .flatMap((l) => {
      const m = /^([A-Z][^.]{1,40})\.\s+((?:Tiny|Small|Medium|Large|Huge|Gargantuan)\b.*\b(?:Aberration|Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Monstrosity|Ooze|Plant|Undead)s?\b.*)$/i.exec(l);
      return m ? [m[1], m[2]] : [l];
    });
}

const FIELD = /^(Armor Class|Hit Points|Speed|Skills|Senses|Languages|Challenge|Saving Throws|Resistances|Immunities|Vulnerabilities|Initiative|Gear|AC|HP|CR)\b/i;

/** Reads a pasted stat block. Returns null when it doesn't look like one. */
export function parseStatBlock(text: string): Companion | null {
  const lines = blockLines(text);
  if (lines.length < 3) return null;
  const all = lines.join('\n');
  // A field at the start of its own line, so "regains Hit Points" in a trait isn't its HP.
  const field = (re: RegExp, inline?: RegExp) => {
    for (const l of lines) {
      const m = re.exec(l);
      if (m) return m;
    }
    // A PDF can run fields together ("Armor Class 15 (natural armor) Hit Points 22 (4d8 + 4)"):
    // then a number must follow, so "regains Hit Points from a spell" isn't one.
    for (const l of inline ? lines : []) {
      const m = inline!.exec(l);
      if (m) return m;
    }
    return null;
  };
  const c = blankCompanion({ source: 'Pasted stat block' });
  const typeLine = lines.findIndex((l) => /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b.*\b(Aberration|Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Monstrosity|Ooze|Plant|Undead)s?\b/i.test(l));
  c.name = lines[typeLine > 0 ? typeLine - 1 : 0].replace(/[.:]$/, '');
  if (typeLine >= 0) {
    const m = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?:\s+or\s+\w+)?\s+(\w+)/i.exec(lines[typeLine])!;
    c.size = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    c.type = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
  }
  const ac = field(/^(?:AC|Armor Class)\s+(.+?)(?:\s*\(|\s+Initiative\b|$)/i, /\b(?:AC|Armor Class)\s+(\d+(?:\s*\+\s*[^\s(]+)?)/i);
  if (ac) c.ac = tokenize(ac[1]).replace(/\s*\+\s*/g, ' + ');
  const hp = field(/^(?:HP|Hit Points)\s+(.+?)(?:\s*\(|$)/i, /\b(?:HP|Hit Points)\s+(\d+(?:\s*\+\s*[^\s(]+)?)(?=\s*\(|\s+Speed\b|\s*$)/i);
  if (hp) {
    c.maxHp = tokenize(hp[1]).replace(/\s*\+\s*/g, ' + ');
    const n = Number(c.maxHp);
    if (Number.isFinite(n)) c.hp = n;
  }
  const speed = field(/^Speed\s+(.+)$/i, /\bSpeed\s+(\d+\s*ft\.?.*)$/i);
  if (speed) c.speed = speed[1].trim();
  const abilities = readText(all).abilities;
  for (const a of ABILITIES) if (abilities[a]) c.abilities[a] = abilities[a]!;
  const saves = field(/^Saving Throws?\s+(.+)$/i);
  if (saves) c.saves = ABILITIES.filter((a) => new RegExp(`\\b${a}\\b`, 'i').test(saves[1]));
  else {
    // The 2024 table: "Str 18 +4 +6", a save above its modifier is a proficient one.
    for (const l of lines) {
      const m = /^(Str|Dex|Con|Int|Wis|Cha)\s+\d{1,2}\s+([+−-]\s*\d+)\s+([+−-]\s*\d+)$/i.exec(l);
      const n = (x: string) => Number(x.replace(/−/g, '-').replace(/\s+/g, ''));
      if (m && n(m[3]) > n(m[2])) c.saves.push(m[1].toLowerCase() as Ability);
    }
  }
  const skills = field(/^Skills\s+(.+)$/i);
  if (skills) c.skills = skills[1].trim();
  const senses = field(/^Senses\s+(.+)$/i);
  if (senses) c.senses = senses[1].trim();
  const langs = field(/^Languages\s+(.+)$/i);
  if (langs) c.languages = langs[1].trim();
  const cr = field(/^(?:CR|Challenge)\s+([\d/]+)/i);
  if (cr) {
    c.cr = cr[1];
    const [n, d] = cr[1].split('/').map(Number);
    c.pb = String(pbForCr(d ? n / d : n));
  }
  if (/proficiency bonus|\bPB\b/i.test(all) && !cr) c.pb = '{PB}';

  // Entries: "Name. Text" (or "Name (Recharge 5–6). Text") under Traits / Actions / Bonus Actions / Reactions.
  let kind: CompanionAction['kind'] = 'trait';
  for (const l of lines) {
    const head = SECTION[l.toLowerCase().replace(/[:.]$/, '')];
    if (head) {
      kind = head;
      continue;
    }
    const m = /^([A-Z][\w'’ /-]{0,60}?(?:\s*\([^()]{1,80}\))?)\.\s+(.+)$/.exec(l);
    if (!m || FIELD.test(m[1])) continue;
    const action = readAction(m[1].trim(), m[2].trim(), kind === 'trait' && /Attack(?: Roll)?:/i.test(m[2]) ? 'action' : kind);
    c.actions.push(action);
  }
  if (!ac && !hp && !c.actions.length) return null;
  return c;
}

/** A companion from one of the rules' creatures, every number and action filled in. */
export function companionFromCreature(def: CreatureDef): Companion {
  if (def.companion) {
    // A library creature carries its whole sheet; copy it with fresh ids.
    const { id: _id, actions, ...rest } = structuredClone(def.companion);
    return blankCompanion({ ...rest, actions: actions.map(({ id: _a, ...a }) => a) as CompanionAction[] });
  }
  const kindOf = (k: string): CompanionAction['kind'] => (k === 'bonus' ? 'bonus' : k === 'reaction' ? 'reaction' : k === 'legendary' ? 'legendary' : k === 'trait' ? 'trait' : 'action');
  return blankCompanion({
    name: def.name,
    kind: `${def.size} ${def.type}`,
    size: def.size,
    type: def.type.charAt(0).toUpperCase() + def.type.slice(1),
    ac: String(def.ac),
    maxHp: String(def.hp),
    hp: def.hp,
    speed: def.speed,
    abilities: { ...def.abilities },
    pb: String(pbForCr(def.cr)),
    saves: def.saves,
    skills: def.skills.map((s) => s.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())).join(', '),
    senses: def.senses,
    languages: def.languages,
    cr: crText(def.cr),
    source: def.source ?? 'SRD 5.2.1',
    actions: def.actions.map((a) => {
      const parsed = readAction(a.name, a.text, kindOf(a.kind));
      return blankCompanionAction({
        ...parsed,
        attack: a.attack ?? parsed.attack,
        toHit: a.toHit !== undefined ? String(a.toHit) : parsed.toHit,
        reach: a.reach ? `reach ${a.reach} ft.` : a.range ? `range ${a.range} ft.` : parsed.reach,
        damage: a.damage ? a.damage.replace(/\s*\+\s*/g, ' + ') : parsed.damage,
        damageType: a.damageType ?? parsed.damageType,
        save: a.save ?? parsed.save,
        dc: a.dc !== undefined ? String(a.dc) : parsed.dc,
      });
    }),
  });
}

/** For an AI chat: rewrites any creature write-up in the layout parseStatBlock reads. */
export const COMPANION_AI_PROMPT = `Rewrite the creature below as a D&D 5e stat block in exactly this plain-text layout, so an app can read it. Keep every number and rule. Where a number depends on the creature's owner, write it in words the way the 2024 rules do: "plus your Proficiency Bonus", "equals your spell attack modifier", "equals your spell save DC", "five times your Ranger level". Where it depends on the level a spell was cast at, write it the same way: "11 + the spell's level", "+ 5 for each spell level above 2", "half the spell's level (round down)". Where a part is for one form only, mark it "(Air only)", "(Land and Water only)".

<Name>
<Size> <Type>, <Alignment>
AC <number or formula>
HP <number or formula>
Speed <speeds>
STR <score> DEX <score> CON <score> INT <score> WIS <score> CHA <score>
Saving Throws <e.g. Dex, Wis>
Skills <e.g. Perception +4, Stealth +4>
Senses <senses>
Languages <languages>
CR <challenge rating, or leave out for a companion that uses your Proficiency Bonus>
Traits
<Trait name>. <what it does>
Actions
<Action name>. Melee Attack Roll: +<bonus>, reach <n> ft. Hit: <average> (<dice>) <Type> damage. <anything else>
<Action name>. <Ability> Saving Throw: DC <number>, <area or target>. Failure: <dice> <Type> damage.
Bonus Actions
<…>
Reactions
<…>

The creature:
`;
