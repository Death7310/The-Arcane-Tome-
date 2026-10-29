// Languages: a free-text list ("Common, Elvish, Thieves' Cant") with the SRD's languages
// one tap away, so the usual ones don't need typing.

import { useId } from 'react';
import LANGUAGES from '../systems/dnd5e/srd/languages.json';

const split = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function LanguagesField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const have = split(value);
  const known = new Set(have.map((l) => l.toLowerCase()));
  const toggle = (name: string) => onChange((known.has(name.toLowerCase()) ? have.filter((l) => l.toLowerCase() !== name.toLowerCase()) : [...have, name]).join(', '));
  return (
    <div className="field">
      <label htmlFor={fid}>
        <span>Languages</span>
      </label>
      <input id={fid} className="input" value={value} placeholder="Common, Elvish…" onChange={(e) => onChange(e.target.value)} />
      <details className="lang-picks">
        <summary>Pick from the standard and rare languages</summary>
        <div className="chips" role="group" aria-label="Languages">
          {(LANGUAGES as { name: string; rare?: boolean }[]).map((l) => (
            <button key={l.name} type="button" className="chip" aria-pressed={known.has(l.name.toLowerCase())} onClick={() => toggle(l.name)} title={l.rare ? 'Rare language' : 'Standard language'}>
              {l.name}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
