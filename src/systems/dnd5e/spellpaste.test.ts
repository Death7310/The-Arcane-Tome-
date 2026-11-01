import { describe, expect, it } from 'vitest';
import { describeSpellDef, readPastedSpells, spellToText } from './spellimport';
import srdSpells from './srd/spells.json';
import type { SpellDef } from './srd';

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
