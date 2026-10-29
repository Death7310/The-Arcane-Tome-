import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttacksPanel, TurnPanel, VitalsPanel } from './components/CombatPanels';
import { DicePanel } from './components/DicePanel';
import { FeaturesPanel, InventoryPanel, NotesPanel } from './components/GearPanels';
import { CharactersDialog, SettingsDialog } from './components/Menus';
import { AdvChip, ResultCard } from './components/Results';
import { SpellsPanel } from './components/SpellsPanel';
import { AbilitiesPanel, GlancePanel, IdentityPanel, SkillsPanel } from './components/StatsPanels';
import { fx, setDiceSpeed, sound } from './fx';
import { CharacterContext } from './state/character';
import { isNative, readNativeSave, writeNativeSave } from './state/native';
import { applyUpdate, dismissReady, usePwa } from './state/pwa';
import { addSavePoint, defaultSettings, load, mergeCharacters, parseSaved, save, type Saved, type Settings } from './state/storage';
import { TableContext, useTableState } from './state/table';
import { blankCharacter, type Character } from './systems/dnd5e/model';
import { classSummary, maxHp } from './systems/dnd5e/rules';
import { sampleCharacter } from './systems/dnd5e/sample';

const TABS = [
  { id: 'stats', name: 'Stats' },
  { id: 'combat', name: 'Combat' },
  { id: 'magic', name: 'Magic' },
  { id: 'gear', name: 'Gear' },
  { id: 'dice', name: 'Dice' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function initialState(): Saved {
  const saved = load();
  if (saved) return saved;
  const c = sampleCharacter();
  return { characters: [c], currentId: c.id, settings: defaultSettings(), savePoints: [], savedAt: 0 };
}

const hostTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
const stamp = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function App() {
  const [state, setState] = useState<Saved>(initialState);
  // On a phone, open the example on its spells (the showpiece); your own sheets open on stats.
  const [tab, setTab] = useState<Tab>(() => (state.characters.find((c) => c.id === state.currentId)?.isExample ? 'magic' : 'stats'));
  const [dialog, setDialog] = useState<'characters' | 'settings' | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  // In the Android app the save file is read asynchronously; don't overwrite it before it has been read.
  const [hydrated, setHydrated] = useState(!isNative());
  const shakeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  const char = state.characters.find((c) => c.id === state.currentId) ?? state.characters[0];
  const pwa = usePwa();

  const update = useCallback((fn: (c: Character) => void) => {
    setState((s) => ({
      ...s,
      characters: s.characters.map((c) => {
        if (c.id !== s.currentId) return c;
        const next = structuredClone(c);
        fn(next);
        next.updatedAt = Date.now();
        return next;
      }),
    }));
  }, []);

  const persist = useCallback((s: Saved) => {
    const snapshot = { ...s, savedAt: Date.now() };
    setSaveFailed(!save(snapshot));
    void writeNativeSave(JSON.stringify(snapshot));
  }, []);

  // Pick up the phone's save file if it is newer than what the web view remembers.
  useEffect(() => {
    if (!isNative()) return;
    void readNativeSave().then((raw) => {
      const fromFile = raw ? parseSaved(raw) : null;
      if (fromFile && fromFile.savedAt > state.savedAt) setState(fromFile);
      setHydrated(true);
    });
    // Runs once at start-up.
  }, []);

  // Autosave, debounced. Every change is kept; Save adds a point you can go back to.
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => persist(state), 400);
    return () => clearTimeout(id);
  }, [state, hydrated, persist]);

  const saveNow = () => {
    const next = { ...state, savePoints: addSavePoint(state.savePoints, char, `Saved ${stamp(Date.now())}`) };
    setState(next);
    persist(next);
    sound.click();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  // Effects engine + settings.
  useEffect(() => {
    if (!canvasRef.current || !flashRef.current || !dimRef.current || !vignetteRef.current || !shakeRef.current) return;
    fx.attach(canvasRef.current, { flash: flashRef.current, dim: dimRef.current, vignette: vignetteRef.current, shake: shakeRef.current });
    return () => fx.detach();
  }, []);
  useEffect(() => {
    fx.level = state.settings.fx;
    fx.allowFlash = state.settings.flashes;
    sound.enabled = state.settings.sound;
    sound.setVolume(state.settings.volume);
    setDiceSpeed(state.settings.diceSpeed);
    const root = document.documentElement;
    if (state.settings.theme === 'system') {
      if (hostTheme) root.setAttribute('data-theme', hostTheme);
      else root.removeAttribute('data-theme');
    } else root.setAttribute('data-theme', state.settings.theme);
  }, [state.settings]);

  // Keep current HP within the (possibly changed) maximum.
  const max = maxHp(char).total;
  useEffect(() => {
    if (char.hp.current > max) update((d) => void (d.hp.current = max));
  }, [max, char.hp.current, update]);

  const table = useTableState(char, update);
  const charApi = useMemo(() => ({ char, update }), [char, update]);

  const addCharacter = (c: Character) => setState((s) => ({ ...s, characters: [...s.characters, c], currentId: c.id }));
  const restore = (incoming: Character[]) => {
    const result = mergeCharacters(state.characters, incoming);
    setState((s) => ({ ...s, characters: mergeCharacters(s.characters, incoming).characters }));
    return result;
  };

  return (
    <CharacterContext.Provider value={charApi}>
      <TableContext.Provider value={table}>
        <div className="app" ref={shakeRef}>
          <div className="top">
            <header className="masthead">
              <span className="brand" aria-hidden="true">
                ARCANE TOME
              </span>
              <h1 className="who">
                {char.name || 'Unnamed'}
                <small>{[char.species, classSummary(char)].filter(Boolean).join(' · ')}</small>
              </h1>
              <div className="mast-actions">
                <button type="button" className="btn small primary save-btn" onClick={saveNow} aria-live="polite" title="Save a point you can come back to">
                  {savedFlash ? 'Saved ✓' : 'Save'}
                </button>
                <button type="button" className="btn small" onClick={() => setDialog('characters')}>
                  Characters
                </button>
                <button type="button" className="btn small ghost" onClick={() => setDialog('settings')} aria-label="Settings">
                  Settings
                </button>
              </div>
            </header>
            <nav className="tabs" role="tablist" aria-label="Sheet sections">
              {TABS.map((x) => (
                <button key={x.id} type="button" role="tab" className={x.id === 'dice' ? undefined : 'tab-narrow'} aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
                  {x.name}
                </button>
              ))}
              <button type="button" role="tab" className="tab-wide" aria-selected={tab !== 'dice'} onClick={() => setTab('stats')}>
                Character sheet
              </button>
            </nav>
          </div>

          {char.isExample && (
            <div className="banner">
              <span>
                <strong>Example character.</strong> Cast Fireball or Lightning Bolt in the Magic panel, then make the sheet your own.
              </span>
              <span className="row">
                <button type="button" className="btn small primary" onClick={() => addCharacter(blankCharacter())}>
                  Start my own character
                </button>
                <button type="button" className="btn small ghost" onClick={() => update((d) => void (d.isExample = false))}>
                  Keep editing this one
                </button>
              </span>
            </div>
          )}
          {pwa.needRefresh && (
            <div className="banner">
              <span>A new version of Arcane Tome is ready.</span>
              <button type="button" className="btn small primary" onClick={applyUpdate}>
                Update now
              </button>
            </div>
          )}
          {pwa.justBecameReady && (
            <div className="banner" role="status">
              <span>
                <strong>Ready offline.</strong> Arcane Tome is saved on this device and now works without internet.
                {!pwa.installed && ' Install it from Settings to open it like an app.'}
              </span>
              <button type="button" className="btn small ghost" onClick={dismissReady}>
                Got it
              </button>
            </div>
          )}
          {saveFailed && <div className="banner">This browser is blocking storage, so changes won't be kept after you close the page. Export your character to keep it.</div>}

          <main className="folio" data-active={tab}>
            <div className="col col-a">
              <IdentityPanel />
              <AbilitiesPanel />
              <GlancePanel />
            </div>
            <div className="col col-b">
              <VitalsPanel />
              <TurnPanel />
              <AttacksPanel />
              <SkillsPanel />
            </div>
            <div className="col col-c">
              <SpellsPanel />
              <FeaturesPanel />
              <InventoryPanel />
              <NotesPanel />
            </div>
            <div className="dice-view">
              <DicePanel />
            </div>
          </main>
        </div>

        {tab !== 'dice' && <AdvChip />}
        <ResultCard />

        {dialog === 'characters' && (
          <CharactersDialog
            characters={state.characters}
            currentId={state.currentId}
            savePoints={state.savePoints}
            onSwitch={(id) => setState((s) => ({ ...s, currentId: id }))}
            onAdd={addCharacter}
            onRestore={restore}
            onDelete={(id) =>
              setState((s) => {
                const characters = s.characters.filter((c) => c.id !== id);
                return { ...s, characters, currentId: s.currentId === id ? characters[0].id : s.currentId, savePoints: s.savePoints.filter((p) => p.characterId !== id) };
              })
            }
            onMakeSavePoint={(name) => setState((s) => ({ ...s, savePoints: addSavePoint(s.savePoints, char, name) }))}
            onLoadSavePoint={(id) =>
              setState((s) => {
                const point = s.savePoints.find((p) => p.id === id);
                if (!point) return s;
                const current = s.characters.find((c) => c.id === point.characterId);
                // Keep a way back: the state you're leaving becomes a save point too.
                const points = current ? addSavePoint(s.savePoints, current, `Before loading “${point.name}”`) : s.savePoints;
                const loaded = { ...structuredClone(point.data), id: point.characterId, updatedAt: Date.now() };
                return { ...s, savePoints: points, characters: s.characters.map((c) => (c.id === point.characterId ? loaded : c)) };
              })
            }
            onDeleteSavePoint={(id) => setState((s) => ({ ...s, savePoints: s.savePoints.filter((p) => p.id !== id) }))}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'settings' && <SettingsDialog settings={state.settings} characters={state.characters} onRestore={restore} onChange={(settings: Settings) => setState((s) => ({ ...s, settings }))} onClose={() => setDialog(null)} />}

        <div className="fx-dim" ref={dimRef} aria-hidden="true" />
        <div className="fx-vignette" ref={vignetteRef} aria-hidden="true" />
        <canvas className="fx-canvas" ref={canvasRef} aria-hidden="true" />
        <div className="fx-flash" ref={flashRef} aria-hidden="true" />
      </TableContext.Provider>
    </CharacterContext.Provider>
  );
}
