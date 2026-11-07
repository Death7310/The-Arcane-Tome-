// The phone itself: keeping the screen on during a fight, and a buzz on a natural 20 or 1.
// In the Android app these use the app's own KeepAwake plugin (MainActivity) and Capacitor's
// Haptics; in a browser, the Screen Wake Lock API and navigator.vibrate where they exist.

import { isNative } from './native';

let vibrateOn = true;
export const setVibrate = (on: boolean) => void (vibrateOn = on);

/** A strong double buzz for a natural 20, a long dull one for a natural 1. */
export async function buzz(kind: 'crit' | 'fumble'): Promise<void> {
  if (!vibrateOn) return;
  try {
    if (isNative()) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (kind === 'crit') {
        await Haptics.impact({ style: ImpactStyle.Heavy });
        setTimeout(() => void Haptics.impact({ style: ImpactStyle.Heavy }), 140);
      } else await Haptics.notification({ type: NotificationType.Error });
      return;
    }
    navigator.vibrate?.(kind === 'crit' ? [70, 60, 110] : [260]);
  } catch {
    /* No vibration on this device. */
  }
}

interface KeepAwakePlugin {
  keepOn(): Promise<void>;
  allowSleep(): Promise<void>;
}

let lock: { release(): Promise<void> } | null = null;
let wanted = false;

async function requestWebLock() {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (wl && document.visibilityState === 'visible') lock = await wl.request('screen');
  } catch {
    lock = null; // Not allowed (battery saver, an embedded viewer): the screen sleeps as usual.
  }
}

// A browser drops the lock when the page is hidden; take it again on return.
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible' && !isNative()) void requestWebLock();
  });

/** Keeps the screen on (true) or lets it sleep again (false). */
export async function keepScreenOn(on: boolean): Promise<void> {
  if (on === wanted) return;
  wanted = on;
  try {
    if (isNative()) {
      const { registerPlugin } = await import('@capacitor/core');
      const plugin = registerPlugin<KeepAwakePlugin>('KeepAwake');
      await (on ? plugin.keepOn() : plugin.allowSleep());
      return;
    }
    if (on) await requestWebLock();
    else {
      await lock?.release();
      lock = null;
    }
  } catch {
    /* The screen sleeps as usual. */
  }
}
