import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { PanelSlot, useArranger } from './components/Arrange';
import { AttacksPanel, TurnPanel, VitalsPanel } from './components/CombatPanels';
import { CompanionsPanel } from './components/CompanionsPanel';
import { ConditionsPanel, StatusStrip } from './components/ConditionsPanel';
import { DicePanel } from './components/DicePanel';
import { FeaturesPanel, InventoryPanel, NotesPanel } from './components/GearPanels';
import { LanguagesPanel } from './components/Languages';
import { PagesDialog } from './components/Pages';
import { TilePanel } from './components/Tiles';
import { LibraryDialog } from './components/Library';
import { CharactersDialog, SettingsDialog } from './components/Menus';
import { AdvChip, ResultCard } from './components/Results';
import { SpellsPanel } from './components/SpellsPanel';
import { SpellCompendiumPanel } from './components/SpellBrowser';
import { FeatLibraryPanel } from './components/Feats';
import { BackgroundLibraryPanel } from './components/Backgrounds';
import { DownWatch, EnemiesPanel } from './components/Enemies';
import { InitiativePanel } from './components/Initiative';
import { CountersPanel } from './components/Counters';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AbilitiesPanel, GlancePanel, IdentityPanel, SkillsPanel } from './components/StatsPanels';
import { fx, setDiceSpeed, setTally, sound } from './fx';
import { CharacterContext } from './state/character';
import { isNative, listenBackButton, readNativeSave, writeNativeSave } from './state/native';
import { goBack, onBack } from './state/back';
import { emptyStack, remember, takeBack, type UndoStack } from './state/undo';
import { keepScreenOn, matchSystemBars, setVibrate, tick } from './state/device';
import { slideIn, usePageSwipe, type Dir } from './state/swipe';
import { APP_BUILD, checkInBackground, type Published } from './state/updates';
import { addPanel, gridTracks, isDefault, isTileKey, normalizeLayout, ownTab, putBack, removePanel, resetLayout, tileKey, withTiles, type Layout, type PanelId, type PanelKey } from './state/layout';
import { loadLibrary } from './state/library';
import { applyUpdate, dismissReady, usePwa } from './state/pwa';
import { addGameState, addSavePoint, defaultSettings, load, mergeCharacters, parseSaved, saveMakingRoom, type Saved, type Settings } from './state/storage';
import { applyPlay, makeGameState } from './systems/dnd5e/gamestate';
import { TableContext, useTableState } from './state/table';
import { blankCharacter, blankTile, type Character } from './systems/dnd5e/model';
import { classSummary, maxHp } from './systems/dnd5e/rules';
import { sampleCharacter } from './systems/dnd5e/sample';


const PANEL_VIEWS: Record<PanelId, () => React.JSX.Element> = {
  identity: IdentityPanel,
  abilities: AbilitiesPanel,
  glance: GlancePanel,
  vitals: VitalsPanel,
  conditions: ConditionsPanel,
  turn: TurnPanel,
  attacks: AttacksPanel,
  companions: CompanionsPanel,
  skills: SkillsPanel,
  spells: SpellsPanel,
  features: FeaturesPanel,
  inventory: InventoryPanel,
  notes: NotesPanel,
  languages: LanguagesPanel,
  compendium: SpellCompendiumPanel,
  feats: FeatLibraryPanel,
  enemies: EnemiesPanel,
  initiative: InitiativePanel,
  counters: CountersPanel,
  backgrounds: BackgroundLibraryPanel,
};

/** Panel names for the message shown if one runs into an error. */
const PANEL_NAMES: Record<PanelId, string> = {
  identity: 'Character',
  abilities: 'Abilities',
  glance: 'At a glance',
  vitals: 'Vitals',
  conditions: 'Conditions',
  turn: 'Turn',
  attacks: 'Attacks',
  companions: 'Companions',
  skills: 'Skills',
  spells: 'Spellcasting',
  features: 'Features & traits',
  inventory: 'Inventory',
  notes: 'Notes',
  languages: 'Languages',
  compendium: 'Spell compendium',
  feats: 'Feat library',
  enemies: 'Enemies',
  initiative: 'Initiative',
  counters: 'Counters',
  backgrounds: 'Background library',
};

function initialState(): Saved {
  const saved = load();
  if (saved) return saved;
  const c = sampleCharacter();
  return { characters: [c], currentId: c.id, settings: defaultSettings(), savePoints: [], gameStates: [], savedAt: 0 };
}

const hostTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
const stamp = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function App() {
  const [state, setState] = useState<Saved>(initialState);
  // On a phone, open the example on its spells (the showpiece); your own sheets open on stats.
  // The page showing: a page's id (built-in or one you made), or 'dice'.
  const [tab, setTab] = useState<string>(() => (state.characters.find((c) => c.id === state.currentId)?.isExample ? 'magic' : 'stats'));
  const [dialog, setDialog] = useState<'characters' | 'import' | 'settings' | 'library' | 'pages' | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  // In the Android app the save file is read asynchronously; don't overwrite it before it has been read.
  const [hydrated, setHydrated] = useState(!isNative());
  const shakeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const folioRef = useRef<HTMLElement>(null);
  const [arranging, setArranging] = useState(false);
  // The apps (Android, iPad, Mac) look for a newer build now and then; the website updates itself.
  const [appUpdate, setAppUpdate] = useState<Published | null>(null);
  useEffect(() => {
    void checkInBackground().then((p) => p && setAppUpdate(p));
  }, []);

  // Back (Android's button, or Escape for dialogs and Arrange): close what's on top, then go
  // back through the pages you visited, and only then leave the app.
  const [trail, setTrail] = useState<string[]>([]);
  const lastTab = useRef(tab);
  const goingBack = useRef(false);
  useEffect(() => {
    if (lastTab.current === tab) return;
    if (!goingBack.current) setTrail((t) => [...t, lastTab.current].slice(-20));
    goingBack.current = false;
    lastTab.current = tab;
  }, [tab]);
  useEffect(() => {
    if (!trail.length) return;
    return onBack(() => {
      goingBack.current = true;
      setTab(trail[trail.length - 1]);
      setTrail(trail.slice(0, -1));
    }, 'page');
  }, [trail]);
  useEffect(() => (arranging ? onBack(() => setArranging(false)) : undefined), [arranging]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && goBack(false)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    const stop = listenBackButton(() => goBack(true));
    return () => {
      window.removeEventListener('keydown', onKey);
      stop();
    };
  }, []);

  const char = state.characters.find((c) => c.id === state.currentId) ?? state.characters[0];
  const pwa = usePwa();
  const tileKeys = char.tiles.map((t) => tileKey(t.id));
  const tileSig = tileKeys.join();
  // Tiles this device hasn't placed yet (made elsewhere, or restored) get a place of their own.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => withTiles(normalizeLayout(state.settings.layout), tileKeys), [state.settings.layout, tileSig]);
  const setLayout = useCallback((l: Layout) => setState((s) => ({ ...s, settings: { ...s.settings, layout: isDefault(l) ? null : l } })), []);
  const exists = useCallback((k: string) => !isTileKey(k) || char.tiles.some((t) => tileKey(t.id) === k), [char.tiles]);
  const page = tab === 'dice' ? null : (layout.pages.find((p) => p.id === tab) ?? layout.pages[0]);
  const pageId = page?.id ?? null;
  // The Library and pages you made show on their own on a wide screen; the rest share the main sheet.
  const view = page && ownTab(page) ? 'page' : 'sheet';
  const arranger = useArranger(layout, setLayout, folioRef, arranging, { pageId, view, exists });
  const emptyPage = !!page && !page.panels.some(exists);

  // Sliding between pages (swipe, trackpad, arrow keys on the tabs), in the tabs' order: every
  // page then Dice on a phone; the main sheet, the pages you made, then Dice on a wide screen.
  const narrowNow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 899px)').matches;
  const sheetId = layout.pages.find((p) => !ownTab(p))!.id;
  const swipeOrder = () => (narrowNow() ? [...layout.pages.map((p) => p.id), 'dice'] : [sheetId, ...layout.pages.filter(ownTab).map((p) => p.id), 'dice']);
  const swipeCurrent = () => (tab === 'dice' ? 'dice' : !narrowNow() && page && !ownTab(page) ? sheetId : (page?.id ?? sheetId));
  const slideDir = useRef<Dir | null>(null);
  const slideTo = (id: string, dir: Dir) => {
    slideDir.current = dir;
    setTab(id);
    void tick();
  };
  useEffect(() => {
    if (slideDir.current) slideIn(folioRef.current, slideDir.current);
    slideDir.current = null;
  }, [tab]);
  usePageSwipe({ surface: shakeRef, follow: folioRef, enabled: !arranging && !dialog, order: swipeOrder, current: swipeCurrent, go: slideTo });
  /** Left and right arrows (and Home, End) move along the tabs, as tabs do everywhere. */
  const onTabKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
    if (!(e.key in keys)) return;
    const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter((b) => b.offsetParent !== null);
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const step = keys[e.key];
    const j = Number.isFinite(step) ? Math.max(0, Math.min(tabs.length - 1, i + step)) : step < 0 ? 0 : tabs.length - 1;
    if (j === i) return;
    slideDir.current = j > i ? 1 : -1;
    tabs[j].focus();
    tabs[j].click();
  };

  /** A new tile of your own, on the page you're looking at (on a wide screen's main sheet, with the gear). */
  const newTile = () => {
    const tile = blankTile({ entries: [] });
    update((d) => void d.tiles.push(tile));
    const narrowScreen = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 899px)').matches;
    setLayout(addPanel(layout, tileKey(tile.id), page && (ownTab(page) || narrowScreen) ? page.id : 'gear'));
  };
  const deleteTile = (id: string) => {
    update((d) => void (d.tiles = d.tiles.filter((t) => t.id !== id)));
    setLayout(removePanel(layout, tileKey(id)));
  };
  const tracks = layout.widths ? gridTracks(layout.widths) : null;
  /** A tile's name: a built-in panel's title, or the title you gave your own tile. */
  const nameOf = (k: PanelKey) => (isTileKey(k) ? char.tiles.find((t) => tileKey(t.id) === k)?.title || 'Your tile' : (PANEL_NAMES[k as PanelId] ?? k));
  /** Tiles you removed (this character's own tiles only), to add back. */
  const removed = layout.removed.filter((x) => exists(x.id));
  const [backNote, setBackNote] = useState('');
  useEffect(() => setBackNote(''), [arranging]);
  const addBack = (id: PanelKey, toPage?: string) => {
    const next = putBack(layout, id, toPage);
    setLayout(next);
    const where = next.pages.filter((p) => p.panels.includes(id)).map((p) => p.name);
    setBackNote(`${nameOf(id)} is back${where.length ? ` on ${where.join(', ')}` : ''}.`);
  };

  // Undo: each character's recent states, newest last (see state/undo.ts).
  const stateRef = useRef(state);
  stateRef.current = state;
  const undoRef = useRef(new Map<string, UndoStack>());
  const [undoable, setUndoable] = useState(0);
  const [undoneFlash, setUndoneFlash] = useState(false);
  const update = useCallback((fn: (c: Character) => void) => {
    const now = stateRef.current;
    const before = now.characters.find((c) => c.id === now.currentId);
    if (before) {
      const next = remember(undoRef.current.get(before.id) ?? emptyStack(), before, Date.now());
      undoRef.current.set(before.id, next);
      setUndoable(next.past.length);
    }
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

  /** Puts the character back as it was before the last change (or burst of changes). */
  const undo = () => {
    const id = stateRef.current.currentId;
    const r = takeBack(undoRef.current.get(id) ?? emptyStack());
    undoRef.current.set(id, r.stack);
    setUndoable(r.stack.past.length);
    if (!r.restore) return;
    const restore = { ...r.restore, updatedAt: Date.now() };
    setState((s) => ({ ...s, characters: s.characters.map((c) => (c.id === id ? restore : c)) }));
    sound.click();
    setUndoneFlash(true);
    setTimeout(() => setUndoneFlash(false), 1200);
  };
  // Switching characters shows that character's own undo steps.
  useEffect(() => setUndoable(undoRef.current.get(state.currentId)?.past.length ?? 0), [state.currentId]);

  const [roomNote, setRoomNote] = useState('');
  const persist = useCallback((s: Saved) => {
    const snapshot = { ...s, savedAt: Date.now() };
    // When the browser's storage is full, the oldest save points make way for your changes.
    const r = saveMakingRoom(snapshot);
    setSaveFailed(!r);
    if (r?.dropped) {
      setState((cur) => ({ ...cur, savePoints: cur.savePoints.filter((p) => r.saved.savePoints.some((q) => q.id === p.id)) }));
      setRoomNote(`This browser’s storage was full, so the ${r.dropped} oldest save point${r.dropped === 1 ? ' was' : 's were'} removed to keep your changes. Back up from Settings to keep everything.`);
    }
    void writeNativeSave(JSON.stringify(r?.saved ?? snapshot));
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
  const unsaved = useRef<Saved | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    unsaved.current = state;
    const id = setTimeout(() => {
      unsaved.current = null;
      persist(state);
    }, 400);
    return () => clearTimeout(id);
  }, [state, hydrated, persist]);
  // Closing, reloading or switching away straight after a change still keeps it.
  useEffect(() => {
    const flush = () => {
      if (!unsaved.current || document.visibilityState === 'visible') return;
      persist(unsaved.current);
      unsaved.current = null;
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [persist]);

  const saveNow = () => {
    const next = { ...state, savePoints: addSavePoint(state.savePoints, char, `Saved ${stamp(Date.now())}`) };
    setState(next);
    persist(next);
    sound.click();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  // During a fight (Initiative), the screen stays on so the phone doesn't lock between turns.
  const fighting = !!char.fight;
  useEffect(() => {
    void keepScreenOn(state.settings.keepAwake && fighting);
  }, [state.settings.keepAwake, fighting]);

  // Your rules library joins the SRD in the catalog from the start.
  useEffect(() => {
    void loadLibrary();
  }, []);

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
    setTally(state.settings.tally);
    setVibrate(state.settings.vibrate);
    const root = document.documentElement;
    if (state.settings.theme === 'system') {
      if (hostTheme) root.setAttribute('data-theme', hostTheme);
      else root.removeAttribute('data-theme');
    } else root.setAttribute('data-theme', state.settings.theme);
  }, [state.settings]);
  // In the apps, status bar text that suits the theme, following the system when the theme does.
  useEffect(() => {
    if (!isNative()) return;
    const apply = () => void matchSystemBars(getComputedStyle(document.documentElement).colorScheme !== 'light');
    apply();
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [state.settings.theme]);

  // Keep current HP within the (possibly changed) maximum.
  const max = maxHp(char).total;
  useEffect(() => {
    if (char.hp.current > max) update((d) => void (d.hp.current = max));
  }, [max, char.hp.current, update]);

  const table = useTableState(char, update);
  const savePoint = useCallback((name: string) => setState((s) => ({ ...s, savePoints: addSavePoint(s.savePoints, s.characters.find((c) => c.id === s.currentId)!, name) })), []);
  const charApi = useMemo(() => ({ char, update, savePoint }), [char, update, savePoint]);

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
              {char.portrait && <img className="avatar" src={char.portrait} alt="" />}
              <h1 className="who">
                {char.name || 'Unnamed'}
                <small>{[char.species, classSummary(char)].filter(Boolean).join(' · ')}</small>
              </h1>
              <div className="mast-actions">
                <button
                  type="button"
                  className="btn small ghost undo-btn"
                  onClick={undo}
                  disabled={!undoable}
                  aria-label={undoneFlash ? 'Undone' : `Undo the last change${undoable ? ` (${undoable} to go back through)` : ''}`}
                  title="Undo the last change: a wrong HP, damage on the wrong enemy, a mistapped condition"
                >
                  {undoneFlash ? '✓' : '↶'}
                  <span className="wide-only"> Undo</span>
                </button>
                <button type="button" className="btn small primary save-btn" onClick={saveNow} aria-live="polite" title="Save a point you can come back to">
                  {savedFlash ? 'Saved ✓' : 'Save'}
                </button>
                <button type="button" className="btn small" onClick={() => setDialog('characters')}>
                  Characters
                </button>
                <button type="button" className="btn small ghost wide-only" onClick={() => setDialog('library')} title="Your imported rules: classes, spells, creatures and rules text">
                  Rules
                </button>
                <button type="button" className="btn small ghost" aria-pressed={arranging} aria-label="Arrange" onClick={() => setArranging((a) => !a)} title="Move, resize and fold the panels, and move them between pages">
                  <span className="wide-only">Arrange</span>
                  <span className="narrow-only" aria-hidden="true">⠿</span>
                </button>
                <button type="button" className="btn small ghost" onClick={() => setDialog('settings')} aria-label="Settings">
                  Settings
                </button>
              </div>
            </header>
            <nav className="tabs" role="tablist" aria-label="Sheet sections" onKeyDown={onTabKey}>
              {/* Wide screens: the main sheet, the pages you made, Dice. Phones: every page, then Dice. */}
              <button type="button" role="tab" className="tab-wide" aria-selected={!!page && !ownTab(page)} onClick={() => setTab(sheetId)}>
                Character sheet
              </button>
              {layout.pages.map((p) => (
                <button key={p.id} type="button" role="tab" className={ownTab(p) ? undefined : 'tab-narrow'} aria-selected={pageId === p.id} onClick={() => setTab(p.id)}>
                  {p.name}
                </button>
              ))}
              <button type="button" role="tab" aria-selected={tab === 'dice'} onClick={() => setTab('dice')}>
                Dice
              </button>
            </nav>
            <StatusStrip onOpen={() => setTab('combat')} />
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
                <button type="button" className="btn small" onClick={() => setDialog('import')}>
                  Import from a document
                </button>
                <button type="button" className="btn small ghost" onClick={() => update((d) => void (d.isExample = false))}>
                  Keep editing this one
                </button>
              </span>
            </div>
          )}
          {appUpdate && (
            <div className="banner" role="status">
              <span>
                <strong>Arcane Tome {appUpdate.version}</strong> is out (build {appUpdate.build}; this is {APP_BUILD || 'a local build'}). Installing it over this app keeps your characters.
              </span>
              <button type="button" className="btn small primary" onClick={() => (setAppUpdate(null), setDialog('settings'))}>
                Update
              </button>
              <button type="button" className="btn small ghost" onClick={() => setAppUpdate(null)}>
                Later
              </button>
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
          <DownWatch />
          {roomNote && (
            <div className="banner" role="status">
              {roomNote}{' '}
              <button type="button" className="btn small ghost" onClick={() => setRoomNote('')}>
                OK
              </button>
            </div>
          )}
          {saveFailed && (
            <div className="banner">
              Changes aren't being saved: this browser's storage is blocked or full. Delete old save points or remove a large portrait, and back up your characters from Settings.
            </div>
          )}

          <main
            className={['folio', tracks && 'custom-widths', arranging && 'arranging'].filter(Boolean).join(' ')}
            data-active={tab === 'dice' ? 'dice' : pageId ?? 'stats'}
            data-view={view}
            ref={folioRef}
            style={tracks ? ({ '--grid3': tracks.three, '--grid2': tracks.two } as CSSProperties) : undefined}
          >
            {layout.columns.map((ids, i) => (
              <div key={i} className={`col col-${'abc'[i]}`}>
                {ids.map((id: PanelKey) => {
                  if (isTileKey(id)) {
                    const tile = char.tiles.find((t) => tileKey(t.id) === id);
                    return tile ? (
                      <PanelSlot key={id} api={arranger.slot(id)}>
                        <ErrorBoundary name={tile.title || 'This tile'}>
                          <TilePanel tile={tile} onDelete={() => deleteTile(tile.id)} />
                        </ErrorBoundary>
                      </PanelSlot>
                    ) : null;
                  }
                  const View = PANEL_VIEWS[id as PanelId];
                  return (
                    <PanelSlot key={id} api={arranger.slot(id)}>
                      <ErrorBoundary name={PANEL_NAMES[id as PanelId] ?? 'This panel'}>
                        <View />
                      </ErrorBoundary>
                    </PanelSlot>
                  );
                })}
              </div>
            ))}
            {emptyPage && (
              <div className="empty-page">
                <p>
                  <b>{page!.name}</b> is empty. Add a tile of your own (notes, trackers, rolls), or move tiles here: tap Arrange, then use “On:” on any tile.
                </p>
                {removed.length > 0 && (
                  <span className="row" style={{ alignItems: 'center' }}>
                    <span className="hint">Add back here:</span>
                    {removed.map((x) => (
                      <button key={x.id} type="button" className="btn small ghost" onClick={() => addBack(x.id, page!.id)}>
                        ＋ {nameOf(x.id)}
                      </button>
                    ))}
                  </span>
                )}
                <span className="row">
                  <button type="button" className="btn small primary" onClick={newTile}>
                    New tile
                  </button>
                  <button type="button" className="btn small" onClick={() => setArranging(true)}>
                    Arrange
                  </button>
                </span>
              </div>
            )}
            {arranger.dividerEls}
            <div className="dice-view">
              <DicePanel />
            </div>
          </main>
        </div>

        {arranging && (
          <div className="arrange-bar" role="region" aria-label="Arranging panels">
            <span>
              Drag a panel by <b>⠿</b> or use its arrows; “On:” puts it on other pages.<span className="wide-only"> Drag the gap between columns, or a panel’s bottom edge, to resize.</span> The ⌄ on each panel folds it away; Remove takes it off your pages.
            </span>
            {(removed.length > 0 || backNote) && (
              <span className="row removed-tiles" style={{ alignItems: 'center' }}>
                {removed.length > 0 && <span>Removed:</span>}
                {removed.map((x) => (
                  <button key={x.id} type="button" className="btn small ghost" aria-label={`Add ${nameOf(x.id)} back`} onClick={() => addBack(x.id)}>
                    ＋ {nameOf(x.id)}
                  </button>
                ))}
                {backNote && (
                  <span role="status" style={{ color: 'var(--good)' }}>
                    {backNote}
                  </span>
                )}
              </span>
            )}
            <span className="row">
              <button type="button" className="btn small ghost" onClick={() => setDialog('pages')}>
                Pages…
              </button>
              <button type="button" className="btn small ghost" onClick={newTile}>
                New tile
              </button>
              <button type="button" className="btn small ghost" disabled={isDefault(layout)} onClick={() => setLayout(resetLayout(layout))} title="Usual places and sizes; pages you made are kept">
                Reset layout
              </button>
              <button type="button" className="btn small primary" onClick={() => setArranging(false)}>
                Done
              </button>
            </span>
          </div>
        )}
        {arranger.overlay}
        {tab !== 'dice' && !arranging && <AdvChip />}
        <ResultCard />

        {(dialog === 'characters' || dialog === 'import') && (
          <CharactersDialog
            initialMode={dialog === 'import' ? 'import' : 'list'}
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
                const loaded = { ...structuredClone(point.data), id: point.characterId, portrait: current?.portrait ?? null, updatedAt: Date.now() };
                return { ...s, savePoints: points, characters: s.characters.map((c) => (c.id === point.characterId ? loaded : c)) };
              })
            }
            onDeleteSavePoint={(id) => setState((s) => ({ ...s, savePoints: s.savePoints.filter((p) => p.id !== id) }))}
            gameStates={state.gameStates}
            onSaveGameState={(name) => setState((s) => ({ ...s, gameStates: addGameState(s.gameStates, makeGameState(char, name)) }))}
            onLoadGameState={(id) => {
              const g = state.gameStates.find((x) => x.id === id);
              if (!g) return [];
              // Keep a way back: where you are now is saved as a game state first.
              const before = makeGameState(char, `Before loading “${g.name}”`);
              const missed = applyPlay(structuredClone(char), g.state);
              setState((s) => ({ ...s, gameStates: addGameState(s.gameStates, before) }));
              update((d) => void applyPlay(d, g.state));
              return missed;
            }}
            onDeleteGameState={(id) => setState((s) => ({ ...s, gameStates: s.gameStates.filter((g) => g.id !== id) }))}
            onImportGameState={(g) => setState((s) => ({ ...s, gameStates: addGameState(s.gameStates, g) }))}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'settings' && (
          <SettingsDialog
            settings={state.settings}
            characters={state.characters}
            gameStates={state.gameStates}
            onRestore={restore}
            onRestoreGameStates={(list) => setState((s) => ({ ...s, gameStates: list.reduceRight((acc, g) => addGameState(acc, g), s.gameStates) }))}
            onChange={(settings: Settings) => setState((s) => ({ ...s, settings }))}
            onArrange={() => {
              setDialog(null);
              setArranging(true);
            }}
            onLibrary={() => setDialog('library')}
            onClose={() => setDialog(null)}
          />
        )}

        {dialog === 'library' && <LibraryDialog onClose={() => setDialog(null)} />}
        {dialog === 'pages' && (
          <PagesDialog layout={layout} setLayout={setLayout} exists={exists} onOpen={setTab} onClose={() => setDialog(null)} removed={removed.map((x) => ({ id: x.id, name: nameOf(x.id) }))} onAddBack={(id) => addBack(id)} />
        )}

        <div className="fx-dim" ref={dimRef} aria-hidden="true" />
        <div className="fx-vignette" ref={vignetteRef} aria-hidden="true" />
        <canvas className="fx-canvas" ref={canvasRef} aria-hidden="true" />
        <div className="fx-flash" ref={flashRef} aria-hidden="true" />
      </TableContext.Provider>
    </CharacterContext.Provider>
  );
}
