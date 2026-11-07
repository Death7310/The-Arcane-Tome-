// The Counters page: numbers you keep track of yourself (arrows, gold, ki points, days on the
// road, a homebrew resource). Each is one line: its name, its number (type over it to set it),
// and − / + around an amount box, so +1 by default or +37 when you type 37. Edit renames it,
// sets the number Reset goes back to, or removes it.

import { useState } from 'react';
import { useChar } from '../state/character';
import { blankCounter, type Counter } from '../systems/dnd5e/model';
import { ConfirmButton, NumField, Panel } from './ui';

export function CountersPanel() {
  const { char: c, update } = useChar();
  const [editing, setEditing] = useState<string | null>(null);
  const add = () => {
    const k = blankCounter({ name: `Counter ${c.counters.length + 1}` });
    update((d) => void d.counters.push(k));
    setEditing(k.id);
  };
  return (
    <Panel
      title="Counters"
      tab="counters"
      actions={
        <button type="button" className="btn small" onClick={add}>
          Add
        </button>
      }
    >
      {c.counters.length === 0 && (
        <p className="hint" style={{ margin: 0 }}>
          No counters yet. Add one for anything you keep count of: arrows, gold, ki points, days on the road. Give it a starting number, then − and + change it by the amount in between.
        </p>
      )}
      <div className="counter-list">
        {c.counters.map((k) => (
          <CounterRow key={k.id} k={k} editing={editing === k.id} onEdit={() => setEditing(editing === k.id ? null : k.id)} />
        ))}
      </div>
    </Panel>
  );
}

function CounterRow({ k, editing, onEdit }: { k: Counter; editing: boolean; onEdit: () => void }) {
  const { update } = useChar();
  const set = (fn: (x: Counter) => void) =>
    update((d) => {
      const x = d.counters.find((y) => y.id === k.id);
      if (x) fn(x);
    });
  return (
    <div className="counter">
      <div className="counter-line">
        <span className="counter-name">{k.name || 'Counter'}</span>
        <NumField value={k.value} min={-999999} max={999999} ariaLabel={`${k.name}: value`} id={`counter-${k.id}`} className="counter-value" onChange={(n) => set((x) => void (x.value = n))} />
      </div>
      <div className="counter-controls">
        <button type="button" className="step big" aria-label={`Subtract ${k.step} from ${k.name}`} onClick={() => set((x) => void (x.value -= x.step))}>
          −
        </button>
        <NumField value={k.step} min={1} max={99999} ariaLabel={`${k.name}: amount to add or subtract`} id={`counter-step-${k.id}`} className="counter-step" onChange={(n) => set((x) => void (x.step = Math.max(1, n)))} />
        <button type="button" className="step big" aria-label={`Add ${k.step} to ${k.name}`} onClick={() => set((x) => void (x.value += x.step))}>
          +
        </button>
        <button type="button" className="btn small ghost" aria-expanded={editing} onClick={onEdit}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      {editing && (
        <div className="counter-edit">
          <label className="field">
            <span>Name</span>
            <input className="input" value={k.name} onChange={(e) => set((x) => void (x.name = e.target.value))} aria-label="Counter name" autoFocus />
          </label>
          <NumField label="Reset goes back to" value={k.start} min={-999999} max={999999} id={`counter-start-${k.id}`} onChange={(n) => set((x) => void (x.start = n))} />
          <div className="row">
            <button type="button" className="btn small" onClick={() => set((x) => void (x.value = x.start))}>
              Reset to {k.start}
            </button>
            <button type="button" className="btn small ghost" onClick={() => set((x) => void (x.start = x.value))}>
              Make {k.value} the reset number
            </button>
            <ConfirmButton label="Remove" confirmLabel={`Remove ${k.name}?`} className="btn small ghost" onConfirm={() => update((d) => void (d.counters = d.counters.filter((y) => y.id !== k.id)))} />
          </div>
        </div>
      )}
    </div>
  );
}
