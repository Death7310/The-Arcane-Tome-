import { useEffect, useRef, useState } from 'react';
import { fx, perform, sound, centerOf, type DiceSpeed } from '../fx';
import { ELEMENTS, type FxLevel, type Shape } from '../fx/types';
import { applyUpdate, install, requestPersist, usePwa } from '../state/pwa';
import { isNative, saveFileToDevice, shareFile } from '../state/native';
import { downloadText, makeBackup, parseImport, type MergeResult, type SavePoint, type Settings } from '../state/storage';
import { blankCharacter, uid, type Character } from '../systems/dnd5e/model';
import { classSummary, maxHp, totalLevel } from '../systems/dnd5e/rules';
import { sampleCharacter } from '../systems/dnd5e/sample';
import { ImportCharacter } from './ImportCharacter';
import { Check, ConfirmButton, Dialog, SelectField } from './ui';

export function CharactersDialog(props: {
  characters: Character[];
  currentId: string;
  onSwitch: (id: string) => void;
  onAdd: (c: Character) => void;
  onDelete: (id: string) => void;
  onRestore: (characters: Character[]) => MergeResult;
  savePoints: SavePoint[];
  onMakeSavePoint: (name: string) => void;
  onLoadSavePoint: (id: string) => void;
  onDeleteSavePoint: (id: string) => void;
  onClose: () => void;
  initialMode?: 'list' | 'saves' | 'import' | 'export';
}) {
  const [mode, setMode] = useState<'list' | 'saves' | 'import' | 'export'>(props.initialMode ?? 'list');
  const [pointName, setPointName] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const current = props.characters.find((c) => c.id === props.currentId)!;
  const exportJson = JSON.stringify(current, null, 2);

  return (
    <Dialog title="Characters" onClose={props.onClose}>
      <div className="seg" role="group" aria-label="Character tools" style={{ marginBottom: 12 }}>
        {(['list', 'saves', 'import', 'export'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => (setMode(m), setNotice(''))}>
            {m === 'list' ? 'Characters' : m === 'saves' ? 'Save points' : m === 'import' ? 'Import' : 'Export'}
          </button>
        ))}
      </div>

      {mode === 'saves' && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            Your sheet saves itself as you go. A save point is a copy of <b>{current.name || 'this character'}</b> you can come back to, like a save slot in a game. The Save button at the top makes one; loading one first saves where you are now, so you can always undo it.
          </p>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              props.onMakeSavePoint(pointName.trim() || `Saved ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
              setPointName('');
            }}
          >
            <input className="input" style={{ flex: 1, minWidth: 0 }} id="save-point-name" value={pointName} placeholder="Name it, e.g. Before the dragon" onChange={(e) => setPointName(e.target.value)} aria-label="Save point name" />
            <button type="submit" className="btn primary">
              Make a save point
            </button>
          </form>
          <div className="lib">
            {props.savePoints
              .filter((p) => p.characterId === current.id)
              .map((p) => (
                <div key={p.id} className="item" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, padding: '8px 10px', alignItems: 'center' }}>
                  <span className="item-title">
                    <b>{p.name}</b>
                    <small>
                      {new Date(p.createdAt).toLocaleString()} · Level {totalLevel(p.data)} · {p.data.hp.current}/{maxHp(p.data).total} HP
                    </small>
                  </span>
                  <span className="row" style={{ flexWrap: 'nowrap' }}>
                    <ConfirmButton label="Load" confirmLabel="Load it?" onConfirm={() => (props.onLoadSavePoint(p.id), setNotice(`Loaded “${p.name}”.`), setMode('list'))} />
                    <ConfirmButton label="Delete" confirmLabel="Delete?" onConfirm={() => props.onDeleteSavePoint(p.id)} />
                  </span>
                </div>
              ))}
            {!props.savePoints.some((p) => p.characterId === current.id) && <p className="hint">No save points yet.</p>}
          </div>
        </>
      )}

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
            <button type="button" className="btn" onClick={() => setMode('import')}>
              Import from a document
            </button>
            <button type="button" className="btn ghost" onClick={() => (props.onAdd(sampleCharacter()), props.onClose())}>
              New from the example
            </button>
          </div>
          <p className="hint">Characters are saved in this browser only. Export them to keep a backup or move them to another device.</p>
        </>
      )}

      {mode === 'import' && (
        <ImportCharacter
          onCreate={(c) => props.onAdd({ ...c, isExample: false })}
          onRestore={props.onRestore}
          onDone={(message) => {
            setNotice(message);
            setMode('list');
          }}
        />
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

const backupName = () => `arcane-tome-backup-${new Date().toISOString().slice(0, 10)}.json`;
const backupJson = (characters: Character[]) => JSON.stringify(makeBackup(characters), null, 2);

/** Offered in the browser when the site has an Android build to download. */
function AndroidAppLink() {
  const [available, setAvailable] = useState(false);
  const pwa = usePwa();
  useEffect(() => {
    // Only the website carries the APK; the single file and the app itself don't.
    if (pwa.ios || pwa.mode !== 'pwa') return;
    fetch('arcane-tome.apk', { method: 'HEAD' })
      .then((r) => setAvailable(r.ok))
      .catch(() => setAvailable(false));
  }, [pwa.ios, pwa.mode]);
  if (!available) return null;
  return (
    <p className="hint" style={{ margin: 0 }}>
      On Android you can also get it as a regular app:{' '}
      <a href="arcane-tome.apk" download>
        Download the Android app (APK)
      </a>
      . Android will ask you to allow installing apps from your browser the first time.
    </p>
  );
}

function OfflineSection(props: { characters: Character[]; settings: Settings; onChange: (s: Settings) => void; onRestore: (c: Character[]) => MergeResult }) {
  const pwa = usePwa();
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const last = props.settings.lastBackupAt;
  return (
    <>
      <h3 style={{ margin: 0 }}>Offline &amp; backups</h3>
      {pwa.mode === 'native' ? (
        <p className="hint" style={{ margin: 0, color: 'var(--good)' }}>
          You're using the Android app. It works fully offline and saves to a file in its own storage on your phone.
        </p>
      ) : pwa.mode === 'pwa' ? (
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
      {pwa.mode !== 'native' && <AndroidAppLink />}
      {pwa.mode !== 'native' && pwa.persisted === false && (
        <div className="row">
          <button type="button" className="btn small" onClick={() => void requestPersist().then((ok) => setMsg(ok ? 'Your browser will keep this data.' : 'Your browser decided for itself; installing the app usually makes it agree.'))}>
            Ask the browser to keep my data
          </button>
        </div>
      )}
      {pwa.mode !== 'native' && pwa.persisted && <p className="hint" style={{ margin: 0 }}>Storage is protected: the browser won't clear it to free space.</p>}
      <p className="hint" style={{ margin: 0 }}>
        Characters live only on this device. Last backup: <b>{last ? ago(last) : 'never'}</b>.
      </p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const r = await saveFileToDevice(backupName(), backupJson(props.characters));
            if (r.ok) props.onChange({ ...props.settings, lastBackupAt: Date.now() });
            setMsg(r.message);
          }}
        >
          {isNative() ? 'Save a backup to my phone' : 'Save a backup file'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const r = await shareFile(backupName(), backupJson(props.characters));
            if (r.ok && r.message === 'Shared.') props.onChange({ ...props.settings, lastBackupAt: Date.now() });
            setMsg(r.message);
          }}
        >
          Share a backup…
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

export function SettingsDialog(props: {
  settings: Settings;
  characters: Character[];
  onChange: (s: Settings) => void;
  onRestore: (c: Character[]) => MergeResult;
  onArrange: () => void;
  onClose: () => void;
}) {
  const s = props.settings;
  const set = (patch: Partial<Settings>) => props.onChange({ ...s, ...patch });
  return (
    <Dialog title="Settings" onClose={props.onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <OfflineSection characters={props.characters} settings={s} onChange={props.onChange} onRestore={props.onRestore} />
        <h3 style={{ margin: '8px 0 0' }}>Layout</h3>
        <p className="hint" style={{ margin: 0 }}>
          Move, resize and fold the panels the way you like them. The layout is kept on this device, so a phone and a laptop can each have their own.
        </p>
        <span className="row">
          <button type="button" className="btn small" onClick={props.onArrange}>
            Arrange panels
          </button>
          <button type="button" className="btn small ghost" disabled={!s.layout} onClick={() => set({ layout: null })}>
            Reset layout
          </button>
        </span>
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
        <SelectField<DiceSpeed>
          label="Rolling dice"
          id="set-dice"
          value={s.diceSpeed}
          options={[
            { id: 'full', name: 'Full roll (about 1½ seconds)' },
            { id: 'quick', name: 'Quick roll' },
            { id: 'off', name: 'Off: show results at once' },
          ]}
          onChange={(v) => set({ diceSpeed: v })}
        />
        <Check
          label="Count attacks and spells up hit by hit (a weapon strikes each die; a spell's dice burst one by one)"
          id="set-tally"
          checked={s.tally}
          onChange={(b) => set({ tally: b })}
        />
        <p className="hint" style={{ margin: 0 }}>
          Tap anywhere, or press Escape, to skip straight to a roll’s result.
        </p>
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
