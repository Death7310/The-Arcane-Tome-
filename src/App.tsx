import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { AbilitiesPanel, GlancePanel, IdentityPanel, SkillsPanel } from './components/StatsPanels';
import { fx, setDiceSpeed, setTally, sound } from './fx';
import { CharacterContext } from './state/character';
import { isNative, readNativeSave, writeNativeSave } from './state/native';
import { addPanel, gridTracks, isDefault, isTileKey, normalizeLayout, removePanel, resetLayout, tileKey, withTiles, type Layout, type PanelId, type PanelKey } from './state/layout';
import { loadLibrary } from './state/library';
import { applyUpdate, dismissReady, usePwa } from './state/pwa';
import { addSavePoint, defaultSettings, load, mergeCharacters, parseSaved, save, type Saved, type Settings } from './state/storage';
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
};

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
  const view = page?.custom ? 'page' : 'sheet';
  const arranger = useArranger(layout, setLayout, folioRef, arranging, { pageId, view, exists });
  const emptyPage = !!page && !page.panels.some(exists);

  /** A new tile of your own, on the page you're looking at (on a wide screen's main sheet, with the gear). */
  const newTile = () => {
    const tile = blankTile({ entries: [] });
    update((d) => void d.tiles.push(tile));
    const narrowScreen = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 899px)').matches;
    setLayout(addPanel(layout, tileKey(tile.id), page && (page.custom || narrowScreen) ? page.id : 'gear'));
  };
  const deleteTile = (id: string) => {
    update((d) => void (d.tiles = d.tiles.filter((t) => t.id !== id)));
    setLayout(removePanel(layout, tileKey(id)));
  };
  const tracks = layout.widths ? gridTracks(layout.widths) : null;

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
              {char.portrait && <img className="avatar" src={char.portrait} alt="" />}
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
            <nav className="tabs" role="tablist" aria-label="Sheet sections">
              {/* Wide screens: the main sheet, the pages you made, Dice. Phones: every page, then Dice. */}
              <button type="button" role="tab" className="tab-wide" aria-selected={!!page && !page.custom} onClick={() => setTab(layout.pages.find((p) => !p.custom)!.id)}>
                Character sheet
              </button>
              {layout.pages.map((p) => (
                <button key={p.id} type="button" role="tab" className={p.custom ? undefined : 'tab-narrow'} aria-selected={pageId === p.id} onClick={() => setTab(p.id)}>
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
                        <TilePanel tile={tile} onDelete={() => deleteTile(tile.id)} />
                      </PanelSlot>
                    ) : null;
                  }
                  const View = PANEL_VIEWS[id as PanelId];
                  return (
                    <PanelSlot key={id} api={arranger.slot(id)}>
                      <View />
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
              Drag a panel by <b>⠿</b> or use its arrows; “On:” puts it on other pages.<span className="wide-only"> Drag the gap between columns, or a panel’s bottom edge, to resize.</span> The ⌄ on each panel folds it away.
            </span>
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
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'settings' && (
          <SettingsDialog
            settings={state.settings}
            characters={state.characters}
            onRestore={restore}
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
        {dialog === 'pages' && <PagesDialog layout={layout} setLayout={setLayout} exists={exists} onOpen={setTab} onClose={() => setDialog(null)} />}

        <div className="fx-dim" ref={dimRef} aria-hidden="true" />
        <div className="fx-vignette" ref={vignetteRef} aria-hidden="true" />
        <canvas className="fx-canvas" ref={canvasRef} aria-hidden="true" />
        <div className="fx-flash" ref={flashRef} aria-hidden="true" />
      </TableContext.Provider>
    </CharacterContext.Provider>
  );
}
