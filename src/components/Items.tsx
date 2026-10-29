// Adding equipment: pick from the item list (the SRD 5.2.1 plus your rules library), or
// paste a weapon's or item's stat block and have its damage, properties, bonus and
// description land in the right fields.

import { useMemo, useState } from 'react';
import { useChar } from '../state/character';
import { useCatalog } from '../state/catalog';
import { WEAPONS, ARMOR } from '../systems/dnd5e/data';
import { armorFromResolved, inventoryFromResolved, itemName, itemSummary, parseItemText, resolveItem, weaponFromResolved, type ParsedItem } from '../systems/dnd5e/items';
import { uid, type Character, type Item, type Weapon } from '../systems/dnd5e/model';
import type { ItemDef } from '../systems/dnd5e/srd';
import { RulesText } from './RulesText';
import { Dialog } from './ui';

type Kind = 'all' | 'weapon' | 'armor' | 'gear' | 'tool' | 'magic';
const KINDS: { id: Kind; name: string }[] = [
  { id: 'all', name: 'Everything' },
  { id: 'weapon', name: 'Weapons' },
  { id: 'armor', name: 'Armor & shields' },
  { id: 'gear', name: 'Adventuring gear' },
  { id: 'tool', name: 'Tools' },
  { id: 'magic', name: 'Magic items' },
];

const isWeaponDef = (d: ItemDef) => d.kind === 'weapon' || !!d.weapon || d.template?.applies === 'weapon';
const isArmorDef = (d: ItemDef) => d.kind === 'armor' || !!d.armor || d.template?.applies === 'armor' || d.template?.applies === 'shield';

/** Puts an item in the inventory, adding to the count when it's already there. */
export function addToInventory(d: Character, item: Omit<Item, 'id'>) {
  const same = d.inventory.find((i) => i.name.trim().toLowerCase() === item.name.trim().toLowerCase());
  if (same) {
    same.qty += item.qty || 1;
    if (!same.description && item.description) same.description = item.description;
    if (!same.weight && item.weight) same.weight = item.weight;
  } else d.inventory.push({ ...item, id: uid() });
}

function wear(d: Character, armor: { armorId: string; shield: boolean; magicBonus: number }) {
  if (armor.shield) d.armor.shield = true;
  else if (armor.armorId) (d.armor.armorId = armor.armorId), (d.armor.magicBonus = armor.magicBonus);
}

