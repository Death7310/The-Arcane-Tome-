// Languages: the Languages tile (each language you know, with who speaks it and its lore,
// or your own description), and the compact field used in the Character editor.

import { useId, useState } from 'react';
import { useChar } from '../state/character';
import { LANGUAGES, languageInfo, languageKey, splitLanguages } from '../systems/dnd5e/languages';
import { RulesText } from './RulesText';
import { Panel } from './ui';

/** Tappable chips for the SRD's languages; a pressed chip is one you know. */
function LanguageChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const have = splitLanguages(value);
  const known = new Set(have.map(languageKey));
  const toggle = (name: string) => onChange((known.has(languageKey(name)) ? have.filter((l) => languageKey(l) !== languageKey(name)) : [...have, name]).join(', '));
  return (
    <div className="chips" role="group" aria-label="Languages">
      {LANGUAGES.map((l) => (
        <button key={l.name} type="button" className="chip" aria-pressed={known.has(languageKey(l.name))} onClick={() => toggle(l.name)} title={`${l.rare ? 'Rare' : 'Standard'} language · ${l.origin}`}>
          {l.name}
        </button>
      ))}
    </div>
  );
}

export function LanguagesField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>
        <span>Languages</span>
      </label>
      <input id={fid} className="input" value={value} placeholder="Common, Elvish…" onChange={(e) => onChange(e.target.value)} />
      <details className="lang-picks">
        <summary>Pick from the standard and rare languages</summary>
        <LanguageChips value={value} onChange={onChange} />
      </details>
    </div>
  );
}

export function LanguagesPanel() {
  const { char: c, update } = useChar();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const langs = splitLanguages(c.languages);
  const setList = (names: string[]) => update((d) => void (d.languages = names.join(', ')));

  const add = () => {
    const names = splitLanguages(adding);
    if (!names.length) return;
    const merged = splitLanguages([...langs, ...names].join(','));
    setList(merged);
    setAdding('');
    // A language of your own opens straight to its description, so it can be written.
    const own = names.find((n) => !languageInfo(n));
    if (own) (setOpen(languageKey(own)), setEditing(languageKey(own)));
  };

  return (
    <Panel title="Languages" tab="languages">
      <div className="list">
        {langs.length === 0 && <p className="hint">No languages yet. Add the ones your character speaks below.</p>}
        {langs.map((name) => {
          const k = languageKey(name);
          const info = languageInfo(name);
          const own = c.languageNotes[k];
          const text = own ?? info?.lore ?? '';
          return (
            <div className="item lang-item" key={k}>
              <div className="item-head">
                <button type="button" className="item-title" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                  <b>{name}</b>
                  <small>{info ? `${info.rare ? 'Rare' : 'Standard'} · ${info.origin}` : own ? 'Your own language' : 'Your own language · add a description'}</small>
                </button>
              </div>
              {open === k && (
                <div className="item-body">
                  {editing === k ? (
                    <LanguageNoteEditor
                      name={name}
                      initial={text}
                      onSave={(v) => {
                        update((d) => {
                          if (!v.trim() || (info && v.trim() === info.lore)) delete d.languageNotes[k];
                          else d.languageNotes[k] = v.trim();
                        });
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      {info && <p className="hint" style={{ margin: 0 }}>Origin (SRD 5.2.1): {info.origin}</p>}
                      {text ? <RulesText text={text} /> : <p className="hint">No description yet.</p>}
                      {own && info && <p className="hint" style={{ margin: 0 }}>Your description (replaces the built-in one).</p>}
                      <div className="row">
                        <button type="button" className="btn small ghost" onClick={() => setEditing(k)}>
                          {text ? 'Edit description' : 'Write a description'}
                        </button>
                        {own && info && (
                          <button type="button" className="btn small ghost" onClick={() => update((d) => void delete d.languageNotes[k])}>
                            Use the built-in description
                          </button>
                        )}
                        <button type="button" className="btn small ghost" onClick={() => setList(langs.filter((l) => languageKey(l) !== k))}>
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <form
        className="row"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          list="language-names"
          placeholder="Add languages: Elvish, Sylvan…"
          aria-label="Languages to add"
          id="lang-add"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
        />
        <datalist id="language-names">
          {LANGUAGES.filter((l) => !langs.some((x) => languageKey(x) === languageKey(l.name))).map((l) => (
            <option key={l.name} value={l.name} />
          ))}
        </datalist>
        <button type="submit" className="btn small" disabled={!adding.trim()}>
          Add
        </button>
      </form>
      <details className="lang-picks">
        <summary>Pick from the standard and rare languages</summary>
        <LanguageChips value={c.languages} onChange={(v) => update((d) => void (d.languages = v))} />
      </details>
      <p className="hint" style={{ marginBottom: 0 }}>
        Separate several with commas. Any name works, so homebrew languages are fine; give them a description of who speaks them. Origins are from the SRD 5.2.1; the lore notes are general D&amp;D background, so change any of them to fit your world.
      </p>
    </Panel>
  );
}

function LanguageNoteEditor({ name, initial, onSave, onCancel }: { name: string; initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const id = useId();
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label className="field" htmlFor={id}>
        <span>About {name}: who speaks it, where it comes from, its history</span>
        <textarea id={id} className="input" style={{ minHeight: 110 }} value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      </label>
      <div className="row">
        <button type="button" className="btn small primary" onClick={() => onSave(v)}>
          Save
        </button>
        <button type="button" className="btn small ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
