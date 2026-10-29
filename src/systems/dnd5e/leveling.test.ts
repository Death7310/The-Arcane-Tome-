import { beforeAll, describe, expect, it } from 'vitest';
import { applyLevelUp, hpGain, levelDown, multiclassCheck, planLevelUp, spellCounts, syncFeatures } from './leveling';
import { blankCharacter, blankFeature, type Character } from './model';
import { maxHp, spellSlots } from './rules';
import { loadSrd, type Catalog } from './srd';

let cat: Catalog;
beforeAll(async () => {
  cat = await loadSrd();
});

function fighter(level = 1): Character {
  const c = blankCharacter();
  c.abilities = { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 8 };
  c.classes[0] = { ...c.classes[0], classId: 'fighter', level };
  syncFeatures(c, cat);
  c.hp.current = maxHp(c).total;
  return c;
}

const names = (c: Character) => c.features.map((f) => f.name);
const feature = (c: Character, name: string) => c.features.find((f) => f.name === name);

describe('the SRD class data', () => {
  it('has all twelve classes with their 2024 tables', () => {
    expect(cat.classes.map((c) => c.id).sort()).toEqual(['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard']);
    const fighterDef = cat.classes.find((c) => c.id === 'fighter')!;
    expect(fighterDef.asiLevels).toEqual([4, 6, 8, 12, 14, 16]);
    expect(cat.classes.find((c) => c.id === 'rogue')!.asiLevels).toEqual([4, 8, 10, 12, 16]);
    expect(cat.classes.find((c) => c.id === 'wizard')!.prepared).toContainEqual([20, 25]);
    expect(cat.subclasses).toHaveLength(12);
  });
});

describe('leveling up', () => {
  it('adds the new level’s features and hit points', () => {
    const c = fighter(1);
    expect(names(c)).toEqual(expect.arrayContaining(['Fighting Style', 'Second Wind', 'Weapon Mastery']));
    const before = maxHp(c).total;
    const plan = planLevelUp(c, cat, 'fighter')!;
    expect(plan.features.map((f) => f.name)).toEqual(['Action Surge', 'Tactical Mind']);
    expect(plan.average).toBe(8); // d10 average 6 + CON 2
    applyLevelUp(c, cat, plan, { hpRoll: null });
    expect(c.classes[0].level).toBe(2);
    expect(maxHp(c).total).toBe(before + 8);
    expect(c.hp.current).toBe(before + 8);
    expect(names(c)).toEqual(expect.arrayContaining(['Action Surge', 'Tactical Mind']));
    expect(feature(c, 'Action Surge')!.usesMax).toBe(1);
  });

  it('uses a rolled hit die when you roll', () => {
    const c = fighter(1);
    const plan = planLevelUp(c, cat, 'fighter')!;
    const before = maxHp(c).total;
    applyLevelUp(c, cat, plan, { hpRoll: 3 });
    expect(maxHp(c).total).toBe(before + 3 + 2);
    expect(hpGain(plan, 1)).toBe(3);
  });

  it('grows uses and dice with the level', () => {
    const c = fighter(3);
    expect(feature(c, 'Second Wind')).toMatchObject({ usesMax: 2, roll: '1d10+3' });
    applyLevelUp(c, cat, planLevelUp(c, cat, 'fighter')!, { hpRoll: null, asi: { str: 2 } });
    expect(feature(c, 'Second Wind')).toMatchObject({ usesMax: 3, roll: '1d10+4' });
    expect(feature(c, 'Weapon Mastery')!.description).toMatch(/At level 4: Weapons 4/);
  });

  it('offers the subclass at its level and brings in its features', () => {
    const c = fighter(2);
    const plan = planLevelUp(c, cat, 'fighter')!;
    expect(plan.subclassOptions!.map((s) => s.name)).toEqual(['Champion']);
    applyLevelUp(c, cat, plan, { hpRoll: null, subclass: { id: 'champion', name: 'Champion' } });
    expect(c.classes[0].subclass).toBe('Champion');
    expect(names(c)).toEqual(expect.arrayContaining(['Improved Critical', 'Remarkable Athlete']));
  });

  it('applies an Ability Score Improvement, capped at 20, and a feat at the same kind of level', () => {
    const c = fighter(3);
    c.abilities.str = 19;
    const plan = planLevelUp(c, cat, 'fighter')!;
    expect(plan.asi).toBe(true);
    applyLevelUp(c, cat, plan, { hpRoll: null, asi: { str: 2 } });
    expect(c.abilities.str).toBe(20);
    const grappler = cat.feats.find((f) => f.id === 'grappler')!;
    const plan5 = planLevelUp(c, cat, 'fighter')!;
    applyLevelUp(c, cat, plan5, { hpRoll: null });
    const plan6 = planLevelUp(c, cat, 'fighter')!;
    expect(plan6.asi).toBe(true); // Fighters also improve at 6
    applyLevelUp(c, cat, plan6, { hpRoll: null, feats: [{ feat: grappler, ability: 'dex' }] });
    expect(names(c)).toContain('Grappler');
    expect(c.abilities.dex).toBe(13);
  });

  it('works out the new spell slots and how many spells you can prepare', () => {
    const c = blankCharacter();
    c.abilities.int = 16;
    c.classes[0] = { ...c.classes[0], classId: 'wizard', level: 2 };
    const plan = planLevelUp(c, cat, 'wizard')!;
    expect(plan.spells.slots).toEqual([spellSlots(c), [4, 2, 0, 0, 0, 0, 0, 0, 0]]);
    expect(plan.spells.prepared).toEqual([5, 6]);
    expect(plan.spells.cantrips).toEqual([3, 3]);
    applyLevelUp(c, cat, plan, { hpRoll: null, subclass: { id: 'evoker', name: 'Evoker' } });
    expect(spellCounts(c, cat)).toEqual([{ className: 'Wizard', cantrips: 3, prepared: 6 }]);
  });
});

