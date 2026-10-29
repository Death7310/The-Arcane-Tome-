import { useRef, useState } from 'react';
import { fx, perform, sound, centerOf } from '../fx';
import { ELEMENTS, type FxLevel, type Shape } from '../fx/types';
import { applyUpdate, install, requestPersist, usePwa } from '../state/pwa';
import { downloadText, makeBackup, parseImport, type MergeResult, type Settings } from '../state/storage';
import { blankCharacter, uid, type Character } from '../systems/dnd5e/model';
import { classSummary } from '../systems/dnd5e/rules';
import { sampleCharacter } from '../systems/dnd5e/sample';
import { Check, ConfirmButton, Dialog, SelectField } from './ui';

export function CharactersDialog(props: {
  characters: Character[];
  currentId: string;
  onSwitch: (id: string) => void;
  onAdd: (c: Character) => void;
  onDelete: (id: string) => void;
  onRestore: (characters: Character[]) => MergeResult;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'list' | 'import' | 'export'>('list');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = props.characters.find((c) => c.id === props.currentId)!;
  const exportJson = JSON.stringify(current, null, 2);

  const importText = (raw: string) => {
    try {
      const r = props.onRestore(parseImport(raw));
      setNotice(restoreSummary(r));
      setText('');
      setError('');
      setMode('list');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog title="Characters" onClose={props.onClose}>
      <div className="seg" role="group" aria-label="Character tools" style={{ marginBottom: 12 }}>
        {(['list', 'import', 'export'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => (setMode(m), setError(''), setNotice(''))}>
            {m === 'list' ? 'My characters' : m === 'import' ? 'Import' : 'Export'}
          </button>
        ))}
      </div>

      {mode === 'list' && (
        <>
          {notice && <p className="hint" style={{ color: 'var(--good)', marginTop: 0 }}>{notice}</p>}
          <div className="lib">
            {props.characters.map((c) => (
              <div key={c.id} className="item" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, padding: '8px 10px', alignItems: 'center' }}>
                <button type="button" className="item-title" onClick={() => (props.onSwitch(c.id), props.onClose())}>
                  <b>
                    {c.name || 'Unnamed'}
                    {c.id === props.currentId ? ' · open' : ''}
                    {c.isExample ? ' · example' : ''}
                  </b>
                  <small>
                    {[c.species, classSummary(c)].filter(Boolean).join(' · ')}
                  </small>
                </button>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button type="button" className="btn small ghost" onClick={() => props.onAdd({ ...structuredClone(c), id: uid(), name: `${c.name} (copy)`, isExample: false })}>
                    Copy
                  </button>
                  {props.characters.length > 1 && <ConfirmButton label="Delete" confirmLabel="Delete?" onConfirm={() => props.onDelete(c.id)} />}
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary" onClick={() => (props.onAdd(blankCharacter()), props.onClose())}>
              New character
            </button>
            <button type="button" className="btn" onClick={() => (props.onAdd(sampleCharacter()), props.onClose())}>
              New from the example
            </button>
          </div>
          <p className="hint">Characters are saved in this browser only. Export them to keep a backup or move them to another device.</p>
        </>
      )}

      {mode === 'import' && (
        <>
          <p className="hint">Choose a backup or an exported character (.json), or paste its contents. If a character is already here, whichever copy was edited most recently is kept.</p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            id="import-file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importText(await f.text());
            }}
          />
          <textarea className="input" style={{ marginTop: 10 }} id="import-text" aria-label="Character JSON" value={text} placeholder='{"name": "…"}' onChange={(e) => setText(e.target.value)} />
          {error && <p className="hint" style={{ color: 'var(--bad)' }}>{error}</p>}
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => importText(text)}>
              Import
            </button>
          </div>
        </>
      )}

      {mode === 'export' && (
        <>
          <p className="hint">{current.name}: copy this text and keep it somewhere safe, or download it as a file.</p>
          <textarea className="input" readOnly id="export-text" aria-label="Exported character" value={exportJson} onFocus={(e) => e.currentTarget.select()} />
          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                navigator.clipboard?.writeText(exportJson).then(
                  () => (setCopied(true), setTimeout(() => setCopied(false), 2000)),
                  () => (document.getElementById('export-text') as HTMLTextAreaElement | null)?.select(),
                );
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="btn" onClick={() => downloadText(`${(current.name || 'character').replace(/[^\w-]+/g, '_')}.json`, exportJson)}>
              Download file
            </button>
          </div>
          <p className="hint">If Download does nothing (some embedded viewers block it), use Copy.</p>
        </>
      )}
    </Dialog>
  );
}

