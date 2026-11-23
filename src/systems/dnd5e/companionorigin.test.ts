// How a companion comes to you, and the numbers that follow from it: a spell's creature at the
// level it was cast at and in its form (the SRD 5.2.1's Find Steed, Giant Insect, Summon Dragon
// and Animate Objects, exactly as the rules print them), a class feature's following your level
// in that class (a drake, a homunculus, a primal beast), and HP that grows as you level.
import { describe, expect, it } from 'vitest';
import { buildAnaurys } from './anaurys';
import { DRAKE, HOMUNCULUS, LAND_BEAST } from './companion-samples';
import { actionDice, actionHeal, actionMore, availableBoosts, companionAc, companionMaxes, compEval, compMaxHp, depart, durationFor, followMaxHp, goneAtZero, isHere, originOf, passTime, roundsOf, roundsText, tickSummons, tidyDice, timeText } from './companion';
import { endConcentration, startFight } from './enemies';
import { presentWho } from './battle';
import { EXTRA_SUBCLASSES } from './extras';
import { describeFormula } from './formula';
import { applyLevelUp, levelDown, planLevelUp } from './leveling';
import { blankCharacter, blankCompanion, blankSpell, normalizeCharacter, readOrigin, uid, type Character, type Companion } from './model';
import { summonedCreature } from './spellimport';
import { parseStatBlock, tokenize } from './statblock';
import { applyRuleSet, damageFormula, fitConstant, hpPart, ruleSetFor, splitDamage, withConstant } from './scaling';
import { castSummon, companionFromBlock, followClass, lineForForm, readCompanionPaste, slotText, summonCompanion, summonForms, upcastOf } from './summon';
import { readPastedSpells } from './spellimport';
import { SUMMON_BEAST } from './summon-sample';
import classes from './srd/classes.json';
import creatures from './srd/creatures.json';
import feats from './srd/feats.json';
import items from './srd/items.json';
import spells from './srd/spells.json';
import subclasses from './srd/subclasses.json';
import type { Catalog } from './srd';

const cat = { classes, subclasses: [...subclasses, ...EXTRA_SUBCLASSES], feats, spells, creatures, items } as unknown as Catalog;
const refs = spells.map((s) => ({ name: s.name, level: s.level, description: s.description }));
const blockOf = (name: string) => summonedCreature(spells.find((s) => s.name === name)!.description)!;
const ranger = (level: number): Character => {
  const c = blankCharacter();
  c.classes[0] = { ...c.classes[0], classId: 'ranger', level };
  c.abilities.wis = 16;
  return c;
};
const act = (k: Companion, name: string) => k.actions.find((a) => a.name.startsWith(name));

describe('reading the spell-level words', () => {
  it('turns them into the level it was cast at, {SLOT}', () => {
    expect(tokenize('11 + the level of the spell')).toBe('11 + {SLOT}');
    expect(tokenize('14 + the spell’s level')).toBe('14 + {SLOT}');
    expect(tokenize('30 + 5 for each spell level above 2nd')).toBe('30 + 5 * max(0, {SLOT} - 2)');
    expect(tokenize('5 + 10 per spell level')).toBe('5 + 10 * {SLOT}');
    expect(tokenize('10 + 1 per spell level')).toBe('10 + {SLOT}');
    expect(tokenize('1d8 plus the spell’s level')).toBe('1d8 + {SLOT}');
    expect(tokenize('13 plus your Wisdom modifier')).toBe('13 + {WIS}');
    expect(tokenize('half your Ranger level (round down)')).toBe('floor({LEVEL:ranger} / 2)');
    expect(tokenize('2d6 + 3 + your spellcasting ability modifier')).toBe('2d6 + 3 + {MOD}');
  });

  it('says them back in words, and reads text at a level', () => {
    expect(describeFormula('30 + 5 * max(0, {SLOT} - 2)')).toBe('30 + 5 for each spell level above 2');
    expect(describeFormula('11 + {SLOT}')).toBe('11 + the spell’s level');
    expect(describeFormula('5 + 10 * {SLOT}')).toBe('5 + 10 per spell level');
    expect(slotText('The insect makes a number of attacks equal to half this spell’s level (round down).', 5)).toBe('The insect makes 2 attacks.');
    expect(slotText('60 ft., Fly 60 ft. (requires level 4+ spell)', 3)).toBe('60 ft.');
    expect(slotText('60 ft., Fly 60 ft. (requires level 4+ spell)', 4)).toBe('60 ft., Fly 60 ft.');
  });

  it('sums a dice formula’s numbers', () => {
    expect(tidyDice('1d8+4+3')).toBe('1d8+7');
    expect(tidyDice('1d6 + 3 + 5 + 1d4')).toBe('1d6+1d4+8');
    expect(tidyDice('2d6')).toBe('2d6');
    expect(tidyDice('1d4-1+1')).toBe('1d4');
    expect(tidyDice('2d6+3+3+2d6')).toBe('4d6+6');
    expect(tidyDice('2d6+3+0d6')).toBe('2d6+3');
    expect(describeFormula('2d6 + 3 + {ABOVE:5}d6')).toBe('2d6 + 3 + 1d6 for each spell level above 5');
  });
});

