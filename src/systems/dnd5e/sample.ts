import { blankCharacter, blankFeature, blankWeapon, uid, type Character } from './model';
import { SPELL_LIBRARY } from './spells';

const spell = (name: string, patch: Partial<(typeof SPELL_LIBRARY)[number]> = {}) => {
  const s = SPELL_LIBRARY.find((x) => x.name === name);
  if (!s) throw new Error(`Missing library spell ${name}`);
  return { ...structuredClone(s), id: uid(), ...patch };
};

/** A level 5 Aasimar sorcerer that shows off every element. Clearly marked as an example in the UI. */
export function sampleCharacter(): Character {
  const c = blankCharacter();
  return {
    ...c,
    isExample: true,
    name: 'Seraphine Vale',
    species: 'Aasimar',
    background: 'Acolyte',
    alignment: 'Chaotic Good',
    xp: 6500,
    classes: [{ id: uid(), classId: 'sorcerer', subclass: 'Draconic Sorcery', level: 5, hitDiceUsed: 0 }],
    abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 },
    saveProfs: { str: false, dex: false, con: true, int: false, wis: false, cha: true },
    skills: { ...c.skills, arcana: 1, persuasion: 1, insight: 1, religion: 1 },
    armor: { armorId: 'none', shield: false, magicBonus: 0, unarmored: 'draconic' },
    hp: { current: 37, temp: 0, maxOverride: null },
    bonus: { ...c.bonus, hpPerLevel: 1 }, // Draconic Resilience: +1 HP per sorcerer level
    spellcasting: { ...c.spellcasting, ability: 'cha' },
    languages: 'Common, Celestial, Draconic',
    proficiencies: 'Simple weapons. Calligrapher’s supplies.',
    spells: [
      spell('Fire Bolt'),
      spell('Ray of Frost'),
      spell('Shocking Grasp'),
      spell('Chill Touch'),
      spell('Light'),
      spell('Magic Missile'),
      spell('Burning Hands'),
      spell('Shield'),
      spell('Thunderwave'),
      spell('Scorching Ray'),
      spell('Misty Step'),
      spell('Fireball'),
      spell('Lightning Bolt'),
    ],
    weapons: [
      blankWeapon({ name: 'Dagger', damage: [{ dice: '1d4', type: 'piercing' }], finesse: true, properties: 'Finesse, Light, Thrown (20/60)', mastery: 'Nick' }),
      blankWeapon({ name: 'Light Crossbow', damage: [{ dice: '1d8', type: 'piercing' }], ranged: true, properties: 'Ammunition (80/320), Loading, Two-Handed', mastery: 'Slow' }),
    ],
    features: [
      blankFeature({ name: 'Healing Hands', source: 'Aasimar', description: 'Magic action: touch a creature and roll d4s equal to your Proficiency Bonus; it regains that many Hit Points.', usesMax: 1, recharge: 'long', roll: '{PB}d4', rollKind: 'healing', element: 'healing', shape: 'touch' }),
      blankFeature({ name: 'Celestial Revelation: Inner Radiance', source: 'Aasimar', description: 'Bonus Action, 1 minute: once on each of your turns, deal extra Radiant damage equal to your Proficiency Bonus to one target you damage. You also shed light and sear creatures within 10 feet at the end of your turns.', usesMax: 1, recharge: 'long', roll: '{PB}', rollKind: 'damage', castingTime: 'bonus', element: 'radiant', shape: 'aura' }),
      blankFeature({ name: 'Sorcery Points', source: 'Sorcerer', description: 'Fuel Metamagic or convert to spell slots.', usesMax: 'class:sorcerer', recharge: 'long' }),
      blankFeature({ name: 'Innate Sorcery', source: 'Sorcerer', description: 'Bonus Action, 1 minute: +1 to your spell save DC and Advantage on sorcerer spell attack rolls.', usesMax: 2, recharge: 'long', castingTime: 'bonus', element: 'arcane', shape: 'aura' }),
      blankFeature({ name: 'Celestial Resistance', source: 'Aasimar', description: 'Resistance to Necrotic and Radiant damage.', usesMax: null, recharge: 'none' }),
      blankFeature({ name: 'Darkvision', source: 'Aasimar', description: '60 feet.', usesMax: null, recharge: 'none' }),
    ],
    inventory: [
      { id: uid(), name: 'Arcane focus (crystal)', qty: 1, weight: 1, notes: '' },
      { id: uid(), name: 'Crossbow bolts', qty: 20, weight: 0.075, notes: '' },
      { id: uid(), name: 'Explorer’s pack', qty: 1, weight: 55, notes: '' },
    ],
    currency: { cp: 0, sp: 14, ep: 0, gp: 85, pp: 0 },
    notes: 'This is an example character. Edit anything, or start your own from the character menu.',
  };
}