const SHOWCASE: { el: (typeof ELEMENTS)[number]['id']; shape: Shape; power: number }[] = [
  { el: 'fire', shape: 'burst', power: 3 },
  { el: 'lightning', shape: 'line', power: 3 },
  { el: 'cold', shape: 'ray', power: 1 },
  { el: 'thunder', shape: 'burst', power: 2 },
  { el: 'acid', shape: 'bolt', power: 1 },
  { el: 'poison', shape: 'cone', power: 1 },
  { el: 'necrotic', shape: 'touch', power: 2 },
  { el: 'radiant', shape: 'rain', power: 2 },
  { el: 'force', shape: 'bolt', power: 1 },
  { el: 'psychic', shape: 'bolt', power: 1 },
  { el: 'healing', shape: 'aura', power: 1 },
  { el: 'slashing', shape: 'touch', power: 0 },
  { el: 'piercing', shape: 'bolt', power: 0 },
  { el: 'bludgeoning', shape: 'touch', power: 0 },
  { el: 'arcane', shape: 'aura', power: 1 },
  { el: 'shadow', shape: 'cone', power: 1 },
  { el: 'nature', shape: 'burst', power: 1 },
];

const restoreSummary = (r: MergeResult): string =>
  [r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.kept && `${r.kept} already up to date`].filter(Boolean).join(', ') || 'Nothing to import.';

function ago(t: number): string {
  const days = Math.floor((Date.now() - t) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

function OfflineSection(props: { characters: Character[]; settings: Settings; onChange: (s: Settings) => void; onRestore: (c: Character[]) => MergeResult }) {
  const pwa = usePwa();
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const last = props.settings.lastBackupAt;
  return (
    <>
      <h3 style={{ margin: 0 }}>Offline &amp; backups</h3>
      {pwa.mode === 'pwa' ? (
        <p className="hint" style={{ margin: 0, color: pwa.offlineReady ? 'var(--good)' : undefined }}>
          {pwa.offlineReady ? 'Ready to work offline on this device. No internet needed after this.' : 'Saving the app for offline use…'}
        </p>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          You are running the single-file version. It works offline as long as you keep the file; open it from the same place each time so your saves are found.
        </p>
      )}
      {pwa.mode === 'pwa' &&
        (pwa.installed ? (
          <p className="hint" style={{ margin: 0 }}>Installed as an app.</p>
        ) : pwa.canInstall ? (
          <button type="button" className="btn primary" onClick={() => void install()}>
            Install Arcane Tome as an app
          </button>
        ) : pwa.ios ? (
          <p className="hint" style={{ margin: 0 }}>
            To install on iPhone or iPad: open this page in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. Installed, Safari keeps your saves; as a plain website it can clear them after 7 days without a visit.
          </p>
        ) : (
          <p className="hint" style={{ margin: 0 }}>To install, use your browser's <b>Install app</b> option (address bar or menu).</p>
        ))}
      {pwa.needRefresh && (
        <button type="button" className="btn" onClick={applyUpdate}>
          Update to the new version
        </button>
      )}
      {pwa.persisted === false && (
        <div className="row">
          <button type="button" className="btn small" onClick={() => void requestPersist().then((ok) => setMsg(ok ? 'Your browser will keep this data.' : 'Your browser decided for itself; installing the app usually makes it agree.'))}>
            Ask the browser to keep my data
          </button>
        </div>
      )}
      {pwa.persisted && <p className="hint" style={{ margin: 0 }}>Storage is protected: the browser won't clear it to free space.</p>}
      <p className="hint" style={{ margin: 0 }}>
        Characters live only on this device. Last backup: <b>{last ? ago(last) : 'never'}</b>.
      </p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const stamp = new Date().toISOString().slice(0, 10);
            if (downloadText(`arcane-tome-backup-${stamp}.json`, JSON.stringify(makeBackup(props.characters), null, 2))) {
              props.onChange({ ...props.settings, lastBackupAt: Date.now() });
              setMsg(`Backed up ${props.characters.length} character${props.characters.length === 1 ? '' : 's'}.`);
            } else setMsg('This viewer blocks downloads. Use Characters → Export → Copy instead.');
          }}
        >
          Back up all characters
        </button>
        <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
          Restore from a backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          id="restore-file"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setMsg(`Restored: ${restoreSummary(props.onRestore(parseImport(await f.text())))}.`);
            } catch (err) {
              setMsg((err as Error).message);
            }
          }}
        />
      </div>
      {msg && <p className="hint" style={{ margin: 0 }} role="status">{msg}</p>}
    </>
  );
}