describe('a stat block laid out in markdown (the SRD’s own)', () => {
  it('reads its HP from its HP line, not from a trait that mentions Hit Points, and its table of scores', () => {
    const k = parseStatBlock(blockOf('Find Steed'))!;
    expect(k).toMatchObject({ name: 'Otherworldly Steed', size: 'Large', ac: '10 + {SLOT}', maxHp: '5 + 10 * {SLOT}', pb: '{PB}' });
    expect(k.abilities).toEqual({ str: 18, dex: 12, con: 14, int: 6, wis: 12, cha: 8 });
    expect(k.actions.map((a) => a.name)).toEqual(['Life Bond', 'Otherworldly Slam', 'Fell Glare (Fiend Only; Recharges after a Long Rest)', 'Fey Step (Fey Only; Recharges after a Long Rest)', 'Healing Touch (Celestial Only; Recharges after a Long Rest)']);
  });

  it('still reads a PDF’s fields run together on one line', () => {
    const k = parseStatBlock('Wolf\nMedium Beast, Unaligned\nArmor Class 13 (natural armor) Hit Points 11 (2d8 + 2) Speed 40 ft.\nSTR 12 (+1) DEX 15 (+2) CON 12 (+1) INT 3 (-4) WIS 12 (+1) CHA 6 (-2)\nBite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage.')!;
    expect(k).toMatchObject({ ac: '13', maxHp: '11', hp: 11, speed: '40 ft.' });
  });

  it('reads a save above its modifier in the table as a proficient one', () => {
    expect(parseStatBlock(LAND_BEAST)!.saves).toEqual(['wis']);
  });
});

