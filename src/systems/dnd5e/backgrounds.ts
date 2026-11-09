// Backgrounds: what each one gives, written into Features & traits as "Background: Name".
//
// Acolyte, Criminal, Sage and Soldier are from the System Reference Document 5.2.1 (Wizards of
// the Coast LLC, CC-BY-4.0). The other 2024 backgrounds list only their game choices (ability
// scores, feat, skills, tool), with a line about each in this app's own words; their equipment
// is in the Player's Handbook. The older (2014-era) backgrounds, from the 2014 Player's
// Handbook, the Sword Coast Adventurer's Guide and Van Richten's Guide to Ravenloft, give their
// proficiencies and a summary of their feature in this app's own words: check the book for the
// full text. A background that isn't here still gets a feature, for you to describe.

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
const PHB14 = "Player's Handbook (2014)";
const SCAG = "Sword Coast Adventurer's Guide";
const VRGR = "Van Richten's Guide to Ravenloft";
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
    source: VRGR,
    about: 'Something horrifying happened to you, and it still follows you. You know darkness better than most.',
    skills: 'Two of Arcana, Investigation, Religion and Survival',
    languages: 'Two of your choice, at least one of them exotic (such as Abyssal, Celestial, Draconic, Infernal, Primordial, Sylvan or Undercommon)',
    equipment: 'A monster hunter’s pack (chest, crowbar, hammer, three wooden stakes, holy symbol, flask of holy water, manacles, steel mirror, flask of oil, tinderbox and 3 torches), a trinket of special meaning to you, and common clothes.',
    feature: {
      name: 'Heart of Darkness',
      text: "People who look into your eyes can tell you've faced unspeakable horror. Ordinary folk may fear you, but they treat you with every courtesy and do their best to help. Unless you've shown yourself a danger to them, they'll even take up arms beside you if they see you facing an enemy alone.",
    },
  },
  // ── Older backgrounds (2014-era books) ──
  { name: 'Acolyte (2014)', source: PHB14, about: 'You served in a temple as an intermediary between the holy and the mortal world.', skills: 'Insight, Religion', languages: 'Two of your choice', feature: { name: 'Shelter of the Faithful', text: 'You and your companions can count on free healing and care at temples, shrines and other places of your faith, and those who share your faith will support you (within reason).' } },
  { name: 'Charlatan (2014)', source: PHB14, about: 'You know how to work people: what they want to hear and what lies they’ll believe.', skills: 'Deception, Sleight of Hand', tool: 'Disguise kit, forgery kit', feature: { name: 'False Identity', text: 'You have a second identity, with papers, acquaintances and disguises to match, and you can forge documents you have seen.' } },
  { name: 'Criminal (2014)', source: PHB14, about: 'You have a history of breaking the law and contacts in the underworld.', skills: 'Deception, Stealth', tool: 'One gaming set, thieves’ tools', feature: { name: 'Criminal Contact', text: 'You have a reliable contact who links you to a network of criminals and can carry messages for you, even over long distances.' } },
  { name: 'Entertainer (2014)', source: PHB14, about: 'You thrive in front of an audience.', skills: 'Acrobatics, Performance', tool: 'Disguise kit, one musical instrument', feature: { name: 'By Popular Demand', text: 'You can always find a place to perform; while you do, you get modest lodging and food for free, and you become something of a local figure.' } },
  { name: 'Folk Hero', source: PHB14, about: 'You come from humble roots, and the common folk see you as their champion.', skills: 'Animal Handling, Survival', tool: 'One kind of artisan’s tools, vehicles (land)', feature: { name: 'Rustic Hospitality', text: 'Common folk will shelter you, and hide you from the law or anyone searching for you, though they won’t risk their lives for you.' } },
  { name: 'Guild Artisan', source: PHB14, about: 'You are a member of an artisans’ guild, skilled in a craft.', skills: 'Insight, Persuasion', tool: 'One kind of artisan’s tools', languages: 'One of your choice', feature: { name: 'Guild Membership', text: 'Your guild offers lodging and food when you need it, help in legal disputes, and contacts with influential people, as long as you pay your dues (5 GP a month).' } },
  { name: 'Hermit (2014)', source: PHB14, about: 'You lived in seclusion for a formative part of your life.', skills: 'Medicine, Religion', tool: 'Herbalism kit', languages: 'One of your choice', feature: { name: 'Discovery', text: 'Your solitude led you to a unique and powerful discovery: a truth, a secret, a place. Work out what it is with your DM.' } },
  { name: 'Noble (2014)', source: PHB14, about: 'You were born to wealth, power and privilege.', skills: 'History, Persuasion', tool: 'One gaming set', languages: 'One of your choice', feature: { name: 'Position of Privilege', text: 'You are welcome in high society, common folk try to accommodate you, and you can get an audience with a local noble if you need one.' } },
  { name: 'Outlander', source: PHB14, about: 'You grew up in the wilds, far from civilization.', skills: 'Athletics, Survival', tool: 'One musical instrument', languages: 'One of your choice', feature: { name: 'Wanderer', text: 'You have an excellent memory for maps and land, and can find food and fresh water each day for yourself and up to five others, if the land offers them.' } },
  { name: 'Sage (2014)', source: PHB14, about: 'You spent years learning the lore of the multiverse.', skills: 'Arcana, History', languages: 'Two of your choice', feature: { name: 'Researcher', text: 'When you don’t know a piece of lore, you usually know where or from whom you can learn it.' } },
  { name: 'Sailor (2014)', source: PHB14, about: 'You sailed on a seagoing vessel for years.', skills: 'Athletics, Perception', tool: 'Navigator’s tools, vehicles (water)', feature: { name: "Ship's Passage", text: 'You can get free passage on a sailing ship for yourself and your companions, in exchange for helping the crew.' } },
  { name: 'Soldier (2014)', source: PHB14, about: 'War has been your life for as long as you care to remember.', skills: 'Athletics, Intimidation', tool: 'One gaming set, vehicles (land)', feature: { name: 'Military Rank', text: 'Soldiers loyal to your former army still recognize your rank; you can borrow simple equipment or horses and visit friendly military camps.' } },
  { name: 'Urchin', source: PHB14, about: 'You grew up on the streets, alone and poor.', skills: 'Sleight of Hand, Stealth', tool: 'Disguise kit, thieves’ tools', feature: { name: 'City Secrets', text: 'You know a city’s hidden ways: out of combat, you and your companions can travel between places in a city twice as fast as usual.' } },
  { name: 'City Watch', source: SCAG, about: 'You served in a city’s watch or guard, keeping the peace.', skills: 'Athletics, Insight', languages: 'Two of your choice', feature: { name: "Watcher's Eye", text: 'You can easily find the local watch post and spot the places where criminals gather.' } },
  { name: 'Clan Crafter', source: SCAG, about: 'You learned a craft among a dwarven clan.', skills: 'History, Insight', tool: 'One kind of artisan’s tools', languages: 'Dwarvish, or another if you already speak it', feature: { name: 'Respect of the Stout Folk', text: 'Dwarves welcome you as one of their own: you can find shelter and food in dwarven settlements, and they won’t give you away to those who hunt you.' } },
  { name: 'Cloistered Scholar', source: SCAG, about: 'You studied in a great library or monastery.', skills: 'History, plus one of Arcana, Nature or Religion', languages: 'Two of your choice', feature: { name: 'Library Access', text: 'You have free access to most libraries in your institution’s region, and the staff help you find what you seek.' } },
  { name: 'Courtier', source: SCAG, about: 'You served at a court, among nobles and their bureaucrats.', skills: 'Insight, Persuasion', languages: 'Two of your choice', feature: { name: 'Court Functionary', text: 'You know how governments and their bureaucracies work: whom to ask, and how to reach the records you want.' } },
  { name: 'Faction Agent', source: SCAG, about: 'You serve a faction, such as the Harpers or the Zhentarim.', skills: 'Insight, plus one Intelligence, Wisdom or Charisma skill', languages: 'Two of your choice', feature: { name: 'Safe Haven', text: 'Your faction gives you safe houses, contacts and a way to pass secret messages, in most places of any size.' } },
  { name: 'Far Traveler', source: SCAG, about: 'You come from a distant land, and it shows.', skills: 'Insight, Perception', tool: 'One musical instrument or gaming set', languages: 'One of your choice', feature: { name: 'All Eyes on You', text: 'Your foreign ways draw curiosity; people want to hear about your homeland, which can open doors (and invite trouble).' } },
  { name: 'Inheritor', source: SCAG, about: 'You are the heir to something of great value.', skills: 'Survival, plus one of Arcana, History or Religion', tool: 'One gaming set or musical instrument', languages: 'One of your choice', feature: { name: 'Inheritance', text: 'You hold an inheritance (an object, a secret, a title or a claim) that others may covet. Work out what it is with your DM.' } },
  { name: 'Knight of the Order', source: SCAG, about: 'You belong to an order of knights sworn to an ideal.', skills: 'Persuasion, plus one of Arcana, History, Nature or Religion', tool: 'One gaming set or musical instrument', languages: 'One of your choice', feature: { name: 'Knightly Regard', text: 'Members and supporters of your order give you shelter and help.' } },
  { name: 'Mercenary Veteran', source: SCAG, about: 'You fought for pay in a mercenary company.', skills: 'Athletics, Persuasion', tool: 'One gaming set, vehicles (land)', feature: { name: 'Mercenary Life', text: 'You know the mercenary companies of the region and can find paid work as a mercenary, enough to live modestly.' } },
  { name: 'Urban Bounty Hunter', source: SCAG, about: 'You track down wanted people in the cities.', skills: 'Two of Deception, Insight, Persuasion and Stealth', tool: 'Two of a gaming set, a musical instrument and thieves’ tools', feature: { name: 'Ear to the Ground', text: 'You have contacts wherever you hunt, who pass you word of the people you’re after.' } },
  { name: 'Uthgardt Tribe Member', source: SCAG, about: 'You grew up among the Uthgardt tribes of the North.', skills: 'Athletics, Survival', tool: 'One musical instrument or artisan’s tools', languages: 'One of your choice', feature: { name: 'Uthgardt Heritage', text: 'You know the North’s wilds: foraging, you find twice the usual food and water, and the Uthgardt and their allies welcome you.' } },
  { name: 'Waterdhavian Noble', source: SCAG, about: 'You are a scion of a noble family of Waterdeep.', skills: 'History, Persuasion', tool: 'One gaming set or musical instrument', languages: 'One of your choice', feature: { name: 'Kept in Style', text: 'Your family covers your living costs, at a comfortable lifestyle, while you are in Waterdeep and many places in the North.' } },
  { name: 'Investigator', source: VRGR, about: 'You hunt the truth behind crimes and mysteries.', skills: 'Two of Insight, Investigation and Perception', tool: 'Disguise kit, thieves’ tools', feature: { name: 'Official Inquiry', text: 'People involved in your investigations (witnesses, officials, the guardians of crime scenes) tend to grant you access and answers.' } },
];

/** The name without any note in brackets: "Sage (Researcher)" → "sage". */
const key = (name: string) => name.replace(/\(.*?\)/g, '').trim().toLowerCase();

export function findBackground(name: string, extra: BackgroundDef[] = []): BackgroundDef | null {
  const all = [...extra, ...BACKGROUNDS];
  const exact = name.trim().toLowerCase();
  const k = key(name);
  if (!k) return null;
  // "Sage (2014)" is its own entry; "Sage (Researcher)" is the Sage.
  return all.find((b) => b.name.toLowerCase() === exact) ?? all.find((b) => key(b.name) === k) ?? null;
}

/** The books the backgrounds come from, for the library's filter. */
export const BACKGROUND_SOURCES = [...new Set(BACKGROUNDS.map((b) => b.source))];

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
