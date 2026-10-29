// Languages: who speaks them and a little of their background. The origins are the SRD
// 5.2.1's (its Standard and Rare Languages tables, CC-BY-4.0); the lore notes are this app's
// own short, setting-neutral summaries of how D&D games usually treat each language. Every
// table's world differs, so any description can be replaced with your own on the sheet.

export interface LanguageInfo {
  name: string;
  rare: boolean;
  /** Who it comes from, as the SRD puts it. */
  origin: string;
  /** Who tends to speak it, and its character and history, in brief. */
  lore: string;
}

export const LANGUAGES: LanguageInfo[] = [
  {
    name: 'Common',
    rare: false,
    origin: 'Sigil',
    lore: 'The trade tongue of the planes, said to have spread outward from Sigil, the City of Doors. Nearly every merchant, traveler and town guard speaks some of it, so it is the language strangers fall back on. Regional accents and slang vary widely.',
  },
  {
    name: 'Common Sign Language',
    rare: false,
    origin: 'Sigil',
    lore: 'A signed form of Common, used wherever speech is impossible or unwise: in noise, at a distance, in silence, or by those who don’t speak aloud. Scouts and thieves favor it for passing messages quietly.',
  },
  {
    name: 'Draconic',
    rare: false,
    origin: 'Dragons',
    lore: 'Spoken by dragons and by the peoples bound to them, such as dragonborn and kobolds. It is ancient, harsh and precise, full of hissing and guttural sounds, and much of the vocabulary of magic is rooted in it, so wizards often learn its script for their spellbooks.',
  },
  {
    name: 'Dwarvish',
    rare: false,
    origin: 'Dwarves',
    lore: 'The language of the dwarves: blunt, full of hard consonants, and written in angular runes made to be carved in stone and metal. Its craft, mining and clan words are very exact, and old dwarven records and grudges are kept in it for centuries.',
  },
  {
    name: 'Elvish',
    rare: false,
    origin: 'Elves',
    lore: 'The flowing, musical language of the elves, with fine shades of meaning and a large body of song and poetry. Because elves live so long, their speech changes slowly and old texts stay readable for ages.',
  },
  {
    name: 'Giant',
    rare: false,
    origin: 'Giants',
    lore: 'The tongue of giants and their kin, such as ogres. It is loud and slow, with deep, rolling words. Giant societies are ranked by an ancient order, and the language carries many forms of address for status and respect.',
  },
  {
    name: 'Gnomish',
    rare: false,
    origin: 'Gnomes',
    lore: 'The quick, inventive language of the gnomes, famous for long technical terms and a wealth of words for tinkering, illusion and nature. Gnomes write precise treatises and catalogs in it.',
  },
  {
    name: 'Goblin',
    rare: false,
    origin: 'Goblinoids',
    lore: 'Shared by goblins, hobgoblins and bugbears. Hobgoblins use it with military crispness and goblins with endless slang, but they understand each other. It is a common language of raiders and border warbands.',
  },
  {
    name: 'Halfling',
    rare: false,
    origin: 'Halflings',
    lore: 'The homely language of the halflings, rich in words for family, food, hearth and good fortune. Halflings rarely write much down, so it is mostly a spoken tradition of stories, songs and sayings.',
  },
  {
    name: 'Orc',
    rare: false,
    origin: 'Orcs',
    lore: 'The language of the orcs: direct and forceful, with a strong oral tradition of sagas, oaths and battle chants. Many orc words carry ideas of strength, endurance and loyalty to one’s people.',
  },
  {
    name: 'Abyssal',
    rare: true,
    origin: 'Demons of the Abyss',
    lore: 'The chaotic tongue of demons, as savage and changeable as the Abyss itself. Its sounds grate on mortal ears, and it is heard mostly in summoning circles, cult rites and the threats of fiends.',
  },
  {
    name: 'Celestial',
    rare: true,
    origin: 'Celestials',
    lore: 'The language of angels and other beings of the Upper Planes. It is said to sound beautiful even to those who don’t understand it, and it appears in holy texts, temple inscriptions and the oaths of devoted servants of the gods.',
  },
  {
    name: 'Deep Speech',
    rare: true,
    origin: 'Aberrations',
    lore: 'The alien language of aberrations such as mind flayers and beholders, born from minds far removed from mortal ones. Its sounds and ideas are hard for humanoids to grasp, and it is often spread as much by thought as by voice.',
  },
  {
    name: 'Druidic',
    rare: true,
    origin: 'Druidic circles',
    lore: 'The secret language of druids, taught only to members of a druidic circle. Druids leave hidden messages in it on trees and stones; others can spot that a message is there but cannot read it without magic.',
  },
  {
    name: 'Infernal',
    rare: true,
    origin: 'Devils of the Nine Hells',
    lore: 'The precise, legalistic language of devils. Infernal contracts are worded with deadly care, and its writing is formal and exact, so it is studied by warlocks, scholars of the Hells and anyone careful about the bargains they sign.',
  },
  {
    name: 'Primordial',
    rare: true,
    origin: 'Elementals',
    lore: 'The language of elementals and the Elemental Planes. It includes the Aquan, Auran, Ignan and Terran dialects (water, air, fire and earth), and a speaker of one dialect can understand the others.',
  },
  {
    name: 'Sylvan',
    rare: true,
    origin: 'Fey realm',
    lore: 'The lilting language of the fey, such as dryads, satyrs and pixies, and of the Feywild. It is full of riddles, wordplay and old names for wild places, and promises made in it are taken seriously by the fey.',
  },
  {
    name: 'Thieves’ Cant',
    rare: true,
    origin: 'Various criminal guilds',
    lore: 'A secret mix of slang, coded phrases and hand signs that lets criminals hide a message inside an ordinary conversation, plus marks chalked on walls to warn of guards or point the way to a safehouse.',
  },
  {
    name: 'Undercommon',
    rare: true,
    origin: 'Underdark traders',
    lore: 'The trade tongue of the Underdark, used between the many peoples who live and deal beneath the surface. It borrows heavily from the languages of those peoples and is spoken in the markets and outposts of the deep.',
  },
  { name: 'Blink Dog', rare: true, origin: 'Blink dogs', lore: 'The language of blink dogs, carried in yips, barks and growls; few others can follow it.' },
  { name: 'Gnoll', rare: true, origin: 'Gnolls', lore: 'The harsh, cackling speech of gnolls, heard among their hunting packs.' },
  { name: 'Otyugh', rare: true, origin: 'Otyughs', lore: 'The guttural language of otyughs, which also communicate through crude telepathy.' },
  { name: 'Sahuagin', rare: true, origin: 'Sahuagin', lore: 'The language of the sahuagin, the sea devils of the deep oceans, spoken underwater.' },
  { name: 'Worg', rare: true, origin: 'Worgs', lore: 'The snarling language of worgs, the large, cunning wolves that often run with goblin raiders.' },
];

const DIALECTS: Record<string, string> = { aquan: 'water', auran: 'air', ignan: 'fire', terran: 'earth' };
const key = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z']/g, '');

/** What the rules (and this app) know of a language, or null for one of your own. */
export function languageInfo(name: string): LanguageInfo | null {
  const k = key(name);
  const found = LANGUAGES.find((l) => key(l.name) === k);
  if (found) return found;
  if (DIALECTS[k]) {
    const prim = LANGUAGES.find((l) => l.name === 'Primordial')!;
    return { name: name.trim(), rare: true, origin: `Elementals (a dialect of Primordial, the ${DIALECTS[k]} elementals’ tongue)`, lore: prim.lore };
  }
  return null;
}

/** The key a language's notes are stored under, so "thieves' cant" and "Thieves’ Cant" are one language. */
export const languageKey = key;

/** The character's languages, one per name, from the comma-separated list. */
export function splitLanguages(list: string): string[] {
  const out: string[] = [];
  for (const raw of list.split(/[,;\n]/)) {
    const name = raw.trim();
    if (name && !out.some((x) => key(x) === key(name))) out.push(name);
  }
  return out;
}
