// Where each panel sits: which column, in what order, how tall, and whether it's folded
// away. Saved with the settings, so it belongs to this device (a phone and a laptop can
// be arranged differently). Everything here is pure; the dragging lives in the UI.

/** Every movable panel, with the phone tabs it appears on. */
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
  spells: ['magic'],
  features: ['gear', 'combat'],
  inventory: ['gear'],
  notes: ['gear'],
} as const satisfies Record<string, readonly string[]>;

export type PanelId = keyof typeof PANELS;

export interface Layout {
  /** Panel ids in each of the three columns, top to bottom. */
  columns: PanelId[][];
  /** Relative column widths (any unit; they become fr), or null for the built-in widths. */
  widths: number[] | null;
  /** Heights in px for panels the reader has sized; the rest fit their content. */
  heights: Partial<Record<PanelId, number>>;
  collapsed: PanelId[];
}

export const MIN_HEIGHT = 120;

const DEFAULT_COLUMNS: PanelId[][] = [
  ['identity', 'abilities', 'glance'],
  ['vitals', 'conditions', 'turn', 'attacks', 'companions', 'skills'],
  ['spells', 'features', 'inventory', 'notes'],
];

export const defaultLayout = (): Layout => ({ columns: DEFAULT_COLUMNS.map((c) => [...c]), widths: null, heights: {}, collapsed: [] });

const isPanel = (v: unknown): v is PanelId => typeof v === 'string' && Object.hasOwn(PANELS, v);

export const isDefault = (l: Layout): boolean =>
  l.widths === null && !Object.keys(l.heights).length && !l.collapsed.length && JSON.stringify(l.columns) === JSON.stringify(DEFAULT_COLUMNS);

/**
 * Reads a saved layout defensively: unknown panels are dropped, duplicates kept once, and
 * any panel missing (say, one added in a later version) goes back to its usual column.
 */
export function normalizeLayout(raw: unknown): Layout {
  const l = defaultLayout();
  if (!raw || typeof raw !== 'object') return l;
  const r = raw as Partial<Record<keyof Layout, unknown>>;
  const seen = new Set<PanelId>();
  if (Array.isArray(r.columns) && r.columns.length === 3) {
    l.columns = r.columns.map((col) => (Array.isArray(col) ? col.filter((id): id is PanelId => isPanel(id) && !seen.has(id) && !!seen.add(id)) : []));
    DEFAULT_COLUMNS.forEach((col, i) => col.forEach((id) => !seen.has(id) && l.columns[i].push(id)));
  }
  if (Array.isArray(r.widths) && r.widths.length === 3 && r.widths.every((w) => typeof w === 'number' && w > 0 && Number.isFinite(w))) l.widths = r.widths as number[];
  if (r.heights && typeof r.heights === 'object') {
    for (const [id, h] of Object.entries(r.heights)) if (isPanel(id) && typeof h === 'number' && h >= MIN_HEIGHT && h < 5000) l.heights[id] = Math.round(h);
  }
  if (Array.isArray(r.collapsed)) l.collapsed = [...new Set(r.collapsed.filter(isPanel))];
  return l;
}

const locate = (l: Layout, id: PanelId) => {
  const col = l.columns.findIndex((c) => c.includes(id));
  return { col, index: l.columns[col]?.indexOf(id) ?? -1 };
};

/** Puts a panel at `index` in column `col` (counted without the panel itself). */
export function movePanel(l: Layout, id: PanelId, col: number, index: number): Layout {
  const columns = l.columns.map((c) => c.filter((x) => x !== id));
  const target = columns[Math.max(0, Math.min(columns.length - 1, col))];
  target.splice(Math.max(0, Math.min(target.length, index)), 0, id);
  return { ...l, columns };
}

const shareTab = (a: PanelId, b: PanelId) => (PANELS[a] as readonly string[]).some((t) => (PANELS[b] as readonly string[]).includes(t));

/**
 * Moves a panel one place up or down as a phone shows it: the columns stacked in order,
 * counting only panels that share a tab with it (the others aren't on screen with it).
 */
export function stepPanel(l: Layout, id: PanelId, dir: -1 | 1): Layout {
  const order = l.columns.flat();
  let i = order.indexOf(id) + dir;
  while (i >= 0 && i < order.length && !shareTab(order[i], id)) i += dir;
  if (i < 0 || i >= order.length) return l;
  const { col } = locate(l, order[i]);
  const at = l.columns[col].filter((x) => x !== id).indexOf(order[i]);
  return movePanel(l, id, col, dir < 0 ? at : at + 1);
}

/** Moves a panel to the column beside it, at about the same height in the list. */
export function shiftPanel(l: Layout, id: PanelId, dir: -1 | 1): Layout {
  const { col, index } = locate(l, id);
  const to = col + dir;
  if (to < 0 || to >= l.columns.length) return l;
  return movePanel(l, id, to, index);
}

export function toggleCollapsed(l: Layout, id: PanelId): Layout {
  return { ...l, collapsed: l.collapsed.includes(id) ? l.collapsed.filter((x) => x !== id) : [...l.collapsed, id] };
}

export function setHeight(l: Layout, id: PanelId, h: number | null): Layout {
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