describe('Find Steed: a spell’s creature with a form for each creature type', () => {
  const steed = (form: string, cast: number) => companionFromBlock(blockOf('Find Steed'), { kind: 'spell', name: 'Find Steed', base: 2, cast, form }, ranger(5))!;

  it('offers the three types its stat block names, in order', () => {
    expect(summonForms(blockOf('Find Steed'))).toEqual(['Celestial', 'Fey', 'Fiend']);
  });

  it('a Fey steed at 2nd level: AC 12, 25 HP, a psychic Slam of 1d8 + 2, and only the Fey’s bonus action', () => {
    const k = steed('Fey', 2);
    const me = ranger(5);
    expect(k).toMatchObject({ type: 'Fey', hp: 25 });
    expect(companionAc(k, me).total).toBe(12);
    expect(act(k, 'Otherworldly Slam')).toMatchObject({ attack: 'melee', toHit: '{SPELLATK}', reach: 'reach 5 ft', damage: '1d8 + {SLOT}', damageType: 'psychic' });
    expect(actionDice(act(k, 'Otherworldly Slam')!, me, k)).toBe('1d8+2');
    expect(k.actions.map((a) => a.name)).toEqual(['Life Bond', 'Otherworldly Slam', 'Fey Step (Recharges after a Long Rest)']);
  });

  it('a Fiend steed at 4th level: AC 14, 45 HP, necrotic, flying, and Fell Glare against your spell save DC', () => {
    const k = steed('Fiend', 4);
    const me = ranger(5);
    expect(compMaxHp(k, me)).toBe(45);
    expect(companionAc(k, me).total).toBe(14);
    expect(act(k, 'Otherworldly Slam')!.damageType).toBe('necrotic');
    expect(slotText(k.speed, 4)).toBe('60 ft., Fly 60 ft.');
    expect(act(k, 'Fell Glare')).toMatchObject({ save: 'wis', dc: '{SPELLDC}' });
  });

  it('pasting the whole spell finds the spell, its level and its forms', () => {
    const text = `Find Steed\nLevel 2 Conjuration (Paladin)\nCasting Time: Action\nRange: 30 feet\nComponents: V, S\nDuration: Instantaneous\n\n${spells.find((s) => s.name === 'Find Steed')!.description}`;
    const r = readCompanionPaste(text)!;
    expect(r).toMatchObject({ spell: { name: 'Find Steed', level: 2 }, kind: 'spell', base: 2, forms: ['Celestial', 'Fey', 'Fiend'] });
    expect(r.block.startsWith('***Otherworldly Steed***')).toBe(true);
  });

  it('pasting the stat block alone finds its spell in the rules by the creature’s name', () => {
    const r = readCompanionPaste(blockOf('Find Steed'), refs)!;
    expect(r.spell?.name).toBe('Find Steed');
    expect(r.follows).toEqual(['the level the spell is cast at', 'your Proficiency Bonus', 'your spell attack modifier', 'your spell save DC']);
  });
});

describe('the SRD’s other summoned creatures', () => {
  const me = ranger(9);

  it('Giant Insect as a spider at 5th: 40 HP, the Web Bolt, two attacks, and the Poison Jab’s extra poison', () => {
    const k = companionFromBlock(blockOf('Giant Insect'), { kind: 'spell', name: 'Giant Insect', base: 4, cast: 5, form: 'Spider' }, me)!;
    expect(summonForms(blockOf('Giant Insect'))).toEqual(['Wasp', 'Spider', 'Centipede']);
    expect(compMaxHp(k, me)).toBe(40);
    expect(k.actions.map((a) => a.name)).toEqual(['Spider Climb', 'Multiattack', 'Poison Jab', 'Web Bolt']);
    expect(slotText(act(k, 'Multiattack')!.text, 5)).toBe('The insect makes 2 attacks.');
    expect(actionDice(act(k, 'Poison Jab')!, me, k)).toBe('1d6+8');
    expect(actionMore(act(k, 'Poison Jab')!, me, k)).toEqual([{ dice: '1d4', type: 'poison' }]);
    expect(slotText(k.speed, 5)).toBe('40 ft., Climb 40 ft.');
  });

  it('Summon Dragon at 6th: AC 20, 60 HP, 3 Rends and its breath (its type yours to choose)', () => {
    const k = companionFromBlock(blockOf('Summon Dragon'), { kind: 'spell', name: 'Summon Dragon', base: 5, cast: 6 }, me)!;
    expect(companionAc(k, me).total).toBe(20);
    expect(compMaxHp(k, me)).toBe(60);
    expect(slotText(act(k, 'Multiattack')!.text, 6)).toBe('The spirit makes 3 Rend attacks, and it uses Breath Weapon.');
    expect(actionDice(act(k, 'Rend')!, me, k)).toBe('1d6+10');
    expect(act(k, 'Breath Weapon')).toMatchObject({ save: 'dex', dc: '{SPELLDC}', damage: '2d6', damageType: '' });
  });

  it('Animate Objects: its size is its form, with that size’s HP and Slam', () => {
    const k = companionFromBlock(blockOf('Animate Objects'), { kind: 'spell', name: 'Animate Objects', base: 5, cast: 5, form: 'Large' }, me)!;
    expect(summonForms(blockOf('Animate Objects'))).toEqual(['Medium or smaller', 'Large', 'Huge']);
    expect(k).toMatchObject({ name: 'Animated Object', size: 'Large', type: 'Construct', hp: 20 });
    expect(act(k, 'Slam')).toMatchObject({ damage: '2d6 + 3 + {MOD}', damageType: 'force' });
  });

  it('keeps a list item for its form and drops the others', () => {
    const forms = ['Celestial', 'Fey', 'Fiend'];
    const line = 'Hit: 1d8 plus the spell’s level of Radiant (Celestial), Psychic (Fey), or Necrotic (Fiend) damage.';
    expect(lineForForm(line, 'Celestial', forms)).toBe('Hit: 1d8 plus the spell’s level of Radiant damage.');
    expect(lineForForm(line, 'Fey', forms)).toBe('Hit: 1d8 plus the spell’s level of Psychic damage.');
    expect(lineForForm(line, 'Fiend', forms)).toBe('Hit: 1d8 plus the spell’s level of Necrotic damage.');
  });
});

