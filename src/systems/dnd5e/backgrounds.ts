// Backgrounds: what each one gives, written into Features & traits as "Background: Name".
//
// Acolyte, Criminal, Sage and Soldier are from the System Reference Document 5.2.1 (Wizards of
// the Coast LLC, CC-BY-4.0). The other 2024 backgrounds list only their game choices (ability
// scores, feat, skills, tool), with a line about each in this app's own words; their equipment
// is in the Player's Handbook. Haunted One (an older background, from Van Richten's Guide to
// Ravenloft) is described in this app's own words. A background that isn't here still gets a
// feature, for you to describe.

import { blankFeature, type Character, type Feature } from './model';

export interface BackgroundDef {
  name: string;
  source: string;
  /** A line about who has this background (this app's words). */
  about: string;
  /** 2024 backgrounds: the three ability scores it can raise, and its Origin feat. */
  abilities?: string;
  feat?: string;
  skills: string;
  tool?: string;
  languages?: string;
  equipment?: string;
  /** Older backgrounds: their named feature and what it does. */
  feature?: { name: string; text: string };
}

const SRD = 'SRD 5.2.1';
const PHB = "Player's Handbook (2024)";
const EQUIPMENT_IN_PHB = "See the Player's Handbook (or 50 GP instead).";

export const BACKGROUNDS: BackgroundDef[] = [
  {
    name: 'Acolyte',
    source: SRD,
    about: 'You served in a temple, performing its rites and studying its faith.',
    abilities: 'Intelligence, Wisdom, Charisma',
    feat: 'Magic Initiate (Cleric)',
    skills: 'Insight, Religion',
    tool: "Calligrapher's Supplies",
    equipment: "Choose A or B: (A) Calligrapher's Supplies, Book (prayers), Holy Symbol, Parchment (10 sheets), Robe, 8 GP; or (B) 50 GP.",
  },
  { name: 'Artisan', source: PHB, about: 'You learned a craft in a workshop, and the bargaining that goes with selling it.', abilities: 'Strength, Dexterity, Intelligence', feat: 'Crafter', skills: 'Investigation, Persuasion', tool: "One kind of Artisan's Tools", equipment: EQUIPMENT_IN_PHB },
  { name: 'Charlatan', source: PHB, about: 'You made your living with lies, forged papers and a smile.', abilities: 'Dexterity, Constitution, Charisma', feat: 'Skilled', skills: 'Deception, Sleight of Hand', tool: 'Forgery Kit', equipment: EQUIPMENT_IN_PHB },
  {
    name: 'Criminal',
    source: SRD,
    about: 'You lived outside the law, earning coin in back alleys and dark corners.',
    abilities: 'Dexterity, Constitution, Intelligence',
    feat: 'Alert',
    skills: 'Sleight of Hand, Stealth',
    tool: "Thieves' Tools",
    equipment: "Choose A or B: (A) 2 Daggers, Thieves' Tools, Crowbar, 2 Pouches, Traveler's Clothes, 16 GP; or (B) 50 GP.",
  },
  { name: 'Entertainer', source: PHB, about: 'You performed for crowds: music, tumbling, stories, anything that drew applause.', abilities: 'Strength, Dexterity, Charisma', feat: 'Musician', skills: 'Acrobatics, Performance', tool: 'One kind of Musical Instrument', equipment: EQUIPMENT_IN_PHB },
  { name: 'Farmer', source: PHB, about: 'You grew up working the land and tending animals.', abilities: 'Strength, Constitution, Wisdom', feat: 'Tough', skills: 'Animal Handling, Nature', tool: "Carpenter's Tools", equipment: EQUIPMENT_IN_PHB },
  { name: 'Guard', source: PHB, about: 'You stood watch on walls and gates, alert for trouble.', abilities: 'Strength, Intelligence, Wisdom', feat: 'Alert', skills: 'Athletics, Perception', tool: 'One kind of Gaming Set', equipment: EQUIPMENT_IN_PHB },
  { name: 'Guide', source: PHB, about: 'You led travellers through the wild, reading trails and weather.', abilities: 'Dexterity, Constitution, Wisdom', feat: 'Magic Initiate (Druid)', skills: 'Stealth, Survival', tool: "Cartographer's Tools", equipment: EQUIPMENT_IN_PHB },
  { name: 'Hermit', source: PHB, about: 'You lived apart from others, in quiet study, prayer or herb-lore.', abilities: 'Constitution, Wisdom, Charisma', feat: 'Healer', skills: 'Medicine, Religion', tool: 'Herbalism Kit', equipment: EQUIPMENT_IN_PHB },
  { name: 'Merchant', source: PHB, about: 'You bought and sold goods along the trade roads.', abilities: 'Constitution, Intelligence, Charisma', feat: 'Lucky', skills: 'Animal Handling, Persuasion', tool: "Navigator's Tools", equipment: EQUIPMENT_IN_PHB },
  { name: 'Noble', source: PHB, about: 'You were raised among wealth, titles and courtly manners.', abilities: 'Strength, Intelligence, Charisma', feat: 'Skilled', skills: 'History, Persuasion', tool: 'One kind of Gaming Set', equipment: EQUIPMENT_IN_PHB },
  {
    name: 'Sage',
    source: SRD,
    about: 'You spent years in libraries and with scholars, studying lore.',
    abilities: 'Constitution, Intelligence, Wisdom',
    feat: 'Magic Initiate (Wizard)',
    skills: 'Arcana, History',
    tool: "Calligrapher's Supplies",
    equipment: "Choose A or B: (A) Quarterstaff, Calligrapher's Supplies, Book (history), Parchment (8 sheets), Robe, 8 GP; or (B) 50 GP.",
  },
  { name: 'Sailor', source: PHB, about: 'You worked the decks of ships through storms and calm.', abilities: 'Strength, Dexterity, Wisdom', feat: 'Tavern Brawler', skills: 'Acrobatics, Perception', tool: "Navigator's Tools", equipment: EQUIPMENT_IN_PHB },
  { name: 'Scribe', source: PHB, about: 'You copied texts and kept records, with an eye for detail.', abilities: 'Dexterity, Intelligence, Wisdom', feat: 'Skilled', skills: 'Investigation, Perception', tool: "Calligrapher's Supplies", equipment: EQUIPMENT_IN_PHB },
  {
    name: 'Soldier',
    source: SRD,
    about: 'You trained and fought in an army or a mercenary company.',
    abilities: 'Strength, Dexterity, Constitution',
    feat: 'Savage Attacker',
    skills: 'Athletics, Intimidation',
    tool: 'One kind of Gaming Set',
    equipment: "Choose A or B: (A) Spear, Shortbow, 20 Arrows, Gaming Set (same as above), Healer's Kit, Quiver, Traveler's Clothes, 14 GP; or (B) 50 GP.",
  },
  { name: 'Wayfarer', source: PHB, about: 'You grew up on the streets and roads, surviving by your wits.', abilities: 'Dexterity, Wisdom, Charisma', feat: 'Lucky', skills: 'Insight, Stealth', tool: "Thieves' Tools", equipment: EQUIPMENT_IN_PHB },
  {
    name: 'Haunted One',
    source: "Van Richten's Guide to Ravenloft",
    about: 'Something horrifying happened to you, and it still follows you. You know darkness better than most.',
    skills: 'Two of Arcana, Investigation, Religion and Survival',
    languages: 'Two of your choice, at least one of them exotic (such as Abyssal, Celestial, Draconic, Infernal, Primordial, Sylvan or Undercommon)',
    equipment: 'A monster hunter’s pack (chest, crowbar, hammer, three wooden stakes, holy symbol, flask of holy water, manacles, steel mirror, flask of oil, tinderbox and 3 torches), a trinket of special meaning to you, and common clothes.',
    feature: {
      name: 'Heart of Darkness',
      text: "People who look into your eyes can tell you've faced unspeakable horror. Ordinary folk may fear you, but they treat you with every courtesy and do their best to help. Unless you've shown yourself a danger to them, they'll even take up arms beside you if they see you facing an enemy alone.",
    },
  },
];

