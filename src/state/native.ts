// Saving on the device. In the Android and iPad apps, the whole save also lives in a file in
// the app's own storage, and backups can be written where the person can find them (Android's
// Documents folder; the Files app on an iPad or iPhone) or handed to the share sheet. In a
// browser the same buttons download or share the file instead.
// Capacitor's plugins are loaded only inside the apps.

import { downloadText } from './storage';

const SAVE_PATH = 'arcane-tome/save.json';
const FOLDER = 'Arcane Tome';

type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } };

export const isNative = (): boolean => !!(window as unknown as CapacitorGlobal).Capacitor?.isNativePlatform?.();

/** Which app this is running in: 'android', 'ios' (iPad or iPhone), or 'web' for a browser. */
export const platform = (): 'android' | 'ios' | 'web' => {
  if (!isNative()) return 'web';
  const p = (window as unknown as CapacitorGlobal).Capacitor?.getPlatform?.();
  return p === 'ios' ? 'ios' : p === 'android' ? 'android' : 'web';
};

/** True in the Mac app (desktop/main.cjs), which runs the same web build in Electron. */
export const isMacApp = (): boolean => typeof navigator !== 'undefined' && /\bElectron\//.test(navigator.userAgent);

/** True in a browser on a Mac (not an iPad, which can also report itself as a Mac). */
export const isMacBrowser = (): boolean =>
  typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1) && !isMacApp();

/** What to call the device in messages: "iPad", "iPhone" or "phone". */
export const deviceWord = (): string =>
  platform() === 'ios' ? (/iPhone|iPod/.test(navigator.userAgent) ? 'iPhone' : 'iPad') : 'phone';

export async function readNativeSave(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const r = await Filesystem.readFile({ path: SAVE_PATH, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : null;
  } catch {
    return null; // No save file yet.
  }
}

export async function writeNativeSave(json: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({ path: SAVE_PATH, data: json, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
    return true;
  } catch {
    return false;
  }
}

export type FileResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Puts a backup where the person can find it: Documents/Arcane Tome on Android; the app's own
 * folder in the Files app on an iPad or iPhone (Info.plist shares it); a download in a browser.
 */
export async function saveFileToDevice(filename: string, text: string): Promise<FileResult> {
  if (isMacApp()) {
    return downloadText(filename, text)
      ? { ok: true, message: `Choose where to keep ${filename} (it starts in Documents).` }
      : { ok: false, message: "Couldn't save the backup. Use Characters → Export → Copy instead." };
  }
  if (!isNative()) {
    return downloadText(filename, text)
      ? { ok: true, message: `Saved ${filename} to your downloads.` }
      : { ok: false, message: 'This viewer blocks downloads. Use Characters → Export → Copy instead.' };
  }
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    if (platform() === 'ios') {
      // The app's Documents folder is what the Files app shows as On My iPad › Arcane Tome.
      await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
      return { ok: true, message: `Saved to the Files app: On My ${deviceWord()} › Arcane Tome › ${filename}` };
    }
    // Only Android 9 and older ask for storage permission; newer versions let the app write its own files.
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
    await Filesystem.writeFile({ path: `${FOLDER}/${filename}`, data: text, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    return { ok: true, message: `Saved to your phone: Documents › ${FOLDER} › ${filename}` };
  } catch (e) {
    return { ok: false, message: `Couldn't save to Documents (${(e as Error).message}). Try Share instead.` };
  }
}

/** Opens the share sheet with the file, to send it to Drive, email, a message, another app. */
export async function shareFile(filename: string, text: string): Promise<FileResult> {
  try {
    if (isNative()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const { uri } = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: filename, files: [uri], dialogTitle: 'Share your Arcane Tome backup' });
      return { ok: true, message: 'Shared.' };
    }
    const file = new File([text], filename, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return { ok: true, message: 'Shared.' };
    }
    return { ok: false, message: "This browser can't share files. Use “Save a backup file” instead." };
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (/cancel|abort/i.test(msg) || (e as Error).name === 'AbortError') return { ok: true, message: 'Sharing cancelled.' };
    return { ok: false, message: `Couldn't share (${msg}).` };
  }
}

/**
 * Android's Back button: runs `onBack` (close a dialog, leave Arrange, go back a page) and,
 * when there's nothing left to go back from, sends the app to the background rather than
 * closing it. Returns a function that stops listening.
 */
export function listenBackButton(onBack: () => boolean): () => void {
  if (!isNative()) return () => {};
  let stop = () => {};
  let stopped = false;
  void import('@capacitor/app').then(async ({ App }) => {
    const handle = await App.addListener('backButton', () => {
      if (!onBack()) void App.minimizeApp();
    });
    if (stopped) void handle.remove();
    else stop = () => void handle.remove();
  });
  return () => {
    stopped = true;
    stop();
  };
}
