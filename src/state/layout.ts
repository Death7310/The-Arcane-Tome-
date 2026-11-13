// Where each panel sits: which column, in what order, how tall, whether it's folded away,
// and which pages it's on. Saved with the settings, so it belongs to this device (a phone
// and a laptop can be arranged differently). Everything here is pure; the dragging lives
// in the UI.
//
// Pages are the phone's tabs: the built-in ones (Stats, Combat, Magic, Gear, Languages,
// Library) and any you make. A panel can be on several pages, in its own place on each. On a
// wide screen the built-in pages share one sheet laid out in columns; the Library and the
// pages you made get tabs of their own (so the spell, feat and background lists aren't on
// the sheet unless you go to them).

/** Every built-in panel, with the pages it starts on. */
export const PANELS = {
  identity: ['stats'],
  abilities: ['stats'],
  glance: ['stats', 'combat'],
  vitals: ['combat'],
  conditions: ['combat'],
  initiative: ['combat'],
  enemies: ['enemies'],
  battle: ['enemies'],
  counters: ['counters'],
  turn: ['combat'],
  attacks: ['combat'],
  companions: ['combat'],
  skills: ['stats'],
  features: ['stats'],
  feats: ['library'],
  spells: ['magic'],
  compendium: ['library'],
  backgrounds: ['library'],
  inventory: ['gear'],
  notes: ['gear'],
  languages: ['languages'],
} as const satisfies Record<string, readonly string[]>;

export type PanelId = keyof typeof PANELS;
/** A tile you made (see Character.tiles), by its id. */
export type TileKey = `tile:${string}`;
export type PanelKey = PanelId | TileKey;

export interface Page {
  id: string;
  name: string;
  /** Panels on this page, in the order a phone shows them. */
  panels: PanelKey[];
  /** True for pages you made (they can be deleted, and get their own tab on wide screens). */
  custom: boolean;
}

export interface Layout {
  /** Panel ids in each of the three columns, top to bottom. */
  columns: PanelKey[][];
  /** Relative column widths (any unit; they become fr), or null for the built-in widths. */
  widths: number[] | null;
  /** Heights in px for panels the reader has sized; the rest fit their content. */
  heights: Partial<Record<PanelKey, number>>;
  collapsed: PanelKey[];
  pages: Page[];
  /**
   * Tiles you took off the sheet, with the pages they were on so they can go back there.
   * Nothing in them is deleted: their contents stay on the character, ready to add back.
   */
  removed: RemovedPanel[];
}

export interface RemovedPanel {
  id: PanelKey;
  pages: string[];
  /** On each of those pages, the tile that came after it (null: it was last), to go back in its place. */
  before?: Record<string, PanelKey | null>;
}

export const MIN_HEIGHT = 120;

export const BUILT_IN_PAGES = [
  { id: 'stats', name: 'Stats' },
  { id: 'combat', name: 'Combat' },
  { id: 'enemies', name: 'Enemies' },
  { id: 'counters', name: 'Counters' },
  { id: 'magic', name: 'Magic' },
  { id: 'gear', name: 'Gear' },
  { id: 'languages', name: 'Languages' },
  { id: 'library', name: 'Library' },
] as const;

/** Built-in pages with a tab of their own on wide screens, rather than a place on the main sheet. */
const OWN_TAB_PAGES: readonly string[] = ['library'];

/** Whether a page has its own tab on a wide screen (one you made, or the Library). */
export const ownTab = (p: Pick<Page, 'id' | 'custom'>): boolean => p.custom || OWN_TAB_PAGES.includes(p.id);

const DEFAULT_COLUMNS: PanelKey[][] = [
  ['identity', 'abilities', 'glance', 'languages', 'feats', 'counters'],
  ['initiative', 'enemies', 'battle', 'vitals', 'conditions', 'turn', 'attacks', 'companions', 'skills'],
  ['spells', 'compendium', 'features', 'inventory', 'notes', 'backgrounds'],
];

/** The built-in pages' panels, in phone order. */
const DEFAULT_PAGE_PANELS: Record<string, PanelKey[]> = {
  stats: ['identity', 'abilities', 'skills', 'features', 'glance'],
  combat: ['glance', 'initiative', 'vitals', 'conditions', 'turn', 'attacks', 'companions'],
  enemies: ['enemies', 'battle'],
  counters: ['counters'],
  magic: ['spells'],
  gear: ['inventory', 'notes'],
  languages: ['languages'],
  library: ['compendium', 'feats', 'backgrounds'],
};

