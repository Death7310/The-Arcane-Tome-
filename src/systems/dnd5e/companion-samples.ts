// Class companions' stat blocks, cut down to their mechanics in the layouts people paste: a
// 2014-style drake and homunculus (numbers in words, "plus PB"), and a 2024-style beast
// ("plus your Wisdom modifier", a choice of damage types). Test fixtures only.

export const DRAKE = `Drake Companion
Small Dragon, Neutral
Armor Class 14 + PB (natural armor)
Hit Points 5 + five times your ranger level (the drake has a number of hit dice [d10s] equal to your ranger level)
Speed 40 ft.
STR 16 (+3) DEX 12 (+1) CON 15 (+2) INT 8 (-1) WIS 14 (+2) CHA 8 (-1)
Saving Throws Dex +1 plus PB, Wis +2 plus PB
Senses darkvision 60 ft., passive Perception 12
Languages Draconic
Draconic Essence. When you summon the drake, choose a damage type: acid, cold, fire, lightning, or poison.
Actions
Bite. Melee Weapon Attack: your spell attack modifier to hit, reach 5 ft., one target. Hit: 1d6 + PB piercing damage.
Reactions
Infused Strikes. When another creature within 30 feet of the drake that it can see hits a target with a weapon attack, the drake infuses the strike with its essence, causing the attack to deal an extra 1d6 damage of the type determined by its Draconic Essence.`;

export const HOMUNCULUS = `Homunculus Servant
Tiny Construct
Armor Class 13 (natural armor)
Hit Points 1 + your Intelligence modifier + your artificer level (the homunculus has a number of Hit Dice [d4s] equal to your artificer level)
Speed 20 ft., fly 30 ft.
STR 4 (-3) DEX 15 (+2) CON 12 (+1) INT 10 (+0) WIS 10 (+0) CHA 7 (-2)
Actions
Force Strike. Ranged Spell Attack: your spell attack modifier to hit, range 30 ft., one target you can see. Hit: 1d4 + PB force damage.`;

export const LAND_BEAST = `Beast of the Land
Medium Beast, Neutral
AC 13 plus your Wisdom modifier
HP 5 plus five times your Ranger level (the beast has a number of Hit Dice [d8s] equal to your Ranger level)
Speed 40 ft., Climb 40 ft.
| | Score | Mod | Save |
| --- | --- | --- | --- |
| Str | 14 | +2 | +2 |
| Dex | 14 | +2 | +2 |
| Con | 15 | +2 | +2 |
| Int | 8 | −1 | −1 |
| Wis | 14 | +2 | +4 |
| Cha | 11 | +0 | +0 |
CR None (XP 0; PB equals your Proficiency Bonus)
Actions
Beast's Strike. Melee Attack Roll: Bonus equals your spell attack modifier, reach 5 ft. Hit: 1d8 plus 2 plus your Wisdom modifier Bludgeoning, Piercing, or Slashing damage (your choice when you summon the beast).`;
