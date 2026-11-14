// The Feature library: every class and subclass feature in the rules, to read and to add to any
// character's sheet (Rage, Sneak Attack, Second Wind…). Feats have their own library beside it.

import { useMemo, useState } from 'react';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { featureForSheet, levelFor, libraryFeatures, matches, onSheet, usesLine } from '../systems/dnd5e/featurelib';
import { RulesText } from './RulesText';
import { Panel } from './ui';

const PAGE = 40;

export function FeatureLibraryPanel() {
  const { char: c, update } = useChar();
  const cat = useCatalog();
  const mine = [...new Set(c.classes.map((k) => k.classId))];
  const [cls, setCls] = useState<string>(mine.length ? 'mine' : 'all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [message, setMessage] = useState('');
  const all = useMemo(() => (cat ? libraryFeatures(cat) : []), [cat]);
  if (!cat)
    return (
      <Panel title="Feature library" tab="library">
        <p className="hint">Loading the rules…</p>
      </Panel>
    );
  const list = all.filter((e) => (cls === 'all' ? true : cls === 'mine' ? mine.includes(e.classId) : e.classId === cls) && matches(e, query));
  return (
    <Panel title="Feature library" tab="library">
      <p className="hint" style={{ marginTop: 0 }}>
        Every class and subclass feature in your rules. Add any of them to this sheet, whatever its classes. Feats, including Fighting Style feats like Two-Weapon Fighting and the Dual Wielder feat,
        are in the Feat library.
      </p>
      {message && (
        <p className="note good" role="status">
          {message}
        </p>
      )}
      <div className="row">
        <select className="input" style={{ width: 'auto' }} value={cls} onChange={(e) => (setCls(e.target.value), setShown(PAGE))} aria-label="Which class’s features">
          {mine.length > 0 && <option value="mine">My classes</option>}
          <option value="all">All classes</option>
          {cat.classes.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <input className="input" style={{ flex: 1, minWidth: 120 }} value={query} placeholder="Search: Rage, Sneak Attack, Extra Attack…" onChange={(e) => (setQuery(e.target.value), setShown(PAGE))} aria-label="Search features" />
      </div>
      <p className="hint">
        {list.length} feature{list.length === 1 ? '' : 's'}
      </p>
      <div className="list">
        {list.slice(0, shown).map((e) => {
          const have = onSheet(c, e);
          const uses = usesLine(c, e);
          return (
            <div className="item" key={e.key}>
              <div className="item-head">
                <button type="button" className="item-title" onClick={() => setOpen(open === e.key ? null : e.key)} aria-expanded={open === e.key}>
                  <b>{e.def.name}</b>
                  <small>
                    {e.subclass ? `${e.className} · ${e.source}` : e.source}
                    {uses ? ` · ${uses}` : ''}
                    {have === 'same' ? ' · on your sheet' : ''}
                  </small>
                </button>
                <button
                  type="button"
                  className="cast"
                  disabled={have === 'same'}
                  onClick={() => {
                    update((d) => void d.features.push(featureForSheet(d, e)));
                    setMessage(`${e.def.name} (${e.source}) is on your sheet under Features & traits${uses ? `, ${uses} at ${e.className} ${levelFor(c, e)}` : ''}.`);
                  }}
                  aria-label={have === 'same' ? `${e.def.name} is on your sheet` : `Add ${e.def.name} to my sheet`}
                >
                  {have === 'same' ? 'Added' : 'Add'}
                </button>
              </div>
              {open === e.key && (
                <div className="item-body">
                  <RulesText text={e.def.text} />
                  {have === 'other' && <p className="hint">You have a feature by this name from somewhere else already.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {list.length > shown && (
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn small" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({list.length - shown} left)
          </button>
        </div>
      )}
    </Panel>
  );
}
