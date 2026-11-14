// Subclasses beyond the SRD that the app knows, so Level up gives their features like any other.
// Described in this app's own words, with the book named; check the book for the full text.
//
// Drakewarden (Fizban's Treasury of Dragons, 2021): the published version (not the playtest),
// checked against D&D Beyond's Drakewarden article and other summaries of the book. Its drake's
// numbers live on the companion (see systems/dnd5e/anaurys.ts and syncDrake below).

import type { Character, CompanionAction } from './model';
import type { FeatDef, SpeciesDef, SubclassDef } from './srd';

const FTOD = "Fizban's Treasury of Dragons";

export const DRAKEWARDEN: SubclassDef = {
  id: 'ftod:drakewarden',
  name: 'Drakewarden',
  classId: 'ranger',
  source: FTOD,
  text: 'A ranger bonded to a drake, a small draconic spirit that grows in power with you. (Fizban’s Treasury of Dragons; described in this app’s own words.)',
  features: [
    {
      key: 'draconic-gift',
      id: 'features.drakewarden.draconic-gift',
      name: 'Draconic Gift',
      level: 3,
      text: 'You learn the Thaumaturgy cantrip (a Ranger spell for you), and you can speak, read and write Draconic or another language of your choice.',
      castingTime: 'other',
    },
    {
      key: 'drake-companion',
      id: 'features.drakewarden.drake-companion',
      name: 'Drake Companion',
      level: 3,
      text: "Action: summon your drake in an unoccupied space within 30 feet, choosing its Draconic Essence (Acid, Cold, Fire, Lightning or Poison) and its look. It stays until it drops to 0 Hit Points, you summon it again, or you die. It shares your initiative and acts right after you; it takes the Dodge action unless you use a Bonus Action to command it, though it moves and uses its Reaction (Infused Strikes) on its own. Once per Long Rest, or again by expending a spell slot of level 1 or higher. Its sheet is under Companions.",
      uses: [[3, 1]],
      recharge: 'long',
      castingTime: 'action',
    },
    {
      key: 'bond-of-fang-and-scale',
      id: 'features.drakewarden.bond-of-fang-and-scale',
      name: 'Bond of Fang and Scale',
      level: 7,
      text: "Your drake grows to Medium size and sprouts wings: it gains a Fly Speed equal to its walking Speed, though it can't use it while you ride it. If you are Medium or smaller you can ride it as a mount. Magic Fang: its Bite deals an extra 1d6 damage of its Draconic Essence type. Resistance: you have Resistance to that damage type.",
      castingTime: 'other',
    },
    {
      key: 'drakes-breath',
      id: 'features.drakewarden.drakes-breath',
      name: "Drake's Breath",
      level: 11,
      text: 'Action: you or your drake exhale a 30-foot cone of Acid, Cold, Fire, Lightning or Poison (your choice; it needn’t match the drake’s essence). Each creature in it makes a Dexterity saving throw against your spell save DC, taking the damage on a failure or half on a success: 8d6, rising to 10d6 at Ranger 15. Once per Long Rest, or again by expending a spell slot of level 3 or higher.',
      uses: [[11, 1]],
      recharge: 'long',
      roll: [
        [11, '8d6'],
        [15, '10d6'],
      ],
      rollKind: 'damage',
      castingTime: 'action',
    },
    {
      key: 'perfected-bond',
      id: 'features.drakewarden.perfected-bond',
      name: 'Perfected Bond',
      level: 15,
      text: "Empowered Bite: your drake's Bite deals an extra 2d6 of its essence type (in place of Magic Fang's 1d6). Large Drake: it grows to Large and can now fly while you ride it. Reflexive Resistance: when you or your drake take damage while within 30 feet of each other, you can use your Reaction to give yourself or the drake Resistance to that damage; you can do this a number of times equal to your Proficiency Bonus per Long Rest (the uses shown here).",
      uses: 'pb',
      recharge: 'long',
      castingTime: 'reaction',
    },
  ],
};

/** Subclasses from books the app describes itself, added to the rules alongside the SRD's. */
export const EXTRA_SUBCLASSES: SubclassDef[] = [DRAKEWARDEN];

/**
 * Dual Wielder (Player's Handbook, 2024), a General feat the SRD leaves out. In this app's words;
 * check the book for its exact text. With two Nick weapons it's a fourth attack, on the Bonus
 * Action a Drakewarden also uses to command the drake.
 */
export const DUAL_WIELDER: FeatDef = {
  id: 'phb2024:dual-wielder',
  name: 'Dual Wielder',
  category: 'general',
  repeatable: false,
  minLevel: 4,
  abilities: ['str', 'dex'],
  text: `General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+). Player's Handbook (2024); described in this app's own words.

***Ability Score Increase.*** Increase your Strength or Dexterity by 1, to a maximum of 20.

***Enhanced Dual Wielding.*** When you take the Attack action on your turn and attack with a Light weapon, you can make one extra attack as a Bonus Action later that turn with a different weapon, which must be a Melee weapon without the Two-Handed property. Its damage doesn't add your ability modifier unless that modifier is negative.

***Quick Draw.*** You can draw or stow two weapons that lack the Two-Handed property when you could normally draw or stow only one.`,
  source: "Player's Handbook (2024)",
};

