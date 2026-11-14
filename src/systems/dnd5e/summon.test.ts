// Summon Beast exactly as the user pasted it: a bulleted header, no level line, and the
// Bestial Spirit's stat block. Expected numbers are Tasha's Cauldron of Everything's.
import { describe, expect, it } from 'vitest';
import { levelFromUpcast, readPastedSpells, summonedCreature } from './spellimport';
import { summonCompanion, summonForms } from './summon';
import { SUMMON_BEAST } from './summon-sample';

describe('pasting Summon Beast', () => {
  const [r] = readPastedSpells(SUMMON_BEAST);

  it('reads the bulleted header into its fields', () => {
    expect(r.def).toMatchObject({
      name: 'Summon Beast',
      castingTime: 'action',
      range: '90 feet',
      components: 'V, S, M (a feather, fur tuft, or fish tail inside a gilded acorn worth 200+ gp, which is not consumed)',
      duration: 'Concentration, up to 1 hour',
      concentration: true,
    });
  });

  it('works its level out from "a spell slot of 3rd level or higher", and says the school isn’t given', () => {
    expect(r.def.level).toBe(2);
    expect(r.parts.has('level')).toBe(true);
    expect(r.parts.has('school')).toBe(false);
  });

  it('doesn’t take the beast’s Maul for the spell’s own attack or damage', () => {
    expect(r.def.resolution).toBe('utility');
    expect(r.def.damage).toEqual([]);
    expect(r.def.description).toMatch(/^You call forth a bestial spirit/);
    expect(r.def.description).toContain('Maul. Melee Weapon Attack');
  });
});

describe('the Bestial Spirit as a companion', () => {
  const block = summonedCreature(readPastedSpells(SUMMON_BEAST)[0].def.description)!;
  const beast = (form: string, level: number) => summonCompanion(block, { spell: 'Summon Beast', level, form })!;
  const names = (form: string, level: number) => beast(form, level).actions.map((a) => a.name);

  it('finds its stat block and its three forms', () => {
    expect(block.split('\n')[0]).toBe('Bestial Spirit');
    expect(summonForms(block)).toEqual(['Air', 'Land', 'Water']);
  });

  it('takes each form’s HP, speed and traits', () => {
    expect(beast('Air', 2)).toMatchObject({ name: 'Bestial Spirit', size: 'Small', ac: '13', maxHp: '20', hp: 20, speed: '30 ft.; fly 60 ft.' });
    expect(beast('Land', 2)).toMatchObject({ maxHp: '30', speed: '30 ft.; climb 30 ft.' });
    expect(beast('Water', 2)).toMatchObject({ maxHp: '30', speed: '30 ft.; swim 30 ft.' });
    expect(names('Air', 2)).toEqual(['Flyby', 'Multiattack', 'Maul']);
    expect(names('Land', 2)).toEqual(['Pack Tactics', 'Multiattack', 'Maul']);
    expect(names('Water', 2)).toEqual(['Pack Tactics', 'Water Breathing', 'Multiattack', 'Maul']);
  });

  it('grows with the level you cast it at: AC, HP, Multiattack and the Maul', () => {
    const b = beast('Land', 4);
    expect(b).toMatchObject({ ac: '15', maxHp: '40', hp: 40, pb: '{PB}' });
    expect(b.actions.find((a) => a.name === 'Multiattack')!.text).toBe('The beast makes 2 attacks.');
    expect(b.actions.find((a) => a.name === 'Maul')).toMatchObject({ attack: 'melee', toHit: '{SPELLATK}', damage: '1d8 + 8', damageType: 'piercing' });
    expect(beast('Land', 2).actions.find((a) => a.name === 'Maul')!.damage).toBe('1d8 + 6');
    expect(b.notes).toContain('Summon Beast at 4th level, Land form');
  });
});

describe('a spell’s level from its higher-level text', () => {
  it('reads the usual wordings, and not the ones that don’t say', () => {
    expect(levelFromUpcast('When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.')).toBe(3);
    expect(levelFromUpcast('Using a Higher-Level Spell Slot. The damage increases by 1d6 for each spell slot level above 3.')).toBe(3);
    expect(levelFromUpcast('When you cast this spell using a spell slot of 3rd level or higher, use the higher level.')).toBe(2);
    expect(levelFromUpcast('When you cast this spell using a spell slot of 3rd or 4th level, you can maintain your concentration for up to 8 hours. When you use a spell slot of 5th level or higher, up to 24 hours.')).toBeNull();
  });
});

describe('the paste summary says what the text didn’t give', () => {
  it('says the school isn’t given instead of showing a default', async () => {
    const { describeSpellDef } = await import('./spellimport');
    const [r] = readPastedSpells(SUMMON_BEAST);
    expect(describeSpellDef(r.def, r.parts)[0]).toBe('Level 2, school not given, concentration');
    expect(describeSpellDef({ ...r.def, school: 'Conjuration' }, new Set([...r.parts, 'school'] as const))[0]).toBe('Level 2 Conjuration, concentration');
    expect(describeSpellDef({ ...r.def, school: 'Conjuration' })[0]).toBe('Level 2 Conjuration, concentration');
  });
});
