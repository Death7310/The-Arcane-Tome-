import { useRef, useState } from 'react';
import { extractFromFile, UnsupportedFile } from '../import/extract';
import { parseImport, type MergeResult } from '../state/storage';
import { ABILITIES, ABILITY_NAMES, classById } from '../systems/dnd5e/data';
import { AI_PROMPT, buildCharacter, importFromText, looksLikeAiJson, readAiJson, type ImportResult } from '../systems/dnd5e/importer';
import type { Character } from '../systems/dnd5e/model';
import { NumField, TextField } from './ui';

const ACCEPT = '.pdf,.docx,.odt,.txt,.md,.markdown,.html,.htm,.rtf,.csv,.json,application/pdf,text/*';

/**
 * Import a character from a document (PDF, Word, text, an AI's write-up) or an Arcane Tome
 * backup. Documents go through a review step: nothing is created until the person confirms.
 */
export function ImportCharacter(props: { onCreate: (c: Character) => void; onRestore: (characters: Character[]) => MergeResult; onDone: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<(ImportResult & { source: string }) | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  /** JSON is either an Arcane Tome backup/export (restored directly) or the AI prompt's format (reviewed). */
  const fromRaw = (raw: string, source: string) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const data = JSON.parse(trimmed.replace(/^```(?:json)?|```$/g, ''));
        if (looksLikeAiJson(data)) return setReview({ ...buildCharacter(readAiJson(data)), source: 'AI conversion' });
        const r = props.onRestore(parseImport(trimmed));
        return props.onDone(`Imported: ${[r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.kept && `${r.kept} already up to date`].filter(Boolean).join(', ')}.`);
      } catch (e) {
        if (!(e instanceof SyntaxError)) return setError((e as Error).message);
        // Not JSON after all; read it as text.
      }
    }
    const result = importFromText(raw);
    setReview({ ...result, source });
  };

  const fromFile = async (f: File) => {
    setError('');
    setBusy(`Reading ${f.name}…`);
    try {
      if (/\.json$/i.test(f.name)) fromRaw(await f.text(), f.name);
      else {
        const ex = await extractFromFile(f);
        setReview({ ...importFromText(ex.text, ex.fields), source: `${f.name} (${ex.kind})` });
      }
    } catch (e) {
      setError(e instanceof UnsupportedFile ? e.message : `Couldn’t read that file: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  if (review) {
    const c = review.character;
    const set = (fn: (x: Character) => void) => {
      const next = structuredClone(c);
      fn(next);
      setReview({ ...review, character: next });
    };
    return (
      <div className="import-review">
        <p className="hint" style={{ marginTop: 0 }}>
          Read from <b>{review.source}</b>. Check it over, fix anything that’s off, then create the character. Everything else can be edited on the sheet afterwards.
        </p>
        {review.found.length > 0 && (
          <ul className="found">
            {review.found.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        {review.warnings.length > 0 && (
          <ul className="warn-list">
            {review.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <div className="grid-2">
          <TextField label="Name" id="imp-name" value={c.name} onChange={(v) => set((x) => void (x.name = v))} />
          <TextField label="Species" id="imp-species" value={c.species} onChange={(v) => set((x) => void (x.species = v))} />
        </div>
        <p className="hint">
          {c.classes.map((k) => `${classById(k.classId).name}${k.subclass ? ` (${k.subclass})` : ''} ${k.level}`).join(' / ')} · {c.spells.length} spells · {c.weapons.length} weapons · {c.features.length} features
        </p>
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
          {ABILITIES.map((a) => (
            <NumField key={a} label={a.toUpperCase()} id={`imp-${a}`} ariaLabel={ABILITY_NAMES[a]} value={c.abilities[a]} min={1} max={30} onChange={(n) => set((x) => void (x.abilities[a] = n))} />
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" onClick={() => (props.onCreate(c), props.onDone(`Created ${c.name}.`))}>
            Create this character
          </button>
          <button type="button" className="btn ghost" onClick={() => setReview(null)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="import">
      <p className="hint" style={{ marginTop: 0 }}>
        Bring in a character sheet: a PDF (including fillable sheets and D&amp;D Beyond exports), a Word or Google Doc (download it as .docx or PDF), a text file, something an AI wrote, or an Arcane
        Tome backup. It’s read on this device; nothing is uploaded.
      </p>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          Choose a file
        </button>
        {busy && <span className="hint">{busy}</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        id="import-file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void fromFile(f);
        }}
      />
      <label className="field" htmlFor="import-text" style={{ marginTop: 12 }}>
        <span>Or paste the sheet’s text</span>
        <textarea id="import-text" className="input" value={text} placeholder={'Name: …\nLevel 5 Wizard\nSTR 8  DEX 14  CON 13…'} onChange={(e) => setText(e.target.value)} />
      </label>
      {error && <p className="hint" style={{ color: 'var(--bad)' }}>{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn" disabled={!text.trim()} onClick={() => (setError(''), fromRaw(text, 'pasted text'))}>
          Read pasted text
        </button>
      </div>

      <div className="ai-help">
        <button type="button" className="btn small ghost" aria-expanded={showPrompt} onClick={() => setShowPrompt((s) => !s)}>
          {showPrompt ? 'Hide' : 'Unusual sheet? Let an AI convert it first'}
        </button>
        {showPrompt && (
          <>
            <p className="hint">
              Copy this, paste it into ChatGPT, Claude, Gemini or another AI, then paste your character underneath it. Paste the AI’s answer back here and press Read pasted text.
            </p>
            <textarea className="input mono" readOnly value={AI_PROMPT} id="ai-prompt" aria-label="Prompt for an AI" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn small"
              onClick={() =>
                navigator.clipboard?.writeText(AI_PROMPT).then(
                  () => (setCopied(true), setTimeout(() => setCopied(false), 2000)),
                  () => (document.getElementById('ai-prompt') as HTMLTextAreaElement | null)?.select(),
                )
              }
            >
              {copied ? 'Copied' : 'Copy the prompt'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
