import type { Layout } from './layout';
import type { DiceSpeed } from '../fx';
import type { FxLevel } from '../fx/types';
import { normalizeCharacter, uid, type Character } from '../systems/dnd5e/model';

export interface Settings {
  sound: boolean;
  volume: number;
  fx: FxLevel;
  flashes: boolean;
  theme: 'system' | 'light' | 'dark';
  lastBackupAt: number | null;
  diceSpeed: DiceSpeed;
  /** Attacks and spells count up hit by hit on the dice tray. */
  tally: boolean;
  /** Where the panels sit on this device; null for the built-in arrangement. */
  layout: Layout | null;
}

/** A manual save: a copy of one character you can go back to. */
export interface SavePoint {
  id: string;
  characterId: string;
  name: string;
  createdAt: number;
  data: Character;
}

export interface Saved {
  characters: Character[];
  currentId: string;
  settings: Settings;
  savePoints: SavePoint[];
  /** When this state was last written, used to pick the newer of two copies (browser vs. phone storage). */
  savedAt: number;
}

export const SAVE_POINTS_PER_CHARACTER = 25;

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
  return {
    sound: true,
    volume: 0.7,
    fx: reduce ? 'reduced' : 'full',
    flashes: !reduce,
    theme: 'system',
    lastBackupAt: null,
    diceSpeed: reduce ? 'quick' : 'full',
    tally: true,
    layout: null,
  };
}

/** Everything lives in this browser only. Storage can be blocked (private windows), so every access is guarded. */
export function load(): Saved | null {
  try {
    const raw = [KEY, ...LEGACY_KEYS].map((k) => localStorage.getItem(k)).find((v) => v !== null);
    return raw ? parseSaved(raw) : null;
  } catch {
    return null;
  }
}

/** Reads a stored state, repairing anything missing or malformed. */
export function parseSaved(raw: string): Saved | null {
  try {
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
      savePoints: (Array.isArray(data.savePoints) ? data.savePoints : []).flatMap((p) => {
        try {
          return [{ id: String(p.id), characterId: String(p.characterId), name: String(p.name ?? 'Save'), createdAt: Number(p.createdAt) || 0, data: normalizeCharacter(p.data) }];
        } catch {
          return [];
        }
      }),
      savedAt: Number(data.savedAt) || 0,
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

/** Adds a save point for a character, keeping its newest SAVE_POINTS_PER_CHARACTER. */
export function addSavePoint(points: SavePoint[], c: Character, name: string): SavePoint[] {
  // The portrait is left out: it rarely changes, and copying it into every save point would fill storage.
  const point: SavePoint = { id: uid(), characterId: c.id, name, createdAt: Date.now(), data: { ...structuredClone(c), portrait: null } };
  const mine = [point, ...points.filter((p) => p.characterId === c.id)].slice(0, SAVE_POINTS_PER_CHARACTER);
  return [...mine, ...points.filter((p) => p.characterId !== c.id)];
}
