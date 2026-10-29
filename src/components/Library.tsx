import { useMemo, useRef, useState } from 'react';
import { extractFromFile, UnsupportedFile } from '../import/extract';
import { exportPack, looksLikePackFile, packFrom, useLibrary, type Pack } from '../state/library';
import { downloadText } from '../state/storage';
import { contentCounts, looksLikeRulesJson, readRulesDocument, readRulesJson, RULES_AI_PROMPT, type ReadResult } from '../systems/dnd5e/rulesdoc';
import { RulesText } from './RulesText';
import { Check, ConfirmButton, Dialog } from './ui';

const ACCEPT = '.pdf,.docx,.odt,.txt,.md,.markdown,.html,.htm,.rtf,.json,application/pdf,text/*,application/json';

function countsText(c: ReturnType<typeof contentCounts>, sections?: number): string {
  const parts = [
    sections !== undefined ? `${sections} section${sections === 1 ? '' : 's'}` : '',
    c.classes ? `${c.classes} class${c.classes === 1 ? '' : 'es'}` : '',
    c.subclasses ? `${c.subclasses} subclass${c.subclasses === 1 ? '' : 'es'}` : '',
    c.feats ? `${c.feats} feat${c.feats === 1 ? '' : 's'}` : '',
    c.spells ? `${c.spells} spell${c.spells === 1 ? '' : 's'}` : '',
    c.creatures ? `${c.creatures} creature${c.creatures === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'nothing yet';
}

/**
 * Your rules library: import rules documents (your own game's PDF, a supplement, house
 * rules), and the sheet pulls their classes, subclasses, feats, spells and creatures into
 * Level up, the spell list and the companion list. Everything is also readable and
 * searchable here. Stored on this device; included in backups.
 */
export function LibraryDialog({ onClose }: { onClose: () => void }) {
  const lib = useLibrary();
  const [mode, setMode] = useState<'packs' | 'add' | 'read'>('packs');
  const [readPack, setReadPack] = useState<string | null>(null);
  const packs = lib.packs ?? [];
  return (
    <Dialog title="Rules library" onClose={onClose}>
      <div className="seg" role="radiogroup" aria-label="Library">
        <button type="button" role="radio" aria-checked={mode === 'packs'} onClick={() => setMode('packs')}>
          Your rules{packs.length ? ` (${packs.length})` : ''}
        </button>
        <button type="button" role="radio" aria-checked={mode === 'add'} onClick={() => setMode('add')}>
          Add rules
        </button>
        <button type="button" role="radio" aria-checked={mode === 'read'} onClick={() => setMode('read')} disabled={!packs.length}>
          Read &amp; search
        </button>
      </div>
      {lib.error && <p className="hint" style={{ color: 'var(--bad)' }}>{lib.error}</p>}

      {mode === 'packs' && (
        <div className="lib-packs">
          {lib.packs === null && <p className="hint">Opening your library…</p>}
          {lib.packs && packs.length === 0 && (
            <div className="note">
              <b>No rules imported yet.</b> Add a rulebook, supplement or homebrew document and its classes, subclasses, feats, spells and creatures join the official ones on
              your sheet.{' '}
              <button type="button" className="btn small primary" onClick={() => setMode('add')}>
                Add rules
              </button>
            </div>
          )}
          {packs.map((p) => (
            <div key={p.id} className="item" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <b>{p.name}</b> <small className="hint">from {p.source}</small>
                </span>
                <Check label="Use on my sheet" id={`pack-on-${p.id}`} checked={p.enabled} onChange={(b) => void lib.save({ ...p, enabled: b })} />
              </div>
              <span className="hint">{countsText(contentCounts(p.content), p.sections.length)}</span>
              <div className="row">
                <button type="button" className="btn small" onClick={() => (setReadPack(p.id), setMode('read'))} disabled={!p.sections.length}>
                  Read
                </button>
                <button type="button" className="btn small ghost" onClick={() => downloadText(`${p.name.replace(/[^\w-]+/g, '-').toLowerCase()}.rules.json`, exportPack(p))}>
                  Export
                </button>
                <ConfirmButton label="Delete" onConfirm={() => void lib.remove(p.id)} />
              </div>
            </div>
          ))}
          <p className="hint">
            Your library is kept on this device and included in backup files. Content from rules you import is for your own table: share it only if you have the rights to.
          </p>
        </div>
      )}

      {mode === 'add' && <AddRules onSaved={() => setMode('packs')} save={lib.save} />}
      {mode === 'read' && <ReadRules packs={packs} initialPack={readPack} />}
    </Dialog>
  );
}

function AddRules({ onSaved, save }: { onSaved: () => void; save: (p: Pack) => Promise<boolean> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [review, setReview] = useState<{ result: ReadResult; name: string; source: string } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  const fromText = (raw: string, name: string, source: string) => {
    const trimmed = raw.trim().replace(/^```(?:json)?|```$/g, '').trim();
    if (trimmed.startsWith('{')) {
      try {
        const data = JSON.parse(trimmed);
        if (looksLikePackFile(data)) {
          void save({ ...data.pack, id: data.pack.id || `pack-${Date.now().toString(36)}` }).then((ok) => ok && onSaved());
          return;
        }
        if (looksLikeRulesJson(data)) {
          const r = readRulesJson(data, name);
          setReview({ result: r, name: r.name, source: 'AI conversion' });
          return;
        }
      } catch {
        // Not JSON; read it as a document.
      }
    }
    // Name the pack after the document's own title when it has one.
    const result = readRulesDocument(raw, name);
    const title = result.sections.find((s) => s.level === 1 && s.title !== 'Introduction')?.title;
    const packName = title && title.length <= 60 ? title : name;
    setReview({ result: packName === name ? result : readRulesDocument(raw, packName), name: packName, source });
  };

  const fromFile = async (f: File) => {
    setError('');
    setBusy(`Reading ${f.name}…`);
    try {
      const name = f.name.replace(/\.[^.]+$/, '');
      if (/\.json$/i.test(f.name)) fromText(await f.text(), name, f.name);
      else {
        const ex = await extractFromFile(f);
        if (!ex.text.trim()) throw new UnsupportedFile('That file has no text to read.');
        fromText(ex.text, name, f.name);
      }
    } catch (e) {
      setError(e instanceof UnsupportedFile ? e.message : `Couldn’t read that file: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  if (review) {
    const r = review.result;
    const lists: [string, string[]][] = [
      ['Classes', r.classes.map((k) => `${k.name} (d${k.hitDie}, ${k.features.length} features)`)],
      ['Subclasses', r.subclasses.map((k) => k.name)],
      ['Feats', r.feats.map((k) => k.name)],
      ['Spells', r.spells.map((k) => `${k.name} (${k.level === 0 ? 'cantrip' : `level ${k.level}`})`)],
      ['Creatures', r.creatures.map((k) => k.name)],
    ];
    return (
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        <label className="field">
          <span>Name this rules pack</span>
          <input className="input" value={review.name} onChange={(e) => setReview({ ...review, name: e.target.value })} aria-label="Pack name" />
        </label>
        <p className="hint" style={{ margin: 0 }}>
          From <b>{review.source}</b>: {countsText(contentCounts(r), r.sections.length)}.
        </p>
        {r.notes.map((n) => (
          <div key={n} className="note warn">
            {n}
          </div>
        ))}
        {lists
          .filter(([, l]) => l.length)
          .map(([title, l]) => (
            <details key={title} className="feature-preview" open={l.length <= 8}>
              <summary>
                <b>{title}</b> <span className="hint">· {l.length}</span>
              </summary>
              <p className="hint" style={{ margin: '6px 0 0' }}>
                {l.join(', ')}
              </p>
            </details>
          ))}
        <p className="hint" style={{ margin: 0 }}>
          Found content shows up in Level up, Add a spell and Add a companion, marked with this pack’s name. Anything the reader missed is still in the searchable text, and you can
          run the document through an AI for a fuller conversion.
        </p>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            disabled={!review.name.trim()}
            onClick={async () => {
              // Content is labelled with the pack's final name.
              const name = review.name.trim();
              const relabel = <T extends { source?: string }>(xs: T[]) => xs.map((x) => ({ ...x, source: name }));
              const result = { ...r, classes: relabel(r.classes), subclasses: relabel(r.subclasses), feats: relabel(r.feats), spells: relabel(r.spells), creatures: relabel(r.creatures) };
              if (await save(packFrom(name, review.source, result))) onSaved();
            }}
          >
            Save to my library
          </button>
          <button type="button" className="btn ghost" onClick={() => setReview(null)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      <p className="hint" style={{ margin: 0 }}>
        A rulebook, a supplement, or the rules of the game you’re making: PDF, Word (.docx), OpenDocument, text, Markdown or a web page. It’s read on this device; nothing is uploaded.
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
        id="rules-file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void fromFile(f);
        }}
      />
      <label className="field" htmlFor="rules-text">
        <span>Or paste rules text, or an AI’s JSON conversion</span>
        <textarea id="rules-text" className="input" style={{ minHeight: 140 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'# My Game\n## Spells\nFrostbite Lance\nLevel 2 Evocation (Wizard)\nCasting Time: Action\n…'} />
      </label>
      {error && <p className="hint" style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      <div className="row">
        <button type="button" className="btn" disabled={!text.trim()} onClick={() => fromText(text, 'My rules', 'pasted text')}>
          Read pasted text
        </button>
      </div>
      <div className="ai-help">
        <button type="button" className="btn small ghost" aria-expanded={showPrompt} onClick={() => setShowPrompt((s) => !s)}>
          {showPrompt ? 'Hide' : 'Your own game, or an unusual layout? Let an AI convert it'}
        </button>
        {showPrompt && (
          <>
            <p className="hint">
              The reader finds spells, creatures, feats and classes laid out the way D&amp;D books lay them out. For anything else, copy this prompt into ChatGPT, Claude, Gemini or
              another AI, paste your rules under it (a chapter at a time for a long book), and paste the AI’s JSON answer above.
            </p>
            <textarea className="input mono" readOnly value={RULES_AI_PROMPT} aria-label="Prompt for an AI" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn small"
              onClick={() =>
                navigator.clipboard?.writeText(RULES_AI_PROMPT).then(
                  () => (setCopied(true), setTimeout(() => setCopied(false), 2000)),
                  () => undefined,
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

function ReadRules({ packs, initialPack }: { packs: Pack[]; initialPack: string | null }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<{ pack: string; section: string } | null>(null);
  const [packId, setPackId] = useState(initialPack ?? packs[0]?.id ?? '');
  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (needle.length < 2) return [];
    const out: { pack: Pack; id: string; title: string; snippet: string }[] = [];
    for (const p of packs) {
      for (const s of p.sections) {
        const inTitle = s.title.toLowerCase().includes(needle);
        const at = s.text.toLowerCase().indexOf(needle);
        if (!inTitle && at < 0) continue;
        const from = Math.max(0, at - 60);
        out.push({ pack: p, id: s.id, title: s.title, snippet: at >= 0 ? `${from ? '…' : ''}${s.text.slice(from, at + needle.length + 80).replace(/\s+/g, ' ')}…` : s.text.slice(0, 120) });
        if (out.length >= 60) return out;
      }
    }
    return out;
  }, [packs, needle]);
  const pack = packs.find((p) => p.id === (pick?.pack ?? packId));
  const section = pick && pack?.sections.find((s) => s.id === pick.section);

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      <div className="row">
        <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Search your rules" value={q} onChange={(e) => (setQ(e.target.value), setPick(null))} aria-label="Search your rules" />
        <select className="input" style={{ width: 'auto' }} value={packId} onChange={(e) => (setPackId(e.target.value), setPick(null))} aria-label="Rules pack">
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {section ? (
        <div className="rules-reader">
          <button type="button" className="btn small ghost" onClick={() => setPick(null)}>
            ← Back
          </button>
          <h3 style={{ margin: 0 }}>{section.title}</h3>
          <RulesText text={section.text || '(No text under this heading.)'} />
        </div>
      ) : needle.length >= 2 ? (
        <div className="lib">
          {results.length === 0 && <p className="hint">Nothing matches “{q}”.</p>}
          {results.map((r) => (
            <button key={`${r.pack.id}:${r.id}`} type="button" className="search-hit" onClick={() => setPick({ pack: r.pack.id, section: r.id })}>
              <span>
                <b>{r.title}</b> <small className="hint">{r.pack.name}</small>
                <span className="hint clamp">{r.snippet}</span>
              </span>
            </button>
          ))}
        </div>
      ) : pack ? (
        <nav className="toc" aria-label={`${pack.name} contents`}>
          {pack.sections.map((s) => (
            <button key={s.id} type="button" className={`toc-${s.level}`} onClick={() => setPick({ pack: pack.id, section: s.id })}>
              {s.title}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
