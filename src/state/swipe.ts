// Sliding between pages: a sideways swipe on a phone or tablet, a two-finger sideways swipe on
// a laptop's trackpad (Mac or PC), on every version of the app. The arrow keys on the tabs do
// the same from a keyboard. Fields, sliders, sideways-scrolling tables, dialogs and Arrange's
// drag handles keep their own gestures.

import { useEffect, useRef, type RefObject } from 'react';

export const SWIPE = {
  /** A finger must travel this far sideways (px)… */
  min: 60,
  /** …mostly sideways (this many times its vertical travel)… */
  ratio: 1.6,
  /** …within this long (ms). */
  maxMs: 900,
  /** Trackpad: sideways scroll (px) that turns the page. */
  wheel: 110,
  /** Trackpad: a pause this long (ms) ends one swipe, momentum included. */
  wheelIdle: 380,
};

export type Dir = 1 | -1;

/** The page a swipe lands on: the next one for 1, the previous for -1, or null past either end. */
export function neighbour(order: string[], current: string, dir: Dir): string | null {
  const i = order.indexOf(current);
  if (i < 0) return order[0] ?? null;
  return order[i + dir] ?? null;
}

/**
 * Whether a finger's movement is a page swipe, and which way: 1 (it moved left: the next page),
 * -1 (it moved right: the previous one) or 0 (a tap, a scroll, or too slow).
 */
export function swipeDir(dx: number, dy: number, ms: number): Dir | 0 {
  if (ms > SWIPE.maxMs || Math.abs(dx) < SWIPE.min || Math.abs(dx) < Math.abs(dy) * SWIPE.ratio) return 0;
  return dx < 0 ? 1 : -1;
}

const KEEP = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .scrim, [role="dialog"], .grip, .resize-grip, .col-divider, .arrange-bar, .result, [data-no-swipe]';

/** Whether a gesture starting here belongs to the element instead (typing, sliding, scrolling sideways…). */
export function keepsGesture(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest(KEEP)) return true;
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const x = getComputedStyle(el).overflowX;
      if (x === 'auto' || x === 'scroll') return true;
    }
  }
  return false;
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Slides the page in from the side it came from. */
export function slideIn(el: HTMLElement | null, dir: Dir) {
  if (!el || reducedMotion() || typeof el.animate !== 'function') return;
  el.animate([{ transform: `translateX(${dir * 44}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 210, easing: 'cubic-bezier(.2,.7,.3,1)' });
}

export interface SwipeOptions {
  /** Where swipes are read. */
  surface: RefObject<HTMLElement | null>;
  /** What follows the finger while it moves (the page's content). */
  follow: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** The pages in tab order, and the one showing. */
  order: () => string[];
  current: () => string;
  go: (page: string, dir: Dir) => void;
}

export function usePageSwipe(opts: SwipeOptions) {
  const ref = useRef(opts);
  ref.current = opts;
  useEffect(() => {
    const surface = opts.surface.current;
    if (!surface) return;
    const target = (dir: Dir) => neighbour(ref.current.order(), ref.current.current(), dir);
    const drag = (x: number | null) => {
      const el = ref.current.follow.current;
      if (!el) return;
      if (x === null) {
        if (!el.style.transform) return;
        el.style.transition = 'transform 160ms ease-out';
        el.style.transform = '';
        window.setTimeout(() => (el.style.transition = ''), 180);
      } else {
        el.style.transition = 'none';
        el.style.transform = `translateX(${x}px)`;
      }
    };

    // Touch: follow the finger once it's clearly moving sideways, turn the page on release.
    let start: { x: number; y: number; t: number; axis: 'x' | 'y' | null } | null = null;
    const onStart = (e: TouchEvent) => {
      start = ref.current.enabled && e.touches.length === 1 && !keepsGesture(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), axis: null } : null;
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!start.axis && Math.hypot(dx, dy) > 12) start.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (start.axis !== 'x') return;
      // Past the first or last page it only gives a little.
      const open = target(dx < 0 ? 1 : -1) !== null;
      drag(open ? dx * 0.45 : dx * 0.12);
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const s = start;
      start = null;
      drag(null);
      if (s.axis !== 'x') return;
      const t = e.changedTouches[0];
      const dir = swipeDir(t.clientX - s.x, t.clientY - s.y, performance.now() - s.t);
      const next = dir ? target(dir) : null;
      if (dir && next) ref.current.go(next, dir);
    };
    const onCancel = () => {
      start = null;
      drag(null);
    };

    // Trackpad: a two-finger sideways swipe arrives as sideways wheel scrolling.
    let sum = 0;
    let last = 0;
    let fired = false;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (now - last > SWIPE.wheelIdle) {
        sum = 0;
        fired = false;
      }
      last = now;
      if (!ref.current.enabled || fired || e.ctrlKey || e.shiftKey) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * SWIPE.ratio || keepsGesture(e.target)) return;
      sum += e.deltaX * (e.deltaMode === 1 ? 16 : 1);
      if (Math.abs(sum) < SWIPE.wheel) return;
      fired = true;
      const dir: Dir = sum > 0 ? 1 : -1;
      const next = target(dir);
      if (next) ref.current.go(next, dir);
    };

    surface.addEventListener('touchstart', onStart, { passive: true });
    surface.addEventListener('touchmove', onMove, { passive: true });
    surface.addEventListener('touchend', onEnd, { passive: true });
    surface.addEventListener('touchcancel', onCancel, { passive: true });
    surface.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      surface.removeEventListener('touchstart', onStart);
      surface.removeEventListener('touchmove', onMove);
      surface.removeEventListener('touchend', onEnd);
      surface.removeEventListener('touchcancel', onCancel);
      surface.removeEventListener('wheel', onWheel);
    };
  }, [opts.surface, opts.follow]);
}