const defaultPages = (): Page[] => BUILT_IN_PAGES.map((p) => ({ id: p.id, name: p.name, panels: [...DEFAULT_PAGE_PANELS[p.id]], custom: false }));

export const defaultLayout = (): Layout => ({ columns: DEFAULT_COLUMNS.map((c) => [...c]), widths: null, heights: {}, collapsed: [], pages: defaultPages(), removed: [] });

/**
 * Back to the usual columns, sizes and built-in pages, with removed tiles back in place. Pages
 * you made are kept (with what's on them), so a reset never loses your own pages or tiles.
 */
export const resetLayout = (l: Layout): Layout => ({ ...defaultLayout(), pages: [...defaultPages(), ...l.pages.filter((p) => p.custom)] });

export const tileKey = (id: string): TileKey => `tile:${id}`;
export const isTileKey = (k: string): k is TileKey => /^tile:[\w-]{1,60}$/.test(k);
const isPanel = (v: unknown): v is PanelKey => typeof v === 'string' && (Object.hasOwn(PANELS, v) || isTileKey(v));
const isBuiltInPage = (id: string) => BUILT_IN_PAGES.some((p) => p.id === id);

export const isDefault = (l: Layout): boolean =>
  l.widths === null &&
  !Object.keys(l.heights).length &&
  !l.collapsed.length &&
  !l.removed.length &&
  JSON.stringify(l.columns) === JSON.stringify(DEFAULT_COLUMNS) &&
  JSON.stringify(l.pages) === JSON.stringify(defaultPages());

/**
 * Reads a saved layout defensively: unknown panels are dropped, duplicates kept once, and
 * any panel missing (say, one added in a later version) goes back to its usual column and
 * pages. Built-in pages always exist; pages you made are kept as they were.
 */
export function normalizeLayout(raw: unknown): Layout {
  const l = defaultLayout();
  if (!raw || typeof raw !== 'object') return l;
  const r = raw as Partial<Record<keyof Layout, unknown>>;
  const seen = new Set<PanelKey>();
  if (Array.isArray(r.columns) && r.columns.length === 3) {
    l.columns = r.columns.map((col) => (Array.isArray(col) ? col.filter((id): id is PanelKey => isPanel(id) && !seen.has(id) && !!seen.add(id)) : []));
    DEFAULT_COLUMNS.forEach((col, i) => col.forEach((id) => !seen.has(id) && l.columns[i].push(id)));
  }
  if (Array.isArray(r.widths) && r.widths.length === 3 && r.widths.every((w) => typeof w === 'number' && w > 0 && Number.isFinite(w))) l.widths = r.widths as number[];
  if (r.heights && typeof r.heights === 'object') {
    for (const [id, h] of Object.entries(r.heights)) if (isPanel(id) && typeof h === 'number' && h >= MIN_HEIGHT && h < 5000) l.heights[id] = Math.round(h);
  }
  if (Array.isArray(r.collapsed)) l.collapsed = [...new Set(r.collapsed.filter(isPanel))];
  if (Array.isArray(r.pages)) {
    const pages: Page[] = [];
    for (const p of r.pages as Partial<Page>[]) {
      if (!p || typeof p.id !== 'string' || !p.id || pages.some((x) => x.id === p.id)) continue;
      const builtIn = BUILT_IN_PAGES.find((b) => b.id === p.id);
      const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 40) : (builtIn?.name ?? 'Page');
      const panels = Array.isArray(p.panels) ? [...new Set(p.panels.filter(isPanel))] : [];
      pages.push({ id: p.id, name, panels, custom: !builtIn });
    }
    // A built-in page that's missing (from an older version) comes back with its usual panels.
    // It goes back in its usual place among the built-in pages (Enemies right after Combat).
    // Layouts from before the Library: the spell compendium and the feat library move there.
    if (!pages.some((p) => p.id === 'library')) for (const p of pages) p.panels = p.panels.filter((x) => x !== 'compendium' && x !== 'feats');
    defaultPages().forEach((b, k) => {
      if (pages.some((p) => p.id === b.id)) return;
      const before = BUILT_IN_PAGES.slice(0, k).map((x) => x.id);
      const at = pages.reduce((last, p, i) => (before.includes(p.id as never) ? i : last), -1);
      pages.splice(at + 1, 0, b);
    });
    l.pages = pages;
  }
  if (Array.isArray(r.removed)) {
    for (const x of r.removed as Partial<RemovedPanel>[]) {
      if (!x || !isPanel(x.id) || l.removed.some((k) => k.id === x.id)) continue;
      const before: Record<string, PanelKey | null> = {};
      if (x.before && typeof x.before === 'object')
        for (const [pid, k] of Object.entries(x.before)) if (k === null || isPanel(k)) before[pid] = k;
      l.removed.push({ id: x.id, pages: Array.isArray(x.pages) ? x.pages.filter((p): p is string => typeof p === 'string') : [], ...(Object.keys(before).length ? { before } : {}) });
    }
    // A removed tile is on no page.
    const gone = new Set(l.removed.map((x) => x.id));
    l.pages = l.pages.map((p) => ({ ...p, panels: p.panels.filter((id) => !gone.has(id)) }));
  }
  // Every built-in panel you haven't removed is somewhere: one on no page goes back to its usual pages.
  for (const id of Object.keys(PANELS) as PanelId[]) {
    if (l.removed.some((x) => x.id === id) || l.pages.some((p) => p.panels.includes(id))) continue;
    for (const pid of PANELS[id]) l.pages.find((p) => p.id === pid)?.panels.push(id);
  }
  return l;
}

