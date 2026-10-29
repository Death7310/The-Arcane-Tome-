// Saving on the device. In the Android app, the whole save also lives in a file in the
// app's own storage, and backups can be written to the phone's Documents folder or handed
// to the share sheet. In a browser the same buttons download or share the file instead.
// Capacitor's plugins are loaded only inside the Android app.

import { downloadText } from './storage';

const SAVE_PATH = 'arcane-tome/save.json';
const FOLDER = 'Arcane Tome';

export const isNative = (): boolean =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

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

/** Puts a backup where the person can find it: Documents/Arcane Tome on Android, a download in a browser. */
export async function saveFileToDevice(filename: string, text: string): Promise<FileResult> {
  if (!isNative()) {
    return downloadText(filename, text)
      ? { ok: true, message: `Saved ${filename} to your downloads.` }
      : { ok: false, message: 'This viewer blocks downloads. Use Characters → Export → Copy instead.' };
  }
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
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