describe('class companions follow your level in their class', () => {
  it('a pasted drake reads as a Ranger feature: AC 14 + PB, HP 5 + 5 × your Ranger level', () => {
    const r = readCompanionPaste(DRAKE)!;
    expect(r).toMatchObject({ kind: 'feature', classId: 'ranger', follows: ['your Ranger level', 'your Proficiency Bonus', 'your spell attack modifier'] });
    const me = ranger(4);
    const k = companionFromBlock(r.block, { kind: 'feature', name: 'Drake Companion', classId: 'ranger' }, me)!;
    expect(k).toMatchObject({ ac: '14 + {PB}', maxHp: '5 + 5 * {LEVEL:ranger}', hp: 25, pb: '{PB}', saves: ['dex', 'wis'] });
    expect(act(k, 'Infused Strikes')).toMatchObject({ kind: 'reaction', boost: true, damage: '1d6' });
  });

  it('a homunculus follows your Artificer level and Intelligence; it can be set to follow another class', () => {
    const r = readCompanionPaste(HOMUNCULUS)!;
    expect(r).toMatchObject({ kind: 'feature', classId: 'artificer' });
    const k = companionFromBlock(r.block, { kind: 'feature', name: 'Homunculus Servant', classId: 'artificer' })!;
    expect(k.maxHp).toBe('1 + {INT} + {LEVEL:artificer}');
    followClass(k, '');
    expect(k.maxHp).toBe('1 + {INT} + {LEVEL}');
    const asWizard = companionFromBlock(r.block, { kind: 'feature', classId: 'wizard' })!;
    expect(asWizard.maxHp).toBe('1 + {INT} + {LEVEL:wizard}');
  });

  it('a 2024 primal beast: “13 plus your Wisdom modifier”, and the first of its damage types', () => {
    const me = ranger(3);
    const k = companionFromBlock(LAND_BEAST, { kind: 'feature', name: 'Primal Companion', classId: 'ranger' }, me)!;
    expect(companionAc(k, me).total).toBe(16);
    expect(compMaxHp(k, me)).toBe(20);
    expect(act(k, "Beast's Strike")).toMatchObject({ damage: '1d8 + 2 + {WIS}', damageType: 'bludgeoning' });
    expect(actionDice(act(k, "Beast's Strike")!, me, k)).toBe('1d8+5');
  });

  it('gains Hit Points when you level up, as you do, and loses the excess when you level down', () => {
    const c = buildAnaurys(cat);
    const artex = () => c.companions.find((k) => k.name === 'Artex')!;
    expect(compMaxHp(artex(), c)).toBe(25);
    artex().hp = 20;
    applyLevelUp(c, cat, planLevelUp(c, cat, 'ranger')!, { hpRoll: null, spells: [] });
    expect(compMaxHp(artex(), c)).toBe(30);
    expect(artex().hp).toBe(25);
    levelDown(c, cat);
    expect(artex().hp).toBe(25);
    artex().hp = 25;
    const before = companionMaxes(c);
    c.classes.find((k) => k.classId === 'ranger')!.level = 2;
    expect(followMaxHp(c, before)).toEqual([{ name: 'Artex', from: 25, to: 15 }]);
    expect(artex().hp).toBe(15);
  });
});

