// The rules the sheet draws on: the SRD 5.2.1 plus every pack in your rules library,
// merged into one catalog of classes, subclasses, feats, spells and creatures. Library
// content sits beside the SRD's (same shapes), so it shows up in Level up, the spell list
// and the companion picker without any special handling.

import { useEffect, useState } from 'react';
import { registerClasses } from '../systems/dnd5e/data';
import { loadSrd, type Catalog } from '../systems/dnd5e/srd';

let extra: Partial<Catalog>[] = [];
let merged: Catalog | null = null;
let pending: Promise<Catalog> | null = null;
const listeners = new Set<(c: Catalog) => void>();

function merge(base: Catalog, packs: Partial<Catalog>[]): Catalog {
  const out: Catalog = { classes: [...base.classes], subclasses: [...base.subclasses], feats: [...base.feats], spells: [...base.spells], creatures: [...base.creatures] };
  for (const p of packs) {
    out.classes.push(...(p.classes ?? []));
    out.subclasses.push(...(p.subclasses ?? []));
    out.feats.push(...(p.feats ?? []));
    out.spells.push(...(p.spells ?? []));
    out.creatures.push(...(p.creatures ?? []));
  }
  return out;
}

/** The current catalog (SRD + library), loading it on first use. */
export function loadCatalog(): Promise<Catalog> {
  if (merged) return Promise.resolve(merged);
  pending ??= loadSrd().then((srd) => {
    merged = merge(srd, extra);
    pending = null;
    return merged;
  });
  return pending;
}

/** Called by the rules library whenever its packs change. */
export function setLibraryContent(packs: Partial<Catalog>[]) {
  extra = packs;
  // Homebrew classes need their hit die, saves and casting known to the sheet's math.
  registerClasses(packs.flatMap((p) => p.classes ?? []));
  merged = null;
  void loadCatalog().then((c) => listeners.forEach((l) => l(c)));
}

/** The catalog for a component: null until it has loaded, then kept up to date. */
export function useCatalog(): Catalog | null {
  const [cat, setCat] = useState<Catalog | null>(merged);
  useEffect(() => {
    let live = true;
    void loadCatalog().then((c) => live && setCat(c));
    const l = (c: Catalog) => setCat(c);
    listeners.add(l);
    return () => {
      live = false;
      listeners.delete(l);
    };
  }, []);
  return cat;
}
