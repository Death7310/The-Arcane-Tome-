import { FairnessCheck } from './Fairness';
import { useEffect, useRef, useState } from 'react';
import { fx, perform, performCondition, sound, centerOf, type DiceSpeed } from '../fx';
import { ELEMENTS, type FxLevel, type Shape } from '../fx/types';
import { CONDITIONS } from '../systems/dnd5e/data';
import { applyUpdate, install, requestPersist, usePwa } from '../state/pwa';
import { deviceWord, isMacApp, isMacBrowser, isNative, platform, saveFileToDevice, shareFile } from '../state/native';
import { isDefault, normalizeLayout, resetLayout } from '../state/layout';
import { listPacks, restoreLibrary } from '../state/library';
import { downloadText, makeBackup, parseImport, type MergeResult, type SavePoint, type Settings } from '../state/storage';
import { blankCharacter, uid, type Character } from '../systems/dnd5e/model';
import { classSummary, maxHp, totalLevel } from '../systems/dnd5e/rules';
import { anaurysCharacter } from '../systems/dnd5e/anaurys';
import { sampleCharacter } from '../systems/dnd5e/sample';
import { SRD_CREDIT } from '../systems/dnd5e/srd';
import { ImportCharacter } from './ImportCharacter';
import { GameStatesPanel } from './GameStates';
import { GAME_STATE_FORMAT, readGameState, type GameState } from '../systems/dnd5e/gamestate';
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
  gameStates: GameState[];
  onSaveGameState: (name: string) => void;
  onLoadGameState: (id: string) => string[];
  onDeleteGameState: (id: string) => void;
  onImportGameState: (g: GameState) => void;
  onClose: () => void;
  initialMode?: 'list' | 'saves' | 'game' | 'import' | 'export';
}) {
  const [mode, setMode] = useState<'list' | 'saves' | 'game' | 'import' | 'export'>(props.initialMode ?? 'list');
  const [pointName, setPointName] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const current = props.characters.find((c) => c.id === props.currentId)!;
  const addReady = async (make: () => Character | Promise<Character>) => {
    setPreparing(true);
    try {
      props.onAdd(await make());
      props.onClose();
    } catch (e) {
      setNotice(`Couldn't set that character up (${(e as Error).message}).`);
    } finally {
      setPreparing(false);
    }
  };
  const exportJson = JSON.stringify(current, null, 2);

  return (
    <Dialog title="Characters" onClose={props.onClose}>
      <div className="seg" role="group" aria-label="Character tools" style={{ marginBottom: 12 }}>
        {(['list', 'saves', 'game', 'import', 'export'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => (setMode(m), setNotice(''))}>
            {m === 'list' ? 'Characters' : m === 'saves' ? 'Save points' : m === 'game' ? 'Game states' : m === 'import' ? 'Import' : 'Export'}
          </button>
        ))}
      </div>

      {mode === 'game' && (
        <GameStatesPanel
          current={current}
          gameStates={props.gameStates}
          onSave={props.onSaveGameState}
          onLoad={props.onLoadGameState}
          onDelete={props.onDeleteGameState}
          onImport={props.onImportGameState}
        />
      )}

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
          </div>
          <h3 style={{ margin: '14px 0 6px' }}>Ready-made characters</h3>
          <div className="lib">
            {[
              { key: 'anaurys', name: 'Anaurys', about: 'Aasimar · Ranger (Drakewarden) 4 / Warlock 2, with Artex the drake', make: anaurysCharacter },
              { key: 'seraphine', name: 'Seraphine Vale', about: 'Example · Aasimar · Sorcerer 5', make: sampleCharacter },
            ].map((r) => (
              <button
                key={r.key}
                type="button"
                className="item item-title"
                disabled={preparing}
                onClick={() => void addReady(r.make)}
              >
                <b>Add {r.name}</b>
                <small style={{ whiteSpace: 'normal' }}>{r.about}</small>
              </button>
            ))}
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
/** Characters plus the rules library, so moving to a new device brings your homebrew along. */
/** Everything to move to another device: characters, game states and the rules library. */
const backupJson = async (characters: Character[], gameStates: GameState[]) => JSON.stringify({ ...makeBackup(characters), gameStates, library: await listPacks().catch(() => []) }, null, 2);

/** The game states in a backup file, or the one game state a game state file holds. */
function gameStatesIn(text: string): GameState[] {
  try {
    const data = JSON.parse(text) as { format?: unknown; gameStates?: unknown };
    if (data?.format === GAME_STATE_FORMAT) return [readGameState(data)];
    if (!Array.isArray(data?.gameStates)) return [];
    return data.gameStates.flatMap((g) => {
      try {
        return [readGameState(g)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** Offered in the browser when the site has an app build to download: the IPA on an iPad or iPhone, the Mac app on a Mac, the APK elsewhere. */
function AppDownloadLink() {
  const [available, setAvailable] = useState(false);
  const pwa = usePwa();
  const mac = !pwa.ios && isMacBrowser();
  const file = pwa.ios ? 'arcane-tome.ipa' : mac ? 'arcane-tome-mac.dmg' : 'arcane-tome.apk';
  useEffect(() => {
    // Only the website carries the app files; the single file and the apps themselves don't.
    if (pwa.mode !== 'pwa') return;
    fetch(file, { method: 'HEAD' })
      .then((r) => setAvailable(r.ok))
      .catch(() => setAvailable(false));
  }, [pwa.mode, file]);
  if (!available) return null;
  if (pwa.ios)
    return (
      <p className="hint" style={{ margin: 0 }}>
        There is also an iPad and iPhone app:{' '}
        <a href={file} download>
          Download the app file (IPA)
        </a>
        . Apple only lets it install through a sideloading tool such as AltStore or SideStore, signed with your own Apple ID.{' '}
        <a href="https://github.com/Death7310/The-Arcane-Tome-#on-an-ipad-or-iphone" target="_blank" rel="noreferrer">
          How to install it
        </a>
        .
      </p>
    );
  if (mac)
    return (
      <p className="hint" style={{ margin: 0 }}>
        There is also a Mac app:{' '}
        <a href={file} download>
          Download the Mac app (DMG)
        </a>
        . Open it and drag Arcane Tome into Applications. The first time, macOS blocks it because it isn't notarized by Apple: choose Done, then
        allow it in System Settings → Privacy &amp; Security → Open Anyway.{' '}
        <a href="https://github.com/Death7310/The-Arcane-Tome-#on-a-mac" target="_blank" rel="noreferrer">
          More help
        </a>
        .
      </p>
    );
  return (
    <p className="hint" style={{ margin: 0 }}>
      On Android you can also get it as a regular app:{' '}
      <a href={file} download>
        Download the Android app (APK)
      </a>
      . Android will ask you to allow installing apps from your browser the first time.
    </p>
  );
}

function OfflineSection(props: {
  characters: Character[];
  gameStates: GameState[];
  settings: Settings;
  onChange: (s: Settings) => void;
  onRestore: (c: Character[]) => MergeResult;
  onRestoreGameStates: (g: GameState[]) => void;
}) {
  const pwa = usePwa();
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const last = props.settings.lastBackupAt;
  return (
    <>
      <h3 style={{ margin: 0 }}>Offline &amp; backups</h3>
      {pwa.mode === 'native' ? (
        <p className="hint" style={{ margin: 0, color: 'var(--good)' }}>
          {platform() === 'ios'
            ? `You're using the ${deviceWord()} app. It works fully offline and saves to a file in its own storage. Backups you save appear in the Files app under On My ${deviceWord()} › Arcane Tome.`
            : isMacApp()
              ? "You're using the Mac app. It works fully offline and keeps your characters in its own storage on this Mac. “Save a backup file” asks where to put the backup."
              : "You're using the Android app. It works fully offline and saves to a file in its own storage on your phone."}
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
      {pwa.mode !== 'native' && <AppDownloadLink />}
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
            const r = await saveFileToDevice(backupName(), await backupJson(props.characters, props.gameStates));
            if (r.ok) props.onChange({ ...props.settings, lastBackupAt: Date.now() });
            setMsg(r.message);
          }}
        >
          {isNative() ? `Save a backup to my ${deviceWord()}` : 'Save a backup file'}
        </button>
        {/* The Mac app has no share sheet; saving the file covers it. */}
        {!isMacApp() && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const r = await shareFile(backupName(), await backupJson(props.characters, props.gameStates));
              if (r.ok && r.message === 'Shared.') props.onChange({ ...props.settings, lastBackupAt: Date.now() });
              setMsg(r.message);
            }}
          >
            Share a backup…
          </button>
        )}
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
              const text = await f.text();
              const games = gameStatesIn(text);
              if (games.length) props.onRestoreGameStates(games);
              const gameNote = games.length ? `${games.length} game state${games.length === 1 ? '' : 's'} (under Characters → Game states)` : '';
              // A game state file on its own holds no characters.
              if (games.length === 1 && JSON.parse(text)?.format === GAME_STATE_FORMAT) {
                setMsg(`Added ${gameNote}.`);
                return;
              }
              const summary = restoreSummary(props.onRestore(parseImport(text)));
              const packs = await restoreLibrary(text).catch(() => 0);
              setMsg(`Restored: ${summary}${packs ? `, ${packs} rules ${packs === 1 ? 'pack' : 'packs'}` : ''}${gameNote ? `, and ${gameNote}` : ''}.`);
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
  gameStates: GameState[];
  onChange: (s: Settings) => void;
  onRestore: (c: Character[]) => MergeResult;
  onRestoreGameStates: (g: GameState[]) => void;
  onArrange: () => void;
  onLibrary: () => void;
  onClose: () => void;
}) {
  const s = props.settings;
  const set = (patch: Partial<Settings>) => props.onChange({ ...s, ...patch });
  return (
    <Dialog title="Settings" onClose={props.onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <OfflineSection characters={props.characters} gameStates={props.gameStates} settings={s} onChange={props.onChange} onRestore={props.onRestore} onRestoreGameStates={props.onRestoreGameStates} />
        <h3 style={{ margin: '8px 0 0' }}>Are the dice fair?</h3>
        <FairnessCheck />
        <h3 style={{ margin: '8px 0 0' }}>Rules library</h3>
        <p className="hint" style={{ margin: 0 }}>
          Import rulebooks, supplements or your own game’s rules (PDF, Word, text). Their classes, subclasses, feats, spells and creatures join the official ones in Level up, the spell
          list and companions, and the text is searchable.
        </p>
        <span className="row">
          <button type="button" className="btn small" onClick={props.onLibrary}>
            Open the rules library
          </button>
        </span>
        <h3 style={{ margin: '8px 0 0' }}>Layout</h3>
        <p className="hint" style={{ margin: 0 }}>
          Move, resize and fold the panels, move them between pages, and add pages and tiles of your own. The layout is kept on this device, so a phone and a laptop can each have their own.
        </p>
        <span className="row">
          <button type="button" className="btn small" onClick={props.onArrange}>
            Arrange panels
          </button>
          <button
            type="button"
            className="btn small ghost"
            disabled={!s.layout}
            title="Usual places and sizes; pages you made are kept"
            onClick={() => {
              // Pages you made survive a reset (with their tiles); everything else goes back to the usual.
              const reset = resetLayout(normalizeLayout(s.layout));
              set({ layout: isDefault(reset) ? null : reset });
            }}
          >
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
        <Check label="Buzz on a natural 20 or 1 (phones that can vibrate)" id="set-vibrate" checked={s.vibrate} onChange={(b) => set({ vibrate: b })} />
        <Check label="Keep the screen on during a fight (while Initiative is running)" id="set-awake" checked={s.keepAwake} onChange={(b) => set({ keepAwake: b })} />
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
        <h3 style={{ margin: 0 }}>Conditions</h3>
        <div className="actions-grid">
          {CONDITIONS.map((k) => (
            <button key={k.id} type="button" className="cast" title={k.summary} onClick={(e) => performCondition(k.id, centerOf(e.currentTarget), k.name)}>
              {k.name}
            </button>
          ))}
          <button type="button" className="cast" onClick={(e) => performCondition('exhaustion', centerOf(e.currentTarget), 'Exhaustion')}>
            Exhaustion
          </button>
        </div>
        <button type="button" className="btn small ghost" onClick={() => sound.dice(3)}>
          Test dice sound
        </button>
        <p className="hint" style={{ margin: 0 }} id="app-version">
          Arcane Tome {__APP_VERSION__} · built {__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC
        </p>
        <p className="hint" style={{ margin: 0 }} id="srd-credit">
          {SRD_CREDIT}
        </p>
      </div>
    </Dialog>
  );
}
