// The Back button (Android's, or Escape on a keyboard): it steps back through what's open
// rather than closing the app. Whatever is on top (an open dialog, then Arrange mode, then the
// page you came from) registers a handler; Back runs the newest one. With nothing left, the
// Android app goes to the background, keeping everything as it was.

type Handler = () => void;
/** 'overlay': a dialog or Arrange mode (Escape closes these too). 'page': going back a page (Back only). */
type Kind = 'overlay' | 'page';
const stack: { id: number; run: Handler; kind: Kind }[] = [];
let next = 1;

/** Registers something Back should close; returns the function that unregisters it. */
export function onBack(run: Handler, kind: Kind = 'overlay'): () => void {
  const id = next++;
  stack.push({ id, run, kind });
  return () => {
    const i = stack.findIndex((h) => h.id === id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/**
 * Runs the newest handler (with `pages` false, the newest dialog or Arrange mode only: the
 * Escape key shouldn't flip pages). Returns false when there was nothing to go back from.
 */
export function goBack(pages = true): boolean {
  const top = [...stack].reverse().find((h) => pages || h.kind === 'overlay');
  if (!top) return false;
  top.run();
  return true;
}

/** How many things Back would close (for tests). */
export const backDepth = () => stack.length;
