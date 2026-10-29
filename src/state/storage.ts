import type { FxLevel } from '../fx/types';
import { normalizeCharacter, type Character } from '../systems/dnd5e/model';

export interface Settings {
  sound: boolean;
  volume: number;
  fx: FxLevel;
  flashes: boolean;
  theme: 'system' | 'light' | 'dark';
  lastBackupAt: number | null;
}

export interface Saved {
  characters: Character[];
  currentId: string;
  settings: Settings;
}

const KEY = 'arcane-tome:v1';
/** Saves from before the app was renamed; read if nothing is stored under the current key yet. */
const LEGACY_KEYS = ['arcane-folio:v1'];

export function defaultSettings(): Settings {
  let reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* no matchMedia */
  }
  return { sound: true, volume: 0.7, fx: reduce ? 'reduced' : 'full', flashes: !reduce, theme: 'system', lastBackupAt: null };
}

/** Everything lives in this browser only. Storage can be blocked (private windows), so every access is guarded. */
export function load(): Saved | null {
  try {
    const raw = [KEY, ...LEGACY_KEYS].map((k) => localStorage.getItem(k)).find((v) => v !== null);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Saved>;
    const characters = (data.characters ?? []).flatMap((c) => {
      try {
        return [normalizeCharacter(c)];
      } catch {
        return [];
      }
    });
    if (!characters.length) return null;
    return {
      characters,
      currentId: characters.some((c) => c.id === data.currentId) ? data.currentId! : characters[0].id,
      settings: { ...defaultSettings(), ...data.settings },
    };
  } catch {
    return null;
  }
}

export function save(s: Saved): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export interface Backup {
  format: 'arcane-tome-backup';
  version: 1;
  exportedAt: string;
  characters: Character[];
}

export const makeBackup = (characters: Character[]): Backup => ({
  format: 'arcane-tome-backup',
  version: 1,
  exportedAt: new Date().toISOString(),
  characters,
});

const BACKUP_FORMATS = ['arcane-tome-backup', 'arcane-folio-backup'];

/** Reads a full backup, a list of characters, or a single exported character. */
export function parseImport(raw: string): Character[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('That is not valid JSON. Use the whole exported file.');
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && BACKUP_FORMATS.includes(String((data as { format?: unknown }).format))
      ? (data as Backup).characters
      : [data];
  if (!Array.isArray(list) || list.length === 0) throw new Error('No characters found in that file.');
  return list.map((c) => normalizeCharacter(c));
}

export interface MergeResult {
  characters: Character[];
  added: number;
  updated: number;
  kept: number;
}

/** Restores a backup without losing newer local edits: same character → keep whichever was edited last. */
export function mergeCharacters(local: Character[], incoming: Character[]): MergeResult {
  const out = [...local];
  let added = 0;
  let updated = 0;
  let kept = 0;
  for (const c of incoming) {
    const i = out.findIndex((x) => x.id === c.id);
    if (i === -1) {
      out.push(c);
      added++;
    } else if ((c.updatedAt ?? 0) > (out[i].updatedAt ?? 0)) {
      out[i] = c;
      updated++;
    } else kept++;
  }
  return { characters: out, added, updated, kept };
}

/** Saves text as a file. Returns false where the page isn't allowed to download (some embedded viewers). */
export function downloadText(filename: string, text: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch {
    return false;
  }
}