/** The pages a panel is on. */
export const pagesOf = (l: Layout, id: PanelKey): string[] => l.pages.filter((p) => p.panels.includes(id)).map((p) => p.id);

/** Whether a panel is on the wide screen's main sheet (a built-in page without its own tab). */
export const onSheet = (l: Layout, id: PanelKey): boolean => l.pages.some((p) => !ownTab(p) && p.panels.includes(id));

/** Puts a panel on exactly these pages (at the end of any it's new to). At least one page is kept. */
export function setPanelPages(l: Layout, id: PanelKey, pageIds: string[]): Layout {
  if (!pageIds.some((pid) => l.pages.some((p) => p.id === pid))) return l;
  return {
    ...l,
    pages: l.pages.map((p) => {
      const on = p.panels.includes(id);
      const want = pageIds.includes(p.id);
      if (on === want) return p;
      return { ...p, panels: want ? [...p.panels, id] : p.panels.filter((x) => x !== id) };
    }),
  };
}

/** Moves a panel to `index` on a page (counted without the panel itself). */
export function moveInPage(l: Layout, pageId: string, id: PanelKey, index: number): Layout {
  return {
    ...l,
    pages: l.pages.map((p) => {
      if (p.id !== pageId || !p.panels.includes(id)) return p;
      const panels = p.panels.filter((x) => x !== id);
      panels.splice(Math.max(0, Math.min(panels.length, index)), 0, id);
      return { ...p, panels };
    }),
  };
}

/**
 * Moves a panel one place up or down on a page, as a phone shows it, past the next panel
 * that's on screen (`shown`: a tile of another character isn't).
 */
export function stepInPage(l: Layout, pageId: string, id: PanelKey, dir: -1 | 1, shown: (k: PanelKey) => boolean = () => true): Layout {
  const page = l.pages.find((p) => p.id === pageId);
  if (!page || !page.panels.includes(id)) return l;
  const order = page.panels;
  let j = order.indexOf(id) + dir;
  while (j >= 0 && j < order.length && !shown(order[j])) j += dir;
  if (j < 0 || j >= order.length) return l;
  const at = order.filter((x) => x !== id).indexOf(order[j]);
  return moveInPage(l, pageId, id, dir < 0 ? at : at + 1);
}

/** Puts a panel just before another on a page (or at the end, for null): where a drag dropped it. */
export function placeInPage(l: Layout, pageId: string, id: PanelKey, before: PanelKey | null): Layout {
  const page = l.pages.find((p) => p.id === pageId);
  if (!page) return l;
  const rest = page.panels.filter((x) => x !== id);
  const at = before === null ? rest.length : rest.indexOf(before);
  return moveInPage(l, pageId, id, at < 0 ? rest.length : at);
}