export function AddItemDialog({ mode, onClose, start = 'list' }: { mode: 'weapon' | 'any'; onClose: () => void; start?: 'list' | 'paste' }) {
  const { char: c, update } = useChar();
  const cat = useCatalog();
  const items = useMemo(() => cat?.items ?? [], [cat]);
  const [tab, setTab] = useState<'list' | 'paste'>(start);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>(mode === 'weapon' ? 'weapon' : 'all');
  const [source, setSource] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [bases, setBases] = useState<Record<string, string>>({});
  const [added, setAdded] = useState('');
  const sources = useMemo(() => [...new Set(items.map((d) => d.source ?? 'SRD 5.2.1'))], [items]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((d) => {
      if (needle && !itemName(d).toLowerCase().includes(needle) && !d.category.toLowerCase().includes(needle)) return false;
      if (source !== 'all' && (d.source ?? 'SRD 5.2.1') !== source) return false;
      if (kind === 'all') return true;
      if (kind === 'weapon') return isWeaponDef(d);
      if (kind === 'armor') return isArmorDef(d);
      return d.kind === kind;
    });
  }, [items, q, kind, source]);

  const done = (what: string) => setAdded(`${what} added.`);
  const addWeapon = (w: Weapon, inv?: Omit<Item, 'id'>) =>
    update((d) => {
      d.weapons.push({ ...w, id: uid() });
      if (inv && mode === 'any') addToInventory(d, inv);
    });

  /** Adds a catalog entry, made from `base` when it's a magic item built on a base weapon or armor. */
  const addDef = (def: ItemDef, wearIt = false) => {
    const baseName = def.name.includes('{base}') ? bases[def.id] || def.template?.bases[0] || defaultBase(def) : undefined;
    const r = resolveItem(itemName(def, baseName), items);
    if (!r.def) r.def = def.kind === 'weapon' || def.kind === 'armor' ? undefined : def;
    const w = isWeaponDef(def) ? weaponFromResolved(r) : null;
    const inv = inventoryFromResolved(r, items);
    if (w) addWeapon(w, inv);
    else
      update((d) => {
        addToInventory(d, inv);
        const armor = wearIt ? armorFromResolved(r) : null;
        if (armor) wear(d, armor);
      });
    done(r.name);
  };

  return (
    <Dialog title={mode === 'weapon' ? 'Add a weapon' : 'Add equipment'} onClose={onClose}>
      <div className="seg" role="radiogroup" aria-label="How to add">
        <button type="button" role="radio" aria-checked={tab === 'list'} onClick={() => setTab('list')}>
          Item list
        </button>
        <button type="button" role="radio" aria-checked={tab === 'paste'} onClick={() => setTab('paste')}>
          Paste a stat block
        </button>
      </div>
      {added && (
        <p className="note good" role="status" style={{ marginTop: 10 }}>
          {added} {mode === 'weapon' ? 'It’s in Attacks.' : 'Weapons go in Attacks as well as your inventory.'}
        </p>
      )}

      {tab === 'list' && (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" autoFocus />
            {mode === 'any' && (
              <select className="input" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Kind of item">
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            )}
            {sources.length > 1 && (
              <select className="input" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
                <option value="all">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="lib">
            {!cat && <p className="hint">Loading items…</p>}
            {list.slice(0, 150).map((d) => {
              const templ = d.name.includes('{base}') && d.template;
              const baseOptions = templ ? (d.template!.bases.length ? d.template!.bases : templ.applies === 'weapon' ? WEAPONS.map((w) => w.name) : ARMOR.filter((a) => a.id !== 'none').map((a) => a.name)) : [];
              return (
                <div key={`${d.source}:${d.id}`} className="lib-row" style={{ alignItems: 'start' }}>
                  <div className="lib-main" style={{ padding: '6px 10px', display: 'grid', gap: 4 }}>
                    <button type="button" className="item-title item-pick" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>
                      <b>{itemName(d)}</b>
                      <small>
                        {itemSummary(d)}
                        {d.source && d.source !== 'SRD 5.2.1' ? ` · ${d.source}` : ''}
                      </small>
                    </button>
                    {open === d.id && <RulesText text={d.text || 'No description.'} />}
                    {templ && baseOptions.length > 1 && (
                      <select className="input" value={bases[d.id] ?? ''} aria-label={`Base item for ${itemName(d)}`} onChange={(e) => setBases({ ...bases, [d.id]: e.target.value })}>
                        <option value="">{`Made from… (${defaultBase(d) ?? baseOptions[0]})`}</option>
                        {baseOptions.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                    <button type="button" className="btn small" aria-label={`Add ${itemName(d, bases[d.id])}`} onClick={() => addDef(d)}>
                      Add
                    </button>
                    {mode === 'any' && isArmorDef(d) && !isWeaponDef(d) && (
                      <button type="button" className="btn small ghost" onClick={() => addDef(d, true)}>
                        Wear
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {list.length > 150 && <p className="hint">Showing 150 of {list.length}. Search to narrow it down.</p>}
            {cat && !list.length && <p className="hint">Nothing matches. Not in the list? Paste its stat block instead.</p>}
          </div>
          <p className="hint">
            Equipment and magic items from the System Reference Document 5.2.1 (CC-BY-4.0) and your rules library. Items from other books aren’t in the SRD: paste their stat block, or add the book to your rules library.
          </p>
        </>
      )}

      {tab === 'paste' && <PasteItem mode={mode} items={items} wearing={c.armor.armorId !== 'none'} onAdd={(p, wearIt) => {
        if (p.weapon) addWeapon(p.weapon, p.item);
        else
          update((d) => {
            addToInventory(d, p.item);
            if (wearIt && p.armor) wear(d, p.armor);
          });
        done(p.name);
      }} />}
    </Dialog>
  );
}

/** A sensible base for a list pick: a +1 weapon defaults to a Longsword, armor to Chain Mail. */
function defaultBase(d: ItemDef): string | undefined {
  const t = d.template;
  if (!t) return undefined;
  if (t.bases.length) return t.bases[0];
  return t.applies === 'weapon' ? 'Longsword' : t.applies === 'shield' ? 'Shield' : t.applies === 'armor' ? 'Chain Mail' : 'Arrows';
}

function PasteItem({ mode, items, wearing, onAdd }: { mode: 'weapon' | 'any'; items: ItemDef[]; wearing: boolean; onAdd: (p: ParsedItem, wear: boolean) => void }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedItem | null>(null);
  const [wearIt, setWearIt] = useState(!wearing);
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      <label className="field" htmlFor="item-paste">
        <span>Paste the weapon or item: from your book, D&amp;D Beyond, a character sheet or your own notes</span>
        <textarea
          id="item-paste"
          className="input"
          style={{ minHeight: 170 }}
          value={text}
          onChange={(e) => (setText(e.target.value), setParsed(null))}
          placeholder={'Dragon Wing Shortbow\nWeapon (shortbow), rare (requires attunement)\nWhen you hit with an arrow fired from it, the target takes an extra 1d6 fire damage…'}
        />
      </label>
      <div className="row">
        <button type="button" className="btn small primary" disabled={!text.trim()} onClick={() => setParsed(parseItemText(text, items))}>
          Read it
        </button>
      </div>
      {parsed && (
        <div className="note good">
          <b>{parsed.name}</b> · {parsed.kind === 'weapon' ? 'a weapon' : parsed.kind === 'armor' ? (parsed.armor?.shield ? 'a shield' : 'armor') : 'an item'}
          <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
            {parsed.found.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {parsed.check.length > 0 && (
            <ul style={{ margin: '6px 0', paddingLeft: 18, color: 'var(--warn, var(--bad))' }}>
              {parsed.check.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {parsed.kind === 'armor' && mode === 'any' && (
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={wearIt} onChange={(e) => setWearIt(e.target.checked)} /> Wear it (sets your armor in Vitals)
            </label>
          )}
          <div className="row" style={{ marginTop: 6 }}>
            <button type="button" className="btn small primary" disabled={mode === 'weapon' && parsed.kind !== 'weapon'} onClick={() => (onAdd(parsed, wearIt), setText(''), setParsed(null))}>
              {parsed.kind === 'weapon' ? (mode === 'any' ? 'Add to Attacks and inventory' : 'Add to Attacks') : 'Add to inventory'}
            </button>
          </div>
          {mode === 'weapon' && parsed.kind !== 'weapon' && <p className="hint">That reads as {parsed.kind === 'armor' ? 'armor' : 'an item'}, not a weapon: add it from Inventory instead.</p>}
        </div>
      )}
    </div>
  );
}