describe('saving and older sheets', () => {
  it('Artex comes from his Drakewarden feature, following your Ranger level', () => {
    expect(originOf(buildAnaurys(cat).companions[0])).toMatchObject({ kind: 'feature', classId: 'ranger' });
  });

  it('an older companion without one gets it from its numbers', () => {
    expect(originOf(blankCompanion({ maxHp: '5 + 5 * {LEVEL:ranger}' }))).toMatchObject({ kind: 'feature', classId: 'ranger' });
    expect(originOf(blankCompanion({ ac: '11 + {SLOT}' })).kind).toBe('spell');
    expect(originOf(blankCompanion({ ac: '13' })).kind).toBe('creature');
  });

  it('keeps how it came through a save, and reads a bad one as none', () => {
    const c = blankCharacter();
    c.companions.push(companionFromBlock(blockOf('Find Steed'), { kind: 'spell', name: 'Find Steed', base: 2, cast: 3, form: 'Fey' })!);
    const again = normalizeCharacter(JSON.parse(JSON.stringify(c)));
    expect(again.companions[0].origin).toMatchObject({ kind: 'spell', name: 'Find Steed', base: 2, cast: 3, form: 'Fey', forms: ['Celestial', 'Fey', 'Fiend'] });
    expect(compEval(again.companions[0], again.companions[0].ac, again)).toBe(13);
    expect(readOrigin({ kind: 'ritual' })).toBeNull();
    expect(readOrigin({ kind: 'spell', base: 3, cast: 1, forms: ['A'], form: 'B' })).toMatchObject({ base: 3, cast: 3, form: 'A' });
  });
});

describe('what the spell’s own text adds, and healing', () => {
  const me = ranger(9);

  it('Animate Objects: its Slam gains its size’s die for each slot level above 5th, from the spell’s text', () => {
    const r = readCompanionPaste(blockOf('Animate Objects'), refs)!;
    expect(r).toMatchObject({ spell: { name: 'Animate Objects', level: 5 }, kind: 'spell', base: 5 });
    expect(r.upcast).toBe("The creature's Slam damage increases by 1d4 (Medium or smaller), 1d6 (Large), or 1d12 (Huge) for each spell slot level above 5.");
    const at = (form: string, cast: number) => {
      const k = companionFromBlock(r.block, { kind: 'spell', name: 'Animate Objects', base: 5, cast, form, upcast: r.upcast }, me)!;
      return actionDice(k.actions.find((a) => a.name === 'Slam')!, me, k);
    };
    expect(at('Large', 5)).toBe('2d6+6');
    expect(at('Large', 7)).toBe('4d6+6');
    expect(at('Medium or smaller', 6)).toBe('2d4+3');
    expect(at('Huge', 9)).toBe('6d12+6');
  });

  it('the spell panel’s summon reads the same dice from the spell it’s on', () => {
    const d = spells.find((x) => x.name === 'Animate Objects')!.description;
    const block = summonedCreature(d)!;
    const k = summonCompanion(block, { spell: 'Animate Objects', base: 5, cast: 6, form: 'Large', upcast: upcastOf(d.slice(0, d.length - block.length)) }, me)!;
    expect(k.actions.find((a) => a.name === 'Slam')!.damage).toBe('2d6 + 3 + {MOD} + {ABOVE:5}d6');
    expect(actionDice(k.actions.find((a) => a.name === 'Slam')!, me, k)).toBe('3d6+6');
  });

  it('Find Steed’s Healing Touch heals 2d8 + the spell’s level; Life Bond heals nothing itself', () => {
    const k = companionFromBlock(blockOf('Find Steed'), { kind: 'spell', name: 'Find Steed', base: 2, cast: 3, form: 'Celestial' }, me)!;
    const touch = act(k, 'Healing Touch')!;
    expect(touch.heal).toBe('2d8 + {SLOT}');
    expect(actionHeal(touch, me, k)).toBe('2d8+3');
    expect(act(k, 'Life Bond')!.heal).toBeUndefined();
  });
});