export function SettingsDialog(props: { settings: Settings; characters: Character[]; onChange: (s: Settings) => void; onRestore: (c: Character[]) => MergeResult; onClose: () => void }) {
  const s = props.settings;
  const set = (patch: Partial<Settings>) => props.onChange({ ...s, ...patch });
  return (
    <Dialog title="Settings" onClose={props.onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <OfflineSection characters={props.characters} settings={s} onChange={props.onChange} onRestore={props.onRestore} />
        <h3 style={{ margin: '8px 0 0' }}>Effects &amp; sound</h3>
        <SelectField<FxLevel>
          label="Animations"
          id="set-fx"
          value={s.fx}
          options={[
            { id: 'full', name: 'Full' },
            { id: 'reduced', name: 'Reduced (fewer particles, no shaking or flashes)' },
            { id: 'off', name: 'Off' },
          ]}
          onChange={(v) => set({ fx: v })}
        />
        <Check label="Allow screen flashes (lightning, big explosions)" id="set-flash" checked={s.flashes} onChange={(b) => set({ flashes: b })} />
        <p className="hint" style={{ margin: 0 }}>
          Flashes are limited to two per effect and kept dim, below the WCAG three-flashes-per-second threshold. Turn them off if bright flashes bother you.
        </p>
        <Check label="Sound effects" id="set-sound" checked={s.sound} onChange={(b) => set({ sound: b })} />
        <label className="field" htmlFor="set-volume">
          <span>Volume</span>
          <input id="set-volume" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
        </label>
        <SelectField
          label="Theme"
          id="set-theme"
          value={s.theme}
          options={[
            { id: 'system', name: 'Match my device' },
            { id: 'dark', name: 'Dark' },
            { id: 'light', name: 'Light' },
          ]}
          onChange={(v) => set({ theme: v })}
        />
        <h3 style={{ margin: 0 }}>Try every effect</h3>
        <div className="actions-grid">
          {SHOWCASE.map((x) => (
            <button
              key={x.el}
              type="button"
              className={`cast el-${x.el}`}
              onClick={(e) => {
                const from = centerOf(e.currentTarget);
                perform({ element: x.el, shape: x.shape, from, to: x.shape === 'touch' ? undefined : fx.defaultTarget(from), power: x.power, outcome: 'hit', label: ELEMENTS.find((q) => q.id === x.el)!.name });
              }}
            >
              {ELEMENTS.find((q) => q.id === x.el)!.name}
            </button>
          ))}
        </div>
        <button type="button" className="btn small ghost" onClick={() => sound.dice(3)}>
          Test dice sound
        </button>
        <p className="hint" style={{ margin: 0 }} id="app-version">
          Arcane Tome {__APP_VERSION__} · built {__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC
        </p>
      </div>
    </Dialog>
  );
}
