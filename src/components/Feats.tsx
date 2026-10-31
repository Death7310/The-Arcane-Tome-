// The feat library: every feat the app knows (the SRD 5.2.1 and your rules library), feats
// you paste or upload, and feats you write or copy and change yourself. Taking a feat puts
// it on your sheet: its ability increase, its spells (marked as coming from the feat and
// cast with the ability it names), and a once-per-Long-Rest free cast of each.

import { useMemo, useState } from 'react';
import { extractFromFile, UnsupportedFile } from '../import/extract';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { addFeatsToLibrary, removeLibraryFeat } from '../state/library';
import { ABILITIES, ABILITY_NAMES, type Ability } from '../systems/dnd5e/data';
import { abilitiesFromText, applyFeat, describeGrants, featSpells, featSpellsFromText, FEATS_AI_PROMPT, readFeatText } from '../systems/dnd5e/featimport';
import type { Character, Feature } from '../systems/dnd5e/model';
import { slug } from '../systems/dnd5e/rulesdoc';
import { spellForClass } from '../systems/dnd5e/spellimport';
import type { FeatDef, FeatSpells, SpellDef } from '../systems/dnd5e/srd';
import { RulesText } from './RulesText';
import { Check, ConfirmButton, Dialog, Panel } from './ui';

const SRD = 'SRD 5.2.1';
const MY_FEATS = 'My feats';
const CATEGORIES = [
  { id: 'origin', name: 'Origin' },
  { id: 'general', name: 'General' },
  { id: 'fighting-style', name: 'Fighting Style' },
  { id: 'epic-boon', name: 'Epic Boon' },
] as const;
const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
const CASTERS = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'];
const MENTAL: Ability[] = ['int', 'wis', 'cha'];
const catName = (id: string) => CATEGORIES.find((k) => k.id === id)?.name ?? id;
const title = (k: string) => k.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const prerequisite = (f: Pick<FeatDef, 'text'>) => /^Prerequisites?:\s*(.+)$/m.exec(f.text)?.[1]?.trim() ?? '';

/** The feat in the catalog a sheet feature stands for (by name, ignoring punctuation). */
export const featForFeature = (feats: FeatDef[], f: Pick<Feature, 'name'>) => feats.find((x) => norm(x.name) === norm(f.name));

/**
 * A feat on your sheet that gives spells it hasn't added yet: one taken through Level up, or
 * imported with your character. Its rules come from the library, else from its own text.
 */
export function featNeedingSpells(c: Character, feats: FeatDef[], f: Feature): FeatDef | null {
  const fromFeat = f.origin?.kind === 'feat' || /\bfeat\b/i.test(f.source) || !!featForFeature(feats, f);
  if (!fromFeat || c.spells.some((s) => s.grantedBy === `feat:${f.name}`)) return null;
  const known = featForFeature(feats, f);
  if (known && featSpells(known)) return { ...known, name: f.name };
  const g = featSpellsFromText(f.description);
  if (!g) return null;
  return { id: `sheet:${slug(f.name)}`, name: f.name, category: 'general', repeatable: false, minLevel: 1, abilities: abilitiesFromText(f.description), text: f.description, spells: g, source: 'your sheet' };
}

// ── The dialog ───────────────────────────────────────────────────────────────

type Tab = 'list' | 'paste' | 'create';

/** The feat library. With `setup`, it opens on setting up that feat (already on your sheet). */
/** Your own copy of a feat to change: renamed, filed in your library, spells written out. */
const copyOfFeat = (f: FeatDef): FeatDef => ({ ...f, name: `${f.name} (custom)`, id: '', source: MY_FEATS, spells: featSpells(f) ?? undefined });

