import { describe, expect, it } from 'vitest';
import { readSpellText, spellForClass } from './spellimport';

// Homebrew spells in the layouts people paste: a 2024 book, a 2014 book, two D&D Beyond copies, notes.
const MIXED = `# My Homebrew Spells

Ember Lattice
Level 2 Evocation (Sorcerer, Wizard)
Casting Time: Action
Range: 90 feet
Components: V, S, M (a pinch of ash)
Duration: Concentration, up to 1 minute
A lattice of glowing embers fills a 15-foot Cube. Each creature in it makes a Dexterity saving throw, taking 3d6 Fire damage on a failed save or half as much damage on a successful one.
Using a Higher-Level Spell Slot. The damage increases by 1d6 for each spell slot level above 2.

Quiet Step
1st-level illusion (ritual)
Casting Time: 1 minute
Range: Touch
Components: V, S
Duration: 1 hour
Classes: Bard, Ranger
The creature you touch makes no sound as it moves.

Glacier Spike
LEVEL
3rd
CASTING TIME
1 Action
RANGE/AREA
120 ft.
COMPONENTS
V, S, M *
DURATION
Instantaneous
SCHOOL
Evocation
ATTACK/SAVE
Ranged
DAMAGE/EFFECT
Cold
You hurl a spike of ice. Make a ranged spell attack against a creature. On a hit, the target takes 4d10 Cold damage.
* - (a shard of blue glass)
Spell Tags: Damage
Available For:
Druid
Sorcerer
Wizard

Thunderclap Ward
LEVEL 1st CASTING TIME 1 Reaction RANGE/AREA Self COMPONENTS V DURATION 1 round SCHOOL Abjuration ATTACK/SAVE CON Save DAMAGE/EFFECT Thunder
When a creature hits you, it must make a Constitution saving throw or take 2d8 Thunder damage.
Available For: Cleric, Wizard

Frost Lance (2nd-level evocation, wizard, sorcerer)
Casting time: 1 bonus action
Range: 60 ft
Components: V, S
Duration: Instantaneous
A lance of frost. Make a ranged spell attack; on a hit the target takes 2d8 Cold damage.

Mending Song
Level: Cantrip
School: Transmutation
Classes: Bard
Casting Time: 1 minute
Range: Touch
Components: V
Duration: Instantaneous
You sing an object whole.
`;

describe('reading spells from pasted text', () => {
  const spells = readSpellText(MIXED, 'My spells');
  const by = (n: string) => spells.find((s) => s.name === n)!;

  it('finds every spell, whatever its layout', () => {
    expect(spells.map((s) => [s.name, s.level, s.school])).toEqual([
      ['Ember Lattice', 2, 'Evocation'],
      ['Quiet Step', 1, 'Illusion'],
      ['Glacier Spike', 3, 'Evocation'],
      ['Thunderclap Ward', 1, 'Abjuration'],
      ['Frost Lance', 2, 'Evocation'],
      ['Mending Song', 0, 'Transmutation'],
    ]);
  });

  it('files each spell under its classes', () => {
    expect(spells.map((s) => s.classes)).toEqual([['sorcerer', 'wizard'], ['bard', 'ranger'], ['druid', 'sorcerer', 'wizard'], ['cleric', 'wizard'], ['wizard', 'sorcerer'], ['bard']]);
    expect(spellForClass(by('Glacier Spike'), 'druid')).toBe(true);
    expect(spellForClass(by('Glacier Spike'), 'my-pack:druid')).toBe(true);
    expect(spellForClass(by('Glacier Spike'), 'bard')).toBe(false);
  });

  it('reads casting, range, components, duration, ritual and concentration', () => {
    expect(by('Ember Lattice')).toMatchObject({ castingTime: 'action', range: '90 feet', concentration: true, components: 'V, S, M (a pinch of ash)' });
    expect(by('Quiet Step')).toMatchObject({ ritual: true, castingTime: 'other', castingTimeText: '1 minute', range: 'Touch' });
    expect(by('Glacier Spike')).toMatchObject({ components: 'V, S, M (a shard of blue glass)', range: '120 ft.' });
    expect(by('Thunderclap Ward')).toMatchObject({ castingTime: 'reaction', range: 'Self', duration: '1 round' });
    expect(by('Frost Lance')).toMatchObject({ castingTime: 'bonus' });
  });

  it('works out the rolls from the text and D&D Beyond’s fields', () => {
    expect(by('Ember Lattice')).toMatchObject({ resolution: 'save', saveAbility: 'dex', halfOnSave: true, damage: [{ dice: '3d6', type: 'fire' }], upcastDice: '1d6' });
    expect(by('Glacier Spike')).toMatchObject({ resolution: 'attack', damage: [{ dice: '4d10', type: 'cold' }] });
    expect(by('Thunderclap Ward')).toMatchObject({ resolution: 'save', saveAbility: 'con', damage: [{ dice: '2d8', type: 'thunder' }] });
    expect(by('Frost Lance')).toMatchObject({ resolution: 'attack', damage: [{ dice: '2d8', type: 'cold' }] });
  });

  it('keeps the description, without the header or D&D Beyond’s footer', () => {
    expect(by('Glacier Spike').description).toBe('You hurl a spike of ice. Make a ranged spell attack against a creature. On a hit, the target takes 4d10 Cold damage.');
    expect(by('Ember Lattice').description).toMatch(/^A lattice[\s\S]*Higher-Level Spell Slot/);
    expect(by('Mending Song').description).toBe('You sing an object whole.');
    expect(spells.every((s) => s.source === 'My spells')).toBe(true);
  });

  it('takes the library’s JSON format too, and ignores text with no spells', () => {
    const json = JSON.stringify({ format: 'arcane-tome-rules', name: 'x', spells: [{ name: 'Ash Bolt', level: 1, school: 'Evocation', classes: ['warlock'], attack: 'ranged', damage: [{ dice: '2d6', type: 'fire' }], text: 'A bolt of ash.' }] });
    expect(readSpellText(json, 'AI spells')).toMatchObject([{ name: 'Ash Bolt', classes: ['warlock'], resolution: 'attack', source: 'AI spells' }]);
    expect(readSpellText('Just some notes about my campaign.\nNothing to see.', 'x')).toEqual([]);
  });
});
