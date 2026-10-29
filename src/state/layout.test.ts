import { describe, expect, it } from 'vitest';
import { defaultLayout, gridTracks, isDefault, movePanel, normalizeLayout, setHeight, shiftPanel, stepPanel, toggleCollapsed } from './layout';

describe('reading a saved layout', () => {
  it('falls back to the usual layout for anything unreadable', () => {
    expect(normalizeLayout(null)).toEqual(defaultLayout());
    expect(normalizeLayout('nope')).toEqual(defaultLayout());
    expect(isDefault(normalizeLayout({}))).toBe(true);
  });

  it('drops unknown and repeated panels and restores missing ones', () => {
    const l = normalizeLayout({
      columns: [['spells', 'bogus', 'spells'], ['vitals'], []],
      widths: [1, -2, 3],
      heights: { spells: 400, vitals: 20, bogus: 300 },
      collapsed: ['notes', 'notes', 'bogus'],
    });
    expect(l.columns[0].slice(0, 1)).toEqual(['spells']);
    expect(l.columns.flat().filter((id) => id === 'spells')).toHaveLength(1);
    expect(l.columns.flat().sort()).toEqual(defaultLayout().columns.flat().sort());
    expect(l.widths).toBeNull();
    expect(l.heights).toEqual({ spells: 400 });
    expect(l.collapsed).toEqual(['notes']);
  });
});

describe('moving panels', () => {
  it('drops a panel into another column at a position', () => {
    const l = movePanel(defaultLayout(), 'spells', 0, 1);
    expect(l.columns[0]).toEqual(['identity', 'spells', 'abilities', 'glance']);
    expect(l.columns[2]).not.toContain('spells');
  });

  it('steps up and down through what a phone tab shows, skipping panels from other tabs', () => {
    // Skills (stats) sits after combat panels in column 2; one step up passes them to land above At a glance's neighbour.
    const up = stepPanel(defaultLayout(), 'skills', -1);
    expect(up.columns[0]).toEqual(['identity', 'abilities', 'skills', 'glance']);
    expect(up.columns[1]).not.toContain('skills');
    const down = stepPanel(defaultLayout(), 'identity', 1);
    expect(down.columns[0]).toEqual(['abilities', 'identity', 'glance']);
    expect(stepPanel(defaultLayout(), 'identity', -1)).toEqual(defaultLayout());
  });

  it('shifts a panel to the next column', () => {
    const l = shiftPanel(defaultLayout(), 'vitals', 1);
    expect(l.columns[2][0]).toBe('vitals');
    expect(shiftPanel(defaultLayout(), 'identity', -1)).toEqual(defaultLayout());
  });
});

describe('sizing and folding', () => {
  it('keeps heights sensible and can clear them', () => {
    let l = setHeight(defaultLayout(), 'spells', 50);
    expect(l.heights.spells).toBe(120);
    l = setHeight(l, 'spells', null);
    expect(l.heights).toEqual({});
  });

  it('folds and unfolds a panel', () => {
    const l = toggleCollapsed(defaultLayout(), 'notes');
    expect(l.collapsed).toEqual(['notes']);
    expect(toggleCollapsed(l, 'notes').collapsed).toEqual([]);
  });

  it('turns column widths into grid tracks', () => {
    expect(gridTracks([300, 500, 600]).three).toBe('minmax(240px, 300fr) minmax(260px, 500fr) minmax(260px, 600fr)');
  });
});
