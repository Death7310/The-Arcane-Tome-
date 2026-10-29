// Arranging the sheet: drag a panel by its handle to another place or column, drag the
// gap between columns to widen one, drag a panel's bottom edge to set its height, and
// fold any panel away to its title. Every drag has a button alternative (arrows, "Fit
// height"), so it all works by keyboard, by one tap at a time, and on phones (WCAG 2.2
// SC 2.5.7, Dragging Movements).
//
// Drags only change the page while they run; the layout is saved once, when you let go.

import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from 'react';
import { gridTracks, MIN_HEIGHT, movePanel, setHeight, shiftPanel, stepPanel, toggleCollapsed, type Layout, type PanelId } from '../state/layout';

export interface SlotApi {
  id: PanelId;
  arranging: boolean;
  dragging: boolean;
  collapsed: boolean;
  height: number | undefined;
  toggle(): void;
  step(dir: -1 | 1): void;
  shift(dir: -1 | 1): void;
  fitHeight(): void;
  nudgeHeight(by: number): void;
  beginDrag(e: RPointerEvent<HTMLElement>, title: string): void;
  beginResize(e: RPointerEvent<HTMLElement>): void;
}

const SlotContext = createContext<SlotApi | null>(null);

/** The arranging controls of the panel being rendered, or null outside the sheet's columns. */
export const useSlot = () => useContext(SlotContext);

export function PanelSlot(props: { api: SlotApi; children: ReactNode }) {
  return <SlotContext.Provider value={props.api}>{props.children}</SlotContext.Provider>;
}

interface Line {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Target {
  col: number;
  index: number;
  line: Line;
}

const columnsOf = (folio: HTMLElement) => [...folio.querySelectorAll<HTMLElement>(':scope > .col')];

/** Which column and position a panel dropped at (x, y) would land in, and where to draw the marker. */
function dropTarget(folio: HTMLElement, id: PanelId, x: number, y: number): Target | null {
  const cols = columnsOf(folio);
  let best = -1;
  let bestDistance = Infinity;
  cols.forEach((col, i) => {
    const r = col.getBoundingClientRect();
    if (r.width === 0) return;
    // An empty column still takes drops near its top.
    const bottom = Math.max(r.bottom, r.top + 120);
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > bottom ? y - bottom : 0;
    if (dx * 4 + dy < bestDistance) (bestDistance = dx * 4 + dy), (best = i);
  });
  if (best < 0) return null;
  const col = cols[best];
  const cr = col.getBoundingClientRect();
  // Two-column screens lay the third column out as a grid of panels side by side.
  const grid = getComputedStyle(col).gridTemplateColumns.trim().split(/\s+/).length > 1;
  const panels = [...col.querySelectorAll<HTMLElement>(':scope > .panel')].filter((p) => p.dataset.panel !== id);
  let index = panels.length;
  let next: DOMRect | null = null;
  let prev: DOMRect | null = null;
  for (let k = 0; k < panels.length; k++) {
    const r = panels[k].getBoundingClientRect();
    if (r.height === 0) continue; // on another phone tab
    const after = y > r.bottom || (y >= r.top && (grid ? x > r.left + r.width / 2 : y > r.top + r.height / 2));
    if (!after) {
      index = k;
      next = r;
      break;
    }
    prev = r;
  }
  const line =
    grid && next
      ? { left: next.left - 10, top: next.top, width: 4, height: next.height }
      : { left: cr.left, top: next ? next.top - 10 : prev ? prev.bottom + 6 : cr.top, width: cr.width, height: 4 };
  return { col: best, index, line };
}

/** Scrolls the page while a drag is held near the top or bottom edge. */
function edgeScroll(y: number) {
  const edge = 70;
  if (y < edge) window.scrollBy(0, -Math.ceil((edge - y) / 4));
  else if (y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((y - (window.innerHeight - edge)) / 4));
}

/** Follows a pointer from a handle until it's released (or the drag is cancelled with Escape). */
function track(e: RPointerEvent<HTMLElement>, onMove: (ev: PointerEvent) => void, onEnd: (commit: boolean) => void) {
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  const done = (commit: boolean) => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    onEnd(commit);
  };
  const up = () => done(true);
  const cancel = () => done(false);
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    done(false);
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
}

