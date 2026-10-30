// Spells beyond your own sheet: browsing every spell the app knows (the SRD 5.2.1 and your
// rules library) by level, class and school; importing spells from pasted text or a
// document into your library, filed under their classes; and the Spell compendium tile.

import { useMemo, useState } from 'react';
import { ELEMENTS } from '../fx/types';
import { extractFromFile, UnsupportedFile } from '../import/extract';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { addSpellsToLibrary, removeLibrarySpell } from '../state/library';
import { useTable } from '../state/table';
import { uid } from '../systems/dnd5e/model';
import { slug } from '../systems/dnd5e/rulesdoc';
import { spellFromDef, tunedSpells } from '../systems/dnd5e/spells';
import { readSpellText, spellForClass, SPELLS_AI_PROMPT } from '../systems/dnd5e/spellimport';
import type { SpellDef } from '../systems/dnd5e/srd';
import { RulesText } from './RulesText';
import { ConfirmButton, Dialog, Panel } from './ui';

const SRD = 'SRD 5.2.1';
const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const levelName = (l: number) => (l === 0 ? 'Cantrip' : `${ordinal(l)} level`);
/** "shadow-knight" → "Shadow Knight", for a class the app doesn't know yet. */
const title = (k: string) => k.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

/** Every spell the app knows, with a list you can narrow by level, class, school and source. */
export function SpellBrowser({ pageSize = 60, defaultClass }: { pageSize?: number; defaultClass?: 'mine' | 'all' }) {
  const { char: c, update } = useChar();
  const t = useTable();
  const cat = useCatalog();
  const mine = c.classes.map((k) => k.classId);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<'all' | number>('all');
  const [cls, setCls] = useState<string>(defaultClass ?? 'mine');
  const [school, setSchool] = useState('all');
  const [source, setSource] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(pageSize);
  const known = new Set(c.spells.map((s) => s.name.toLowerCase()));
  const all = useMemo(() => (cat ? tunedSpells(cat.spells) : []), [cat]);
  const sources = useMemo(() => [...new Set(all.map((s) => s.source ?? SRD))], [all]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const forClass = (s: SpellDef, id: string) => !s.classes?.length || spellForClass(s, id);
    return all
      .filter((s) => !needle || s.name.toLowerCase().includes(needle))
      .filter((s) => level === 'all' || s.level === level)
      .filter((s) => cls === 'all' || (cls === 'mine' ? mine.some((id) => forClass(s, id)) : forClass(s, cls)))
      .filter((s) => school === 'all' || s.school.toLowerCase() === school.toLowerCase())
      .filter((s) => source === 'all' || (s.source ?? SRD) === source)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, q, level, cls, school, source, mine.join()]);
  const className = (k: string) => cat?.classes.find((x) => x.id === k || x.id.endsWith(`:${k}`))?.name ?? title(k);
  const reset = () => setShown(pageSize);

  return (
    <div className="spell-browser">
      <input className="input" placeholder="Search spells" value={q} id="spell-search" aria-label="Search spells" onChange={(e) => (setQ(e.target.value), reset())} />
      <div className="row" style={{ marginTop: 8 }}>
        <select className="input" style={{ width: 'auto' }} value={String(level)} aria-label="Spell level" onChange={(e) => (setLevel(e.target.value === 'all' ? 'all' : Number(e.target.value)), reset())}>
          <option value="all">All levels</option>
          {Array.from({ length: 10 }, (_, l) => (
            <option key={l} value={l}>
              {l === 0 ? 'Cantrips' : `${ordinal(l)} level`}
            </option>
          ))}
        </select>
        <select className="input" style={{ width: 'auto' }} value={cls} aria-label="Class spell list" onChange={(e) => (setCls(e.target.value), reset())}>
          <option value="mine">My classes’ spells</option>
          <option value="all">Every class</option>
          {(cat?.classes ?? []).map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <select className="input" style={{ width: 'auto' }} value={school} aria-label="School of magic" onChange={(e) => (setSchool(e.target.value), reset())}>
          <option value="all">Every school</option>
          {SCHOOLS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        {sources.length > 1 && (
          <select className="input" style={{ width: 'auto' }} value={source} aria-label="Source" onChange={(e) => (setSource(e.target.value), reset())}>
            <option value="all">All sources</option>
            {sources.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        )}
        <span className="hint">{cat ? `${list.length} spell${list.length === 1 ? '' : 's'}` : 'Loading spells…'}</span>
      </div>
      <div className="lib">
        {list.slice(0, shown).map((s) => {
          const id = `${s.source}:${s.name}`;
          const have = known.has(s.name.toLowerCase());
          const own = (s.source ?? SRD) !== SRD;
          return (
            <div key={id} className={`lib-row el-${s.element}`}>
              <button type="button" className="lib-main" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
                <span>
                  <b>{s.name}</b>
                  <span className="hint">
                    {' '}
                    · {levelName(s.level)} · {s.school}
                    {s.concentration ? ' · Concentration' : ''}
                    {s.ritual ? ' · Ritual' : ''}
                    {own ? ` · ${s.source}` : ''}
                  </span>
                </span>
                <span className="chip">{ELEMENTS.find((e) => e.id === s.element)?.name}</span>
              </button>
              <button type="button" className="btn small" disabled={have} onClick={(e) => (update((d) => void d.spells.push(spellFromDef(s, uid()))), t.preview(s.element, s.shape, s.level, e.currentTarget))}>
                {have ? 'On sheet' : 'Add'}
              </button>
              {open === id && (
                <div className="lib-detail">
                  <p className="hint" style={{ margin: 0 }}>
                    {[s.castingTimeText, s.range, s.components, s.duration].filter(Boolean).join(' · ')}
                    <br />
                    {s.classes?.length ? `Classes: ${s.classes.map(className).join(', ')}` : 'No class list: shown for every class'}
                  </p>
                  <RulesText text={s.description || 'No description.'} />
                  <div className="row">
                    <button type="button" className="btn small ghost" onClick={(e) => t.preview(s.element, s.shape, s.level, e.currentTarget)}>
                      Preview effect
                    </button>
                    {own && <ConfirmButton label="Remove from my library" confirmLabel="Tap again to remove it" onConfirm={() => void removeLibrarySpell(s.source!, s.name)} />}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {list.length > shown && (
          <button type="button" className="btn small ghost" onClick={() => setShown((n) => n + pageSize)}>
            Show more ({list.length - shown} left)
          </button>
        )}
      </div>
    </div>
  );
}

/** Spells from pasted text or a document, checked and filed under classes, into your library. */
export function SpellImport({ onSaved }: { onSaved?: (message: string) => void }) {
  const { update } = useChar();
  const cat = useCatalog();
  const [text, setText] = useState('');
  const [packName, setPackName] = useState('My spells');
  const [origin, setOrigin] = useState('pasted text');
  const [found, setFound] = useState<SpellDef[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [onSheet, setOnSheet] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  // Class choices as spells store them: "wizard", or a library class's own name slug.
  const classes = (cat?.classes ?? []).map((k) => ({ key: k.id.split(':').pop()!, name: k.name })).filter((k, i, all) => all.findIndex((x) => x.key === k.key) === i);
  const read = (raw: string, from: string) => {
    const spells = readSpellText(raw, packName);
    setFound(spells);
    setSkip(new Set());
    setOrigin(from);
    setError(spells.length ? '' : 'No spells were found. Each spell needs its name and a “Casting Time” line; for other layouts, use the AI prompt below.');
  };
  const toggleClass = (i: number, key: string) => setFound((f) => f && f.map((s, j) => (j !== i ? s : { ...s, classes: s.classes?.includes(key) ? s.classes.filter((k) => k !== key) : [...(s.classes ?? []), key] })));
  const giveAllUnlisted = (key: string) => setFound((f) => f && f.map((s) => (s.classes?.length ? s : { ...s, classes: [key] })));
  const unlisted = found?.filter((s, i) => !skip.has(i) && !s.classes?.length).length ?? 0;
  const chosen = found?.filter((_, i) => !skip.has(i)) ?? [];

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="field" htmlFor="spell-pack">
        <span>Save them in your library as</span>
        <input id="spell-pack" className="input" value={packName} onChange={(e) => setPackName(e.target.value)} placeholder="My spells" />
      </label>
      <label className="field" htmlFor="spell-paste">
        <span>Paste spells (as many as you like), or upload a document below</span>
        <textarea
          id="spell-paste"
          className="input"
          style={{ minHeight: 160 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Frost Lance\nLevel 2 Evocation (Sorcerer, Wizard)\nCasting Time: Bonus Action\nRange: 60 feet\nComponents: V, S\nDuration: Instantaneous\nA lance of frost…'}
        />
      </label>
      <div className="row">
        <button type="button" className="btn small primary" disabled={!text.trim()} onClick={() => read(text, 'pasted text')}>
          Read the spells
        </button>
        <label className="btn small ghost" htmlFor="spell-file" style={{ cursor: 'pointer' }}>
          Upload a document (PDF, Word, text)
        </label>
        <input
          id="spell-file"
          type="file"
          accept=".pdf,.docx,.odt,.txt,.md,.html,.htm,.rtf,application/pdf"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(`Reading ${f.name}…`);
            try {
              const ex = await extractFromFile(f);
              read(ex.text, f.name);
            } catch (err) {
              setError(err instanceof UnsupportedFile ? err.message : `Couldn’t read that file: ${(err as Error).message}`);
            } finally {
              setBusy('');
            }
          }}
        />
        {busy && <span className="hint">{busy}</span>}
      </div>
      {error && <p className="hint" style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}

      {found && found.length > 0 && (
        <div className="note good" style={{ display: 'grid', gap: 8 }}>
          <b>
            Found {found.length} spell{found.length === 1 ? '' : 's'} in {origin}
          </b>
          {unlisted > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span className="hint" style={{ color: 'var(--warn)' }}>
                {unlisted} don’t say which classes can learn them, so they’d show for every class. Give them a class:
              </span>
              <div className="chips">
                {classes.map((k) => (
                  <button key={k.key} type="button" className="chip" onClick={() => giveAllUnlisted(k.key)}>
                    {k.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="list">
            {found.map((s, i) => (
              <div key={`${s.name}-${i}`} className="item import-spell">
                <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
                  <input type="checkbox" checked={!skip.has(i)} aria-label={`Import ${s.name}`} onChange={(e) => setSkip((k) => (e.target.checked ? new Set([...k].filter((x) => x !== i)) : new Set([...k, i])))} />
                  <button type="button" className="item-title" style={{ flex: 1 }} aria-expanded={editing === i} onClick={() => setEditing(editing === i ? null : i)}>
                    <b>{s.name}</b>
                    <small>
                      {levelName(s.level)} · {s.school} · {s.classes?.length ? s.classes.map((k) => classes.find((x) => x.key === k)?.name ?? title(k)).join(', ') : 'no classes'}
                    </small>
                  </button>
                </div>
                {editing === i && (
                  <div className="item-body">
                    <span className="hint">Classes that can learn it:</span>
                    <div className="chips">
                      {[...classes, ...(s.classes ?? []).filter((k) => !classes.some((x) => x.key === k)).map((k) => ({ key: k, name: title(k) }))].map((k) => (
                        <button key={k.key} type="button" className="chip" aria-pressed={!!s.classes?.includes(k.key)} onClick={() => toggleClass(i, k.key)}>
                          {k.name}
                        </button>
                      ))}
                    </div>
                    <p className="hint" style={{ margin: 0 }}>
                      {[s.castingTimeText, s.range, s.components, s.duration].filter(Boolean).join(' · ')}
                    </p>
                    <RulesText text={s.description || 'No description.'} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={onSheet} onChange={(e) => setOnSheet(e.target.checked)} /> Also put them on my character’s sheet
          </label>
          <div className="row">
            <button
              type="button"
              className="btn small primary"
              disabled={!chosen.length || !packName.trim()}
              onClick={async () => {
                const name = packName.trim();
                const r = await addSpellsToLibrary(name, chosen, origin);
                if (onSheet) update((d) => chosen.forEach((s) => !d.spells.some((x) => slug(x.name) === slug(s.name)) && d.spells.push(spellFromDef({ ...s, source: name }, uid()))));
                const msg = `Saved ${chosen.length} spell${chosen.length === 1 ? '' : 's'} to “${name}”${r.replaced ? ` (${r.replaced} replaced)` : ''}. They’re in the spell list under their classes${onSheet ? ', and on your sheet' : ''}.`;
                setFound(null);
                setText('');
                onSaved?.(msg);
              }}
            >
              Add {chosen.length} to my library
            </button>
          </div>
        </div>
      )}

      <button type="button" className="btn small ghost" style={{ justifySelf: 'start' }} aria-expanded={showPrompt} onClick={() => setShowPrompt((v) => !v)}>
        {showPrompt ? 'Hide the AI prompt' : 'Unusual layout? Let an AI convert it first'}
      </button>
      {showPrompt && (
        <>
          <p className="hint" style={{ margin: 0 }}>
            Paste this into ChatGPT, Claude, Gemini or another AI, add your spells underneath, then paste its answer into the box above.
          </p>
          <textarea className="input mono" readOnly value={SPELLS_AI_PROMPT} aria-label="Prompt for an AI" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn small" style={{ justifySelf: 'start' }} onClick={() => void navigator.clipboard?.writeText(SPELLS_AI_PROMPT)}>
            Copy the prompt
          </button>
        </>
      )}
      <p className="hint" style={{ margin: 0 }}>Everything is read on this device. Imported spells live in your rules library (Rules), where they can be turned off or exported.</p>
    </div>
  );
}

/** The Spell compendium tile: every spell, to browse and try out. */
export function SpellCompendiumPanel() {
  const { char: c } = useChar();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const caster = c.spells.length > 0;
  return (
    <Panel
      title="Spell compendium"
      tab="magic"
      actions={
        <button type="button" className="btn small" onClick={() => setImporting(true)}>
          Import spells
        </button>
      }
    >
      {message && (
        <p className="note good" role="status" style={{ marginTop: 0 }}>
          {message}
        </p>
      )}
      <SpellBrowser pageSize={40} defaultClass={caster ? 'mine' : 'all'} />
      {importing && (
        <Dialog title="Import spells" onClose={() => setImporting(false)}>
          <SpellImport onSaved={(m) => (setMessage(m), setImporting(false))} />
        </Dialog>
      )}
    </Panel>
  );
}