describe('making printed numbers follow you', () => {
  const PRINTED = `Drake
Small Dragon, Neutral
Armor Class 16
Hit Points 25
Speed 40 ft.
STR 16 DEX 12 CON 15 INT 8 WIS 14 CHA 8
Actions
Bite. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 1d6 + 2 piercing damage.`;

  it('keeps today’s number when a rule is chosen: 25 HP at Ranger 4 is 5 + 5 × your Ranger level', () => {
    const me = ranger(4);
    const k = parseStatBlock(PRINTED)!;
    const rest = hpPart({ kind: 'class', per: 5, classId: 'ranger', ability: '' });
    expect(fitConstant(25, rest, k, me)).toBe(5);
    expect(withConstant(5, rest)).toBe('5 + 5 * {LEVEL:ranger}');
    expect(withConstant(-2, '{PB}')).toBe('{PB} - 2');
    expect(fitConstant(16, '{PB}', k, me)).toBe(14);
    const split = splitDamage(k.actions[0], k, me);
    expect(split).toEqual({ dice: '1d6', flat: 2 });
    expect(damageFormula(split.dice, fitConstant(split.flat, '{PB}', k, me), { kind: 'pb' })).toBe('1d6 + {PB}');
  });

  it('a drake printed for one level takes the Drakewarden’s rules, and grows', () => {
    const me = ranger(4);
    const k = parseStatBlock(PRINTED)!;
    const rules = ruleSetFor(k.name)!;
    expect(rules.id).toBe('drake');
    applyRuleSet(k, rules, me);
    expect(k).toMatchObject({ ac: '14 + {PB}', maxHp: '5 + 5 * {LEVEL:ranger}', pb: '{PB}', origin: { kind: 'feature', classId: 'ranger' } });
    expect(k.actions[0]).toMatchObject({ toHit: '{SPELLATK}', damage: '1d6 + {PB}' });
    expect(compMaxHp(k, ranger(8))).toBe(45);
    expect(ruleSetFor('Homunculus Servant')?.maxHp).toBe('1 + {INT} + {LEVEL:artificer}');
    expect(ruleSetFor('Steel Defender')?.maxHp).toBe('2 + {INT} + 5 * {LEVEL:artificer}');
  });
});