let counter = 0;
/** Adds a page of your own; returns the layout and the new page's id. */
export function addPage(l: Layout, name: string): [Layout, string] {
  const id = `page-${Date.now().toString(36)}${(counter++).toString(36)}`;
  return [{ ...l, pages: [...l.pages, { id, name: name.trim().slice(0, 40) || 'New page', panels: [], custom: true }] }, id];
}

export function renamePage(l: Layout, pageId: string, name: string): Layout {
  return { ...l, pages: l.pages.map((p) => (p.id === pageId ? { ...p, name: name.slice(0, 40) } : p)) };
}

/** Moves a page one place left or right among the tabs. */
export function movePage(l: Layout, pageId: string, dir: -1 | 1): Layout {
  const i = l.pages.findIndex((p) => p.id === pageId);
  if (i < 0 || i + dir < 0 || i + dir >= l.pages.length) return l;
  const pages = [...l.pages];
  [pages[i], pages[i + dir]] = [pages[i + dir], pages[i]];
  return { ...l, pages };
}

/**
 * Deletes a page you made. Panels that were only on it aren't lost: built-in ones go back to
 * their usual pages, your tiles to the page before it.
 */
export function deletePage(l: Layout, pageId: string): Layout {
  const i = l.pages.findIndex((p) => p.id === pageId);
  const page = l.pages[i];
  if (!page || !page.custom) return l;
  let pages = l.pages.filter((p) => p.id !== pageId);
  const fallback = pages[Math.max(0, i - 1)].id;
  for (const id of page.panels) {
    if (pages.some((p) => p.panels.includes(id))) continue;
    const home = isTileKey(id) ? [fallback] : [...PANELS[id as PanelId]];
    pages = pages.map((p) => (home.includes(p.id) ? { ...p, panels: [...p.panels, id] } : p));
  }
  return { ...l, pages };
}

/** Adds a new tile to a page and to the end of a column. */
export function addPanel(l: Layout, id: PanelKey, pageId: string, col = 2): Layout {
  const columns = l.columns.map((c, i) => (i === col && !c.includes(id) ? [...c, id] : c));
  return setPanelPages({ ...l, columns }, id, [...pagesOf(l, id), pageId]);
}

/** Takes a panel off every page and column (a deleted tile). */
export function removePanel(l: Layout, id: PanelKey): Layout {
  const heights = { ...l.heights };
  delete heights[id];
  return {
    ...l,
    columns: l.columns.map((c) => c.filter((x) => x !== id)),
    pages: l.pages.map((p) => ({ ...p, panels: p.panels.filter((x) => x !== id) })),
    heights,
    collapsed: l.collapsed.filter((x) => x !== id),
    removed: l.removed.filter((x) => x.id !== id),
  };
}

/**
 * Takes a tile off every page, remembering which pages it was on. It keeps its place in the
 * columns and everything in it, so adding it back puts it where it was.
 */
export function takeOff(l: Layout, id: PanelKey): Layout {
  const pages = pagesOf(l, id);
  if (!pages.length && l.removed.some((x) => x.id === id)) return l;
  const before: Record<string, PanelKey | null> = {};
  for (const p of l.pages) if (p.panels.includes(id)) before[p.id] = p.panels[p.panels.indexOf(id) + 1] ?? null;
  return {
    ...l,
    pages: l.pages.map((p) => ({ ...p, panels: p.panels.filter((x) => x !== id) })),
    removed: [...l.removed.filter((x) => x.id !== id), { id, pages, before }],
  };
}

/**
 * Adds a removed tile back: to `pageId` if given, else to the pages it was on (those that
 * still exist), else to its usual pages (a tile you made: the first page you made, or Gear).
 */
