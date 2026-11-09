// Backgrounds: the Background field (type or pick one, see what it gives, write it into
// Features & traits) and the Background library on the Library page.

import { useId, useState } from 'react';
import { useChar } from '../state/character';
import { BACKGROUNDS, BACKGROUND_SOURCES, applyBackground, describeBackground, findBackground, isBackgroundFeature, type BackgroundDef } from '../systems/dnd5e/backgrounds';
import { Panel } from './ui';

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

/** Every background, to read and take: setting it as yours writes it into Features & traits. */
export function BackgroundLibraryPanel() {
  const { char: c, update } = useChar();
  const base = useId();
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const mine = findBackground(c.background)?.name ?? '';
  const words = q.trim().toLowerCase();
  const list = BACKGROUNDS.filter((b) => (!source || b.source === source) && (!words || `${b.name} ${b.about} ${b.skills} ${b.feat ?? ''} ${b.feature?.name ?? ''}`.toLowerCase().includes(words)));
  const take = (b: BackgroundDef) => {
    update((d) => {
      d.background = b.name;
      applyBackground(d, b);
    });
    setMessage(`${b.name} is now ${c.name || 'your character'}’s background, and it’s in Features & traits.${b.feat ? ` Its Origin feat, ${b.feat}, is in the Feat library.` : ''}`);
  };
  return (
    <Panel title="Background library" tab="library">
      {message && (
        <p className="note good" role="status" style={{ marginTop: 0 }}>
          {message}
        </p>
      )}
      <div className="grid-2">
        <label className="field" htmlFor={`${base}-q`}>
          <span>Search</span>
          <input id={`${base}-q`} className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, skill or feature" />
        </label>
        <label className="field" htmlFor={`${base}-src`}>
          <span>From</span>
          <select id={`${base}-src`} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Every book</option>
            {BACKGROUND_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {list.length} background{list.length === 1 ? '' : 's'}. Taking one sets it as your background and adds it to Features &amp; traits; it doesn’t change your skills or scores, so set those as your DM allows.
      </p>
      <div className="list">
        {list.map((b) => (
          <div className="item" key={b.name}>
            <div className="item-head">
              <button type="button" className="item-title" onClick={() => setOpen(open === b.name ? null : b.name)} aria-expanded={open === b.name}>
                <b>
                  {b.name}
                  {mine === b.name ? ' ✓' : ''}
                </b>
                <small>{[b.feat ? `Feat: ${b.feat}` : b.feature?.name, b.skills, b.source].filter(Boolean).join(' · ')}</small>
              </button>
              <button type="button" className="cast" disabled={mine === b.name} onClick={() => take(b)} aria-label={mine === b.name ? `${b.name} is your background` : `Take ${b.name} as your background`}>
                {mine === b.name ? 'Yours' : 'Take'}
              </button>
            </div>
            {open === b.name && (
              <div className="item-body">
                <p style={{ whiteSpace: 'pre-line' }}>{describeBackground(b)}</p>
                <p className="hint" style={{ margin: 0 }}>
                  Source: {b.source}
                  {b.source === 'SRD 5.2.1' ? '' : '. Described in this app’s own words; check the book for the full rules.'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