/** Feats from books the app describes itself, added to the rules alongside the SRD's. */
export const EXTRA_FEATS: FeatDef[] = [DUAL_WIELDER];

const isDrakewarden = (c: Character) => c.classes.find((k) => k.classId === 'ranger' && (k.subclassId === DRAKEWARDEN.id || /^drakewarden$/i.test(k.subclass.trim())));

/** Magic Fang (Ranger 7) and Empowered Bite (Ranger 15): the bite's extra damage of the drake's essence type. */
export const DRAKE_BITE_EXTRA: NonNullable<CompanionAction['extra']> = [
  { level: 7, dice: '1d6' },
  { level: 15, dice: '2d6' },
];

/**
 * Keeps a Drakewarden's drake in step with the ranger's level: its Bite gains Magic Fang's extra
 * damage (from Ranger 7; it only applies from that level, so it can be set at any level), and its
 * size and flight follow Bond of Fang and Scale (7) and Perfected Bond (15). Only drakes (a
 * companion with Infused Strikes or a Draconic Essence) are touched, and only what these features
 * change. Runs whenever class features are brought in line (Level up, level down, an update).
 */
export function syncDrake(d: Character) {
  const ranger = isDrakewarden(d);
  if (!ranger) return;
  const level = ranger.level;
  for (const k of d.companions) {
    const drake = k.actions.some((a) => /infused strikes|draconic essence/i.test(a.name));
    if (!drake || level < 3) continue;
    const bite = k.actions.find((a) => /^bite$/i.test(a.name.trim()));
    if (bite && !bite.extra?.length) {
      bite.extra = DRAKE_BITE_EXTRA.map((x) => ({ ...x }));
      bite.levelOf = bite.levelOf || 'ranger';
    }
    k.size = level >= 15 ? 'Large' : level >= 7 ? 'Medium' : 'Small';
    const fly = /,?\s*fly \d+ ft\.?(?: \(not while ridden\))?/i;
    const walk = /(\d+)\s*ft/i.exec(k.speed)?.[1] ?? '40';
    const base = k.speed.replace(fly, '').trim() || `${walk} ft.`;
    k.speed = level >= 15 ? `${base}, fly ${walk} ft.` : level >= 7 ? `${base}, fly ${walk} ft. (not while ridden)` : base;
  }
}

/**
 * Aasimar (Player's Handbook, 2024), a species the SRD leaves out. In this app's words; check
 * the book for its exact text.
 */
export const AASIMAR: SpeciesDef = {
  id: 'aasimar',
  name: 'Aasimar',
  source: "Player's Handbook (2024)",
  size: 'Medium or Small',
  speed: 30,
  type: 'Humanoid',
  description:
    "Mortals touched by the Upper Planes, with a spark of celestial power. Player's Handbook (2024); described in this app's own words.",
  darkvision: 60,
  resist: ['necrotic', 'radiant'],
  hpPerLevel: 0,
  lineageLabel: '',
  lineages: [],
  traits: [
    { key: 'celestial-resistance', name: 'Celestial Resistance', text: 'You have Resistance to Necrotic damage and Radiant damage.', castingTime: 'other', spells: [] },
    { key: 'darkvision', name: 'Darkvision', text: 'You have Darkvision with a range of 60 feet.', castingTime: 'other', spells: [] },
    {
      key: 'healing-hands',
      name: 'Healing Hands',
      text: 'As a Magic action, you touch a creature and roll a number of d4s equal to your Proficiency Bonus. The creature regains that many Hit Points. Once you use this trait, you can’t again until you finish a Long Rest.',
      uses: 1,
      recharge: 'long',
      roll: [[1, '{PB}d4']],
      rollKind: 'healing',
      castingTime: 'action',
      spells: [],
    },
    { key: 'light-bearer', name: 'Light Bearer', text: 'You know the Light cantrip. Charisma is your spellcasting ability for it.', castingTime: 'other', spells: ['Light'] },
    {
      key: 'celestial-revelation',
      name: 'Celestial Revelation',
      text: 'From character level 3, as a Bonus Action you transform for 1 minute (or until you end it, no action required). Choose the form each time: Heavenly Wings (spectral wings give you a Fly Speed equal to your Speed), Inner Radiance (you shed Bright Light in a 10-foot radius and Dim Light 10 feet beyond, and at the end of each of your turns each creature within 10 feet of you takes Radiant damage equal to your Proficiency Bonus), or Necrotic Shroud (creatures other than your allies within 10 feet of you must succeed on a Charisma save, DC 8 + your Charisma modifier + your Proficiency Bonus, or be Frightened of you until the end of your next turn). Once on each of your turns while transformed, you can deal extra damage equal to your Proficiency Bonus to one target when you deal damage to it with an attack or a spell: Necrotic for the Necrotic Shroud, Radiant otherwise. Once per Long Rest.',
      level: 3,
      uses: 1,
      recharge: 'long',
      castingTime: 'bonus',
      spells: [],
    },
  ],
};

/** Species from books the app describes itself, added alongside the SRD's. */
export const EXTRA_SPECIES: SpeciesDef[] = [AASIMAR];
