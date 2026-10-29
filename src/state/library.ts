// Your rules library: rules documents you've imported, kept on this device in IndexedDB
// (a rulebook's text can run to megabytes, more than the sheet's own storage should hold).
// Each pack holds the document's sections for reading and search, plus the classes,
// subclasses, feats, spells and creatures read from it, which join the SRD in the catalog.

import { useCallback, useEffect, useState } from 'react';
import type { ReadResult, Section } from '../systems/dnd5e/rulesdoc';
import type { Catalog } from '../systems/dnd5e/srd';
import { setLibraryContent } from './catalog';

export interface Pack {
  id: string;
  name: string;
  /** The file it came from, or "pasted text" / "AI conversion". */
  source: string;
  createdAt: number;
  enabled: boolean;
  sections: Section[];
  content: Partial<Catalog>;
}

export const PACK_FORMAT = 'arcane-tome-pack';

const DB = 'arcane-tome-library';
const STORE = 'packs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This browser has no IndexedDB, so a rules library can’t be kept.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('The rules library couldn’t be opened.'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => (db.close(), resolve(req.result));
    tx.onerror = tx.onabort = () => (db.close(), reject(tx.error ?? new Error('The rules library couldn’t be saved: the device may be out of space.')));
  });
}

export const listPacks = (): Promise<Pack[]> => run('readonly', (s) => s.getAll() as IDBRequest<Pack[]>).then((ps) => ps.sort((a, b) => a.createdAt - b.createdAt));
export const putPack = (p: Pack) => run('readwrite', (s) => s.put(p));
export const deletePack = (id: string) => run('readwrite', (s) => s.delete(id));

/** A pack ready to save, from what a document (or an AI's JSON) was read into. */
export function packFrom(name: string, source: string, r: ReadResult): Pack {
  return {
    id: `pack-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    source,
    createdAt: Date.now(),
    enabled: true,
    sections: r.sections,
    content: { classes: r.classes, subclasses: r.subclasses, feats: r.feats, spells: r.spells, creatures: r.creatures },
  };
}

/** Puts the enabled packs' content into the catalog the sheet reads. */
export function applyPacks(packs: Pack[]) {
  setLibraryContent(packs.filter((p) => p.enabled).map((p) => p.content));
}

/** Loads the library at start-up so Level up, spells and companions see it straight away. */
export async function loadLibrary(): Promise<Pack[]> {
  try {
    const packs = await listPacks();
    applyPacks(packs);
    return packs;
  } catch {
    return [];
  }
}

/** The library for a component: its packs, and actions that keep the catalog in step. */
export function useLibrary() {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const ps = await listPacks();
      setPacks(ps);
      applyPacks(ps);
    } catch (e) {
      setError((e as Error).message);
      setPacks([]);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const save = useCallback(
    async (p: Pack) => {
      try {
        await putPack(p);
        await refresh();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [refresh],
  );
  const remove = useCallback(
    async (id: string) => {
      await deletePack(id).catch((e: Error) => setError(e.message));
      await refresh();
    },
    [refresh],
  );
  return { packs, error, save, remove, refresh };
}

/** A pack as a file you can keep or share. */
export function exportPack(p: Pack): string {
  return JSON.stringify({ format: PACK_FORMAT, version: 1, pack: p });
}

export function looksLikePackFile(data: unknown): data is { format: string; pack: Pack } {
  return !!data && typeof data === 'object' && (data as { format?: unknown }).format === PACK_FORMAT && typeof (data as { pack?: { name?: unknown } }).pack?.name === 'string';
}

/** Restores the packs saved in a backup file (adding new ones, replacing ones it already has). */
export async function restoreLibrary(raw: string): Promise<number> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return 0;
  }
  const packs = (data as { library?: unknown }).library;
  if (!Array.isArray(packs)) return 0;
  let n = 0;
  for (const p of packs) {
    if (p && typeof p === 'object' && typeof (p as Pack).id === 'string' && typeof (p as Pack).name === 'string') {
      const q = p as Partial<Pack> & Pick<Pack, 'id' | 'name'>;
      await putPack({ ...q, enabled: q.enabled ?? true, sections: q.sections ?? [], content: q.content ?? {}, createdAt: q.createdAt ?? Date.now(), source: q.source ?? 'backup' });
      n++;
    }
  }
  if (n) applyPacks(await listPacks());
  return n;
}
