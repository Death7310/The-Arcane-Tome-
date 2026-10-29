// Items: finding a weapon, armor or magic item by name in the catalog (the SRD 5.2.1 plus
// your rules library), turning one into a sheet weapon or inventory entry, and reading a
// weapon's or item's stat block from pasted text.
//
// Names are read the way sheets write them: "Shortbow", "Longsword +1", "+1 Longsword",
// "Flame Tongue Longsword", "Dragon Wing Shortbow" (a magic item not in the SRD, whose base
// weapon is still recognised from its name).

import { ARMOR, DAMAGE_TYPES, WEAPONS, type ArmorDef, type DamageType, type WeaponDef } from './data';
import { blankWeapon, type DamagePart, type Item, type Weapon } from './model';
import type { ItemDef, ItemTemplate } from './srd';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const MASTERIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];
const DAMAGE_RE = DAMAGE_TYPES.join('|');
const isDamageType = (s: string | undefined): s is DamageType => !!s && (DAMAGE_TYPES as readonly string[]).includes(s.toLowerCase());

/** "Flame Tongue {base}" → "Flame Tongue Longsword"; without a base, "Flame Tongue Weapon". */
export function itemName(def: ItemDef, base?: string): string {
  if (!def.name.includes('{base}')) return def.name;
  return def.name.replace('{base}', base ?? cap(def.template?.applies ?? 'item')).replace(/\s+/g, ' ').trim();
}

/** "Rare · requires attunement" for a magic item. */
export function rarityLine(def: Pick<ItemDef, 'rarity' | 'attunement' | 'charges'>): string {
  return [def.rarity, def.attunement ? 'requires attunement' : '', def.charges ? `${def.charges} charges` : ''].filter(Boolean).join(' · ');
}

