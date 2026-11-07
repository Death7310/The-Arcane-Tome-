// The Background field: type or pick a background, see what it gives, and write it into
// Features & traits.

import { useId, useState } from 'react';
import { useChar } from '../state/character';
import { BACKGROUNDS, applyBackground, describeBackground, findBackground, isBackgroundFeature } from '../systems/dnd5e/backgrounds';

export function BackgroundField({ id }: { id?: string }) {
  const { char: c, update } = useChar();
  const auto = useId();
  const fid = id ?? auto;
  const [done, setDone] = useState('');
  const def = findBackground(c.background);
  const entry = c.features.find(isBackgroundFeature);
  const name = def?.name ?? c.background.trim();
  const inSync = !!entry && entry.name.endsWith(name) && (!def || entry.description === describeBackground(def));
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor={fid}>
        <span>Background</span>
      </label>
      <input
        id={fid}
        className="input"
        list={`${fid}-list`}
        value={c.background}
        placeholder="Sage, Soldier, Haunted One…"
        onChange={(e) => {
          setDone('');
          update((d) => void (d.background = e.target.value));
        }}
      />
      <datalist id={`${fid}-list`}>
        {BACKGROUNDS.map((b) => (
          <option key={b.name} value={b.name} />
        ))}
      </datalist>
      {name && (
        <details className="lang-picks">
          <summary>{def ? `What ${def.name} gives` : `${name}: not in the list`}</summary>
          {def ? (
            <p className="hint" style={{ whiteSpace: 'pre-line', margin: '6px 0' }}>
              {describeBackground(def)}
              {'\n'}
              <i>Source: {def.source}</i>
            </p>
          ) : (
            <p className="hint" style={{ margin: '6px 0' }}>
              Add it to Features &amp; traits and write its description there.
            </p>
          )}
        </details>
      )}
      {name && (
        <div className="row" style={{ alignItems: 'center' }}>
          <button
            type="button"
            className="btn small"
            disabled={inSync}
            onClick={() => {
              let r: 'added' | 'updated' = 'added';
              update((d) => void (r = applyBackground(d, findBackground(d.background))));
              setDone(r === 'added' ? 'Added to Features & traits.' : 'Updated in Features & traits.');
            }}
          >
            {inSync ? 'In Features & traits ✓' : entry ? 'Update in Features & traits' : 'Add to Features & traits'}
          </button>
          {done && (
            <span className="hint" role="status">
              {done}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