describe('multiclassing', () => {
  it('needs 13 in the new class’s and your current classes’ primary abilities', () => {
    const c = fighter(5);
    const check = multiclassCheck(c, cat, 'wizard');
    expect(check.ok).toBe(false);
    expect(check.requirements.find((r) => r.className === 'Wizard')).toMatchObject({ needs: 'Intelligence 13', met: false });
    expect(check.requirements.find((r) => r.className === 'Fighter')).toMatchObject({ needs: 'Strength or Dexterity 13', met: true });
    c.abilities.int = 14;
    expect(multiclassCheck(c, cat, 'wizard').ok).toBe(true);
  });

  it('adds the class with only its multiclass training, and a skill for a Rogue', () => {
    const c = fighter(5);
    c.abilities.dex = 14;
    const plan = planLevelUp(c, cat, 'rogue')!;
    expect(plan.newClass).toBe(true);
    expect(plan.training).toBe('Rogue (multiclass): Light armor');
    expect(plan.skillPick!.count).toBe(1);
    applyLevelUp(c, cat, plan, { hpRoll: null, skills: ['stealth'] });
    expect(c.classes.map((k) => [k.classId, k.level])).toEqual([
      ['fighter', 5],
      ['rogue', 1],
    ]);
    expect(c.skills.stealth).toBe(1);
    expect(c.proficiencies).toContain('Rogue (multiclass): Light armor');
    expect(names(c)).toEqual(expect.arrayContaining(['Sneak Attack', 'Expertise']));
    // A multiclass level adds the average without the first-level full die.
    expect(plan.average).toBe(7);
  });
});

describe('leveling down', () => {
  it('undoes a level exactly', () => {
    const c = fighter(3);
    const snapshot = structuredClone(c);
    applyLevelUp(c, cat, planLevelUp(c, cat, 'fighter')!, { hpRoll: 7, asi: { str: 1, con: 1 } });
    expect(c.abilities.con).toBe(15);
    expect(levelDown(c, cat)).toBe('Fighter 4 undone');
    expect(c.classes[0].level).toBe(3);
    expect(c.abilities).toEqual(snapshot.abilities);
    expect(names(c).sort()).toEqual(names(snapshot).sort());
    expect(maxHp(c).total).toBe(maxHp(snapshot).total);
  });

  it('removes a class added by multiclassing, with its skill and training', () => {
    const c = fighter(5);
    c.abilities.dex = 14;
    applyLevelUp(c, cat, planLevelUp(c, cat, 'rogue')!, { hpRoll: null, skills: ['stealth'] });
    levelDown(c, cat);
    expect(c.classes).toHaveLength(1);
    expect(c.skills.stealth).toBe(0);
    expect(c.proficiencies).not.toContain('Rogue');
    expect(names(c)).not.toContain('Sneak Attack');
  });

  it('takes a level off a sheet that was levelled by hand', () => {
    const c = fighter(5);
    expect(levelDown(c, cat)).toBe('Fighter level removed');
    expect(c.classes[0].level).toBe(4);
    expect(names(c)).not.toContain('Extra Attack');
  });
});

describe('keeping features in step', () => {
  it('adopts a feature you typed in instead of adding it twice, and leaves your edits alone', () => {
    const c = blankCharacter();
    c.classes[0] = { ...c.classes[0], classId: 'fighter', level: 1 };
    c.features.push(blankFeature({ name: 'Second Wind', roll: '1d10+99' }));
    syncFeatures(c, cat);
    expect(c.features.filter((f) => f.name === 'Second Wind')).toHaveLength(1);
    expect(feature(c, 'Second Wind')!.roll).toBe('1d10+99');
  });
});
