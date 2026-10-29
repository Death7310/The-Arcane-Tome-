import { useState } from 'react';
import { ELEMENTS, SHAPES } from '../fx/types';
import { useChar } from '../state/character';
import { useTable } from '../state/table';
import { ABILITIES, ABILITY_NAMES, allClasses } from '../systems/dnd5e/data';
import { blankFeature, uid, type Feature, type UsesFormula } from '../systems/dnd5e/model';
import { inventoryWeight, resolveTokens, usesMax } from '../systems/dnd5e/rules';
import { AddItemDialog } from './Items';
import { LanguagesField } from './Languages';
import { RulesText } from './RulesText';
import { ConfirmButton, NumField, Panel, Pips, SelectField, TextField } from './ui';

const USES = [
  { id: 'none', name: 'Unlimited / passive' },
  { id: 'fixed', name: 'Fixed number' },
  { id: 'pb', name: 'Proficiency Bonus' },
  { id: 'level', name: 'Character level' },
  ...ABILITIES.map((a) => ({ id: `mod:${a}`, name: `${ABILITY_NAMES[a]} modifier` })),
  ...allClasses().map((k) => ({ id: `class:${k.id}`, name: `${k.name} level` })),
];

const usesKind = (u: UsesFormula | null): string => (u === null ? 'none' : typeof u === 'number' ? 'fixed' : u);

