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

/** "plus your Proficiency Bonus", "your Wisdom modifier", "your Ranger level"… as tokens. */
export function tokenize(phrase: string): string {
  return phrase
    .replace(/\s*\+\s*(?:your\s+)?(?:Proficiency Bonus|PB)\b/gi, ' + {PB}')
    .replace(/\bplus\s+(?:your\s+)?(?:Proficiency Bonus|PB)\b/gi, '+ {PB}')
    .replace(/\b(?:equals?|equal to)?\s*your spell attack modifier\b/gi, '{SPELLATK}')
    .replace(/\b(?:equals?|equal to)?\s*your spell save DC\b/gi, '{SPELLDC}')
    .replace(/\byour (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier\b/gi, (_, a: string) => `{${ABILITY_WORD[a.toLowerCase()].toUpperCase()}}`)
    .replace(/\b(\w+) times your (\w+) level\b/gi, (_, n: string, cls: string) => `${NUMBER_WORD[n.toLowerCase()] ?? n} * {LEVEL:${cls.toLowerCase()}}`)
    .replace(/\byour (\w+) level\b/gi, (_, cls: string) => `{LEVEL:${cls.toLowerCase()}}`)
    .replace(/\s+/g, ' ')
    .trim();
}

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
  // "Hit: 7 (1d8 + 3) Piercing damage", "Hit: 1d8 + 3 + PB Piercing damage", "Hit: 1 Piercing damage".
  const hit = /Hit:\s*(?:(\d+)\s*\(([^)]+)\)|([^.]*?))\s+(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder) damage/i.exec(t);
  if (hit) {
    const dice = (hit[2] ?? hit[3] ?? hit[1] ?? '').trim();
    a.damage = tokenize(dice).replace(/\s*\+\s*/g, ' + ');
    a.damageType = hit[4].toLowerCase();
  } else {
    const dmg = /\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*\)?\s*(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder) damage/i.exec(t);
    if (dmg) (a.damage = dmg[1]), (a.damageType = dmg[2].toLowerCase());
  }
  const save24 = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*([^,.]+)/i.exec(t);
  const save14 = /DC\s*(\d+|equals? your spell save DC)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(t);
  if (save24) (a.save = ABILITY_WORD[save24[1].toLowerCase()]), (a.dc = tokenize(save24[2]));
  else if (save14) (a.save = ABILITY_WORD[save14[2].toLowerCase()]), (a.dc = tokenize(save14[1]));
  return blankCompanionAction(a);
}

const SECTION: Record<string, CompanionAction['kind']> = { traits: 'trait', actions: 'action', 'bonus actions': 'bonus', reactions: 'reaction', 'legendary actions': 'legendary' };

/** Reads a pasted stat block. Returns null when it doesn't look like one. */
export function parseStatBlock(text: string): Companion | null {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/^[#>*\s]+|[*\s]+$/g, '').trim()).filter(Boolean);
  if (lines.length < 3) return null;
  const all = lines.join('\n');
  const c = blankCompanion({ source: 'Pasted stat block' });
  const typeLine = lines.findIndex((l) => /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b.*\b(Aberration|Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Monstrosity|Ooze|Plant|Undead)\b/i.test(l));
  c.name = lines[typeLine > 0 ? typeLine - 1 : 0].replace(/[.:]$/, '');
  if (typeLine >= 0) {
    const m = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?:\s+or\s+\w+)?\s+(\w+)/i.exec(lines[typeLine])!;
    c.size = m[1];
    c.type = m[2];
  }
  const ac = /\b(?:AC|Armor Class)\s+([^\n(]+?)(?:\s*\(|\s+Initiative|\n|$)/i.exec(all);
  if (ac) c.ac = tokenize(ac[1]).replace(/\s*\+\s*/g, ' + ');
  const hp = /\b(?:HP|Hit Points)\s+([^\n(]+?)(?:\s*\(|\n|$)/i.exec(all);
  if (hp) {
    c.maxHp = tokenize(hp[1]).replace(/\s*\+\s*/g, ' + ');
    const n = Number(c.maxHp);
    if (Number.isFinite(n)) c.hp = n;
  }
  const speed = /\bSpeed\s+([^\n]+)/i.exec(all);
  if (speed) c.speed = speed[1].trim();
  const abilities = readText(all).abilities;
  for (const a of ABILITIES) if (abilities[a]) c.abilities[a] = abilities[a]!;
  const saves = /Saving Throws?\s+([^\n]+)/i.exec(all);
  if (saves) c.saves = ABILITIES.filter((a) => new RegExp(`\\b${a}\\b`, 'i').test(saves[1]));
  const skills = /\bSkills\s+([^\n]+)/i.exec(all);
  if (skills) c.skills = skills[1].trim();
  const senses = /\bSenses\s+([^\n]+)/i.exec(all);
  if (senses) c.senses = senses[1].trim();
  const langs = /\bLanguages\s+([^\n]+)/i.exec(all);
  if (langs) c.languages = langs[1].trim();
  const cr = /\b(?:CR|Challenge)\s+([\d/]+)/i.exec(all);
  if (cr) {
    c.cr = cr[1];
    const [n, d] = cr[1].split('/').map(Number);
    c.pb = String(pbForCr(d ? n / d : n));
  }
  if (/proficiency bonus|\bPB\b/i.test(all) && !cr) c.pb = '{PB}';

  // Entries: "Name. Text" (or "Name: Text") under Traits / Actions / Bonus Actions / Reactions.
  let kind: CompanionAction['kind'] = 'trait';
  for (const l of lines) {
    const head = SECTION[l.toLowerCase().replace(/[:.]$/, '')];
    if (head) {
      kind = head;
      continue;
    }
    const m = /^([A-Z][\w'’ ()/-]{1,60}?)\.\s+(.+)$/.exec(l);
    if (!m || /^(Armor Class|Hit Points|Speed|Skills|Senses|Languages|Challenge|Saving Throws|AC|HP|CR)\b/i.test(m[1])) continue;
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
export const COMPANION_AI_PROMPT = `Rewrite the creature below as a D&D 5e stat block in exactly this plain-text layout, so an app can read it. Keep every number and rule. Where a number depends on the creature's owner, write it in words the way the 2024 rules do: "plus your Proficiency Bonus", "equals your spell attack modifier", "equals your spell save DC", "five times your Ranger level".

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