export function putBack(l: Layout, id: PanelKey, pageId?: string): Layout {
  const was = l.removed.find((x) => x.id === id);
  const exists = (pid: string) => l.pages.some((p) => p.id === pid);
  const usual = isTileKey(id) ? [l.pages.find((p) => p.custom)?.id ?? 'gear'] : [...PANELS[id as PanelId]];
  const pages = pageId && exists(pageId) ? [pageId] : (was?.pages.filter(exists).length ? was.pages.filter(exists) : usual.filter(exists));
  const back = { ...l, removed: l.removed.filter((x) => x.id !== id) };
  const columns = back.columns.some((c) => c.includes(id)) ? back.columns : back.columns.map((c, i) => (i === 2 ? [...c, id] : c));
  let next = setPanelPages({ ...back, columns }, id, pages.length ? pages : [l.pages[0].id]);
  // Back in its old place on each page, before the tile that followed it (if that's still there).
  for (const [pid, after] of Object.entries(was?.before ?? {})) {
    const page = next.pages.find((p) => p.id === pid);
    if (page?.panels.includes(id) && (after === null || page.panels.includes(after))) next = placeInPage(next, pid, id, after);
  }
  return next;
}

/**
 * Makes room for tiles this layout hasn't seen (made on another device, or restored from a
 * backup): they go at the end of the last column and on the first page you made, or Gear.
 */
export function withTiles(l: Layout, keys: TileKey[]): Layout {
  const removed = (k: TileKey) => l.removed.some((x) => x.id === k);
  const missing = keys.filter((k) => !l.columns.some((c) => c.includes(k)) || (!removed(k) && !l.pages.some((p) => p.panels.includes(k))));
  if (!missing.length) return l;
  const home = l.pages.find((p) => p.custom)?.id ?? 'gear';
  let next = l;
  for (const k of missing) {
    if (!next.columns.some((c) => c.includes(k))) next = { ...next, columns: next.columns.map((c, i) => (i === 2 ? [...c, k] : c)) };
    if (!removed(k) && !next.pages.some((p) => p.panels.includes(k))) next = setPanelPages(next, k, [home]);
  }
  return next;
}

const locate = (l: Layout, id: PanelKey) => {
  const col = l.columns.findIndex((c) => c.includes(id));
  return { col, index: l.columns[col]?.indexOf(id) ?? -1 };
};

/** Puts a panel at `index` in column `col` (counted without the panel itself). */
export function movePanel(l: Layout, id: PanelKey, col: number, index: number): Layout {
  const columns = l.columns.map((c) => c.filter((x) => x !== id));
  const target = columns[Math.max(0, Math.min(columns.length - 1, col))];
  target.splice(Math.max(0, Math.min(target.length, index)), 0, id);
  return { ...l, columns };
}

/**
 * Moves a panel one place up or down in the columns as the wide screen shows them, skipping
 * panels that aren't on screen with it (`shown`).
 */
export function stepPanel(l: Layout, id: PanelKey, dir: -1 | 1, shown: (k: PanelKey) => boolean = () => true): Layout {
  const order = l.columns.flat();
  let i = order.indexOf(id) + dir;
  while (i >= 0 && i < order.length && !shown(order[i])) i += dir;
  if (i < 0 || i >= order.length) return l;
  const { col } = locate(l, order[i]);
  const at = l.columns[col].filter((x) => x !== id).indexOf(order[i]);
  return movePanel(l, id, col, dir < 0 ? at : at + 1);
}

/** Moves a panel to the column beside it, at about the same height in the list. */
export function shiftPanel(l: Layout, id: PanelKey, dir: -1 | 1): Layout {
  const { col, index } = locate(l, id);
  const to = col + dir;
  if (to < 0 || to >= l.columns.length) return l;
  return movePanel(l, id, to, index);
}

export function toggleCollapsed(l: Layout, id: PanelKey): Layout {
  return { ...l, collapsed: l.collapsed.includes(id) ? l.collapsed.filter((x) => x !== id) : [...l.collapsed, id] };
}

export function setHeight(l: Layout, id: PanelKey, h: number | null): Layout {
  const heights = { ...l.heights };
  if (h === null) delete heights[id];
  else heights[id] = Math.max(MIN_HEIGHT, Math.round(h));
  return { ...l, heights };
}

/** CSS grid tracks for the three-column and two-column layouts from custom widths. */
export function gridTracks(widths: number[]): { three: string; two: string } {
  const fr = (w: number) => `${Math.round(w * 100) / 100}fr`;
  return {
    three: `minmax(240px, ${fr(widths[0])}) minmax(260px, ${fr(widths[1])}) minmax(260px, ${fr(widths[2])})`,
    two: `minmax(240px, ${fr(widths[0])}) minmax(260px, ${fr(widths[1])})`,
  };
}

export { isBuiltInPage };
