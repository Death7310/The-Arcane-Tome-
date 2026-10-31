import { describe, expect, it } from 'vitest';
import { abilitiesFromText, applyFeat, describeGrants, featSpells, featSpellsFromText, readFeatText } from './featimport';
import { blankCharacter, blankSpell } from './model';
import { spellAbility, spellSaveDc } from './rules';
import { inferSources, sourceName, sourceOptions } from './spellsource';
import srdFeats from './srd/feats.json';
import srdSpells from './srd/spells.json';
import type { FeatDef, SpellDef } from './srd';

// Own-words versions, laid out the ways people paste feats.
const SHADOW_2024 = `Shadow-Touched
General Feat (Prerequisite: Level 4+)
Ability Score Increase. Increase your Intelligence, Wisdom, or Charisma score by 1, to a maximum of 20.
Shadow Magic. You learn the Invisibility spell and one level 1 spell of your choice from the Illusion or Necromancy school. You always have them prepared. You can cast each once without a spell slot, regaining that use when you finish a Long Rest, and you can also cast them with your spell slots. Their spellcasting ability is the ability increased by this feat.`;

const FEY_2014 = `Fey Touched
Your exposure to the Feywild's magic has changed you, granting you the following benefits:
Increase your Intelligence, Wisdom, or Charisma score by 1, to a maximum of 20.
You learn the misty step spell and one 1st-level spell of your choice. The 1st-level spell must be from the divination or enchantment school of magic. You can cast each of these spells without expending a spell slot. Once you cast either of these spells in this way, you can't cast that spell in this way again until you finish a long rest. Your spellcasting ability for these spells is the ability increased by this feat.`;

const TWO = `# Feats from my notes

Keen Watcher
Origin Feat
You can't be surprised while you're conscious.

Stormborn
General Feat (Prerequisite: Level 4+, Charisma 13+)
Increase your Constitution or Charisma score by 1, to a maximum of 20.
You learn the Thunderwave spell. Charisma is your spellcasting ability for it.`;

const spells = srdSpells as unknown as SpellDef[];
const magicInitiate = (srdFeats as unknown as FeatDef[]).find((f) => f.name === 'Magic Initiate')!;

describe('reading feats', () => {
  it('reads a 2024 feat with its prerequisite, ability choices and spells', () => {
    const [f] = readFeatText(SHADOW_2024, 'My feats');
    expect(f.name).toBe('Shadow-Touched');
    expect(f.category).toBe('general');
    expect(f.minLevel).toBe(4);
    expect(f.abilities).toEqual(['int', 'wis', 'cha']);
    expect(f.spells).toEqual({ fixed: ['Invisibility'], choose: [{ count: 1, level: 1, schools: ['Illusion', 'Necromancy'], lists: [] }], freeCast: true, ability: 'raised' });
    expect(describeGrants(f.spells!)).toMatch(/Invisibility and 1 level 1 spell \(Illusion or Necromancy\), each free once per Long Rest/);
  });

  it('reads a 2014 feat pasted on its own, lowercase spell names and all', () => {
    const [f] = readFeatText(FEY_2014, 'pasted');
    expect(f.name).toBe('Fey Touched');
    expect(f.abilities).toEqual(['int', 'wis', 'cha']);
    expect(f.spells).toEqual({ fixed: ['Misty Step'], choose: [{ count: 1, level: 1, schools: ['Divination', 'Enchantment'], lists: [] }], freeCast: true, ability: 'raised' });
  });

  it('splits several feats and reads a set casting ability', () => {
    const fs = readFeatText(TWO, 'notes');
    expect(fs.map((f) => f.name)).toEqual(['Keen Watcher', 'Stormborn']);
    expect(fs[0].category).toBe('origin');
    expect(fs[0].spells).toBeUndefined();
    expect(fs[1].text).toMatch(/^Prerequisite: Level 4\+, Charisma 13\+/);
    expect(fs[1].abilities).toEqual(['con', 'cha']);
    expect(fs[1].spells).toMatchObject({ fixed: ['Thunderwave'], choose: [], ability: 'cha', freeCast: false });
  });

  it('reads the SRD Magic Initiate: two cantrips and a level 1 spell from one list, your choice of ability', () => {
    const g = featSpells(magicInitiate)!;
    expect(g.fixed).toEqual([]);
    expect(g.choose).toEqual([
      { count: 2, level: 0, schools: [], lists: ['cleric', 'druid', 'wizard'] },
      { count: 1, level: 1, schools: [], lists: ['cleric', 'druid', 'wizard'] },
    ]);
    expect(g).toMatchObject({ freeCast: true, ability: 'choose' });
    expect(describeGrants(g)).toBe('Grants 2 cantrips from the Cleric, Druid or Wizard list and 1 level 1 spell from the Cleric, Druid or Wizard list, the leveled spells free once per Long Rest; cast with Intelligence, Wisdom or Charisma (your choice).');
  });

  it('leaves feats without spells alone, and does not mistake spell slots for spells', () => {
    expect(featSpellsFromText("You can't be surprised. Once per turn, you can reroll the weapon's damage dice.")).toBeNull();
    expect(featSpellsFromText('When you cast a spell using a level 1 spell slot, you regain hit points.')).toBeNull();
  });

  it('reads which abilities a feat raises', () => {
    expect(abilitiesFromText('Increase one ability score of your choice by 1, to a maximum of 30.')).toHaveLength(6);
    expect(abilitiesFromText('Increase your Strength or Dexterity score by 1.')).toEqual(['str', 'dex']);
    expect(abilitiesFromText('You gain the following benefits.')).toEqual([]);
  });

  it('reads feats from the AI conversion JSON', () => {
    const json = JSON.stringify({ format: 'arcane-tome-rules', name: 'x', feats: [{ name: 'Shadow-Touched', category: 'general', prerequisite: 'Level 4+', abilities: ['int', 'wis', 'cha'], text: SHADOW_2024.split('\n').slice(2).join('\n') }] });
    const [f] = readFeatText(json, 'AI');
    expect(f.minLevel).toBe(4);
    expect(f.spells?.fixed).toEqual(['Invisibility']);
  });
});

