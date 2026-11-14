import { describe, expect, it } from 'vitest';
import { describeSpellDef, readPastedSpells, spellToText } from './spellimport';
import srdSpells from './srd/spells.json';
import type { SpellDef } from './srd';
import { MORE, SAMPLES } from './spellpaste-samples';

const SRD = srdSpells as unknown as SpellDef[];
const KEYS = ['name', 'level', 'school', 'castingTime', 'castingTimeText', 'range', 'components', 'duration', 'concentration', 'ritual', 'resolution', 'damage', 'healing', 'upcastDice', 'instances', 'upcastInstances', 'scaling', 'element', 'shape'] as const;
const pick = (d: SpellDef) => Object.fromEntries(KEYS.map((k) => [k, d[k]]));

describe('copying a spell as text and pasting it back', () => {
  it('gives back every SRD spell exactly', () => {
    // The reader turns non-breaking spaces, curly quotes and long dashes into plain ones.
    const plain = (t: string) => t.replace(/\u00a0/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‒–—−]/g, '-').replace(/[ \t]+/g, ' ');
    const lines = (t: string) => plain(t).split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    const wrong: string[] = [];
    for (const s of SRD) {
      const [back] = readPastedSpells(spellToText(s));
      const same =
        JSON.stringify({ ...pick(s), components: plain(s.components) }) === JSON.stringify(pick(back.def)) &&
        back.def.description === lines(s.description) &&
        (s.resolution !== 'save' || (back.def.saveAbility === s.saveAbility && back.def.halfOnSave === s.halfOnSave));
      if (!same) wrong.push(s.name);
    }
    expect(wrong).toEqual([]);
  });

  it('keeps a changed spell’s own numbers, even when its description says otherwise', () => {
    const eb = SRD.find((s) => s.name === 'Eldritch Blast')!;
    const mine: SpellDef = { ...eb, name: 'Eldritch Lance', damage: [{ dice: '1d12', type: 'force' }, { dice: '1d4', type: 'necrotic' }], element: 'shadow', shape: 'ray', instances: 2, upcastInstances: 1, classes: ['warlock'] };
    const text = spellToText(mine);
    expect(text).toMatch(/^Eldritch Lance\nEvocation Cantrip \(Warlock\)\nCasting Time: Action\n/);
    expect(text).toMatch(/\nDamage: 1d12 force \+ 1d4 necrotic\n/);
    const [{ def, parts }] = readPastedSpells(text);
    expect(pick(def)).toEqual(pick(mine));
    expect(def.classes).toEqual(['warlock']);
    expect(def.description).toBe(eb.description.replace(/\u00a0/g, ' ').replace(/[‘’]/g, "'").split('\n').map((l) => l.trim()).filter(Boolean).join('\n'));
    expect([...parts]).toEqual(expect.arrayContaining(['level', 'school', 'time', 'damage', 'look', 'count']));
  });

  it('keeps a homebrew school', () => {
    const s: SpellDef = { ...SRD[0], name: 'Borrowed Moment', school: 'Chronomancy', level: 2, classes: ['wizard'] };
    const [{ def }] = readPastedSpells(spellToText(s));
    expect(def).toMatchObject({ school: 'Chronomancy', level: 2, classes: ['wizard'] });
  });
});

describe('pasting a spell', () => {
  it('reads a spell with no header, its first line as the name', () => {
    const [{ def, parts }] = readPastedSpells('Grave Hook\nA hooked chain of shadow lashes out. Make a ranged spell attack against a creature within 60 feet. On a hit, it takes 2d8 necrotic damage.');
    expect(def).toMatchObject({ name: 'Grave Hook', resolution: 'attack', damage: [{ dice: '2d8', type: 'necrotic' }], element: 'necrotic' });
    expect(parts.has('damage')).toBe(true);
    expect(parts.has('range')).toBe(false);
    expect(parts.has('level')).toBe(false);
  });

  it('uses the fallback name when the text is only a description', () => {
    const [{ def }] = readPastedSpells('Each creature in a 20-foot Sphere makes a Wisdom saving throw, taking 3d6 psychic damage on a failed save or half as much damage on a successful one.', 'Mind Spike');
    expect(def).toMatchObject({ name: 'Mind Spike', resolution: 'save', saveAbility: 'wis', halfOnSave: true, shape: 'burst' });
  });

  it('reads several pasted spells', () => {
    const two = [SRD.find((s) => s.name === 'Fire Bolt')!, SRD.find((s) => s.name === 'Cure Wounds')!].map((s) => spellToText(s)).join('\n\n');
    expect(readPastedSpells(two).map((r) => r.def.name)).toEqual(['Fire Bolt', 'Cure Wounds']);
  });

  it('leaves prose that only looks like a card line in the description', () => {
    const [{ def }] = readPastedSpells('Odd Spell\nCasting Time: Action\nRange: Self\nRoll: a die of your choice and hope.\nDamage: none to speak of.');
    expect(def.description).toBe('Roll: a die of your choice and hope.\nDamage: none to speak of.');
    expect(def.resolution).toBe('utility');
  });

  it('describes what it read', () => {
    const fb = SRD.find((s) => s.name === 'Fireball')!;
    expect(describeSpellDef(fb)).toEqual(expect.arrayContaining(['Level 3 Evocation', 'Roll: Dexterity save, half damage on a success', 'Damage: 8d6 fire', '+1d6 per slot level above 3']));
  });
});

