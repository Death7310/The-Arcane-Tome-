// Game states: save where a session stands, load it onto this character (even a newer copy of
// it), and carry it between devices as a file. See systems/dnd5e/gamestate.ts.

import { useId, useRef, useState } from 'react';
import { isMacApp, isNative, saveFileToDevice, shareFile } from '../state/native';
import { describePlay, gameStateFile, parseGameStateFile, type GameState } from '../systems/dnd5e/gamestate';
import type { Character } from '../systems/dnd5e/model';
import { ConfirmButton } from './ui';

const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fileName = (g: GameState) => `arcane-tome-game-state-${(g.name || 'game').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'game'}-${new Date(g.savedAt).toISOString().slice(0, 10)}.json`;

export function GameStatesPanel(props: {
  current: Character;
  gameStates: GameState[];
  onSave: (name: string) => void;
  /** Loads it onto the current character; returns what couldn't be placed. */
  onLoad: (id: string) => string[];
  onDelete: (id: string) => void;
  onImport: (g: GameState) => void;
}) {
  const base = useId();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const who = props.current.name || 'this character';
  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>
        A game state is where your session stands, without the character itself: hit points, spent spell slots or points, used features, conditions, the enemies and the damage done to them,
        the initiative order, counters, companions’ hit points, coins and item counts. Load one onto <b>{who}</b> (even after an update or a level up, which it leaves alone), or save it to a
        file to carry it to another device.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave(name.trim() || `${who}, ${when(Date.now())}`);
          setName('');
          setMsg({ text: 'Game state saved.', good: true });
        }}
      >
        <input className="input" style={{ flex: 1, minWidth: 0 }} id={`${base}-name`} value={name} placeholder="Name it: Session 12, goblin cave…" aria-label="Name of the game state" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn primary">
          Save game state
        </button>
      </form>
      {msg && (
        <p className="hint" role="status" style={{ color: msg.good ? 'var(--good)' : 'var(--bad)' }}>
          {msg.text}
        </p>
      )}
      <div className="list" style={{ marginTop: 10 }}>
        {props.gameStates.length === 0 && <p className="hint">No game states yet.</p>}
        {props.gameStates.map((g) => (
          <div key={g.id} className="item" style={{ padding: '8px 10px', display: 'grid', gap: 6 }}>
            <span className="item-title">
              <b>{g.name}</b>
              <small style={{ whiteSpace: 'normal' }}>
                {g.characterName ? `${g.characterName} · ` : ''}
                {when(g.savedAt)} · {describePlay(g.state)}
              </small>
            </span>
            <span className="row">
              <ConfirmButton
                label={`Load onto ${who}`}
                confirmLabel="Tap again to load it"
                className="btn small"
                onConfirm={() => {
                  const missed = props.onLoad(g.id);
                  setMsg({
                    text: `Loaded “${g.name}” onto ${who}. Where you were is saved as a game state too, so you can go back.${missed.length ? ` Not on this sheet, so left out: ${missed.join(', ')}.` : ''}`,
                    good: true,
                  });
                }}
              />
              <button
                type="button"
                className="btn small ghost"
                onClick={async () => {
                  const r = await saveFileToDevice(fileName(g), gameStateFile(g));
                  setMsg({ text: r.message, good: r.ok });
                }}
              >
                Save as a file
              </button>
              {isNative() && !isMacApp() && (
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={async () => {
                    const r = await shareFile(fileName(g), gameStateFile(g));
                    setMsg({ text: r.message, good: r.ok });
                  }}
                >
                  Share…
                </button>
              )}
              <ConfirmButton label="Delete" confirmLabel="Delete?" className="btn small ghost" onConfirm={() => props.onDelete(g.id)} />
            </span>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Open a game state file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Game state file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const g = parseGameStateFile(await file.text());
              props.onImport(g);
              setMsg({ text: `Added “${g.name}”. Load it onto ${who} from the list.`, good: true });
            } catch (err) {
              setMsg({ text: (err as Error).message, good: false });
            }
          }}
        />
      </div>
    </>
  );
}