describe('Summon Beast cast by a Ranger', () => {
  // A Ranger 5 / Warlock 2 with Wisdom 16 and Charisma 18, whose usual spellcasting is the Warlock's.
  const rangerWarlock = (): Character => {
    const c = ranger(5);
    c.abilities.cha = 18;
    c.classes.push({ id: uid(), classId: 'warlock', subclass: '', level: 2, hitDiceUsed: 0, hpRolls: [] });
    c.spellcasting.ability = 'cha';
    const def = readPastedSpells(SUMMON_BEAST)[0].def;
    c.spells.push(blankSpell({ name: def.name, level: def.level, description: def.description, grantedBy: 'ranger' }));
    return c;
  };

  it('casting it with a Ranger slot brings the Bestial Spirit at that level, with the Ranger’s Wisdom', () => {
    const c = rangerWarlock();
    const s = castSummon(c, c.spells[0], 2)!;
    expect(s.index).toBe(-1);
    expect(s.comp.origin).toMatchObject({ kind: 'spell', name: 'Summon Beast', base: 2, cast: 2, castBy: 'ranger', form: 'Air' });
    expect(s.comp.hp).toBe(20);
    const maul = s.comp.actions.find((a) => a.name === 'Maul')!;
    // Proficiency 3 (level 7) + Wisdom 3, not Charisma 4.
    expect(compEval(s.comp, maul.toHit, c)).toBe(6);
    expect(compEval({ origin: { ...s.comp.origin!, castBy: undefined } }, maul.toHit, c)).toBe(7);
  });

  it('casting it again at a higher slot summons the same spirit again, at full HP for that level', () => {
    const c = rangerWarlock();
    c.companions.push({ ...castSummon(c, c.spells[0], 2)!.comp, name: 'Bristle', hp: 4 });
    const again = castSummon(c, c.spells[0], 3)!;
    expect(again.index).toBe(0);
    expect(again.comp).toMatchObject({ name: 'Bristle', hp: 25, origin: { cast: 3, castBy: 'ranger' } });
    expect(companionAc(again.comp, c).total).toBe(14);
  });

  it('a spell with no creature in it summons nothing', () => {
    const c = rangerWarlock();
    expect(castSummon(c, blankSpell({ name: 'Cure Wounds', level: 1, description: 'A creature you touch regains Hit Points.' }), 1)).toBeNull();
  });
});

describe('a summoned creature is here for its spell’s duration', () => {
  const summoner = (): Character => {
    const c = ranger(5);
    const def = readPastedSpells(SUMMON_BEAST)[0].def;
    c.spells.push(blankSpell({ name: def.name, level: def.level, description: def.description, grantedBy: 'ranger', duration: def.duration, concentration: def.concentration }));
    return c;
  };
  const cast = (c: Character, level = 2) => {
    // As casting does: the old concentration ends first, then the creature comes.
    endConcentration(c);
    c.spellcasting.concentratingOn = 'Summon Beast';
    const s = castSummon(c, c.spells[0], level)!;
    if (s.index >= 0) c.companions[s.index] = s.comp;
    else c.companions.push(s.comp);
    return c.companions.find((k) => k.origin?.name === 'Summon Beast')!;
  };

  it('reads a duration in rounds', () => {
    expect(roundsOf('Concentration, up to 1 hour')).toBe(600);
    expect(roundsOf('1 minute')).toBe(10);
    expect(roundsOf('8 hours')).toBe(4800);
    expect(roundsOf('Instantaneous')).toBeNull();
    expect(roundsText(600)).toBe('600 rounds (1 hour)');
    expect(roundsText(10)).toBe('10 rounds (1 minute)');
    expect(roundsText(15)).toBe('15 rounds (about 2 minutes)');
    expect(roundsText(599)).toBe('599 rounds (about 1 hour)');
  });

  it('comes when cast, with an hour (600 rounds) on its clock and your concentration', () => {
    const k = cast(summoner());
    expect(k.origin).toMatchObject({ duration: 'Concentration, up to 1 hour', concentration: true });
    expect(k.up).toMatchObject({ active: true, rounds: 600, why: '' });
    expect(isHere(k)).toBe(true);
  });

  it('goes when your concentration on its spell ends, and drops out of the fight and your hits', () => {
    const c = summoner();
    const k = cast(c);
    k.actions.push({ ...k.actions[0], id: 'boost', name: 'Help', kind: 'reaction', boost: true, damage: '1d4' });
    expect(availableBoosts(c).some((b) => b.comp.id === k.id)).toBe(true);
    endConcentration(c);
    const gone = c.companions.find((x) => x.id === k.id)!;
    expect(gone.up).toMatchObject({ active: false, why: 'Concentration on Summon Beast ended' });
    expect(availableBoosts(c).some((b) => b.comp.id === k.id)).toBe(false);
    expect(presentWho(c).some((w) => w.name === k.name)).toBe(false);
    expect(startFight(c, 15, { enemies: {}, allies: [] }).order.some((x) => x.ref === k.id)).toBe(false);
  });

  it('casting it again brings it back, even when the new casting ends the old concentration', () => {
    const c = summoner();
    cast(c);
    const again = cast(c, 3);
    expect(again.up).toMatchObject({ active: true, rounds: 600 });
    expect(again.origin?.cast).toBe(3);
    expect(c.companions).toHaveLength(1);
  });

  it('goes at 0 Hit Points; a class companion (a drake) doesn’t', () => {
    const c = summoner();
    const k = cast(c);
    k.hp = 0;
    expect(goneAtZero(k)).toBe(true);
    expect(k.up).toMatchObject({ active: false, why: 'Dropped to 0 Hit Points' });
    const artex = buildAnaurys(cat).companions[0];
    artex.hp = 0;
    expect(goneAtZero(artex)).toBe(false);
    expect(isHere(artex)).toBe(true);
  });

  it('counts its rounds down each New turn, and goes when they run out', () => {
    const c = summoner();
    const k = cast(c);
    k.up!.rounds = 2;
    expect(tickSummons(c)).toEqual([]);
    expect(k.up!.rounds).toBe(1);
    expect(tickSummons(c)).toEqual(['Bestial Spirit']);
    expect(k.up).toMatchObject({ active: false, why: 'Its duration ran out' });
  });

  it('keeps here-or-gone through a save', () => {
    const c = summoner();
    const k = cast(c);
    depart(k, 'Dismissed');
    const again = normalizeCharacter(JSON.parse(JSON.stringify(c)));
    expect(again.companions[0].up).toMatchObject({ active: false, rounds: 600, why: 'Dismissed' });
    expect(normalizeCharacter({ ...JSON.parse(JSON.stringify(c)), companions: [{ ...JSON.parse(JSON.stringify(k)), up: { active: 'no' } }] }).companions[0].up).toBeNull();
  });
});

