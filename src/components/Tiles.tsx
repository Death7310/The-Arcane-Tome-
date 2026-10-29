// Tiles you make yourself, for homebrew rules or another game: notes, trackers (Sanity,
// Corruption, Ki, a clock), and roll buttons with your own formulas. They sit on any page,
// like the built-in panels.

import { useState } from 'react';
import { isValid } from '../engine/dice';
import { useChar } from '../state/character';
import { useTable } from '../state/table';
import { blankTileEntry, type Tile, type TileEntry, type TileEntryKind } from '../systems/dnd5e/model';
import { resolveTokens } from '../systems/dnd5e/rules';
import { RulesText } from './RulesText';
import { ConfirmButton, NumField, Panel, SelectField, TextField } from './ui';

const KINDS: { id: TileEntryKind; name: string }[] = [
  { id: 'note', name: 'Note' },
  { id: 'tracker', name: 'Tracker' },
  { id: 'roll', name: 'Roll' },
];

export function TilePanel({ tile, onDelete }: { tile: Tile; onDelete: () => void }) {
  const { char: c, update } = useChar();
  const [editing, setEditing] = useState(!tile.entries.length);
  const set = (fn: (x: Tile) => void) =>
    update((d) => {
      const x = d.tiles.find((y) => y.id === tile.id);
      if (x) fn(x);
    });
  return (
    <Panel
      title={tile.title.trim() || 'Untitled tile'}
      tab="custom"
      actions={
        <button type="button" className="btn small ghost" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      }
    >
      {editing ? <TileEditor tile={tile} set={set} onDelete={onDelete} /> : <TileView tile={tile} set={set} owner={c} />}
    </Panel>
  );
}

function TileView({ tile, set, owner }: { tile: Tile; set: (fn: (x: Tile) => void) => void; owner: Parameters<typeof resolveTokens>[1] }) {
  const t = useTable();
  if (!tile.entries.length) return <p className="hint">This tile is empty. Tap Edit to add notes, trackers or rolls.</p>;
  const entry = (id: string) => (x: Tile) => x.entries.find((e) => e.id === id)!;
  return (
    <div className="tile-entries">
      {tile.entries.map((e) => {
        if (e.kind === 'note')
          return (
            <div key={e.id} className="tile-note">
              {e.label && <h3>{e.label}</h3>}
              {e.text.trim() ? <RulesText text={e.text} /> : <p className="hint">Empty note.</p>}
            </div>
          );
        if (e.kind === 'tracker') {
          const max = e.max;
          const clamp = (n: number) => (max !== null ? Math.max(0, Math.min(max, n)) : n);
          return (
            <div key={e.id} className="tile-tracker">
              <span className="tile-label">{e.label || 'Tracker'}</span>
              <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <button type="button" className="btn small ghost icon" aria-label={`Lower ${e.label}`} onClick={() => set((x) => void (entry(e.id)(x).value = clamp(e.value - 1)))}>
                  −
                </button>
                <NumField value={e.value} ariaLabel={e.label || 'Tracker'} id={`tile-${e.id}`} className="ac" onChange={(n) => set((x) => void (entry(e.id)(x).value = clamp(n)))} />
                {max !== null && <span className="hint">/ {max}</span>}
                <button type="button" className="btn small ghost icon" aria-label={`Raise ${e.label}`} onClick={() => set((x) => void (entry(e.id)(x).value = clamp(e.value + 1)))}>
                  +
                </button>
              </span>
              {max !== null && max > 0 && (
                <span className="tile-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, (e.value / max) * 100))}%` }} />
                </span>
              )}
            </div>
          );
        }
        const dice = resolveTokens(e.formula, owner);
        const ok = !!e.formula.trim() && isValid(dice);
        return (
          <div key={e.id} className="tile-roll">
            <span className="tile-label">
              {e.label || 'Roll'}
              <small className="hint"> {ok ? dice : e.formula ? 'check the formula' : 'no formula yet'}</small>
            </span>
            <button type="button" className="cast" disabled={!ok} onClick={(ev) => t.freeRoll(dice, `${tile.title}: ${e.label || 'Roll'}`, ev.currentTarget)}>
              Roll
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TileEditor({ tile, set, onDelete }: { tile: Tile; set: (fn: (x: Tile) => void) => void; onDelete: () => void }) {
  const edit = (id: string, fn: (e: TileEntry) => void) => set((x) => fn(x.entries.find((e) => e.id === id)!));
  const move = (i: number, dir: -1 | 1) =>
    set((x) => {
      const j = i + dir;
      if (j < 0 || j >= x.entries.length) return;
      [x.entries[i], x.entries[j]] = [x.entries[j], x.entries[i]];
    });
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <TextField label="Tile name" id={`tile-title-${tile.id}`} value={tile.title} onChange={(v) => set((x) => void (x.title = v))} />
      {tile.entries.map((e, i) => (
        <div key={e.id} className="item" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <div className="grid-2">
            <SelectField label="Kind" id={`te-kind-${e.id}`} value={e.kind} options={KINDS} onChange={(v) => edit(e.id, (x) => Object.assign(x, blankTileEntry(v, { id: x.id, label: x.label, text: x.text, value: x.value, formula: x.formula })))} />
            <TextField label="Label" id={`te-label-${e.id}`} value={e.label} onChange={(v) => edit(e.id, (x) => void (x.label = v))} />
          </div>
          {e.kind === 'note' && <TextField label="Text" id={`te-text-${e.id}`} multiline value={e.text} onChange={(v) => edit(e.id, (x) => void (x.text = v))} />}
          {e.kind === 'tracker' && (
            <div className="grid-2">
              <NumField label="Now" id={`te-val-${e.id}`} value={e.value} onChange={(n) => edit(e.id, (x) => void (x.value = n))} />
              <NumField label="Maximum (0 for none)" id={`te-max-${e.id}`} value={e.max ?? 0} min={0} onChange={(n) => edit(e.id, (x) => void (x.max = n > 0 ? n : null))} />
            </div>
          )}
          {e.kind === 'roll' && (
            <>
              <TextField label="Dice" id={`te-formula-${e.id}`} value={e.formula} placeholder="1d100, 3d6+{CON}, 2d10>=8" onChange={(v) => edit(e.id, (x) => void (x.formula = v))} />
              <p className="hint" style={{ margin: 0 }}>
                Any dice the Dice page understands (keep highest, exploding, success pools), with {'{STR}'}…{'{CHA}'}, {'{PB}'}, {'{LEVEL}'} for your character’s numbers.
              </p>
            </>
          )}
          <div className="row">
            <button type="button" className="btn small ghost" aria-label={`Move ${e.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="btn small ghost" aria-label={`Move ${e.label} down`} disabled={i === tile.entries.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button type="button" className="btn small ghost" onClick={() => set((x) => void x.entries.splice(i, 1))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="row">
        <span className="hint">Add:</span>
        {KINDS.map((k) => (
          <button key={k.id} type="button" className="btn small" onClick={() => set((x) => void x.entries.push(blankTileEntry(k.id)))}>
            {k.name}
          </button>
        ))}
      </div>
      <div className="row">
        <ConfirmButton label="Delete this tile" onConfirm={onDelete} />
      </div>
    </div>
  );
}