describe('taking a feat', () => {
  const ranger = () => {
    const c = blankCharacter();
    c.classes = [
      { id: 'r', classId: 'ranger', subclass: '', level: 4, hitDiceUsed: 0 },
      { id: 'w', classId: 'warlock', subclass: '', level: 1, hitDiceUsed: 0 },
    ];
    c.abilities = { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 15 };
    return c;
  };

  it('Shadow-Touched: raises the ability, adds both spells cast with it, and a free cast of each', () => {
    const c = ranger();
    const [feat] = readFeatText(SHADOW_2024, 'My feats');
    const done = applyFeat(c, feat, { ability: 'cha', picks: ['Cause Fear'] }, spells, { addFeature: true, raise: true });
    expect(c.abilities.cha).toBe(16);
    expect(done).toContain('CHA 15 → 16');
    expect(c.features.map((f) => f.name)).toEqual(['Shadow-Touched', 'Invisibility: free cast', 'Cause Fear: free cast']);
    expect(c.features[1]).toMatchObject({ usesMax: 1, recharge: 'long' });
    const inv = c.spells.find((s) => s.name === 'Invisibility')!;
    expect(inv).toMatchObject({ level: 2, grantedBy: 'feat:Shadow-Touched', abilityOverride: 'cha', prepared: true, basedOn: 'Invisibility' });
    expect(spellAbility(c, inv)).toBe('cha');
    // 8 + PB 3 (level 5) + CHA +3
    expect(spellSaveDc(c, inv).total).toBe(14);
    expect(sourceName(c, inv.grantedBy)).toBe('Shadow-Touched');
    expect(sourceOptions(c).map((s) => s.name)).toEqual(['Ranger', 'Warlock', 'Shadow-Touched']);
  });

  it('setting up an existing feat adds its spells without raising the score again or doubling up', () => {
    const c = ranger();
    const [feat] = readFeatText(SHADOW_2024, 'My feats');
    applyFeat(c, feat, { ability: 'wis', picks: [] }, spells, { addFeature: true, raise: false });
    applyFeat(c, feat, { ability: 'wis', picks: [] }, spells, { addFeature: true, raise: false });
    expect(c.abilities.wis).toBe(14);
    expect(c.spells.filter((s) => s.name === 'Invisibility')).toHaveLength(1);
    expect(c.features.filter((f) => f.name === 'Shadow-Touched')).toHaveLength(1);
  });

  it('caps at 20, or 30 for an epic boon', () => {
    const c = ranger();
    c.abilities.cha = 20;
    applyFeat(c, { id: 'x', name: 'Half', category: 'general', repeatable: false, minLevel: 4, abilities: ['cha'], text: '' }, { ability: 'cha', picks: [] }, spells, { addFeature: true, raise: true });
    expect(c.abilities.cha).toBe(20);
    applyFeat(c, { id: 'y', name: 'Boon', category: 'epic-boon', repeatable: false, minLevel: 19, abilities: ['cha'], text: '' }, { ability: 'cha', picks: [] }, spells, { addFeature: true, raise: true });
    expect(c.abilities.cha).toBe(21);
  });
});

describe('spells by source', () => {
  it('casts a class spell with that class’s ability, and infers the class from its list', () => {
    const c = blankCharacter();
    c.classes = [
      { id: 'r', classId: 'ranger', subclass: '', level: 4, hitDiceUsed: 0 },
      { id: 'w', classId: 'warlock', subclass: '', level: 1, hitDiceUsed: 0 },
    ];
    c.abilities = { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 16 };
    c.spells = [blankSpell({ id: 'a', name: "Hunter's Mark" }), blankSpell({ id: 'b', name: 'Hex' }), blankSpell({ id: 'c', name: 'Cure Wounds' }), blankSpell({ id: 'd', name: 'Fire Bolt' })];
    // Cure Wounds is on the 2024 Ranger list; Fire Bolt is on neither, so it's left for you to set.
    const map = inferSources(c, spells);
    expect(map).toEqual({ a: 'ranger', b: 'warlock', c: 'ranger' });
    expect(spellAbility(c, { abilityOverride: null, grantedBy: 'ranger' })).toBe('wis');
    expect(spellAbility(c, { abilityOverride: null, grantedBy: 'warlock' })).toBe('cha');
    // A source the sheet no longer has falls back to the sheet's own choice.
    expect(spellAbility(c, { abilityOverride: null, grantedBy: 'wizard' })).toBe(spellAbility(c));
  });
});