export function FeatLibraryDialog({ onClose, setup, start = 'list', copyOf }: { onClose: () => void; setup?: FeatDef; start?: Tab; copyOf?: FeatDef }) {
  const [tab, setTab] = useState<Tab>(copyOf ? 'create' : start);
  const [draft, setDraft] = useState<FeatDef | null>(copyOf ? copyOfFeat(copyOf) : null);
  const [message, setMessage] = useState('');
  const copy = (f: FeatDef) => {
    setDraft(copyOfFeat(f));
    setTab('create');
  };
  return (
    <Dialog title={setup ? `Set up ${setup.name}` : 'Feats'} onClose={onClose}>
      {setup && (
        <div className="note" style={{ display: 'grid', gap: 8, marginTop: 0 }}>
          <span>
            <b>{setup.name}</b> is on your sheet but its spells aren’t yet. {featSpells(setup) ? describeGrants(featSpells(setup)!) : ''}
          </span>
          <TakeFeat feat={setup} setup onDone={setMessage} />
          {setup.source === 'your sheet' && <SaveSheetFeat feat={setup} onSaved={setMessage} />}
        </div>
      )}
      <div className="seg" role="radiogroup" aria-label="Feats">
        {(
          [
            ['list', 'Library'],
            ['paste', 'Paste or upload'],
            ['create', draft ? 'Edit a copy' : 'Create a feat'],
          ] as const
        ).map(([id, name]) => (
          <button key={id} type="button" role="radio" aria-checked={tab === id} onClick={() => (setTab(id), id === 'create' || setDraft(null))}>
            {name}
          </button>
        ))}
      </div>
      {message && (
        <p className="note good" role="status">
          {message}
        </p>
      )}
      {tab === 'list' && <FeatBrowser onCopy={copy} onMessage={setMessage} />}
      {tab === 'paste' && <FeatImport onSaved={(m) => (setMessage(m), setTab('list'))} />}
      {tab === 'create' && <CreateFeat key={draft?.name ?? 'new'} initial={draft} onSaved={setMessage} />}
    </Dialog>
  );
}

/** Saves a feat read from your sheet's own text into the library, for other characters. */
function SaveSheetFeat({ feat, onSaved }: { feat: FeatDef; onSaved: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn small ghost"
      style={{ justifySelf: 'start' }}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await addFeatsToLibrary(MY_FEATS, [{ ...feat, source: MY_FEATS }], 'your sheet').catch(() => null);
        setBusy(false);
        onSaved(`${feat.name} saved to your feat library (${MY_FEATS}).`);
      }}
    >
      Also save {feat.name} to my feat library
    </button>
  );
}

// ── Browsing ─────────────────────────────────────────────────────────────────

