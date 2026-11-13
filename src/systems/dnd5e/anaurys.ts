// Anaurys: a ready-made level 6 character, from the player's own D&D Beyond sheet
// (kymaera7, exported 7 November 2026): an Aasimar Ranger (Drakewarden) 4 / Warlock 2 with
// his drake, Artex.
//
// Every number is from that sheet. The Ranger and Warlock class features come from the SRD
// through syncFeatures, so Level up keeps them current. Everything the SRD doesn't have
// (the Drakewarden from Fizban's Treasury of Dragons, the Monsters of the Multiverse
// Aasimar, Shadow Touched, Toll the Dead, Primal Savagery, Armor of Agathys, the Dragon
// Wing Bow) is described in this app's own words, with the book named; check the book
// for the full rules.

import { applyBackground, findBackground } from './backgrounds';
import { DRAKEWARDEN } from './extras';
import { syncFeatures } from './leveling';
import { blankCharacter, blankCompanion, blankFeature, blankSpell, blankWeapon, uid, type Character, type Item, type Spell } from './model';
import { spellFromDef, tunedSpells } from './spells';
import { loadSrd, type Catalog } from './srd';

const MAGIC_INITIATE = 'feat:Magic Initiate (Wizard)';
const SHADOW_TOUCHED = 'feat:Shadow Touched';

const item = (name: string, qty: number, weight: number, notes = ''): Item => ({ id: uid(), name, qty, weight, notes });

/** Anaurys, ready to play. Loads the SRD rules first (for his spells and class features). */
export async function anaurysCharacter(): Promise<Character> {
  return buildAnaurys(await loadSrd());
}

