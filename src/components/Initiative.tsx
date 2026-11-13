// The turn order of a fight: you, your companions (right after you), your party and the enemies,
// highest initiative first. Next turn moves down the list, skips enemies that are down, counts
// rounds, and starts your turn over (Action, Bonus Action, Reaction, movement, and your
// companions' turns) when it comes back to you.

import { useState } from 'react';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { useTable } from '../state/table';
import { enemySummary, nextTurn, skipped, startFight } from '../systems/dnd5e/enemies';
import { allyWho, battleName, endBattle, enemyWho } from '../systems/dnd5e/battle';
import { LogTurn } from './Battle';
import { ConfirmButton, Panel } from './ui';

export function InitiativePanel() {
  const { char: c, update } = useChar();
  const t = useTable();
  const cat = useCatalog();
  const creatures = cat?.creatures ?? [];
  const f = c.fight;
  const [setup, setSetup] = useState(false);
  const [mine, setMine] = useState('');
  const [foes, setFoes] = useState<Record<string, string>>({});
  const [allies, setAllies] = useState<Record<string, string>>({});
  const [newAlly, setNewAlly] = useState('');
  const num = (v: string | undefined) => (v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

  if (!f)
    return (
      <Panel title="Initiative" tab="combat">
        {!setup ? (
          <div className="row">
            <button type="button" className="btn small primary" onClick={() => setSetup(true)}>
              Start a fight
            </button>
            <span className="hint">Puts everyone in turn order and keeps track of whose turn it is and the round.</span>
          </div>
        ) : (
          <div className="fight-setup">
            <div className="fight-row">
              <b>{c.name || 'You'}</b>
              <input className="input" inputMode="numeric" placeholder="?" value={mine} onChange={(e) => setMine(e.target.value)} aria-label="Your initiative" />
              <button type="button" className="btn small" onClick={(e) => setMine(String(t.rollInitiative(e.currentTarget)))}>
                Roll
              </button>
            </div>
            {c.companions.length > 0 && <p className="hint" style={{ margin: 0 }}>{c.companions.map((k) => k.name).join(', ')} go right after you.</p>}
            {c.enemies.map((e) => (
              <div className="fight-row" key={e.id}>
                <span>{e.name}</span>
                <input className="input" inputMode="numeric" placeholder="skip" value={foes[e.id] ?? ''} onChange={(ev) => setFoes({ ...foes, [e.id]: ev.target.value })} aria-label={`${e.name}: initiative`} />
              </div>
            ))}
            {c.party.map((p) => (
              <div className="fight-row" key={p}>
                <span>{p}</span>
                <input className="input" inputMode="numeric" placeholder="skip" value={allies[p] ?? ''} onChange={(ev) => setAllies({ ...allies, [p]: ev.target.value })} aria-label={`${p}: initiative`} />
              </div>
            ))}
            <div className="fight-row">
              <input className="input" placeholder="Add a party member" value={newAlly} onChange={(e) => setNewAlly(e.target.value)} aria-label="Party member's name" />
              <button
                type="button"
                className="btn small"
                disabled={!newAlly.trim() || c.party.includes(newAlly.trim())}
                onClick={() => {
                  const n = newAlly.trim();
                  update((d) => void d.party.push(n));
                  setNewAlly('');
                }}
              >
                Add
              </button>
            </div>
            {c.enemies.length === 0 && <p className="hint" style={{ margin: 0 }}>No enemies yet: add them on the Enemies page, and they’ll appear here.</p>}
            <div className="row">
              <button
                type="button"
                className="btn small primary"
                disabled={num(mine) === null}
                onClick={() => {
                  const enemies = Object.fromEntries(Object.entries(foes).flatMap(([id, v]) => (num(v) === null ? [] : [[id, num(v)!]])));
                  const ally = Object.entries(allies).flatMap(([n, v]) => (num(v) === null ? [] : [[n, num(v)!] as [string, number]]));
                  update((d) => void (d.fight = startFight(d, num(mine)!, { enemies, allies: ally })));
                  setSetup(false);
                }}
              >
                Begin
              </button>
              <button type="button" className="btn small ghost" onClick={() => setSetup(false)}>
                Cancel
              </button>
              {num(mine) === null && <span className="hint">Enter or roll your initiative.</span>}
            </div>
          </div>
        )}
      </Panel>
    );

  const now = f.order[f.turn];
  const missing = c.enemies.filter((e) => !f.order.some((x) => x.ref === e.id));
  return (
    <Panel title={`Initiative · round ${f.round}`} tab="combat">
      <ol className="fight-order">
        {f.order.map((x, i) => {
          const e = x.kind === 'enemy' ? c.enemies.find((y) => y.id === x.ref) : undefined;
          const out = skipped(x, c.enemies, creatures);
          return (
            <li key={x.id} className={[i === f.turn && 'now', out && 'out', x.kind, e && e.id === c.targetId && 'target'].filter(Boolean).join(' ')}>
              <span className="init">{x.initiative}</span>
              <button
                type="button"
                className="fight-name"
                disabled={!e}
                title={e ? 'Make it your target' : undefined}
                onClick={() => e && update((d) => void (d.targetId = e.id))}
              >
                <b>{x.name}</b>
                <small>{e ? enemySummary(e, creatures) : x.kind === 'you' ? 'you' : x.kind === 'companion' ? 'your companion' : 'party'}</small>
              </button>
              {i === f.turn && <span className="now-tag">now</span>}
            </li>
          );
        })}
      </ol>
      <div className="row">
        <button
          type="button"
          className="btn small primary"
          onClick={() => {
            const r = nextTurn(f, c.enemies, creatures);
            update((d) => void (d.fight = r.fight));
            const up = r.fight.order[r.fight.turn];
            // Your turn starts over (and your companions', who act with you).
            if (up.kind === 'you') t.newTurn();
            t.note(r.newRound ? `Round ${r.fight.round}` : 'Next turn', `${up.kind === 'you' ? 'Your' : `${up.name}’s`} turn.`);
          }}
        >
          Next turn
        </button>
        <span className="hint">Now: {now?.kind === 'you' ? 'you' : now?.name}</span>
        <ConfirmButton
          label="End the fight"
          confirmLabel="End it?"
          className="btn small ghost"
          onConfirm={() => {
            // The battle ends with it, and is kept (with its stats) under Battle → Past battles.
            const kept = c.battle?.events.length ? battleName(c.battle) : '';
            update((d) => {
              endBattle(d, creatures);
              d.fight = null;
            });
            if (kept) t.note('Battle kept', `${kept}: under Battle → Past battles, on the Enemies page.`);
          }}
        />
      </div>
      {now && (now.kind === 'enemy' || now.kind === 'ally') && <LogTurn by={now.kind === 'enemy' ? enemyWho({ id: now.ref, name: now.name }) : allyWho(now.name)} title={`Log ${now.name}’s turn`} />}
      {missing.length > 0 && (
        <div className="row" style={{ marginTop: 6 }}>
          <span className="hint">Not in the order yet:</span>
          {missing.map((e) => (
            <AddToOrder key={e.id} id={e.id} name={e.name} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/** An enemy that joined mid-fight, slotted in by its initiative. */
function AddToOrder({ id, name }: { id: string; name: string }) {
  const { update } = useChar();
  const [v, setV] = useState('');
  return (
    <span className="row" style={{ gap: 4 }}>
      <input className="input" inputMode="numeric" style={{ width: 56 }} placeholder="init" value={v} onChange={(e) => setV(e.target.value)} aria-label={`${name}: initiative`} />
      <button
        type="button"
        className="btn small"
        disabled={!Number.isFinite(Number(v)) || v.trim() === ''}
        onClick={() =>
          update((d) => {
            if (!d.fight) return;
            const n = Number(v);
            const current = d.fight.order[d.fight.turn];
            const at = d.fight.order.findIndex((x) => x.initiative < n && x.kind !== 'companion');
            const entry = { id: `${id}-${Date.now()}`, kind: 'enemy' as const, ref: id, name, initiative: n };
            d.fight.order.splice(at < 0 ? d.fight.order.length : at, 0, entry);
            d.fight.turn = d.fight.order.indexOf(current);
          })
        }
      >
        Add {name}
      </button>
    </span>
  );
}