export function FeatBrowser({ onCopy, onMessage, pageSize = 60 }: { onCopy: (f: FeatDef) => void; onMessage: (m: string) => void; pageSize?: number }) {
  const { char: c } = useChar();
  const cat = useCatalog();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [source, setSource] = useState('all');
  const [spellsOnly, setSpellsOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [taking, setTaking] = useState<string | null>(null);
  const [shown, setShown] = useState(pageSize);
  const feats = useMemo(() => [...(cat?.feats ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [cat]);
  const sources = useMemo(() => [...new Set(feats.map((f) => f.source ?? SRD))], [feats]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return feats.filter((f) => {
      if (needle && !f.name.toLowerCase().includes(needle) && !f.text.toLowerCase().includes(needle)) return false;
      if (category !== 'all' && f.category !== category) return false;
      if (source !== 'all' && (f.source ?? SRD) !== source) return false;
      if (spellsOnly && !featSpells(f)) return false;
      return true;
    }).sort((a, b) => (needle ? Number(!a.name.toLowerCase().includes(needle)) - Number(!b.name.toLowerCase().includes(needle)) : 0));
  }, [feats, q, category, source, spellsOnly]);
  const key = (f: FeatDef) => `${f.source ?? SRD}|${f.id}`;
  const onSheet = (f: FeatDef) => c.features.some((x) => norm(x.name) === norm(f.name));
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      <div className="grid-2">
        <label className="field" htmlFor="feat-q">
          <span>Search</span>
          <input id="feat-q" className="input" value={q} onChange={(e) => (setQ(e.target.value), setShown(pageSize))} placeholder="Name or rules text" />
        </label>
        <label className="field" htmlFor="feat-cat">
          <span>Kind</span>
          <select id="feat-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Every kind</option>
            {CATEGORIES.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="feat-src">
          <span>From</span>
          <select id="feat-src" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">Everywhere</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Check label="Only feats that give spells" checked={spellsOnly} onChange={setSpellsOnly} id="feat-spells-only" />
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {cat ? `${list.length} feat${list.length === 1 ? '' : 's'}` : 'Loading…'}
      </p>
      <div className="list">
        {list.slice(0, shown).map((f) => {
          const g = featSpells(f);
          const k = key(f);
          const pre = prerequisite(f);
          const mine = !!f.source && f.source !== SRD;
          return (
            <div className="item" key={k}>
              <div className="item-head">
                <button type="button" className="item-title" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                  <b>
                    {f.name}
                    {onSheet(f) ? ' ✓' : ''}
                  </b>
                  <small>{[catName(f.category), pre, g ? 'gives spells' : '', f.source ?? SRD].filter(Boolean).join(' · ')}</small>
                </button>
                <button type="button" className="cast" onClick={() => (setOpen(k), setTaking(taking === k ? null : k))} aria-expanded={taking === k}>
                  Take
                </button>
              </div>
              {open === k && (
                <div className="item-body">
                  <RulesText text={f.text.replace(/^(Origin|General|Fighting Style|Epic Boon) Feat\s*\n+/, '')} />
                  {f.abilities.length > 0 && <p className="hint" style={{ margin: 0 }}>Raises {f.abilities.length === 6 ? 'any ability' : f.abilities.map((a) => ABILITY_NAMES[a]).join(', ')} by 1.</p>}
                  {g && <p className="hint" style={{ margin: 0 }}>{describeGrants(g)}</p>}
                  {taking === k ? (
                    <TakeFeat feat={f} onDone={(m) => (onMessage(m), setTaking(null))} />
                  ) : (
                    <div className="row">
                      <button type="button" className="btn small primary" onClick={() => setTaking(k)}>
                        Take this feat
                      </button>
                      <button type="button" className="btn small ghost" onClick={() => onCopy(f)} title="Make your own version, keeping the original">
                        Copy and edit
                      </button>
                      {mine && (
                        <ConfirmButton
                          label="Remove from my library"
                          confirmLabel="Tap to remove"
                          className="btn small ghost"
                          onConfirm={async () => {
                            if (await removeLibraryFeat(f.source!, f.name).catch(() => false)) onMessage(`${f.name} removed from ${f.source}.`);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {list.length > shown && (
        <button type="button" className="btn small ghost" onClick={() => setShown((n) => n + pageSize)}>
          Show more ({list.length - shown} left)
        </button>
      )}
      <p className="hint" style={{ margin: 0 }}>
        The SRD 5.2.1 (CC-BY-4.0) has a few feats; the rest of the books’ feats aren’t free to include. Paste or upload them from your own books, or write them, and they join this library on this device.
      </p>
    </div>
  );
}

// ── Taking a feat ────────────────────────────────────────────────────────────

/** Spells that fit one "choose" part of a feat: its level, schools and class lists. */
function spellsFitting(spells: SpellDef[], ch: FeatSpells['choose'][number]) {
  return spells
    .filter((s) => s.level === ch.level && (!ch.schools.length || ch.schools.some((x) => x.toLowerCase() === s.school.toLowerCase())) && (!ch.lists.length || ch.lists.some((l) => spellForClass(s, l))))
    .map((s) => s.name)
    .filter((n, i, all) => all.indexOf(n) === i)
    .sort();
}

/** The best of INT, WIS and CHA for a sheet: its casting score, as a sensible default. */
const bestMental = (c: Character, among: Ability[] = MENTAL): Ability => [...among].sort((a, b) => c.abilities[b] - c.abilities[a])[0] ?? 'cha';

export function TakeFeat({ feat, setup = false, onDone }: { feat: FeatDef; setup?: boolean; onDone: (message: string) => void }) {
  const { char: c, update } = useChar();
  const cat = useCatalog();
  const g = featSpells(feat);
  const abilities = feat.abilities;
  const [ability, setAbility] = useState<Ability | ''>(abilities.length === 1 ? abilities[0] : abilities.length ? bestMental(c, abilities.filter((a) => MENTAL.includes(a)).length ? abilities.filter((a) => MENTAL.includes(a)) : abilities) : '');
  const [spellAbility, setSpellAbility] = useState<Ability>(typeof g?.ability === 'string' && g.ability !== 'raised' && g.ability !== 'choose' ? g.ability : bestMental(c));
  const [raise, setRaise] = useState(!setup);
  const [picks, setPicks] = useState<string[]>([]);
  const slots = (g?.choose ?? []).flatMap((ch, i) => Array.from({ length: ch.count }, (_, j) => ({ ch, key: `${i}-${j}` })));
  const onSheet = c.features.some((x) => norm(x.name) === norm(feat.name));
  const needsAbility = (raise && abilities.length > 0) || g?.ability === 'raised';
  const ready = !needsAbility || !!ability;
  const take = () => {
    const choice = { ability: ability || undefined, spellAbility, picks: picks.filter(Boolean) };
    const preview = structuredClone(c);
    const done = applyFeat(preview, feat, choice, cat?.spells ?? [], { addFeature: true, raise });
    update((d) => void applyFeat(d, feat, choice, cat?.spells ?? [], { addFeature: true, raise }));
    onDone(done.length ? `${feat.name}: ${done.join('; ')}.` : `${feat.name} is already on your sheet with its spells.`);
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {abilities.length > 0 && (
        <div className="grid-2">
          <label className="field">
            <span>{g?.ability === 'raised' ? 'Ability it raises (and casts its spells with)' : 'Ability it raises'}</span>
            <select value={ability} onChange={(e) => setAbility(e.target.value as Ability)} aria-label="Ability it raises">
              <option value="">Choose…</option>
              {abilities.map((a) => (
                <option key={a} value={a}>
                  {ABILITY_NAMES[a]} ({c.abilities[a]})
                </option>
              ))}
            </select>
          </label>
          <Check label={`Raise it by 1 now${ability ? ` (${c.abilities[ability]} → ${Math.min(feat.category === 'epic-boon' ? 30 : 20, c.abilities[ability] + 1)})` : ''}`} checked={raise} onChange={setRaise} />
        </div>
      )}
      {setup && abilities.length > 0 && <p className="hint" style={{ margin: 0 }}>Leave “Raise it by 1” off if your score already counts it (Level up and imported sheets usually do).</p>}
      {g?.ability === 'choose' && (
        <label className="field">
          <span>Its spells are cast with</span>
          <select value={spellAbility} onChange={(e) => setSpellAbility(e.target.value as Ability)} aria-label="Spellcasting ability for the feat's spells">
            {MENTAL.map((a) => (
              <option key={a} value={a}>
                {ABILITY_NAMES[a]}
              </option>
            ))}
          </select>
        </label>
      )}
      {g && g.fixed.length > 0 && <p className="hint" style={{ margin: 0 }}>You get {g.fixed.join(' and ')}.</p>}
      {slots.map(({ ch, key }, i) => {
        const options = spellsFitting(cat?.spells ?? [], ch);
        const what = `${ch.level === 0 ? 'Cantrip' : `Level ${ch.level} spell`}${ch.schools.length ? ` (${ch.schools.join(' or ')})` : ''}${ch.lists.length ? ` from the ${ch.lists.map(title).join(', ')} list` : ''}`;
        return (
          <label className="field" key={key}>
            <span>{what}</span>
            <input
              className="input"
              list={`feat-pick-${slug(feat.name)}-${key}`}
              value={picks[i] ?? ''}
              placeholder={options.length ? `Choose or type (e.g. ${options[0]})` : 'Type a spell name'}
              onChange={(e) => setPicks((p) => Object.assign([...p], { [i]: e.target.value }))}
              aria-label={what}
            />
            <datalist id={`feat-pick-${slug(feat.name)}-${key}`}>
              {options.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
        );
      })}
      {onSheet && !setup && <p className="hint" style={{ margin: 0 }}>{feat.name} is already in your features: taking it again adds only what’s missing.</p>}
      <div className="row">
        <button type="button" className="btn small primary" disabled={!ready} onClick={take}>
          {setup ? `Add ${feat.name}’s spells` : `Take ${feat.name}`}
        </button>
        {!ready && <span className="hint">Choose the ability first.</span>}
      </div>
    </div>
  );
}

// ── Pasting and uploading ────────────────────────────────────────────────────

export function FeatImport({ onSaved }: { onSaved: (message: string) => void }) {
  const [text, setText] = useState('');
  const [packName, setPackName] = useState(MY_FEATS);
  const [origin, setOrigin] = useState('pasted text');
  const [found, setFound] = useState<FeatDef[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const read = (raw: string, from: string) => {
    const feats = readFeatText(raw, packName);
    setFound(feats);
    setSkip(new Set());
    setOrigin(from);
    setEditing(null);
    setError(feats.length ? '' : 'No feats were found. Put each feat’s name on its own line, then its kind (“General Feat (Prerequisite: Level 4+)”) or its description; for other layouts, use the AI prompt below.');
  };
  const chosen = found?.filter((_, i) => !skip.has(i)) ?? [];
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      <label className="field" htmlFor="feat-pack">
        <span>Save them in your library as</span>
        <input id="feat-pack" className="input" value={packName} onChange={(e) => setPackName(e.target.value)} placeholder={MY_FEATS} />
      </label>
      <label className="field" htmlFor="feat-paste">
        <span>Paste feats (one or many), or upload a document below</span>
        <textarea
          id="feat-paste"
          className="input"
          style={{ minHeight: 160 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Shadow-Touched\nGeneral Feat (Prerequisite: Level 4+)\nIncrease your Intelligence, Wisdom, or Charisma score by 1…\nYou learn the Invisibility spell and one level 1 spell of your choice…'}
        />
      </label>
      <div className="row">
        <button type="button" className="btn small primary" disabled={!text.trim()} onClick={() => read(text, 'pasted text')}>
          Read the feats
        </button>
        <label className="btn small ghost" htmlFor="feat-file" style={{ cursor: 'pointer' }}>
          Upload a document (PDF, Word, text)
        </label>
        <input
          id="feat-file"
          type="file"
          accept=".pdf,.docx,.odt,.txt,.md,.html,.htm,.rtf,.json,application/pdf"
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
            Found {found.length} feat{found.length === 1 ? '' : 's'} in {origin}
          </b>
          <div className="list">
            {found.map((f, i) => {
              const g = featSpells(f);
              return (
                <div className="item" key={`${f.name}-${i}`}>
                  <div className="item-head">
                    <label className="row" style={{ gap: 6, padding: '6px 10px', flex: 1 }}>
                      <input type="checkbox" checked={!skip.has(i)} onChange={() => setSkip((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])))} aria-label={`Include ${f.name}`} />
                      <span>
                        <b>{f.name}</b>{' '}
                        <small className="hint">{[catName(f.category), prerequisite(f), f.abilities.length ? `+1 ${f.abilities.length === 6 ? 'any' : f.abilities.map((a) => a.toUpperCase()).join('/')}` : '', g ? describeGrants(g) : ''].filter(Boolean).join(' · ')}</small>
                      </span>
                    </label>
                    <button type="button" className="btn small ghost" onClick={() => setEditing(editing === i ? null : i)} aria-expanded={editing === i}>
                      {editing === i ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  {editing === i && (
                    <div className="item-body">
                      <FeatForm value={f} onChange={(next) => setFound((all) => all && all.map((x, j) => (j === i ? next : x)))} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="row">
            <button
              type="button"
              className="btn small primary"
              disabled={!chosen.length || !packName.trim()}
              onClick={async () => {
                try {
                  const r = await addFeatsToLibrary(packName.trim(), chosen, origin);
                  setFound(null);
                  setText('');
                  onSaved(`${r.added} feat${r.added === 1 ? '' : 's'} added to ${packName.trim()}${r.replaced ? ` (${r.replaced} updated)` : ''}. Find them in the Library tab, ready to take.`);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              Save {chosen.length} to my library
            </button>
          </div>
        </div>
      )}

      <button type="button" className="btn small ghost" style={{ justifySelf: 'start' }} onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt}>
        {showPrompt ? 'Hide' : 'Show'} the AI prompt (for layouts the reader misses)
      </button>
      {showPrompt && (
        <div className="note" style={{ display: 'grid', gap: 6 }}>
          <span className="hint">Give this to an AI chat with your feats pasted after it, then paste its JSON answer above and read it.</span>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{FEATS_AI_PROMPT}</pre>
          <button type="button" className="btn small" style={{ justifySelf: 'start' }} onClick={() => void navigator.clipboard?.writeText(FEATS_AI_PROMPT)}>
            Copy the prompt
          </button>
        </div>
      )}
    </div>
  );
}

// ── Writing one ──────────────────────────────────────────────────────────────

const blankFeat = (): FeatDef => ({ id: '', name: '', category: 'general', repeatable: false, minLevel: 1, abilities: [], text: '', source: MY_FEATS });

/** Splits a feat's text into its prerequisite line and the rest, and puts them back. */
const splitText = (text: string) => {
  const m = /^Prerequisites?:\s*(.+)\n*/.exec(text);
  return { pre: m?.[1]?.trim() ?? '', body: m ? text.slice(m[0].length) : text };
};
const joinText = (pre: string, body: string) => [pre.trim() ? `Prerequisite: ${pre.trim()}` : '', body.trim()].filter(Boolean).join('\n\n');

/** Every part of a feat, to write or change: what it is, what it raises, and the spells it gives. */
export function FeatForm({ value: f, onChange }: { value: FeatDef; onChange: (f: FeatDef) => void }) {
  const cat = useCatalog();
  const { pre, body } = splitText(f.text);
  const set = (patch: Partial<FeatDef>) => onChange({ ...f, ...patch });
  const g = f.spells ?? null;
  const setSpells = (next: FeatSpells | null) => onChange({ ...f, spells: next ?? undefined });
  const classes = [...new Set([...CASTERS, ...(cat?.classes ?? []).map((k) => k.id.split(':').pop()!)])];
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="grid-2">
        <label className="field">
          <span>Name</span>
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Shadow-Touched" aria-label="Feat name" />
        </label>
        <label className="field">
          <span>Kind</span>
          <select value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Kind of feat">
            {CATEGORIES.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Prerequisite</span>
          <input
            className="input"
            value={pre}
            placeholder="Level 4+"
            onChange={(e) => set({ text: joinText(e.target.value, body), minLevel: Number(/level\s*(\d+)/i.exec(e.target.value)?.[1] ?? f.minLevel) })}
            aria-label="Prerequisite"
          />
        </label>
        <label className="field">
          <span>Lowest level to take it</span>
          <input className="input" type="number" min={1} max={20} value={f.minLevel} onChange={(e) => set({ minLevel: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} aria-label="Lowest level" />
        </label>
      </div>
      <label className="field">
        <span>What it does</span>
        <textarea className="input" style={{ minHeight: 140 }} value={body} onChange={(e) => set({ text: joinText(pre, e.target.value) })} aria-label="What the feat does" />
      </label>
      <div className="row">
        <button
          type="button"
          className="btn small"
          disabled={!body.trim()}
          onClick={() => onChange({ ...f, abilities: abilitiesFromText(body), repeatable: f.repeatable || /\brepeatable\b/i.test(body), spells: featSpellsFromText(body) ?? undefined })}
          title="Fill in the ability increase and spells below from the description"
        >
          Fill in from the description
        </button>
        <Check label="Repeatable" checked={f.repeatable} onChange={(b) => set({ repeatable: b })} />
      </div>
      <fieldset className="fieldset">
        <legend>Ability increase (+1, choose one when taking it)</legend>
        <div className="chips">
          {ABILITIES.map((a) => (
            <button key={a} type="button" className="chip" aria-pressed={f.abilities.includes(a)} onClick={() => set({ abilities: ABILITIES.filter((x) => (x === a ? !f.abilities.includes(a) : f.abilities.includes(x))) })}>
              {ABILITY_NAMES[a]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Spells it gives</legend>
        <Check label="This feat gives spells" checked={!!g} onChange={(b) => setSpells(b ? { fixed: [], choose: [], freeCast: true, ability: f.abilities.length ? 'raised' : 'choose' } : null)} />
        {g && (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field">
              <span>Spells it always gives (comma between them)</span>
              <input
                className="input"
                defaultValue={g.fixed.join(', ')}
                placeholder="Invisibility"
                onBlur={(e) => setSpells({ ...g, fixed: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                aria-label="Spells it always gives"
              />
            </label>
            {g.choose.map((ch, i) => {
              const put = (patch: Partial<typeof ch>) => setSpells({ ...g, choose: g.choose.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <div className="note" key={i} style={{ display: 'grid', gap: 6 }}>
                  <div className="row">
                    <span>You choose</span>
                    <input className="input" type="number" min={1} max={6} value={ch.count} style={{ width: 60 }} onChange={(e) => put({ count: Math.max(1, Number(e.target.value) || 1) })} aria-label="How many" />
                    <select value={ch.level} onChange={(e) => put({ level: Number(e.target.value) })} aria-label="Spell level">
                      {Array.from({ length: 10 }, (_, l) => (
                        <option key={l} value={l}>
                          {l === 0 ? 'cantrip(s)' : `level ${l} spell(s)`}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn small ghost" onClick={() => setSpells({ ...g, choose: g.choose.filter((_, j) => j !== i) })}>
                      Remove
                    </button>
                  </div>
                  <span className="hint">From these schools (none: any school)</span>
                  <div className="chips">
                    {SCHOOLS.map((s) => (
                      <button key={s} type="button" className="chip" aria-pressed={ch.schools.includes(s)} onClick={() => put({ schools: toggle(ch.schools, s) })}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <span className="hint">From these class lists (none: any list)</span>
                  <div className="chips">
                    {classes.map((k) => (
                      <button key={k} type="button" className="chip" aria-pressed={ch.lists.includes(k)} onClick={() => put({ lists: toggle(ch.lists, k) })}>
                        {title(k)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <button type="button" className="btn small ghost" style={{ justifySelf: 'start' }} onClick={() => setSpells({ ...g, choose: [...g.choose, { count: 1, level: 1, schools: [], lists: [] }] })}>
              Add a spell you choose
            </button>
            <Check label="Each can be cast once per Long Rest without a spell slot" checked={g.freeCast} onChange={(b) => setSpells({ ...g, freeCast: b })} />
            <label className="field">
              <span>Their spellcasting ability</span>
              <select value={g.ability} onChange={(e) => setSpells({ ...g, ability: e.target.value as FeatSpells['ability'] })} aria-label="Spellcasting ability for its spells">
                <option value="raised">The ability this feat raises</option>
                <option value="choose">Intelligence, Wisdom or Charisma (chosen when taken)</option>
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    Always {ABILITY_NAMES[a]}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint" style={{ margin: 0 }}>{describeGrants(g)}</p>
          </div>
        )}
      </fieldset>
    </div>
  );
}

function CreateFeat({ initial, onSaved }: { initial: FeatDef | null; onSaved: (m: string) => void }) {
  const cat = useCatalog();
  const [f, setF] = useState<FeatDef>(initial ?? blankFeat());
  const [packName, setPackName] = useState(initial?.source && initial.source !== SRD ? initial.source : MY_FEATS);
  const [saved, setSaved] = useState<FeatDef | null>(null);
  const [error, setError] = useState('');
  const clash = (cat?.feats ?? []).find((x) => norm(x.name) === norm(f.name) && (x.source ?? SRD) !== packName.trim());
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      {initial && <p className="hint" style={{ margin: 0 }}>A copy: change anything, then save it under its own name. The original stays as it was.</p>}
      <FeatForm value={f} onChange={(next) => (setF(next), setSaved(null))} />
      <label className="field" htmlFor="feat-create-pack">
        <span>Save it in your library as</span>
        <input id="feat-create-pack" className="input" value={packName} onChange={(e) => setPackName(e.target.value)} placeholder={MY_FEATS} />
      </label>
      {clash && <p className="hint" style={{ color: 'var(--warn)', margin: 0 }}>{clash.source ?? SRD} already has a feat called {clash.name}. Both will be listed; a different name keeps them apart on your sheet.</p>}
      {error && <p className="hint" style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      <div className="row">
        <button
          type="button"
          className="btn small primary"
          disabled={!f.name.trim() || !f.text.trim() || !packName.trim()}
          onClick={async () => {
            try {
              const def = { ...f, name: f.name.trim(), source: packName.trim() };
              const r = await addFeatsToLibrary(packName.trim(), [def], 'written on the sheet');
              setSaved({ ...def, id: `${slug(packName.trim())}:${slug(def.name)}` });
              onSaved(`${def.name} ${r.replaced ? 'updated in' : 'saved to'} ${packName.trim()}.`);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          Save to my library
        </button>
        {!f.text.trim() && <span className="hint">Give it a name and a description.</span>}
      </div>
      {saved && (
        <div className="note good" style={{ display: 'grid', gap: 8 }}>
          <b>Take {saved.name} now?</b>
          <TakeFeat feat={saved} onDone={onSaved} />
        </div>
      )}
    </div>
  );
}

/** The Feat library tile: every feat, to read, take, copy and change. */
export function FeatLibraryPanel() {
  const [dialog, setDialog] = useState<Tab | null>(null);
  const [copyOf, setCopyOf] = useState<FeatDef | undefined>();
  const [message, setMessage] = useState('');
  return (
    <Panel
      title="Feat library"
      tab="stats"
      actions={
        <>
          <button type="button" className="btn small" onClick={() => setDialog('paste')}>
            Import feats
          </button>
          <button type="button" className="btn small" onClick={() => (setCopyOf(undefined), setDialog('create'))}>
            Create
          </button>
        </>
      }
    >
      {message && (
        <p className="note good" role="status" style={{ marginTop: 0 }}>
          {message}
        </p>
      )}
      <FeatBrowser pageSize={30} onMessage={setMessage} onCopy={(f) => (setCopyOf(f), setDialog('create'))} />
      {dialog && <FeatLibraryDialog start={dialog} copyOf={copyOf} onClose={() => (setDialog(null), setCopyOf(undefined))} />}
    </Panel>
  );
}
