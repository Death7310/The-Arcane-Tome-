// Quick-add library of common damaging, healing and defensive spells.
// Mechanics follow the System Reference Document 5.2 (Wizards of the Coast LLC,
// licensed CC-BY-4.0, https://creativecommons.org/licenses/by/4.0/). Descriptions
// are short paraphrases written for this app; check your rulebook for full text.

import { blankSpell, type Spell } from './model';

type Entry = Partial<Spell> & Pick<Spell, 'name' | 'level' | 'school'>;

const E: Entry[] = [
  // Cantrips
  { name: 'Fire Bolt', level: 0, school: 'Evocation', range: '120 feet', resolution: 'attack', damage: [{ dice: '1d10', type: 'fire' }], scaling: 'cantrip_dice', element: 'fire', shape: 'bolt', description: 'Hurl a mote of fire. Flammable objects hit ignite if not worn or carried.' },
  { name: 'Ray of Frost', level: 0, school: 'Evocation', range: '60 feet', resolution: 'attack', damage: [{ dice: '1d8', type: 'cold' }], scaling: 'cantrip_dice', element: 'cold', shape: 'ray', description: "A frigid beam. On a hit the target's Speed drops by 10 feet until your next turn starts." },
  { name: 'Shocking Grasp', level: 0, school: 'Evocation', range: 'Touch', resolution: 'attack', damage: [{ dice: '1d8', type: 'lightning' }], scaling: 'cantrip_dice', element: 'lightning', shape: 'touch', description: "Lightning springs from your hand. On a hit the target can't make Opportunity Attacks until its next turn starts." },
  { name: 'Sacred Flame', level: 0, school: 'Evocation', range: '60 feet', resolution: 'save', saveAbility: 'dex', halfOnSave: false, damage: [{ dice: '1d8', type: 'radiant' }], scaling: 'cantrip_dice', element: 'radiant', shape: 'rain', description: 'Flame-like radiance descends on a creature. Cover gives no benefit against the save.' },
  { name: 'Chill Touch', level: 0, school: 'Necromancy', range: 'Touch', resolution: 'attack', damage: [{ dice: '1d10', type: 'necrotic' }], scaling: 'cantrip_dice', element: 'necrotic', shape: 'touch', description: "Channel the chill of the grave. On a hit the target can't regain Hit Points until the end of your next turn." },
  { name: 'Eldritch Blast', level: 0, school: 'Evocation', range: '120 feet', resolution: 'attack', damage: [{ dice: '1d10', type: 'force' }], scaling: 'cantrip_beams', element: 'force', shape: 'ray', description: 'A beam of crackling energy. You fire extra beams at levels 5, 11 and 17; each makes its own attack roll.' },
  { name: 'Acid Splash', level: 0, school: 'Evocation', range: '60 feet', resolution: 'save', saveAbility: 'dex', halfOnSave: false, damage: [{ dice: '1d6', type: 'acid' }], scaling: 'cantrip_dice', element: 'acid', shape: 'burst', description: 'An acidic bubble bursts in a 5-foot-radius sphere.' },
  { name: 'Poison Spray', level: 0, school: 'Necromancy', range: '30 feet', resolution: 'attack', damage: [{ dice: '1d12', type: 'poison' }], scaling: 'cantrip_dice', element: 'poison', shape: 'cone', description: 'Spray toxic mist at a creature you can see.' },
  { name: 'Vicious Mockery', level: 0, school: 'Enchantment', range: '60 feet', components: 'V', resolution: 'save', saveAbility: 'wis', halfOnSave: false, damage: [{ dice: '1d6', type: 'psychic' }], scaling: 'cantrip_dice', element: 'psychic', shape: 'bolt', description: 'Cutting words laced with magic. On a failed save the target has Disadvantage on its next attack roll.' },
  { name: 'Light', level: 0, school: 'Evocation', range: 'Touch', components: 'V, M', duration: '1 hour', resolution: 'utility', element: 'radiant', shape: 'aura', description: 'An object sheds bright light in a 20-foot radius and dim light 20 feet beyond.' },
  { name: 'Mage Hand', level: 0, school: 'Conjuration', range: '30 feet', duration: '1 minute', resolution: 'utility', element: 'arcane', shape: 'bolt', description: 'A spectral hand manipulates objects up to 10 pounds.' },

  // 1st level
  { name: 'Magic Missile', level: 1, school: 'Evocation', range: '120 feet', resolution: 'auto', damage: [{ dice: '1d4+1', type: 'force' }], instances: 3, upcastInstances: 1, element: 'force', shape: 'bolt', description: 'Three glowing darts that always hit. One more dart per slot level above 1.' },
  { name: 'Burning Hands', level: 1, school: 'Evocation', range: 'Self (15-foot cone)', resolution: 'save', saveAbility: 'dex', damage: [{ dice: '3d6', type: 'fire' }], upcastDice: '1d6', element: 'fire', shape: 'cone', description: 'A thin sheet of flame. Half damage on a successful save. +1d6 per slot level above 1.' },
  { name: 'Thunderwave', level: 1, school: 'Evocation', range: 'Self (15-foot cube)', resolution: 'save', saveAbility: 'con', damage: [{ dice: '2d8', type: 'thunder' }], upcastDice: '1d8', element: 'thunder', shape: 'burst', description: 'A wave of thunderous force pushes failing creatures 10 feet away. +1d8 per slot level above 1.' },
  { name: 'Chromatic Orb', level: 1, school: 'Evocation', range: '90 feet', components: 'V, S, M', resolution: 'attack', damage: [{ dice: '3d8', type: 'fire' }], upcastDice: '1d8', element: 'fire', shape: 'bolt', description: 'An orb of acid, cold, fire, lightning, poison or thunder — pick the type each cast. +1d8 per slot level above 1.' },
  { name: 'Guiding Bolt', level: 1, school: 'Evocation', range: '120 feet', resolution: 'attack', damage: [{ dice: '4d6', type: 'radiant' }], upcastDice: '1d6', element: 'radiant', shape: 'bolt', description: 'A flash of light. The next attack roll against the target before your next turn ends has Advantage. +1d6 per slot level above 1.' },
  { name: 'Inflict Wounds', level: 1, school: 'Necromancy', range: 'Touch', resolution: 'save', saveAbility: 'con', damage: [{ dice: '2d10', type: 'necrotic' }], upcastDice: '1d10', element: 'necrotic', shape: 'touch', description: 'Your touch inflicts necrotic harm. Half damage on a successful save. +1d10 per slot level above 1.' },
  { name: 'Ray of Sickness', level: 1, school: 'Necromancy', range: '60 feet', resolution: 'attack', damage: [{ dice: '2d8', type: 'poison' }], upcastDice: '1d8', element: 'poison', shape: 'ray', description: 'A ray of green energy. On a hit the target also has the Poisoned condition until your next turn ends. +1d8 per slot level above 1.' },
  { name: 'Cure Wounds', level: 1, school: 'Abjuration', range: 'Touch', resolution: 'heal', healing: '2d8+{MOD}', upcastDice: '2d8', element: 'healing', shape: 'touch', description: 'A creature you touch regains Hit Points. +2d8 per slot level above 1.' },
  { name: 'Healing Word', level: 1, school: 'Abjuration', range: '60 feet', components: 'V', castingTime: 'bonus', castingTimeText: 'Bonus Action', resolution: 'heal', healing: '2d4+{MOD}', upcastDice: '2d4', element: 'healing', shape: 'bolt', description: 'A creature you can see regains Hit Points. +2d4 per slot level above 1.' },
  { name: 'Shield', level: 1, school: 'Abjuration', range: 'Self', castingTime: 'reaction', castingTimeText: 'Reaction', duration: '1 round', resolution: 'utility', element: 'force', shape: 'aura', description: '+5 AC until the start of your next turn, including against the triggering attack; no damage from Magic Missile.' },
  { name: 'Bless', level: 1, school: 'Enchantment', range: '30 feet', components: 'V, S, M', duration: 'Concentration, up to 1 minute', concentration: true, resolution: 'utility', element: 'radiant', shape: 'aura', description: 'Up to three creatures add 1d4 to attack rolls and saving throws.' },

  // 2nd level
  { name: 'Scorching Ray', level: 2, school: 'Evocation', range: '120 feet', resolution: 'attack', damage: [{ dice: '2d6', type: 'fire' }], instances: 3, upcastInstances: 1, element: 'fire', shape: 'ray', description: 'Three fiery rays, each with its own attack roll. One more ray per slot level above 2.' },
  { name: 'Shatter', level: 2, school: 'Evocation', range: '60 feet', resolution: 'save', saveAbility: 'con', damage: [{ dice: '3d8', type: 'thunder' }], upcastDice: '1d8', element: 'thunder', shape: 'burst', description: 'A painfully loud ring in a 10-foot-radius sphere. Half damage on a successful save. +1d8 per slot level above 2.' },
  { name: 'Misty Step', level: 2, school: 'Conjuration', range: 'Self', components: 'V', castingTime: 'bonus', castingTimeText: 'Bonus Action', resolution: 'utility', element: 'arcane', shape: 'aura', description: 'Teleport up to 30 feet to a space you can see.' },
  { name: 'Moonbeam', level: 2, school: 'Evocation', range: '120 feet', duration: 'Concentration, up to 1 minute', concentration: true, resolution: 'save', saveAbility: 'con', damage: [{ dice: '2d10', type: 'radiant' }], upcastDice: '1d10', element: 'radiant', shape: 'rain', description: 'A silvery beam of pale light shines down in a 5-foot-radius cylinder. Half on a success. +1d10 per slot level above 2.' },

  // 3rd level
  { name: 'Fireball', level: 3, school: 'Evocation', range: '150 feet', components: 'V, S, M', resolution: 'save', saveAbility: 'dex', damage: [{ dice: '8d6', type: 'fire' }], upcastDice: '1d6', element: 'fire', shape: 'burst', description: 'A bright streak blossoms into a 20-foot-radius explosion of flame. Half on a success. +1d6 per slot level above 3.' },
  { name: 'Lightning Bolt', level: 3, school: 'Evocation', range: 'Self (100-foot line)', components: 'V, S, M', resolution: 'save', saveAbility: 'dex', damage: [{ dice: '8d6', type: 'lightning' }], upcastDice: '1d6', element: 'lightning', shape: 'line', description: 'A 100-foot-long, 5-foot-wide line of lightning. Half on a success. +1d6 per slot level above 3.' },
  { name: 'Spirit Guardians', level: 3, school: 'Conjuration', range: 'Self (15-foot emanation)', duration: 'Concentration, up to 10 minutes', concentration: true, resolution: 'save', saveAbility: 'wis', damage: [{ dice: '3d8', type: 'radiant' }], upcastDice: '1d8', element: 'radiant', shape: 'aura', description: 'Protective spirits flit around you, dealing radiant (or necrotic) damage. Half on a success. +1d8 per slot level above 3.' },
  { name: 'Mass Healing Word', level: 3, school: 'Abjuration', range: '60 feet', components: 'V', castingTime: 'bonus', castingTimeText: 'Bonus Action', resolution: 'heal', healing: '2d4+{MOD}', upcastDice: '1d4', element: 'healing', shape: 'aura', description: 'Up to six creatures regain Hit Points. +1d4 per slot level above 3.' },

  // 4th–5th level
  { name: 'Ice Storm', level: 4, school: 'Evocation', range: '300 feet', components: 'V, S, M', resolution: 'save', saveAbility: 'dex', damage: [{ dice: '2d10', type: 'bludgeoning' }, { dice: '4d6', type: 'cold' }], upcastDice: '1d10', element: 'cold', shape: 'rain', description: 'Hail pounds a 20-foot-radius cylinder. Half on a success. +1d10 bludgeoning per slot level above 4.' },
  { name: 'Blight', level: 4, school: 'Necromancy', range: '30 feet', resolution: 'save', saveAbility: 'con', damage: [{ dice: '8d8', type: 'necrotic' }], upcastDice: '1d8', element: 'necrotic', shape: 'touch', description: 'Necromantic energy drains moisture and vitality. Half on a success. +1d8 per slot level above 4.' },
  { name: 'Cone of Cold', level: 5, school: 'Evocation', range: 'Self (60-foot cone)', components: 'V, S, M', resolution: 'save', saveAbility: 'con', damage: [{ dice: '8d8', type: 'cold' }], upcastDice: '1d8', element: 'cold', shape: 'cone', description: 'A blast of cold air. Half on a success. +1d8 per slot level above 5.' },
];

export const SPELL_LIBRARY: Spell[] = E.map((e) =>
  blankSpell({
    castingTime: 'action',
    castingTimeText: 'Action',
    components: 'V, S',
    duration: 'Instantaneous',
    halfOnSave: true,
    ...e,
    id: `srd-${e.name.toLowerCase().replace(/\W+/g, '-')}`,
  }),
);

/** A fresh copy (new id) of a library spell, ready to add to a character. */
export function cloneLibrarySpell(spell: Spell, newId: string): Spell {
  return { ...structuredClone(spell), id: newId };
}