export function buildAnaurys(cat: Catalog): Character {
  const defs = tunedSpells(cat.spells);
  const rules = (name: string, grantedBy: string, patch: Partial<Spell> = {}): Spell => {
    const d = defs.find((s) => s.name === name);
    if (!d) throw new Error(`Missing SRD spell ${name}`);
    return { ...spellFromDef(d, uid(), grantedBy), prepared: true, ...patch };
  };
  const own = (s: Partial<Spell> & Pick<Spell, 'name' | 'level' | 'school' | 'description'>): Spell => blankSpell({ basedOn: s.name, prepared: true, ...s });

  const base = blankCharacter();
  const c: Character = {
    ...base,
    name: 'Anaurys',
    player: 'kymaera7',
    species: 'Aasimar',
    background: 'Haunted One',
    alignment: 'Chaotic Neutral',
    xp: 0, // Milestone
    classes: [
      { id: uid(), classId: 'ranger', subclass: 'Drakewarden', subclassId: DRAKEWARDEN.id, level: 4, hitDiceUsed: 0 },
      { id: uid(), classId: 'warlock', subclass: '', level: 2, hitDiceUsed: 0 },
    ],
    abilities: { str: 8, dex: 16, con: 8, int: 11, wis: 17, cha: 15 },
    saveProfs: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
    skills: { ...base.skills, arcana: 1, investigation: 1, perception: 1, survival: 1, stealth: 2 },
    armor: { armorId: 'studded', shield: false, magicBonus: 0, unarmored: 'none' },
    speed: 30,
    size: 'Medium',
    hp: { current: 32, temp: 0, maxOverride: null },
    spellcasting: { ...base.spellcasting, ability: 'wis' },
    languages: 'Common, Abyssal, Celestial, Draconic, Giant, Primordial, Sylvan, Undercommon',
    proficiencies: 'Armor: Light, Medium, Shields. Weapons: Simple, Martial.',
    spells: [
      // Cantrips
      rules('Eldritch Blast', 'warlock'),
      rules('Chill Touch', 'warlock'),
      own({
        name: 'Toll the Dead',
        level: 0,
        school: 'Necromancy',
        range: '60 feet',
        components: 'V, S',
        resolution: 'save',
        saveAbility: 'wis',
        halfOnSave: false,
        damage: [{ dice: '1d8', type: 'necrotic' }],
        scaling: 'cantrip_dice',
        element: 'necrotic',
        shape: 'burst',
        grantedBy: MAGIC_INITIATE,
        abilityOverride: 'wis',
        description:
          "Xanathar's Guide to Everything. A mournful bell tolls for a creature you can see: on a failed Wisdom save it takes Necrotic damage, d8s, or d12s if it is already missing any Hit Points (change the dice to d12 for that). One die more at levels 5, 11 and 17.",
      }),
      rules('Ray of Frost', MAGIC_INITIATE, { abilityOverride: 'wis' }),
      own({
        name: 'Primal Savagery',
        level: 0,
        school: 'Transmutation',
        range: 'Self',
        components: 'S',
        resolution: 'attack',
        damage: [{ dice: '1d10', type: 'acid' }],
        scaling: 'cantrip_dice',
        element: 'acid',
        shape: 'touch',
        grantedBy: 'feat:Druidic Warrior',
        abilityOverride: 'wis',
        description:
          "Xanathar's Guide to Everything. Your teeth or nails sharpen: make a melee spell attack against a creature within 5 feet. On a hit it takes Acid damage. One die more at levels 5, 11 and 17. (Druidic Warrior: a Ranger spell for you, with Wisdom.)",
      }),
      // Cantrips from features count as Ranger spells (Wisdom) but not against the cantrips you know.
      rules('Guidance', 'feat:Druidic Warrior', { abilityOverride: 'wis' }),
      rules('Thaumaturgy', 'feat:Draconic Gift', { abilityOverride: 'wis' }),
      rules('Light', 'feat:Light Bearer', { abilityOverride: 'cha' }),
      // 1st level
      rules("Hunter's Mark", 'ranger'),
      rules('Cure Wounds', 'ranger'),
      rules('Fog Cloud', 'ranger'),
      rules('Alarm', 'ranger'),
      rules('Hellish Rebuke', 'warlock'),
      own({
        name: 'Armor of Agathys',
        level: 1,
        school: 'Abjuration',
        castingTime: 'bonus',
        castingTimeText: 'Bonus Action',
        range: 'Self',
        components: 'V, S, M (a shard of blue glass)',
        duration: '1 hour',
        resolution: 'utility',
        element: 'cold',
        shape: 'aura',
        grantedBy: 'warlock',
        description:
          "Player's Handbook. You gain 5 Temporary Hit Points for the duration. While you have them, a creature that hits you with a melee attack takes 5 Cold damage. Both rise by 5 for each slot level above 1.",
      }),
      rules('Comprehend Languages', 'warlock'),
      rules('Disguise Self', 'feat:Eldritch Invocations', { abilityOverride: 'cha', description: 'At will, without a spell slot (Mask of Many Faces).' }),
      rules('Ray of Sickness', SHADOW_TOUCHED, { abilityOverride: 'wis' }),
      // 2nd level
      rules('Invisibility', SHADOW_TOUCHED, { abilityOverride: 'wis' }),
    ],
    weapons: [
      blankWeapon({
        name: 'Dragon Wing Shortbow',
        damage: [
          { dice: '1d6', type: 'piercing' },
          { dice: '1d6', type: 'poison' },
        ],
        ranged: true,
        properties: 'Ammunition (80/320), Two-Handed',
        mastery: 'Vex',
        notes:
          "Fizban's Treasury of Dragons. A hit deals an extra 1d6 damage of the type of the dragon its wings came from. Set to Poison here: change the second damage type if your bow is another.",
      }),
      blankWeapon({
        name: 'Shortsword',
        damage: [{ dice: '1d6', type: 'piercing' }],
        finesse: true,
        properties: 'Finesse, Light',
        notes: 'Its mastery property is Vex, but your Weapon Mastery choices are the Longsword and the Shortbow.',
      }),
    ],
    features: [
      // Aasimar (Monsters of the Multiverse)
      blankFeature({ name: 'Celestial Resistance', source: 'Aasimar', description: 'Resistance to Necrotic and Radiant damage.', usesMax: null, recharge: 'none' }),
      blankFeature({ name: 'Darkvision', source: 'Aasimar', description: '60 feet.', usesMax: null, recharge: 'none' }),
      blankFeature({
        name: 'Healing Hands',
        source: 'Aasimar',
        description: 'Action: touch a creature; it regains Hit Points equal to a number of d4s equal to your Proficiency Bonus. Once per Long Rest.',
        usesMax: 1,
        recharge: 'long',
        roll: '{PB}d4',
        rollKind: 'healing',
        element: 'healing',
        shape: 'touch',
      }),
      blankFeature({ name: 'Light Bearer', source: 'Aasimar', description: 'You know the Light cantrip. Charisma is your spellcasting ability for it.', usesMax: null, recharge: 'none' }),
      blankFeature({
        name: 'Celestial Revelation: Radiant Soul',
        source: 'Aasimar',
        description:
          'Bonus Action: transform for 1 minute (or until you end it as a Bonus Action). While transformed you have a Fly Speed equal to your Speed, and once on each of your turns you can deal extra Radiant damage equal to your Proficiency Bonus to one target when you deal damage to it with an attack or a spell. Once per Long Rest.',
        usesMax: 1,
        recharge: 'long',
        roll: '{PB}',
        rollKind: 'damage',
        castingTime: 'bonus',
        element: 'radiant',
        shape: 'aura',
      }),
      // Ranger choices (the class features themselves come from the SRD below)
      blankFeature({
        name: 'Fighting Style: Druidic Warrior',
        source: 'Ranger 2',
        description: 'You know two Druid cantrips, Primal Savagery and Guidance. They count as Ranger spells for you and use Wisdom. Whenever you gain a Ranger level, you can swap one for another Druid cantrip.',
        usesMax: null,
        recharge: 'none',
      }),
      blankFeature({
        name: 'Weapon Masteries: Shortbow (Vex), Longsword (Sap)',
        source: 'Ranger 1',
        description:
          "Vex (Shortbow): when you hit a creature and deal damage to it, you have Advantage on your next attack roll against it before the end of your next turn. Sap (Longsword): a creature you hit has Disadvantage on its next attack roll before the start of your next turn.",
        usesMax: null,
        recharge: 'none',
      }),
      blankFeature({
        name: 'Deft Explorer: Stealth and languages',
        source: 'Ranger 2',
        description: 'Expertise in Stealth, and two extra languages.',
        usesMax: null,
        recharge: 'none',
      }),
      // Drakewarden (Fizban's Treasury of Dragons)
      blankFeature({
        name: 'Draconic Gift',
        source: 'Drakewarden 3',
        description: 'You know the Thaumaturgy cantrip (a Ranger spell for you), and you can speak, read and write Draconic or another language.',
        usesMax: null,
        recharge: 'none',
      }),
      blankFeature({
        name: 'Drake Companion',
        source: 'Drakewarden 3',
        description:
          "Action: summon your drake, Artex, in an unoccupied space within 30 feet, choosing its Draconic Essence (Acid, Cold, Fire, Lightning or Poison) and its look. It stays until it drops to 0 Hit Points, you summon it again, or you die. In combat it shares your initiative and acts right after you; it takes the Dodge action unless you use a Bonus Action to command it, though it moves and uses its Reaction on its own (and acts freely if you're Incapacitated). Once per Long Rest, or again by expending a spell slot of level 1 or higher. Its sheet is under Companions.",
        usesMax: 1,
        recharge: 'long',
        element: 'poison',
        shape: 'aura',
      }),
      // Warlock choices
      blankFeature({
        name: 'Pact of the Blade (Invocation)',
        source: 'Warlock 1',
        description:
          "Bonus Action: conjure a pact weapon in your hand, or bond with a magic weapon you touch. While bonded you're proficient with it and can use it as a Spellcasting Focus; when you attack with it you can use Charisma instead of Strength or Dexterity, and make it deal Necrotic, Psychic or Radiant damage instead of its usual type. The bond ends if you use this again, if the weapon is more than 5 feet from you for 1 minute, or if you die.",
        usesMax: null,
        recharge: 'none',
        castingTime: 'bonus',
        element: 'necrotic',
      }),
      blankFeature({ name: 'Mask of Many Faces (Invocation)', source: 'Warlock 2', description: 'You can cast Disguise Self without expending a spell slot, as often as you like.', usesMax: null, recharge: 'none' }),
      blankFeature({ name: 'Lessons of the First Ones (Invocation)', source: 'Warlock 2', description: 'You gain an Origin feat: Magic Initiate (Wizard).', usesMax: null, recharge: 'none' }),
      // Feats
      blankFeature({
        name: 'Shadow Touched',
        source: "Feat (Tasha's Cauldron of Everything)",
        description: 'Wisdom +1 (already in your score). You learn Invisibility and Ray of Sickness. You can cast each once per Long Rest without a spell slot, and with your spell slots too. Wisdom is their spellcasting ability.',
        usesMax: null,
        recharge: 'none',
      }),
      blankFeature({ name: 'Invisibility: free cast', source: 'Shadow Touched', description: 'Once per Long Rest.', usesMax: 1, recharge: 'long' }),
      blankFeature({ name: 'Ray of Sickness: free cast', source: 'Shadow Touched', description: 'Once per Long Rest.', usesMax: 1, recharge: 'long' }),
      blankFeature({
        name: 'Magic Initiate (Wizard)',
        source: 'Origin feat (Lessons of the First Ones)',
        description: 'Cantrips Toll the Dead and Ray of Frost, and the level 1 spell Ray of Sickness, always prepared, castable once per Long Rest without a spell slot (and with your slots). Wisdom is their spellcasting ability.',
        usesMax: null,
        recharge: 'none',
      }),
      blankFeature({ name: 'Ray of Sickness: free cast', source: 'Magic Initiate (Wizard)', description: 'Once per Long Rest.', usesMax: 1, recharge: 'long' }),
    ],
    companions: [
      blankCompanion({
        name: 'Artex',
        kind: 'Drake companion (Drakewarden)',
        size: 'Small',
        type: 'Dragon',
        ac: '14 + {PB}',
        maxHp: '5 + 5 * {LEVEL:ranger}',
        hp: 25,
        speed: '40 ft.',
        abilities: { str: 16, dex: 12, con: 15, int: 8, wis: 14, cha: 8 },
        pb: '{PB}',
        saves: ['dex', 'wis'],
        senses: 'Darkvision 60 ft.',
        languages: 'Draconic',
        cr: '—',
        essence: 'poison',
        source: "Fizban's Treasury of Dragons (Drakewarden)",
        actions: [
          {
            id: uid(),
            name: 'Draconic Essence',
            kind: 'trait',
            attack: null,
            toHit: '',
            reach: '',
            damage: '',
            damageType: '',
            save: null,
            dc: '',
            text: 'Chosen each time Artex is summoned: Acid, Cold, Fire, Lightning or Poison (Poison now). Artex is immune to that damage type, and its Infused Strikes deal it.',
          },
          {
            id: uid(),
            name: 'Bite',
            kind: 'action',
            attack: 'melee',
            toHit: '{SPELLATK}',
            reach: '5 ft.',
            damage: '1d6 + {PB}',
            damageType: 'piercing',
            save: null,
            dc: '',
            text: 'Melee attack using your spell attack modifier. From Ranger 7 (Magic Fang) it also deals an extra 1d6 damage of its essence type, 2d6 from Ranger 15.',
          },
          {
            id: uid(),
            name: 'Infused Strikes',
            kind: 'reaction',
            attack: null,
            toHit: '',
            reach: '30 ft.',
            damage: '1d6',
            damageType: '',
            save: null,
            dc: '',
            boost: true,
            text: 'When another creature within 30 feet of Artex that it can see hits with a weapon attack, Artex can use its Reaction to add 1d6 damage of its essence type to that hit.',
          },
        ],
        notes: 'Summon it with the Drake Companion feature (Action, once per Long Rest or with a spell slot). Command it with a Bonus Action, or it takes the Dodge action.',
      }),
    ],
    inventory: [
      item('Dragon Wing Shortbow', 1, 2),
      item('Studded Leather', 1, 13, 'Worn'),
      item('Scimitar', 1, 3),
      item('Shortsword', 1, 2),
      item('Arrows', 20, 0.05),
      item('Quiver', 1, 1),
      item('Backpack', 1, 5),
      item('Chest', 1, 25),
      item('Clothes, Common', 1, 3),
      item("Cartographer's Tools", 1, 6),
      item('Bedroll', 1, 7),
      item('Rations', 10, 2),
      item('Waterskin', 1, 5),
      item('Rope', 1, 5),
      item('Torch', 13, 1),
      item('Tinderbox', 2, 1),
      item('Oil (flask)', 3, 1),
      item('Crowbar', 1, 5),
      item('Hammer', 1, 3),
      item('Manacles', 1, 6),
      item('Mirror, Steel', 1, 0.5),
      item('Holy Water (flask)', 1, 1),
      item('Holy Symbol', 1, 0),
      item('Sprig of Mistletoe', 1, 0),
      item('Stake (Wooden)', 9, 0),
    ],
    currency: { cp: 0, sp: 75, ep: 0, gp: 21, pp: 0 },
    notes: [
      "Anaurys, from kymaera7's D&D Beyond sheet (7 November 2026). Male, 6'1\", 180 lb. Organization: The Dragon's Fangs.",
      "Appearance (the sheet cuts these short): skin, eyes and hair listed as Variable: Brown / Icy White / Black / Scorched; Moon Blue; Black / White.",
      "Personality: I don't run from evil. Evil runs from me. I put no trust in divine beings.",
      'Ideal: I have a dark calling that puts me above the law. (Chaotic)',
      'Flaws: I have certain rituals that I must follow every day. I can never break them. I talk to spirits that no one else can see.',
    ].join('\n\n'),
  };
  // The Ranger's and Warlock's SRD features (Favored Enemy with its free Hunter's Marks,
  // Weapon Mastery, Deft Explorer, Fighting Style, Eldritch Invocations, Magical Cunning).
  syncFeatures(c, cat);
  applyBackground(c, findBackground(c.background));
  return c;
}
