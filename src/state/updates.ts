// Updating the app. The website updates itself (its service worker fetches the new files, and
// "Update now" switches to them). The Android, iPad/iPhone and Mac apps carry their own copy, so
// they check the site's version.json (written by CI on every publish) and, when there's a newer
// build, download the new app file from the site: installing it over the old app keeps every
// character, because each platform keeps an app's data when the same app is installed over it.

import { isMacApp, platform } from './native';

export const SITE = 'https://death7310.github.io/The-Arcane-Tome-/';
export const APP_VERSION = __APP_VERSION__;
/** CI's run number for this build; 0 for a local build. */
export const APP_BUILD = Number(__APP_BUILD__) || 0;

export interface Published {
  version: string;
  build: number;
  date: string;
  /** The app files on the site (an app whose build didn't finish isn't there). */
  files: string[];
}

export type AppKind = 'android' | 'ios' | 'mac' | 'web';

/** Which copy of the app this is. */
export function appKind(): AppKind {
  if (isMacApp()) return 'mac';
  const p = platform();
  return p === 'android' || p === 'ios' ? p : 'web';
}

export const APP_FILE: Record<Exclude<AppKind, 'web'>, string> = { android: 'arcane-tome.apk', ios: 'arcane-tome.ipa', mac: 'arcane-tome-mac.dmg' };
export const KIND_NAME: Record<AppKind, string> = { android: 'Android app', ios: 'iPad and iPhone app', mac: 'Mac app', web: 'website' };

/** Reads what the site has published (fails when offline). */
export async function latestPublished(fetcher: typeof fetch = fetch): Promise<Published> {
  const r = await fetcher(`${SITE}version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`the site answered ${r.status}`);
  return readPublished(await r.json());
}

export function readPublished(raw: unknown): Published {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Published>;
  const build = Number(o.build);
  if (!Number.isFinite(build) || build <= 0 || typeof o.version !== 'string') throw new Error('the version file is unreadable');
  return { version: o.version, build, date: typeof o.date === 'string' ? o.date : '', files: Array.isArray(o.files) ? o.files.filter((f): f is string => typeof f === 'string') : [] };
}

/** Whether the published build is newer than this one (a local build counts as older than any). */
export const isNewer = (p: Published, build = APP_BUILD): boolean => p.build > build;

/** Opens a link outside the app: the system browser (Android, iPad, Mac app) or a new tab. */
export function openOutside(url: string) {
  // The apps hand any navigation away from their own pages to the system (Capacitor's shell on
  // Android and iOS, desktop/main.cjs on the Mac), which opens it in the browser.
  if (appKind() === 'web') window.open(url, '_blank', 'noopener');
  else window.location.assign(url);
}

const LAST_CHECK = 'arcane-tome:update-check';

/** At most every few hours, quietly: whether a newer app is out (null when unknown or offline). */
export async function checkInBackground(hours = 6): Promise<Published | null> {
  if (appKind() === 'web') return null;
  try {
    const last = Number(localStorage.getItem(LAST_CHECK)) || 0;
    if (Date.now() - last < hours * 3600_000) return null;
  } catch {
    /* No storage: check anyway. */
  }
  try {
    const p = await latestPublished();
    // Only a check that got an answer counts: offline, it tries again next time the app opens.
    try {
      localStorage.setItem(LAST_CHECK, String(Date.now()));
    } catch {
      /* No storage. */
    }
    return isNewer(p) ? p : null;
  } catch {
    return null;
  }
}
