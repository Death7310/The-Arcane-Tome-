// Spells as people copy them from the usual places, for the paste tests. Paraphrased or short
// excerpts: only the layout matters here.
export const SAMPLES: Record<string, string> = {
  wikidot: `Hunter's Mark
Source: Player's Handbook
1st-level divination
Casting Time: 1 bonus action
Range: 90 feet
Components: V
Duration: Concentration, up to 1 hour
You choose a creature you can see within range and mystically mark it as your quarry. Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack.
At Higher Levels. When you cast this spell using a spell slot of 3rd or 4th level, you can maintain your concentration on the spell for up to 8 hours.
Spell Lists. Ranger`,
  ddbPage: `Fireball
Level
3rd
Casting Time
1 Action
Range/Area
150 ft. (20 ft. )
Components
V, S, M *
Duration
Instantaneous
School
Evocation
Attack/Save
DEX Save
Damage/Effect
Fire
A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.
At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.
* - (A tiny ball of bat guano and sulfur)
Spell Tags: Damage
Available For:
Sorcerer
Wizard`,
  phb2024: `Fireball
Level 3 Evocation (Sorcerer, Wizard)
Casting Time: Action
Range: 150 feet
Components: V, S, M (a ball of bat guano and sulfur)
Duration: Instantaneous
A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one.
Using a Higher-Level Spell Slot. The damage increases by 1d6 for each spell slot level above 3.`,
  tabbed: `Fireball
3rd-level evocation
Casting Time\t1 action
Range\t150 feet
Components\tV, S, M (a tiny ball of bat guano and sulfur)
Duration\tInstantaneous
Each creature in a 20-foot-radius sphere must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.`,
  roll20: `Fireball
3rd level Evocation
Casting Time: 1 action
Range: 150 feet
Target: A point you choose within range
Components: V S M
Material: A tiny ball of bat guano and sulfur
Duration: Instantaneous
Classes: Sorcerer, Wizard
Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.`,
  sourceUnderName: `Hunter's Mark
Player's Handbook (2024)
Level 1 Divination (Ranger)
Casting Time: Bonus Action
Range: 90 feet
Components: V
Duration: Concentration, up to 1 hour
You magically mark one creature you can see within range as your quarry. Until the spell ends, you deal an extra 1d6 Force damage to the target whenever you hit it with an attack roll.`,
  pdfWrapped: `FIREBALL
3rd-level evocation
Casting Time: 1 action
Range: 150 feet
Components: V, S, M (a tiny ball of bat
guano and sulfur)
Duration: Instantaneous
A bright streak flashes from your pointing finger to a point you choose within range. Each creature in a 20-foot-radius sphere must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.`,
  ddbInlineNoColon: `Hunter's Mark
1st Level Divination
Casting Time 1 Bonus Action
Range/Area 90 ft.
Components V
Duration Concentration 1 Hour
You choose a creature you can see within range and mystically mark it as your quarry.`,
  schoolDotLevel: `Misty Step
Conjuration · 2nd Level
Casting Time: 1 Bonus Action
Range: Self
Components: V
Duration: Instantaneous
Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space that you can see.`,
};

/** More layouts: 5e.tools' source line, a name that sounds like a book, two spells at once. */
export const MORE: Record<string, string> = {
  fiveETools: `Fireball
PHB p241
3rd-level evocation
Casting Time: 1 action
Range: 150 feet
Components: V, S, M (a tiny ball of bat guano and sulfur)
Duration: Instantaneous
Each creature in a 20-foot-radius sphere must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.
Classes: Sorcerer, Wizard`,
  tasha: `Tasha's Hideous Laughter
1st-level enchantment
Casting Time: 1 action
Range: 30 feet
Components: V, S, M (tiny tarts and a feather that is waved in the air)
Duration: Concentration, up to 1 minute
A creature of your choice that you can see within range perceives everything as hilariously funny and falls into fits of laughter if this spell affects it. The target must succeed on a Wisdom saving throw or fall prone.`,
  two: `Misty Step
Conjuration · 2nd Level
Casting Time 1 Bonus Action
Range Self
Components V
Duration Instantaneous
Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space that you can see.

Shield
1st-level abjuration
Casting Time: 1 reaction, which you take when you are hit by an attack or targeted by the magic missile spell
Range: Self
Components: V, S
Duration: 1 round
An invisible barrier of magical force appears and protects you.`,
};