export function FeaturesPanel() {
  const { char: c, update } = useChar();
  const t = useTable();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel
      title="Features & traits"
      tab="gear combat"
      actions={
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const f = blankFeature({ id: uid() });
            update((d) => void d.features.push(f));
            setOpen(f.id);
          }}
        >
          Add
        </button>
      }
    >
      <div className="list">
        {c.features.length === 0 && <p className="hint">Species traits, class features and feats go here. Level up adds your class features for you.</p>}
        {orderFeatures(c).map(({ f, idx }) => {
          const max = usesMax(c, f);
          const usable = max !== null || f.roll.trim() !== '';
          return (
            <div className={`item el-${f.element}`} key={f.id}>
              <div className="item-head">
                <button type="button" className="item-title" onClick={() => setOpen(open === f.id ? null : f.id)} aria-expanded={open === f.id}>
                  <b>{f.name}</b>
                  <small>
                    {[f.source, f.roll ? `${f.rollKind === 'healing' ? 'heals' : 'rolls'} ${resolveTokens(f.roll, c)}` : '', max !== null ? `${max - Math.min(max, f.usesSpent)}/${max} per ${f.recharge === 'short' ? 'Short Rest' : 'Long Rest'}` : '']
                      .filter(Boolean)
                      .join(' · ') || f.description}
                  </small>
                </button>
                {usable ? (
                  <button type="button" className="cast" disabled={max !== null && f.usesSpent >= max} onClick={(e) => t.useFeature(f, e.currentTarget)}>
                    Use
                  </button>
                ) : (
                  <span />
                )}
              </div>
              {max !== null && max > 0 && (
                <div style={{ padding: '0 10px 8px' }}>
                  {max > 12 ? (
                    // Big pools (Lay on Hands, Focus Points) count down rather than show a pip each.
                    <NumField
                      label={`${f.name}: left of ${max}`}
                      id={`pool-${f.id}`}
                      value={max - Math.min(max, f.usesSpent)}
                      min={0}
                      max={max}
                      onChange={(left) => update((d) => void (d.features[idx].usesSpent = Math.max(0, Math.min(max, max - left))))}
                    />
                  ) : (
                    <Pips total={max} spent={Math.min(max, f.usesSpent)} label={`${f.name} use`} onChange={(v) => update((d) => void (d.features[idx].usesSpent = Math.max(0, Math.min(max, v))))} />
                  )}
                </div>
              )}
              {open === f.id && (f.origin ? <RulesFeature f={f} idx={idx} /> : <FeatureEditor f={f} idx={idx} />)}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** Hand-added features first (species traits and the like), then class features by class and level. */
function orderFeatures(c: { features: Feature[]; classes: { id: string }[] }) {
  const rank = (f: Feature) => (f.origin ? 1 + (c.classes.findIndex((k) => k.id === f.origin!.entryId) + 1) * 100 + f.origin.level + (f.origin.kind === 'feat' ? 0.5 : 0) : 0);
  return c.features.map((f, idx) => ({ f, idx })).sort((a, b) => rank(a.f) - rank(b.f) || a.idx - b.idx);
}

/** A feature that came from the rules: its text, with editing a step away. */
function RulesFeature({ f, idx }: { f: Feature; idx: number }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="item-body">
      <RulesText text={f.description || 'No description.'} />
      <p className="hint" style={{ margin: 0 }}>
        {f.origin!.auto ? 'Kept up to date with the rules as you level.' : 'You’ve edited this one, so leveling leaves it as you wrote it.'}
      </p>
      {editing ? (
        <FeatureEditor f={f} idx={idx} />
      ) : (
        <div className="row">
          <button type="button" className="btn small ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function FeatureEditor({ f, idx }: { f: Feature; idx: number }) {
  const { update } = useChar();
  const t = useTable();
  // Editing a rules feature makes it yours: leveling stops overwriting it.
  const set = (fn: (x: Feature) => void) =>
    update((d) => {
      const x = d.features[idx];
      fn(x);
      if (x.origin) x.origin.auto = false;
    });
  const kind = usesKind(f.usesMax);
  return (
    <div className="item-body">
      <div className="grid-2">
        <TextField label="Name" id={`f-name-${f.id}`} value={f.name} onChange={(v) => set((x) => void (x.name = v))} />
        <TextField label="Source" id={`f-src-${f.id}`} value={f.source} placeholder="Species, class, feat…" onChange={(v) => set((x) => void (x.source = v))} />
        <SelectField
          label="Uses"
          id={`f-uses-${f.id}`}
          value={kind}
          options={USES}
          onChange={(v) => set((x) => void (x.usesMax = v === 'none' ? null : v === 'fixed' ? 1 : (v as UsesFormula)))}
        />
        {kind === 'fixed' && typeof f.usesMax === 'number' && <NumField label="How many" id={`f-n-${f.id}`} value={f.usesMax} min={1} max={50} onChange={(n) => set((x) => void (x.usesMax = n))} />}
        {f.usesMax !== null && (
          <SelectField label="Recharge" id={`f-rch-${f.id}`} value={f.recharge} options={[{ id: 'short', name: 'Short or Long Rest' }, { id: 'long', name: 'Long Rest' }, { id: 'none', name: 'Never' }]} onChange={(v) => set((x) => void (x.recharge = v))} />
        )}
        <TextField label="Roll (optional)" id={`f-roll-${f.id}`} value={f.roll} placeholder="{PB}d4" onChange={(v) => set((x) => void (x.roll = v))} />
        <SelectField label="Roll is" id={`f-rk-${f.id}`} value={f.rollKind} options={[{ id: 'healing', name: 'Healing' }, { id: 'damage', name: 'Damage' }, { id: 'other', name: 'Other' }]} onChange={(v) => set((x) => void (x.rollKind = v))} />
        <SelectField label="Takes" id={`f-ct-${f.id}`} value={f.castingTime} options={[{ id: 'action', name: 'Action' }, { id: 'bonus', name: 'Bonus Action' }, { id: 'reaction', name: 'Reaction' }, { id: 'other', name: 'No action' }]} onChange={(v) => set((x) => void (x.castingTime = v))} />
        <SelectField label="Look (element)" id={`f-el-${f.id}`} value={f.element} options={ELEMENTS} onChange={(v) => set((x) => void (x.element = v))} />
        <SelectField label="Motion" id={`f-sh-${f.id}`} value={f.shape} options={SHAPES} onChange={(v) => set((x) => void (x.shape = v))} />
      </div>
      <TextField label="Description" id={`f-desc-${f.id}`} multiline value={f.description} onChange={(v) => set((x) => void (x.description = v))} />
      <div className="row">
        <button type="button" className="btn small" onClick={(e) => t.preview(f.element, f.shape, 1, e.currentTarget)}>
          Preview effect
        </button>
        <ConfirmButton label="Delete" onConfirm={() => update((d) => void d.features.splice(idx, 1))} />
      </div>
    </div>
  );
}

export function InventoryPanel() {
  const { char: c, update } = useChar();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState<'list' | 'paste' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const coins = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;
  return (
    <Panel
      title="Inventory"
      tab="gear"
      actions={
        <span className="row" style={{ gap: 4 }}>
          <button type="button" className="btn small" onClick={() => setAdding('list')} title="Weapons, armor, gear and magic items from the rules">
            Item list
          </button>
          <button type="button" className="btn small ghost" onClick={() => setAdding('paste')} title="Paste an item's stat block">
            Paste
          </button>
        </span>
      }
    >
      {adding && <AddItemDialog mode="any" start={adding} onClose={() => setAdding(null)} />}
      <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
        {coins.map((k) => (
          <NumField key={k} label={k.toUpperCase()} id={`coin-${k}`} value={c.currency[k]} min={0} onChange={(n) => update((d) => void (d.currency[k] = n))} />
        ))}
      </div>
      <h3>Items · {inventoryWeight(c)} lb</h3>
      <div className="list">
        {c.inventory.map((it, idx) => (
          <div key={it.id} className="inv-item">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button
                type="button"
                className={`btn small ghost icon inv-more${it.description || it.notes ? ' has' : ''}`}
                aria-expanded={open === it.id}
                aria-label={`Details for ${it.name}`}
                title={it.description || it.notes ? 'Description and notes' : 'Add a description or notes'}
                onClick={() => setOpen(open === it.id ? null : it.id)}
              >
                {open === it.id ? '▾' : '▸'}
              </button>
              <input className="input" style={{ flex: 1, minWidth: 0 }} value={it.name} aria-label="Item name" id={`inv-name-${it.id}`} onChange={(e) => update((d) => void (d.inventory[idx].name = e.target.value))} />
              <NumField value={it.qty} min={0} ariaLabel="Quantity" id={`inv-qty-${it.id}`} className="ac" onChange={(n) => update((d) => void (d.inventory[idx].qty = n))} />
              <NumField value={it.weight} min={0} step={0.1} ariaLabel="Weight each (lb)" id={`inv-wt-${it.id}`} className="ac" onChange={(n) => update((d) => void (d.inventory[idx].weight = n))} />
              <button type="button" className="btn small ghost icon" aria-label={`Remove ${it.name}`} onClick={() => update((d) => void d.inventory.splice(idx, 1))}>
                ✕
              </button>
            </div>
            {open === it.id && (
              <div className="item-body">
                {it.description && <RulesText text={it.description} />}
                <TextField label={it.description ? 'Your notes' : 'Description or notes'} id={`inv-notes-${it.id}`} multiline value={it.notes} onChange={(v) => update((d) => void (d.inventory[idx].notes = v))} />
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        className="row"
        style={{ marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          update((d) => void d.inventory.push({ id: uid(), name: name.trim(), qty: 1, weight: 0, notes: '' }));
          setName('');
        }}
      >
        <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Add an item" value={name} id="inv-new" aria-label="New item" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn small">
          Add
        </button>
      </form>
      <p className="hint" style={{ marginBottom: 0 }}>Columns: name, quantity, weight each (lb). ▸ opens an item’s description and your notes.</p>
    </Panel>
  );
}

export function NotesPanel() {
  const { char: c, update } = useChar();
  return (
    <Panel title="Proficiencies & notes" tab="gear">
      <div style={{ display: 'grid', gap: 10 }}>
        <LanguagesField id="languages" value={c.languages} onChange={(v) => update((d) => void (d.languages = v))} />
        <TextField label="Weapon, armor & tool proficiencies" id="profs" multiline value={c.proficiencies} onChange={(v) => update((d) => void (d.proficiencies = v))} />
        <TextField label="Notes" id="notes" multiline value={c.notes} onChange={(v) => update((d) => void (d.notes = v))} />
      </div>
    </Panel>
  );
}