describe('pasting a spell copied from anywhere fills in every field', () => {
  const read = (text: string) => readPastedSpells(text).map((r) => r.def);
  const header = (d: SpellDef) => ({ name: d.name, level: d.level, school: d.school, castingTime: d.castingTime, castingTimeText: d.castingTimeText, range: d.range, components: d.components, duration: d.duration, concentration: d.concentration });
  const fireball = (range: string, components: string) => ({ name: 'Fireball', level: 3, school: 'Evocation', castingTime: 'action', castingTimeText: 'Action', range, components, duration: 'Instantaneous', concentration: false });
  const mark = (range: string, duration: string) => ({ name: "Hunter's Mark", level: 1, school: 'Divination', castingTime: 'bonus', castingTimeText: 'Bonus Action', range, components: 'V', duration, concentration: true });

  it('reads D&D Beyond’s labels with no colon ("Casting Time 1 Bonus Action")', () => {
    expect(header(read(SAMPLES.ddbInlineNoColon)[0])).toEqual(mark('90 ft.', 'Concentration 1 Hour'));
  });

  it('reads labels and values split by a tab', () => {
    expect(header(read(SAMPLES.tabbed)[0])).toEqual(fireball('150 feet', 'V, S, M (a tiny ball of bat guano and sulfur)'));
  });

  it('reads past Roll20’s extra fields, joining its Material to the components and keeping Target as text', () => {
    const [d] = read(SAMPLES.roll20);
    expect(header(d)).toEqual(fireball('150 feet', 'V, S, M (A tiny ball of bat guano and sulfur)'));
    expect(d.description.split('\n')[0]).toBe('Target: A point you choose within range');
    expect(d.classes).toEqual(['sorcerer', 'wizard']);
  });

  it('skips a book line under the name instead of taking it for the name', () => {
    expect(header(read(SAMPLES.sourceUnderName)[0])).toEqual(mark('90 feet', 'Concentration, up to 1 hour'));
    expect(read(MORE.fiveETools)[0]).toMatchObject({ name: 'Fireball', range: '150 feet', classes: ['sorcerer', 'wizard'] });
    expect(read(MORE.tasha)[0]).toMatchObject({ name: "Tasha's Hideous Laughter", level: 1, school: 'Enchantment', concentration: true });
  });

  it('joins a value wrapped onto the next line, and tidies an all-capitals name', () => {
    expect(header(read(SAMPLES.pdfWrapped)[0])).toEqual(fireball('150 feet', 'V, S, M (a tiny ball of bat guano and sulfur)'));
  });

  it('reads "Conjuration · 2nd Level" as the level and school, not the name', () => {
    expect(read(SAMPLES.schoolDotLevel)[0]).toMatchObject({ name: 'Misty Step', level: 2, school: 'Conjuration', castingTime: 'bonus', range: 'Self' });
  });

  it('still reads D&D Beyond’s spell page, the 2024 book and wikidot (with its Spell Lists)', () => {
    expect(read(SAMPLES.ddbPage)[0]).toMatchObject({ ...fireball('150 ft. (20 ft. )', 'V, S, M (A tiny ball of bat guano and sulfur)'), resolution: 'save', saveAbility: 'dex', halfOnSave: true, upcastDice: '1d6', classes: ['sorcerer', 'wizard'] });
    expect(read(SAMPLES.phb2024)[0]).toMatchObject({ ...fireball('150 feet', 'V, S, M (a ball of bat guano and sulfur)'), classes: ['sorcerer', 'wizard'], upcastDice: '1d6' });
    expect(read(SAMPLES.wikidot)[0]).toMatchObject({ ...mark('90 feet', 'Concentration, up to 1 hour'), classes: ['ranger'] });
  });

  it('reads two spells pasted together, each with its own fields', () => {
    expect(read(MORE.two).map((d) => [d.name, d.level, d.castingTime, d.range, d.duration])).toEqual([
      ['Misty Step', 2, 'bonus', 'Self', 'Instantaneous'],
      ['Shield', 1, 'reaction', 'Self', '1 round'],
    ]);
  });

  it('leaves description lines that merely start with a label word alone', () => {
    const [d] = read(`Arcane Gate
6th-level conjuration
Casting Time: 1 action
Range: 500 feet
Components: V, S
Duration: Concentration, up to 10 minutes
Range of the portals is limited to what you can see.
Duration matters little once you pass through.`);
    expect(d.range).toBe('500 feet');
    expect(d.description).toBe('Range of the portals is limited to what you can see.\nDuration matters little once you pass through.');
  });
});

describe('bulleted headers', () => {
  it('reads "• Label:" and "- Label:" lines, and leaves a description’s own list alone', () => {
    const [d] = readPastedSpells(`Shield of Faith
- 1st-level abjuration
• Casting Time: 1 bonus action
- Range: 60 feet
* Components: V, S, M (a small parchment with a bit of holy text written on it)
• Duration: Concentration, up to 10 minutes
A shimmering field appears and surrounds a creature of your choice within range, granting it a +2 bonus to AC for the duration.
- It ends early if you lose concentration.`).map((r) => r.def);
    expect(d).toMatchObject({ name: 'Shield of Faith', castingTime: 'bonus', range: '60 feet', duration: 'Concentration, up to 10 minutes', concentration: true });
    expect(d.components).toBe('V, S, M (a small parchment with a bit of holy text written on it)');
    expect(d.description).toContain('- It ends early if you lose concentration.');
  });
});