/** One line for a list: category, key stats, weight and cost. */
export function itemSummary(def: ItemDef): string {
  const w = def.weapon;
  const a = def.armor;
  const t = def.template;
  return [
    def.category,
    w && `${w.dice} ${w.type}`,
    w?.properties,
    w?.mastery,
    a && (a.category === 'shield' ? `+${a.base} AC` : `AC ${a.base}${a.category === 'light' ? ' + Dex' : a.category === 'medium' ? ' + Dex (max 2)' : ''}`),
    t?.attackBonus && `+${t.attackBonus} to hit and damage`,
    t?.acBonus && `+${t.acBonus} AC`,
    ...(t?.extraDamage ?? []).map((x) => `+${x.dice} ${x.type === 'same' ? '' : x.type}`.trim()),
    rarityLine(def),
    def.weight ? `${def.weight} lb` : '',
    def.cost ? `${def.cost} gp` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// ── Finding an item by name ──────────────────────────────────────────────────

const WEAPONS_LONGEST = [...WEAPONS].sort((a, b) => b.name.length - a.name.length);
const ARMOR_LONGEST = ARMOR.filter((a) => a.id !== 'none').sort((a, b) => b.name.length - a.name.length);

/** The base weapon a name or phrase mentions ("Dragon Wing Shortbow" → Shortbow). */
export function baseWeaponIn(text: string): WeaponDef | undefined {
  return WEAPONS_LONGEST.find((w) => new RegExp(`\\b${w.name.replace(/ /g, '[\\s-]+')}s?\\b`, 'i').test(text));
}

/** The base armor a name mentions. One-word names ("Leather", "Plate") need "armor" after them, or to be the whole name. */
export function baseArmorIn(text: string): ArmorDef | undefined {
  return ARMOR_LONGEST.find((a) => {
    const name = a.name.replace(/ /g, '\\s+');
    if (a.name.includes(' ') || a.name === 'Breastplate') return new RegExp(`\\b${name}\\b`, 'i').test(text);
    return new RegExp(`\\b${name}\\s+armou?r\\b`, 'i').test(text) || new RegExp(`^\\s*(?:[+]\\d\\s+)?${name}(?:\\s+[+]\\d)?\\s*$`, 'i').test(text);
  });
}

const isShield = (text: string) => /\bshield\b/i.test(text) && !/shield of faith|\bshield spell/i.test(text);

export interface Resolved {
  /** The name as the sheet wrote it, tidied. */
  name: string;
  /** The catalog entry: a magic item (or template), gear, or the base item itself. */
  def?: ItemDef;
  weapon?: WeaponDef;
  armor?: ArmorDef;
  shield: boolean;
  /** A "+1" in the name, or the template's bonus. */
  bonus: number;
}

/** Works out what a name refers to, using the catalog when one is given. */
export function resolveItem(raw: string, items: ItemDef[] = []): Resolved {
  const name = raw.replace(/\s+/g, ' ').trim();
  const plus = /(?:^|[\s,(])\+(\d)\b/.exec(name);
  const bonus = plus ? Number(plus[1]) : 0;
  const core = name.replace(/,?\s*\(?\+\d\)?(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  const r: Resolved = { name, shield: false, bonus };
  const key = norm(core);

  // A named catalog item ("Bag of Holding", "Oathbow", "Shortbow").
  const exact = items.find((d) => !d.name.includes('{base}') && (norm(d.name) === key || norm(d.name) === norm(name)));
  // A standard base weapon or armor ("Longsword", "Chain Mail") is the base, not the item: a "+1" still applies.
  const standard = exact && ((exact.kind === 'weapon' && baseWeaponIn(exact.name)?.name === exact.name) || (exact.kind === 'armor' && exact.source === 'SRD 5.2.1'));
  if (exact && !standard) r.def = exact;
  // A magic item built on a base ("Flame Tongue Longsword", "Mithral Chain Shirt").
  if (!r.def) {
    for (const d of items) {
      if (!d.template || !d.name.includes('{base}') || /^\{base\}\s*\+\d$/.test(d.name)) continue;
      const [pre, post] = d.name.split('{base}').map((p) => escape(p.trim()));
      const m = new RegExp(`^${pre ? `${pre}\\s+` : ''}(.+?)${post ? `\\s+${post}` : ''}$`, 'i').exec(core);
      if (!m) continue;
      const applies = d.template.applies;
      const base =
        applies === 'weapon' ? baseWeaponIn(m[1])?.name : applies === 'shield' ? (isShield(m[1]) ? 'Shield' : undefined) : applies === 'ammunition' ? (/arrow|bolt|bullet|needle/i.test(m[1]) ? m[1] : undefined) : baseArmorIn(m[1])?.name;
      if (base && (!d.template.bases.length || d.template.bases.some((b) => norm(b).startsWith(norm(base)) || norm(base).startsWith(norm(b))))) {
        r.def = d;
        break;
      }
    }
  }
  const baseText = r.def?.template && !r.def.name.includes('{base}') ? r.def.template.bases[0] ?? core : core;
  // A catalog weapon with its own stats (an SRD base weapon, or homebrew) keeps them.
  if (!r.def?.weapon && (r.def?.template?.applies === 'weapon' || !r.def)) r.weapon = baseWeaponIn(baseText);
  if (!r.weapon && !r.def?.weapon) {
    r.shield = r.def?.armor?.category === 'shield' || r.def?.template?.applies === 'shield' || (!r.def && isShield(core));
    if (!r.shield) r.armor = baseArmorIn(r.def?.armor ? r.def.name : baseText);
  }
  // A plain "+1" magic weapon or armor gets the SRD's "{base} +1" entry, for its rarity and text.
  if (!r.def && bonus && (r.weapon || r.armor || r.shield)) {
    const applies = r.weapon ? 'weapon' : r.shield ? 'shield' : 'armor';
    r.def = items.find((d) => d.template?.applies === applies && d.name === `{base} +${bonus}`);
  }
  const t = r.def?.template;
  if (!bonus && t) r.bonus = t.attackBonus ?? t.acBonus ?? 0;
  return r;
}

const description = (def: ItemDef | undefined) => (def ? [rarityLine(def), def.text].filter(Boolean).join('\n\n') : '');

/** A sheet weapon for what was resolved; null when it isn't a weapon. */
export function weaponFromResolved(r: Resolved): Weapon | null {
  const own = r.def?.weapon;
  const w = r.weapon;
  if (!w && !own) return null;
  const type = (w?.type ?? own?.type ?? 'bludgeoning') as DamageType;
  const extra: DamagePart[] = (r.def?.template?.extraDamage ?? []).map((x) => ({ dice: x.dice, type: x.type === 'same' || !isDamageType(x.type) ? type : (x.type as DamageType) }));
  return blankWeapon({
    name: r.name,
    damage: [{ dice: w?.dice ?? own!.dice, type }, ...extra],
    finesse: w ? !!w.finesse : own!.finesse,
    ranged: w?.ranged ?? own!.ranged,
    properties: w?.properties ?? own!.properties,
    mastery: w?.mastery ?? own!.mastery,
    magicBonus: r.bonus,
    notes: description(r.def),
  });
}

/** An inventory entry for what was resolved, with the catalog's weight and text. */
export function inventoryFromResolved(r: Resolved, items: ItemDef[] = []): Omit<Item, 'id'> {
  const base = r.weapon ? items.find((d) => d.kind === 'weapon' && norm(d.name) === norm(r.weapon!.name)) : r.armor ? items.find((d) => d.kind === 'armor' && norm(d.name).startsWith(norm(r.armor!.name))) : undefined;
  return { name: r.name, qty: 1, weight: r.def?.weight ?? base?.weight ?? 0, notes: '', description: description(r.def) };
}

/** Armor as the Vitals panel wears it. */
export function armorFromResolved(r: Resolved): { armorId: string; shield: boolean; magicBonus: number } | null {
  if (r.shield) return { armorId: '', shield: true, magicBonus: r.bonus };
  if (r.armor) return { armorId: r.armor.id, shield: false, magicBonus: r.bonus };
  return null;
}

// ── Reading a pasted stat block ──────────────────────────────────────────────

export interface ParsedItem {
  kind: 'weapon' | 'armor' | 'item';
  name: string;
  weapon?: Weapon;
  armor?: { armorId: string; shield: boolean; magicBonus: number };
  item: Omit<Item, 'id'>;
  rarity?: string;
  attunement: boolean;
  /** Its rules text, without the rarity line. */
  text: string;
  /** What was recognised, in plain words, for the preview. */
  found: string[];
  /** Things to check. */
  check: string[];
}

const TYPE_LINE =
  /^(weapon|armou?r|shield|wondrous item|potion|ring|rod|scroll|staff|wand|ammunition|(?:simple|martial)\s+(?:melee|ranged)\s+weapon|(?:melee|ranged)\s+weapon|(?:light|medium|heavy)\s+armou?r)\b\s*(?:\(([^)]*)\))?\s*,?\s*(.*)$/i;
const RARITY_RE = /\b(very rare|uncommon|common|rare|legendary|artifact|rarity varies)\b/i;
const LABEL_RE =
  /^(damage type|damage|dmg|properties|property|weapon mastery|mastery|range|weight|cost|price|rarity|attunement|attack bonus|to hit|attack|notes?|armou?r class|ac|type|item type)(\s*[:–-]\s*|\s+)(.+)$/i;
// Without a colon, a label only counts when what follows looks like its value (so prose like
// "Range of the bow…" stays prose).
const BARE_VALUE: Record<string, RegExp> = { damage: /^\d/, dmg: /^\d/, range: /^\d/, weight: /^\d/, cost: /^\d/, price: /^\d/, properties: /^[A-Z]/, property: /^[A-Z]/, mastery: /^[A-Z]/, 'weapon mastery': /^[A-Z]/, rarity: RARITY_RE, 'attack bonus': /^[+-]?\d/, 'to hit': /^[+-]?\d/ };
const DICE_PART = new RegExp(`(\\d+d\\d+)(?:\\s*([+-])\\s*(\\d+)(?!d))?(?:\\s+(${DAMAGE_RE}))?`, 'gi');
const PROPERTY_RE = /\b(ammunition|finesse|heavy|light|loading|reach|thrown|two-handed|versatile)\b(?:\s*\(([^)]*)\))?/gi;

/** "1d8+5 Slashing + 1d4 cold" → parts (flat modifiers dropped: the sheet adds your own). */
function damageParts(text: string): { dice: string; type?: DamageType }[] {
  return [...text.matchAll(DICE_PART)].map((m) => ({ dice: m[1].toLowerCase(), type: isDamageType(m[4]) ? (m[4].toLowerCase() as DamageType) : undefined }));
}

/** Extra damage the prose describes ("takes an extra 1d6 lightning damage"). */
function proseExtras(prose: string): { dice: string; type?: DamageType | 'same'; choices?: string[] }[] {
  const out: { dice: string; type?: DamageType | 'same'; choices?: string[] }[] = [];
  const t = prose.replace(/\s+/g, ' ');
  for (const m of t.matchAll(new RegExp(`(?:extra|additional)\\s+(\\d+d\\d+)\\s+(?:points?\\s+of\\s+)?(${DAMAGE_RE})\\s+damage`, 'gi'))) out.push({ dice: m[1], type: m[2].toLowerCase() as DamageType });
  for (const m of t.matchAll(new RegExp(`(\\d+d\\d+)\\s+(?:extra|additional)\\s+(${DAMAGE_RE})\\s+damage`, 'gi'))) out.push({ dice: m[1], type: m[2].toLowerCase() as DamageType });
  for (const m of t.matchAll(/(?:extra|additional)\s+(\d+d\d+)\s+damage\b([^.]{0,140})/gi)) {
    const rest = m[2];
    if (/weapon'?s?\s+(?:normal\s+)?(?:damage\s+)?type|same type/i.test(rest)) out.push({ dice: m[1], type: 'same' });
    else {
      const choices = [...rest.matchAll(new RegExp(`\\b(${DAMAGE_RE})\\b`, 'gi'))].map((x) => x[1].toLowerCase());
      out.push({ dice: m[1], type: (choices[0] as DamageType | undefined) ?? undefined, choices: choices.length > 1 ? [...new Set(choices)] : undefined });
    }
  }
  return out;
}

const clean = (l: string) =>
  l
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‒–—−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\*\*|__|`/g, '')
    .replace(/^[-*•·]\s+/, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

/** Reads a weapon's or item's stat block (from a sheet, a book, D&D Beyond or your own notes). */
export function parseItemText(raw: string, items: ItemDef[] = []): ParsedItem {
  const lines = raw.replace(/\r/g, '').split('\n').map(clean).filter(Boolean);
  const found: string[] = [];
  const check: string[] = [];
  const labels = new Map<string, string>();
  const prose: string[] = [];
  let typeLine: RegExpExecArray | null = null;
  let name = '';
  let attackBonus: number | undefined;
  let rowDamage = '';
  let rowRest = '';

  lines.forEach((l, i) => {
    if (i === 0) {
      // "Name. Weapon (longsword), rare" on one line, or a sheet's attack row "Longsword +1 +7 1d8+5 Slashing Sap".
      const inline = /^([A-Z][^.:]{1,50})[.:]\s+(.+)$/.exec(l);
      if (inline && (TYPE_LINE.test(inline[2]) || inline[2].length > 40)) {
        name = inline[1].trim();
        l = inline[2];
      } else {
        const tokens = l.split(' ');
        const diceAt = tokens.findIndex((t) => /^\d+d\d+/i.test(t));
        if (diceAt > 0 && !TYPE_LINE.test(l)) {
          const atAtk = /^[+-]\d{1,2}$/.test(tokens[diceAt - 1]) && diceAt > 1 ? diceAt - 1 : diceAt;
          if (atAtk < diceAt) attackBonus = Number(tokens[atAtk]);
          name = tokens.slice(0, atAtk).join(' ').replace(/\s+(?:range|reach)?\s*\d+(?:\/\d+)?\s*(?:ft\.?)?$/i, '').trim();
          rowDamage = tokens.slice(diceAt).join(' ');
          rowRest = rowDamage.replace(DICE_PART, ' ');
          return;
        }
        if (!TYPE_LINE.test(l) && !LABEL_RE.test(l)) {
          name = l.replace(/[:.]$/, '');
          return;
        }
      }
    }
    const t = !typeLine && i <= 2 ? TYPE_LINE.exec(l) : null;
    if (t && (t[2] || RARITY_RE.test(t[3] ?? '') || !t[3]?.trim() || /simple|martial|melee|ranged|light|medium|heavy/i.test(t[1]))) {
      typeLine = t;
      return;
    }
    const lab = l.length <= 120 ? LABEL_RE.exec(l) : null;
    const key = lab?.[1].toLowerCase();
    if (lab && key && lab[3].length <= 90 && (/[:–-]/.test(lab[2]) || BARE_VALUE[key]?.test(lab[3])) && !labels.has(key)) {
      labels.set(key.replace(/^dmg$/, 'damage').replace(/^weapon mastery$/, 'mastery').replace(/^property$/, 'properties').replace(/^price$/, 'cost'), lab[3].trim());
      return;
    }
    prose.push(l);
  });

  const tl = typeLine as RegExpExecArray | null;
  const kindWord = tl?.[1]?.toLowerCase() ?? '';
  const paren = tl?.[2] ?? '';
  const tail = `${tl?.[3] ?? ''} ${labels.get('rarity') ?? ''}`;
  const rarity = RARITY_RE.exec(tail)?.[1];
  const attunement = /attunement/i.test(`${tail} ${labels.get('attunement') ?? ''}`) && !/^no\b/i.test(labels.get('attunement') ?? '');
  const proseText = prose.join('\n');
  const flat = proseText.replace(/\s+/g, ' ');
  if (!name) name = paren && !/\bany\b|,| or /i.test(paren) ? cap(paren) : 'New item';

  // What the name (and the catalog) say it is.
  const r = resolveItem(name, items);
  if (!r.weapon && paren && /weapon/i.test(kindWord)) r.weapon = baseWeaponIn(paren);
  if (!r.armor && !r.shield && paren && /armou?r/i.test(kindWord)) r.armor = baseArmorIn(paren) ?? baseArmorIn(`${paren} armor`);
  if (/shield/i.test(kindWord)) r.shield = true;
  const proseBonus = /\+(\d)\s+bonus\s+to\s+attack(?:\s+rolls)?\s+and\s+damage(?:\s+rolls)?/i.exec(flat) ?? /\+(\d)\s+bonus\s+to\s+(?:AC|Armou?r Class)/i.exec(flat);
  if (!r.bonus && proseBonus) r.bonus = Number(proseBonus[1]);

  const labelledDamage = labels.get('damage') ?? rowDamage;
  const parts = labelledDamage ? damageParts(labelledDamage) : [];
  const isWeapon = !!r.weapon || !!r.def?.weapon || r.def?.template?.applies === 'weapon' || /weapon/i.test(kindWord) || parts.length > 0;
  const isArmor = !isWeapon && (!!r.armor || r.shield || /armou?r|shield/i.test(kindWord) || !!r.def?.armor);

  const text = proseText || r.def?.text || '';
  const descParts = [[rarity && cap(rarity), attunement ? 'requires attunement' : ''].filter(Boolean).join(' · ') || (r.def ? rarityLine(r.def) : ''), text].filter(Boolean);
  const description = descParts.join('\n\n');
  const weightText = labels.get('weight') ?? '';
  const weight = Number(/(\d+(?:\.\d+)?)/.exec(weightText)?.[1] ?? NaN);
  const item: Omit<Item, 'id'> = { ...inventoryFromResolved(r, items), name, description };
  if (Number.isFinite(weight)) item.weight = weight;
  if (rarity) found.push(`${cap(rarity)}${attunement ? ', requires attunement' : ''}`);

  if (isWeapon) {
    const w = weaponFromResolved(r) ?? blankWeapon({ name, damage: [] });
    w.name = name;
    if (r.weapon) found.push(`Base weapon: ${r.weapon.name}`);
    if (r.def && r.def.name !== r.weapon?.name) found.push(`Matches ${itemName(r.def, r.weapon?.name)} (${r.def.source ?? 'rules'})`);
    // Damage written on the block wins over the base weapon's.
    if (parts.length) {
      const type = parts[0].type ?? w.damage[0]?.type ?? 'bludgeoning';
      if (!parts[0].type && !w.damage[0]) check.push(`No damage type next to ${parts[0].dice}: it was set to ${type}.`);
      w.damage = [{ dice: parts[0].dice, type }, ...parts.slice(1).map((p) => ({ dice: p.dice, type: p.type ?? type }))];
    }
    for (const x of proseExtras(flat)) {
      const type = x.type === 'same' || !x.type ? (w.damage[0]?.type ?? 'bludgeoning') : x.type;
      if (w.damage.slice(1).some((d) => d.dice === x.dice && d.type === type)) continue;
      w.damage.push({ dice: x.dice, type });
      if (x.choices) check.push(`The extra ${x.dice} can be ${x.choices.join(', ')}: it was set to ${type}. Change it under Extra damage if yours is different.`);
      else if (!x.type) check.push(`No damage type was given for the extra ${x.dice}: it was set to ${type}.`);
    }
    if (!w.damage.length) {
      w.damage = [{ dice: '1d6', type: 'bludgeoning' }];
      check.push('No damage dice were found: set to 1d6 bludgeoning. Enter the real damage in the weapon.');
    }
    found.push(`Damage: ${w.damage.map((d, i) => `${i ? '+ ' : ''}${d.dice} ${d.type}`).join(' ')}`);
    // Properties and mastery from the block, else the base weapon's.
    // (A sheet's attack row abbreviates properties, so a known base weapon keeps its own.)
    const propText = labels.get('properties') ?? (r.weapon ? '' : rowRest || paren);
    const range = /\b(\d{1,3})\s*\/\s*(\d{2,4})\b/.exec(`${labels.get('range') ?? ''} ${propText} ${flat}`);
    if (propText) {
      const props = [...propText.matchAll(PROPERTY_RE)].map((m) => {
        const p = m[1].toLowerCase() === 'two-handed' ? 'Two-Handed' : cap(m[1].toLowerCase());
        if ((p === 'Ammunition' || p === 'Thrown') && (m[2] ?? range?.[0])) return `${p} (${m[2] ?? `${range![1]}/${range![2]}`})`;
        if (p === 'Versatile' && m[2]) return `${p} (${m[2]})`;
        return p;
      });
      if (props.length) w.properties = [...new Set(props)].join(', ');
      const mastery = MASTERIES.find((x) => new RegExp(`\\b${x}\\b`, 'i').test(labels.get('mastery') ?? propText));
      if (mastery) w.mastery = mastery;
    } else {
      const m = labels.get('mastery') ?? rowRest;
      const mastery = m && MASTERIES.find((x) => new RegExp(`\\b${x}\\b`, 'i').test(m));
      if (mastery) w.mastery = mastery;
    }
    if (!r.weapon) {
      w.finesse = /finesse/i.test(w.properties);
      w.ranged = /ammunition/i.test(w.properties) || /ranged/i.test(`${kindWord} ${paren}`) || (!!range && !/thrown/i.test(w.properties));
    }
    if (w.properties) found.push(`Properties: ${w.properties}${w.mastery ? ` · Mastery: ${w.mastery}` : ''}`);
    if (r.bonus) (w.magicBonus = r.bonus), found.push(`+${r.bonus} to attack and damage rolls`);
    if (attackBonus !== undefined) found.push(`The sheet’s attack bonus was ${attackBonus >= 0 ? '+' : ''}${attackBonus}; the app works it out from your scores, proficiency and the magic bonus.`);
    w.notes = description;
    return { kind: 'weapon', name, weapon: w, item, rarity, attunement, text, found, check };
  }
  if (isArmor) {
    const armor = armorFromResolved(r) ?? { armorId: '', shield: false, magicBonus: r.bonus };
    found.push(armor.shield ? 'Shield' : armor.armorId ? `Armor: ${ARMOR.find((a) => a.id === armor.armorId)!.name}` : 'Armor (base type not recognised)');
    if (armor.magicBonus) found.push(`+${armor.magicBonus} to AC`);
    if (!armor.shield && !armor.armorId) check.push('Pick the armor type in Vitals so your AC is worked out.');
    return { kind: 'armor', name, armor, item, rarity, attunement, text, found, check };
  }
  if (r.def) found.push(`Matches ${itemName(r.def)} (${r.def.source ?? 'rules'})`);
  if (Number.isFinite(weight)) found.push(`${weight} lb`);
  if (description) found.push('Description');
  return { kind: 'item', name, item, rarity, attunement, text, found, check };
}

/** A pasted or document-read item as library content, so it can be picked again later. */
export function itemDefFromParsed(p: ParsedItem, id: string, source: string): ItemDef {
  const base: ItemDef = {
    id,
    name: p.name,
    kind: p.rarity ? 'magic' : p.kind === 'weapon' ? 'weapon' : p.kind === 'armor' ? 'armor' : 'gear',
    category: p.kind === 'weapon' ? 'Weapon' : p.kind === 'armor' ? (p.armor?.shield ? 'Shield' : 'Armor') : p.rarity ? 'Wondrous item' : 'Gear',
    ...(p.rarity ? { rarity: cap(p.rarity) } : {}),
    ...(p.attunement ? { attunement: true } : {}),
    ...(p.item.weight ? { weight: p.item.weight } : {}),
    text: p.text,
    source,
  };
  if (p.weapon) {
    const w = p.weapon;
    const t: ItemTemplate = { applies: 'weapon', bases: [] };
    if (w.magicBonus) (t.attackBonus = w.magicBonus), (t.damageBonus = w.magicBonus);
    if (w.damage.length > 1) t.extraDamage = w.damage.slice(1).map((d) => ({ dice: d.dice, type: d.type }));
    base.weapon = { dice: w.damage[0].dice, type: w.damage[0].type, category: 'martial', ranged: w.ranged, finesse: w.finesse, properties: w.properties, mastery: w.mastery };
    if (t.attackBonus || t.extraDamage) base.template = t;
  }
  if (p.armor) {
    const a = ARMOR.find((x) => x.id === p.armor!.armorId);
    base.armor = p.armor.shield ? { category: 'shield', base: 2 } : a ? { category: a.category === 'none' ? 'light' : a.category, base: a.base } : undefined;
    if (p.armor.magicBonus) base.template = { applies: p.armor.shield ? 'shield' : 'armor', bases: [], acBonus: p.armor.magicBonus };
  }
  return base;
}

/** An item from the rules library's JSON format (see RULES_AI_PROMPT). Unknown fields are ignored. */
export function itemFromJson(o: Record<string, unknown>, id: string, source: string): ItemDef {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const n = (v: unknown) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : undefined);
  const type = s(o.type).toLowerCase() || 'gear';
  const name = s(o.name) || 'Item';
  const rarity = s(o.rarity);
  const parts = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map((p) => ({ dice: s((p as Record<string, unknown>)?.dice).replace(/\s+/g, '').toLowerCase(), type: s((p as Record<string, unknown>)?.type).toLowerCase() }))
      .filter((p) => /^\d*d\d+$/.test(p.dice) || /^\d+$/.test(p.dice));
  const def: ItemDef = {
    id,
    name,
    kind: rarity ? 'magic' : type === 'weapon' ? 'weapon' : type === 'armor' || type === 'shield' ? 'armor' : type === 'tool' ? 'tool' : 'gear',
    category: cap(type),
    ...(rarity ? { rarity: cap(rarity) } : {}),
    ...(o.attunement ? { attunement: true } : {}),
    ...(n(o.weight) ? { weight: n(o.weight) } : {}),
    ...(n(o.cost) ? { cost: n(o.cost) } : {}),
    text: s(o.text),
    source,
  };
  const bonus = n(o.bonus);
  const extra = parts(o.extraDamage).map((p) => ({ dice: p.dice, type: isDamageType(p.type) ? p.type : 'same' }));
  if (type === 'weapon') {
    const base = baseWeaponIn(s(o.base)) ?? baseWeaponIn(name);
    const dmg = parts(o.damage)[0];
    if (base && !dmg) def.template = { applies: 'weapon', bases: [base.name] };
    else {
      const props = s(o.properties);
      const range = s(o.range);
      def.weapon = {
        dice: dmg?.dice ?? base?.dice ?? '1d6',
        type: isDamageType(dmg?.type) ? dmg!.type : (base?.type ?? 'bludgeoning'),
        category: 'martial',
        ranged: /ammunition/i.test(props) || (!!range && !/thrown/i.test(props)),
        finesse: /finesse/i.test(props),
        properties: props || base?.properties || '',
        mastery: MASTERIES.find((m) => new RegExp(`\\b${m}\\b`, 'i').test(s(o.mastery))) ?? base?.mastery ?? '',
      };
    }
    if (bonus || extra.length) def.template = { applies: 'weapon', bases: def.template?.bases ?? [], ...(bonus ? { attackBonus: bonus, damageBonus: bonus } : {}), ...(extra.length ? { extraDamage: extra } : {}) };
  } else if (type === 'armor' || type === 'shield') {
    const base = type === 'shield' ? undefined : baseArmorIn(s(o.base)) ?? baseArmorIn(`${s(o.base)} armor`) ?? baseArmorIn(name);
    def.armor = type === 'shield' ? { category: 'shield', base: 2 } : { category: base && base.category !== 'none' ? base.category : 'light', base: n(o.ac) ?? base?.base ?? 11 };
    if (bonus) def.template = { applies: type === 'shield' ? 'shield' : 'armor', bases: base ? [base.name] : [], acBonus: bonus };
  }
  return def;
}

const ITEM_HEAD = /^(weapon|armou?r|shield|wondrous item|potion|ring|rod|scroll|staff|wand|ammunition)\b\s*(?:\([^)]*\))?\s*,\s*(very rare|uncommon|common|rare|legendary|artifact|rarity varies)\b/i;

/** Magic items laid out book-style in a rules document: a name, then "Weapon (longsword), rare…", then the text. */
export function readItemBlocks(lines: string[], source: string, slug: (s: string) => string): ItemDef[] {
  const out: ItemDef[] = [];
  const starts: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const name = lines[i - 1];
    if (ITEM_HEAD.test(lines[i]) && name.length <= 60 && !/[.:;]$/.test(name) && /^[A-Z+]/.test(name)) starts.push(i - 1);
  }
  starts.forEach((start, k) => {
    let end = starts[k + 1] ?? lines.length;
    for (let j = start + 2; j < end; j++) if (/^#{1,6}\s/.test(lines[j])) end = j;
    const p = parseItemText(lines.slice(start, end).join('\n'));
    if (!out.some((d) => d.name === p.name)) out.push(itemDefFromParsed(p, `${slug(source)}:${slug(p.name)}`, source));
  });
  return out;
}