/** The name without any note in brackets: "Sage (Researcher)" → "sage". */
const key = (name: string) => name.replace(/\(.*?\)/g, '').trim().toLowerCase();

export function findBackground(name: string, extra: BackgroundDef[] = []): BackgroundDef | null {
  const k = key(name);
  if (!k) return null;
  return [...extra, ...BACKGROUNDS].find((b) => key(b.name) === k) ?? null;
}

/** The text of a background's entry in Features & traits. */
export function describeBackground(b: BackgroundDef): string {
  const parts = [b.about];
  if (b.feature) parts.push(`${b.feature.name}. ${b.feature.text}`);
  const facts = [
    b.abilities && `Ability scores: ${b.abilities} (raise one by 2 and another by 1, or all three by 1; none above 20)`,
    b.feat && `Origin feat: ${b.feat}`,
    `Skills: ${b.skills}`,
    b.tool && `Tool: ${b.tool}`,
    b.languages && `Languages: ${b.languages}`,
    b.equipment && `Equipment: ${b.equipment}`,
  ].filter(Boolean);
  parts.push(facts.join('\n'));
  return parts.join('\n\n');
}

export const BACKGROUND_PREFIX = 'Background: ';
export const isBackgroundFeature = (f: Pick<Feature, 'name'>) => f.name.startsWith(BACKGROUND_PREFIX);

/**
 * Writes the background into Features & traits as "Background: Name": its description when
 * it's known, or a starting text for you to fill in. Replaces the entry an earlier background
 * left, so there's only ever one. Returns whether it was added or updated.
 */
export function applyBackground(d: Character, def: BackgroundDef | null): 'added' | 'updated' {
  const name = (def?.name ?? d.background.trim()) || 'Background';
  const fields: Partial<Feature> = def
    ? { name: `${BACKGROUND_PREFIX}${name}`, source: `Background (${def.source})`, description: describeBackground(def) }
    : { name: `${BACKGROUND_PREFIX}${name}`, source: 'Background', description: 'Describe your background here: its feature, skills, tools, languages and equipment. (Edit this under Features & traits.)' };
  const existing = d.features.find(isBackgroundFeature);
  if (existing) {
    Object.assign(existing, fields);
    return 'updated';
  }
  d.features.push(blankFeature({ ...fields, usesMax: null, recharge: 'none', castingTime: 'other' }));
  return 'added';
}