interface Divider {
  index: number;
  left: number;
  height: number;
}

/**
 * The arranging machinery for the sheet: an API for each panel slot, the column dividers
 * (drawn inside the folio) and the drag overlay (the ghost and the drop marker).
 */
export function useArranger(layout: Layout, setLayout: (l: Layout) => void, folioRef: RefObject<HTMLElement | null>, arranging: boolean) {
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [drag, setDrag] = useState<{ id: PanelId; title: string; x: number; y: number; line: Line | null } | null>(null);
  const [dividers, setDividers] = useState<Divider[]>([]);

  useLayoutEffect(() => {
    const folio = folioRef.current;
    if (!arranging || !folio) {
      setDividers([]);
      return;
    }
    const measure = () => {
      const fr = folio.getBoundingClientRect();
      const rects = columnsOf(folio).map((c) => c.getBoundingClientRect());
      const out: Divider[] = [];
      for (let i = 0; i + 1 < rects.length; i++) {
        const [a, b] = [rects[i], rects[i + 1]];
        // Only columns that sit side by side have an edge to drag.
        if (!a.width || !b.width || Math.abs(a.top - b.top) > 4 || b.left < a.right) continue;
        out.push({ index: i, left: (a.right + b.left) / 2 - fr.left, height: fr.height });
      }
      setDividers((d) => (JSON.stringify(d) === JSON.stringify(out) ? d : out));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(folio);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [arranging, layout, folioRef]);

  const beginDrag = (id: PanelId) => (e: RPointerEvent<HTMLElement>, title: string) => {
    const folio = folioRef.current;
    if (e.button !== 0 || !folio) return;
    e.preventDefault();
    let target: Target | null = null;
    setDrag({ id, title, x: e.clientX, y: e.clientY, line: null });
    track(
      e,
      (ev) => {
        target = dropTarget(folio, id, ev.clientX, ev.clientY);
        setDrag({ id, title, x: ev.clientX, y: ev.clientY, line: target?.line ?? null });
        edgeScroll(ev.clientY);
      },
      (commit) => {
        setDrag(null);
        if (commit && target) setLayout(movePanel(layoutRef.current, id, target.col, target.index));
      },
    );
  };

  const beginResize = (id: PanelId) => (e: RPointerEvent<HTMLElement>) => {
    const panel = e.currentTarget.closest<HTMLElement>('.panel');
    if (e.button !== 0 || !panel) return;
    e.preventDefault();
    const start = panel.getBoundingClientRect().height;
    const y0 = e.clientY;
    let height = start;
    track(
      e,
      (ev) => {
        height = Math.max(MIN_HEIGHT, start + ev.clientY - y0);
        panel.style.setProperty('--panel-h', `${height}px`);
        panel.dataset.h = '';
        edgeScroll(ev.clientY);
      },
      (commit) => {
        if (commit && Math.abs(height - start) > 2) setLayout(setHeight(layoutRef.current, id, height));
        else if (layoutRef.current.heights[id] === undefined) delete panel.dataset.h;
      },
    );
  };

  const beginColumnResize = (index: number) => (e: RPointerEvent<HTMLElement>) => {
    const folio = folioRef.current;
    if (e.button !== 0 || !folio) return;
    e.preventDefault();
    const rects = columnsOf(folio).map((c) => c.getBoundingClientRect());
    const sideBySide = rects.filter((r) => Math.abs(r.top - rects[0].top) < 4).length;
    // On two-column screens the third column spans the page; keep its share as it was.
    const widths = rects.map((r, i) => (i < sideBySide ? r.width : (layoutRef.current.widths?.[i] ?? (rects[0].width + rects[1].width) * 0.6)));
    const pair = widths[index] + widths[index + 1];
    const x0 = e.clientX;
    let next = widths;
    track(
      e,
      (ev) => {
        const left = Math.max(240, Math.min(pair - 260, widths[index] + ev.clientX - x0));
        next = widths.map((w, i) => (i === index ? left : i === index + 1 ? pair - left : w));
        const tracks = gridTracks(next);
        folio.classList.add('custom-widths');
        folio.style.setProperty('--grid3', tracks.three);
        folio.style.setProperty('--grid2', tracks.two);
      },
      (commit) => {
        if (commit && next !== widths) setLayout({ ...layoutRef.current, widths: next.map((w) => Math.round(w)) });
        else if (!layoutRef.current.widths) folio.classList.remove('custom-widths');
      },
    );
  };

  const slot = (id: PanelId): SlotApi => {
    const set = (fn: (l: Layout) => Layout) => setLayout(fn(layoutRef.current));
    return {
      id,
      arranging,
      dragging: drag?.id === id,
      collapsed: layout.collapsed.includes(id),
      height: layout.heights[id],
      toggle: () => set((l) => toggleCollapsed(l, id)),
      step: (dir) => set((l) => stepPanel(l, id, dir)),
      shift: (dir) => set((l) => shiftPanel(l, id, dir)),
      fitHeight: () => set((l) => setHeight(l, id, null)),
      nudgeHeight: (by) => {
        const panel = folioRef.current?.querySelector<HTMLElement>(`[data-panel="${id}"]`);
        const now = layoutRef.current.heights[id] ?? panel?.getBoundingClientRect().height ?? 300;
        set((l) => setHeight(l, id, now + by));
      },
      beginDrag: beginDrag(id),
      beginResize: beginResize(id),
    };
  };

  const dividerEls = dividers.map((d) => (
    <div
      key={d.index}
      className="col-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to change the column widths"
      style={{ left: d.left, height: d.height }}
      onPointerDown={beginColumnResize(d.index)}
    />
  ));

  const overlay = drag && (
    <>
      {drag.line && <div className="drop-line" style={drag.line as CSSProperties} />}
      <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
        {drag.title}
      </div>
    </>
  );

  return { slot, dividerEls, overlay };
}

/** Arrows, "Fit height" and the bottom-edge grip shown on each panel while arranging. */
export function ArrangeTools(props: { slot: SlotApi; title: string }) {
  const { slot, title } = props;
  const onKey = (e: RKeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      slot.nudgeHeight(e.key === 'ArrowUp' ? -40 : 40);
    }
  };
  return (
    <div className="arrange-tools">
      <div className="row">
        <button type="button" className="btn small ghost" aria-label={`Move ${title} up`} title="Move up" onClick={() => slot.step(-1)}>
          ↑
        </button>
        <button type="button" className="btn small ghost" aria-label={`Move ${title} down`} title="Move down" onClick={() => slot.step(1)}>
          ↓
        </button>
        <button type="button" className="btn small ghost wide-only" aria-label={`Move ${title} to the column on the left`} title="Column to the left" onClick={() => slot.shift(-1)}>
          ←
        </button>
        <button type="button" className="btn small ghost wide-only" aria-label={`Move ${title} to the column on the right`} title="Column to the right" onClick={() => slot.shift(1)}>
          →
        </button>
        {slot.height !== undefined && (
          <button type="button" className="btn small ghost wide-only" onClick={slot.fitHeight}>
            Fit height
          </button>
        )}
      </div>
      <div
        className="resize-grip wide-only"
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Height of ${title}: drag, or use the up and down arrow keys`}
        tabIndex={0}
        onPointerDown={slot.beginResize}
        onKeyDown={onKey}
      />
    </div>
  );
}