describe('time passing for summons and effects', () => {
  const withSpirit = (): Character => {
    const c = ranger(5);
    const def = readPastedSpells(SUMMON_BEAST)[0].def;
    c.spells.push(blankSpell({ name: def.name, level: def.level, description: def.description, grantedBy: 'ranger', duration: def.duration, concentration: def.concentration }));
    const s = castSummon(c, c.spells[0], 2)!;
    c.companions.push(s.comp);
    c.effects.push({ id: 'bless', name: 'Bless', rounds: 10, bonus: '1d4', attacks: true, saves: true, checks: false, ac: 0, note: '' });
    return c;
  };

  it('ten minutes: Bless (a minute) wears off; the spirit has 50 minutes left', () => {
    const c = withSpirit();
    expect(passTime(c, 100)).toEqual({ effects: ['Bless'], summons: [] });
    expect(c.effects).toEqual([]);
    expect(c.companions[0].up?.rounds).toBe(500);
  });

  it('an hour (a Short Rest) and the 1-hour spirit is gone', () => {
    const c = withSpirit();
    expect(passTime(c, 600).summons).toEqual(['Bestial Spirit']);
    expect(c.companions[0].up).toMatchObject({ active: false, why: 'Its duration ran out' });
  });

  it('says time plainly', () => {
    expect([10, 100, 600, 4800, 3].map(timeText)).toEqual(['1 minute', '10 minutes', '1 hour', '8 hours', '3 rounds']);
  });

  it('a spirit from before durations were kept takes its spell’s, from your spells, when the sheet loads', () => {
    const c = withSpirit();
    const k = c.companions[0];
    k.origin = { ...k.origin!, duration: undefined, concentration: undefined };
    k.up = undefined;
    expect(durationFor(k, c.spells)).toEqual({ duration: 'Concentration, up to 1 hour', concentration: true });
    const again = normalizeCharacter(JSON.parse(JSON.stringify(c)));
    expect(again.companions[0].origin).toMatchObject({ duration: 'Concentration, up to 1 hour', concentration: true });
    expect(isHere(again.companions[0])).toBe(true);
  });
});
