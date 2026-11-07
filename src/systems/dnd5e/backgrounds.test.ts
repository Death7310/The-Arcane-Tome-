import { describe, expect, it } from 'vitest';
import { applyBackground, BACKGROUNDS, describeBackground, findBackground, isBackgroundFeature } from './backgrounds';
import { blankCharacter } from './model';

describe('backgrounds', () => {
  it('finds a background however it is written', () => {
    expect(findBackground('haunted one')?.name).toBe('Haunted One');
    expect(findBackground('Sage (Researcher)')?.name).toBe('Sage');
    expect(findBackground('  ')).toBeNull();
    expect(findBackground('Pirate Queen')).toBeNull();
    expect(new Set(BACKGROUNDS.map((b) => b.name)).size).toBe(BACKGROUNDS.length);
  });

  it('describes the SRD backgrounds with their feat, skills, tool and equipment', () => {
    const t = describeBackground(findBackground('Acolyte')!);
    expect(t).toMatch(/Ability scores: Intelligence, Wisdom, Charisma/);
    expect(t).toMatch(/Origin feat: Magic Initiate \(Cleric\)/);
    expect(t).toMatch(/Skills: Insight, Religion/);
    expect(t).toMatch(/Tool: Calligrapher's Supplies/);
    expect(t).toMatch(/Equipment: Choose A or B/);
  });

  it('writes one background entry into Features & traits, updating it when the background changes', () => {
    const c = blankCharacter();
    c.background = 'Haunted One';
    expect(applyBackground(c, findBackground(c.background))).toBe('added');
    const f = c.features.find(isBackgroundFeature)!;
    expect(f).toMatchObject({ name: 'Background: Haunted One', usesMax: null, recharge: 'none' });
    expect(f.description).toMatch(/Heart of Darkness\./);
    expect(f.source).toBe("Background (Van Richten's Guide to Ravenloft)");
    c.background = 'Soldier';
    expect(applyBackground(c, findBackground(c.background))).toBe('updated');
    expect(c.features.filter(isBackgroundFeature)).toHaveLength(1);
    expect(c.features.find(isBackgroundFeature)!.description).toMatch(/Savage Attacker/);
  });

  it('gives a background that isn’t listed an entry to fill in', () => {
    const c = blankCharacter();
    c.background = 'Pirate Queen';
    applyBackground(c, null);
    expect(c.features.find(isBackgroundFeature)).toMatchObject({ name: 'Background: Pirate Queen', source: 'Background' });
  });
});
