// Where each panel sits: which column, in what order, how tall, whether it's folded away,
// and which pages it's on. Saved with the settings, so it belongs to this device (a phone
// and a laptop can be arranged differently). Everything here is pure; the dragging lives
// in the UI.
//
// Pages are the phone's tabs: the built-in ones (Stats, Combat, Magic, Gear, Languages)
// and any you make. A panel can be on several pages, in its own place on each. On a wide
// screen the built-in pages share one sheet laid out in columns, and the pages you made
// get tabs of their own.

/** Every built-in panel, with the pages it starts on. */
export const PANELS = {
  identity: ['stats'],
  abilities: ['stats'],
  glance: ['stats', 'combat'],
  vitals: ['combat'],
  conditions: ['combat'],
  turn: ['combat'],
  attacks: ['combat'],
  companions: ['combat'],
  skills: ['stats'],
  features: ['stats'],
  feats: ['stats'],
  spells: ['magic'],
  compendium: ['magic'],
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
}

export const MIN_HEIGHT = 120;

export const BUILT_IN_PAGES = [
  { id: 'stats', name: 'Stats' },
  { id: 'combat', name: 'Combat' },
  { id: 'magic', name: 'Magic' },
  { id: 'gear', name: 'Gear' },
  { id: 'languages', name: 'Languages' },
] as const;

const DEFAULT_COLUMNS: PanelKey[][] = [
  ['identity', 'abilities', 'glance', 'languages', 'feats'],
  ['vitals', 'conditions', 'turn', 'attacks', 'companions', 'skills'],
  ['spells', 'compendium', 'features', 'inventory', 'notes'],
];

/** The built-in pages' panels, in phone order. */
const DEFAULT_PAGE_PANELS: Record<string, PanelKey[]> = {
  stats: ['identity', 'abilities', 'skills', 'features', 'glance', 'feats'],
  combat: ['glance', 'vitals', 'conditions', 'turn', 'attacks', 'companions'],
  magic: ['spells', 'compendium'],
  gear: ['inventory', 'notes'],
  languages: ['languages'],
};

const defaultPages = (): Page[] => BUILT_IN_PAGES.map((p) => ({ id: p.id, name: p.name, panels: [...DEFAULT_PAGE_PANELS[p.id]], custom: false }));

export const defaultLayout = (): Layout => ({ columns: DEFAULT_COLUMNS.map((c) => [...c]), widths: null, heights: {}, collapsed: [], pages: defaultPages() });

/**
 * Back to the usual columns, sizes and built-in pages. Pages you made are kept (with what's on
 * them), so a reset never loses your own pages or tiles.
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
    for (const b of defaultPages()) if (!pages.some((p) => p.id === b.id)) pages.push(b);
    l.pages = pages;
    // Every built-in panel is somewhere: one that's on no page goes back to its usual pages.
    for (const id of Object.keys(PANELS) as PanelId[]) {
      if (pages.some((p) => p.panels.includes(id))) continue;
      for (const pid of PANELS[id]) pages.find((p) => p.id === pid)?.panels.push(id);
    }
  }
  return l;
}

/** The pages a panel is on. */
export const pagesOf = (l: Layout, id: PanelKey): string[] => l.pages.filter((p) => p.panels.includes(id)).map((p) => p.id);

/** Whether a panel is on the wide screen's main sheet (any built-in page). */
export const onSheet = (l: Layout, id: PanelKey): boolean => l.pages.some((p) => !p.custom && p.panels.includes(id));

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
  return { ...l, columns: l.columns.map((c) => c.filter((x) => x !== id)), pages: l.pages.map((p) => ({ ...p, panels: p.panels.filter((x) => x !== id) })), heights, collapsed: l.collapsed.filter((x) => x !== id) };
}

/**
 * Makes room for tiles this layout hasn't seen (made on another device, or restored from a
 * backup): they go at the end of the last column and on the first page you made, or Gear.
 */
export function withTiles(l: Layout, keys: TileKey[]): Layout {
  const missing = keys.filter((k) => !l.columns.some((c) => c.includes(k)) || !l.pages.some((p) => p.panels.includes(k)));
  if (!missing.length) return l;
  const home = l.pages.find((p) => p.custom)?.id ?? 'gear';
  let next = l;
  for (const k of missing) {
    if (!next.columns.some((c) => c.includes(k))) next = { ...next, columns: next.columns.map((c, i) => (i === 2 ? [...c, k] : c)) };
    if (!next.pages.some((p) => p.panels.includes(k))) next = setPanelPages(next, k, [home]);
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
