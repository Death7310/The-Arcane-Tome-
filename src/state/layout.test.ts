import { describe, expect, it } from 'vitest';
import {
  addPage,
  addPanel,
  defaultLayout,
  deletePage,
  gridTracks,
  isDefault,
  movePage,
  movePanel,
  normalizeLayout,
  onSheet,
  pagesOf,
  placeInPage,
  removePanel,
  renamePage,
  resetLayout,
  setHeight,
  setPanelPages,
  shiftPanel,
  stepInPage,
  stepPanel,
  tileKey,
  toggleCollapsed,
  withTiles,
  type PanelKey,
} from './layout';

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
    expect(l.columns[0]).toEqual(['identity', 'spells', 'abilities', 'glance', 'languages']);
    expect(l.columns[2]).not.toContain('spells');
  });

  it('steps up and down through the columns, skipping panels that aren’t on screen', () => {
    // With only the Stats page's panels on screen, Skills steps up past the combat panels.
    const stats = defaultLayout().pages.find((p) => p.id === 'stats')!.panels;
    const up = stepPanel(defaultLayout(), 'skills', -1, (k) => stats.includes(k));
    expect(up.columns[0]).toEqual(['identity', 'abilities', 'skills', 'glance', 'languages']);
    expect(up.columns[1]).not.toContain('skills');
    const down = stepPanel(defaultLayout(), 'identity', 1);
    expect(down.columns[0]).toEqual(['abilities', 'identity', 'glance', 'languages']);
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

describe('pages', () => {
  const page = (l: ReturnType<typeof defaultLayout>, id: string) => l.pages.find((p) => p.id === id)!;

  it('starts with the built-in pages, Features on Stats and Languages on its own page', () => {
    const l = defaultLayout();
    expect(l.pages.map((p) => p.name)).toEqual(['Stats', 'Combat', 'Magic', 'Gear', 'Languages']);
    expect(pagesOf(l, 'features')).toEqual(['stats']);
    expect(pagesOf(l, 'glance')).toEqual(['stats', 'combat']);
    expect(page(l, 'languages').panels).toEqual(['languages']);
  });

  it('moves a tile to another page, or puts it on several, keeping at least one', () => {
    let l = setPanelPages(defaultLayout(), 'attacks', ['stats']);
    expect(pagesOf(l, 'attacks')).toEqual(['stats']);
    expect(page(l, 'stats').panels.at(-1)).toBe('attacks');
    l = setPanelPages(l, 'attacks', ['stats', 'combat']);
    expect(pagesOf(l, 'attacks')).toEqual(['stats', 'combat']);
    expect(setPanelPages(l, 'attacks', [])).toBe(l);
  });

  it('orders each page on its own, skipping tiles that aren’t on screen', () => {
    let l = stepInPage(defaultLayout(), 'stats', 'glance', -1);
    expect(page(l, 'stats').panels).toEqual(['identity', 'abilities', 'skills', 'glance', 'features']);
    expect(page(l, 'combat').panels[0]).toBe('glance');
    l = placeInPage(l, 'stats', 'features', 'identity');
    expect(page(l, 'stats').panels[0]).toBe('features');
    l = placeInPage(l, 'stats', 'features', null);
    expect(page(l, 'stats').panels.at(-1)).toBe('features');
    // A tile of another character on the page is passed over.
    const withGhost = { ...l, pages: l.pages.map((p) => (p.id === 'gear' ? { ...p, panels: ['inventory', 'tile:other', 'notes'] as PanelKey[] } : p)) };
    expect(page(stepInPage(withGhost, 'gear', 'notes', -1, (k) => k !== 'tile:other'), 'gear').panels).toEqual(['notes', 'inventory', 'tile:other']);
  });

  it('adds, renames, reorders and deletes pages you made, without losing their tiles', () => {
    const [l1, id] = addPage(defaultLayout(), 'Sanity');
    let l = addPanel(l1, tileKey('t1'), id);
    l = setPanelPages(l, 'notes', ['gear', id]);
    l = setPanelPages(l, 'spells', [id]);
    expect(page(l, id)).toMatchObject({ name: 'Sanity', custom: true, panels: ['tile:t1', 'notes', 'spells'] });
    expect(onSheet(l, 'spells')).toBe(false);
    expect(l.columns[2]).toContain('tile:t1');
    l = renamePage(movePage(l, id, -1), id, 'Madness');
    expect(l.pages.map((p) => p.name)).toEqual(['Stats', 'Combat', 'Magic', 'Gear', 'Madness', 'Languages']);
    l = deletePage(l, id);
    expect(l.pages.some((p) => p.id === id)).toBe(false);
    expect(pagesOf(l, 'spells')).toEqual(['magic']);
    expect(pagesOf(l, 'notes')).toEqual(['gear']);
    expect(pagesOf(l, tileKey('t1'))).toEqual(['gear']);
    expect(deletePage(l, 'stats')).toBe(l);
  });

  it('places tiles this device hasn’t seen, and forgets deleted ones', () => {
    let l = withTiles(defaultLayout(), [tileKey('a')]);
    expect(pagesOf(l, 'tile:a')).toEqual(['gear']);
    expect(l.columns[2].at(-1)).toBe('tile:a');
    l = removePanel(l, 'tile:a');
    expect(l.columns.flat()).not.toContain('tile:a');
    expect(pagesOf(l, 'tile:a')).toEqual([]);
  });

  it('reads saved pages defensively and resets without losing your own pages', () => {
    const l = normalizeLayout({
      columns: defaultLayout().columns,
      pages: [
        { id: 'stats', name: 'My Stats', panels: ['identity', 'bogus', 'identity'] },
        { id: 'p1', name: 'Homebrew', panels: ['tile:x', 'features'] },
      ],
    });
    expect(l.pages.map((p) => [p.id, p.name, p.custom])).toEqual([
      ['stats', 'My Stats', false],
      ['p1', 'Homebrew', true],
      ['combat', 'Combat', false],
      ['magic', 'Magic', false],
      ['gear', 'Gear', false],
      ['languages', 'Languages', false],
    ]);
    expect(page(l, 'stats').panels).toEqual(['identity', 'abilities', 'skills']);
    expect(pagesOf(l, 'features')).toEqual(['p1']);
    const reset = resetLayout(l);
    expect(reset.pages.map((p) => p.name)).toEqual(['Stats', 'Combat', 'Magic', 'Gear', 'Languages', 'Homebrew']);
    expect(pagesOf(reset, 'features')).toEqual(['stats', 'p1']);
  });
});
