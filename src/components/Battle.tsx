// The battle: everyone's numbers as the fight goes (hit rates, damage dealt and taken, saves,
// concentration), the rolls still waiting on the DM, a way to log what others do on their turns,
// and the battles you've ended, kept to look back on, copy or save as a file.

import { useState } from 'react';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { isMacApp, isNative, saveFileToDevice, shareFile } from '../state/native';
import { useTable } from '../state/table';
import {
  allyWho,
  archiveBattle,
  autoName,
  battleFile,
  battleName,
  battleStats,
  battleText,
  didSomething,
  enemyWho,
  eventText,
  hitRateText,
  inBattle,
  openEvents,
  presentWho,
  rangeText,
  resumeBattle,
  sameWho,
  whoKey,
  youWho,
  type WhoStats,
} from '../systems/dnd5e/battle';
import { ABILITIES, ABILITY_NAMES, DAMAGE_TYPES, type Ability } from '../systems/dnd5e/data';
import type { Battle, BattleEvent, BattleWho, Character, Enemy } from '../systems/dnd5e/model';
import { acText, knownMaxHp, STATUS_NAMES, statusOf, tally } from '../systems/dnd5e/enemies';
import { conditionName } from '../systems/dnd5e/rules';
import { Check, ConfirmButton, Dialog, Panel } from './ui';

const SIDE_NAME: Record<BattleWho['side'], string> = { you: 'you', companion: 'companion', ally: 'party', enemy: 'enemy' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fileName = (b: Battle) => `battle-${battleName(b).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'record'}-${new Date(b.started).toISOString().slice(0, 10)}.json`;

export function BattlePanel() {
  const { char: c } = useChar();
  const [archiving, setArchiving] = useState(false);
  const b = c.battle;
  const open = openEvents(b);
  return (
    <Panel title="Battle" tab="enemies">
      {!b ? (
        <p className="hint" style={{ marginTop: 0 }}>
          {inBattle(c)
            ? 'Ready: the first attack, save or damage starts this battle’s record.'
            : 'Once there are enemies on the field or a fight in initiative, every attack, save and damage is kept here: yours, your companions’, and what you log for others. End the battle to keep it.'}
        </p>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            <b>{battleName(b)}</b> · started {when(b.started)}
            {b.rounds ? ` · round ${Math.max(b.rounds, c.fight?.round ?? 0)}` : ''} · {b.events.length} thing{b.events.length === 1 ? '' : 's'} kept
          </p>
          <StatsList b={b} />
          {open.length > 0 && <OpenRolls events={open} />}
          <EventLog b={b} />
        </>
      )}
      {(b || c.enemies.length > 0) && (
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn small primary" onClick={() => setArchiving(true)}>
            Save to archive…
          </button>
          <span className="hint">Name it, then keep a snapshot or end the battle.</span>
        </div>
      )}
      {inBattle(c) && <LogTurn />}
      <PastBattles />
      {archiving && <ArchiveDialog onClose={() => setArchiving(false)} />}
    </Panel>
  );
}

/**
 * Saving the battle to the archive: a name and notes of your own, then either a snapshot (the
 * fight goes on; save again later) or the end of it, with the enemies cleared off if you like.
 * Everything on the Enemies panel is kept: every card, its damage, AC, conditions and notes.
 */
export function ArchiveDialog({ onClose }: { onClose: () => void }) {
  const { char: c, update } = useChar();
  const t = useTable();
  const cat = useCatalog();
  const suggested = c.battle ? battleName(c.battle) : autoName({ combatants: c.enemies.map(enemyWho) });
  const [name, setName] = useState(c.battle?.name.trim() ? c.battle.name : '');
  const [notes, setNotes] = useState(c.battle?.notes ?? '');
  const [clear, setClear] = useState(true);
  const save = (end: boolean) => {
    const title = name.trim() || suggested;
    update((d) => void archiveBattle(d, { name: title, notes, end, clear: end && clear }, cat?.creatures ?? []));
    t.note(end ? 'Battle archived' : 'Snapshot archived', `${title}: under Battle → Archive${end ? '' : '. The fight goes on; save again any time'}.`);
    onClose();
  };
  return (
    <Dialog title="Save to archive" onClose={onClose}>
      <p className="hint" style={{ marginTop: 0 }}>
        Keeps the Enemies panel as it is (every enemy, the damage each took and from whom, what you learned of its AC, its conditions, marks, resistances and notes) with
        the battle’s log and everyone’s numbers.
      </p>
      <label className="field">
        <span>Name the battle</span>
        <input className="input" value={name} placeholder={suggested} onChange={(e) => setName(e.target.value.slice(0, 120))} autoFocus />
      </label>
      <label className="field">
        <span>Notes (optional)</span>
        <textarea className="input" value={notes} placeholder="What happened, loot, who fell…" onChange={(e) => setNotes(e.target.value.slice(0, 4000))} />
      </label>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn small" onClick={() => save(false)}>
          Save a snapshot
        </button>
        <span className="hint">The fight goes on.</span>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button type="button" className="btn small primary" onClick={() => save(true)}>
          End the battle and archive it
        </button>
        <Check label="Clear the enemies off the field" id="archive-clear" checked={clear} onChange={setClear} />
      </div>
    </Dialog>
  );
}

/** Each person's numbers, a card apiece: those who did nothing are named underneath. */
function StatsList({ b }: { b: Battle }) {
  const stats = battleStats(b);
  const active = stats.filter(didSomething);
  const idle = stats.filter((s) => !didSomething(s));
  return (
    <>
      <div className="battle-stats">
        {active.map((s) => (
          <StatsCard key={whoKey(s.who)} s={s} />
        ))}
      </div>
      {idle.length > 0 && <p className="hint">Also there: {idle.map((s) => s.who.name).join(', ')}</p>}
    </>
  );
}

function StatsCard({ s }: { s: WhoStats }) {
  const saves = s.saves.made + s.saves.failed;
  const con = s.con.made + s.con.failed;
  const conc = s.concentration.kept + s.concentration.lost;
  const forced = s.forced.made + s.forced.failed + s.forced.unknown;
  const lines = [
    s.attacks ? `Hit ${hitRateText(s)}${s.crits ? ` · ${s.crits} crit${s.crits === 1 ? '' : 's'}` : ''}${s.unknown ? ` · ${s.unknown} not known` : ''}` : '',
    [s.dealt.high ? `Dealt ${rangeText(s.dealt)}` : '', s.taken.high ? `Took ${rangeText(s.taken)}` : ''].filter(Boolean).join(' · '),
    saves ? `Saves made ${s.saves.made} of ${saves}${con ? ` (CON ${s.con.made} of ${con})` : ''}${s.saves.unknown ? ` · ${s.saves.unknown} not known` : ''}` : s.saves.unknown ? `Saves: ${s.saves.unknown} not known yet` : '',
    conc ? `Concentration kept ${s.concentration.kept} of ${conc}` : '',
    forced ? `Saves against them: ${s.forced.made} made, ${s.forced.failed} failed${s.forced.unknown ? `, ${s.forced.unknown} not known` : ''}` : '',
  ].filter(Boolean);
  const ranged = s.dealt.low !== s.dealt.high || s.taken.low !== s.taken.high;
  return (
    <div className={`battle-card side-${s.who.side}`}>
      <b>{s.who.name}</b> <small className="hint">{SIDE_NAME[s.who.side]}</small>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
      {ranged && <small className="hint">A range is the least to the most, while saves or hits aren’t known.</small>}
    </div>
  );
}

/** Rolls still waiting on the DM: answer them here any time, even after their result is gone. */
function OpenRolls({ events }: { events: BattleEvent[] }) {
  const t = useTable();
  return (
    <section className="open-rolls">
      <h4>Not settled yet ({events.length})</h4>
      <p className="hint" style={{ margin: 0 }}>
        Counted as a range until you answer. Answering lands the damage on the enemy.
      </p>
      <ul>
        {events.map((e) => {
          const ref = e.target?.ref ?? '';
          const save = e.kind === 'save';
          return (
            <li key={e.id}>
              <span>{eventText(e)}</span>
              <span className="row">
                <button type="button" className="btn small" onClick={() => t.settleOpen(e.roll, ref, save ? 'failed' : 'hit')}>
                  {save ? 'Failed' : 'Hit'}
                </button>
                <button type="button" className="btn small" onClick={() => t.settleOpen(e.roll, ref, save ? 'saved' : 'miss')}>
                  {save ? 'Saved' : 'Missed'}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EventLog({ b }: { b: Battle }) {
  if (!b.events.length) return null;
  return (
    <details className="battle-log">
      <summary className="hint">Everything that happened ({b.events.length})</summary>
      <ol>
        {b.events.map((e) => (
          <li key={e.id}>{eventText(e)}</li>
        ))}
      </ol>
    </details>
  );
}

/** Everyone you can log for: on the field, in the fight, your party, and anyone already in the battle. */
function people(c: Character): BattleWho[] {
  const all = [...presentWho(c), ...c.party.map(allyWho), ...(c.battle?.combatants ?? [])];
  return all.filter((w, i) => all.findIndex((x) => sameWho(x, w)) === i);
}

/**
 * What someone else did, as the DM or they tell it: an attack (hit, crit or miss, and its
 * damage), a saving throw, or damage from a spell or effect with a save that may not be known.
 */
export function LogTurn({ by: initialBy, title = 'Log someone’s turn' }: { by?: BattleWho | null; title?: string }) {
  const { char: c } = useChar();
  const t = useTable();
  const list = people(c);
  const first = initialBy && list.some((w) => sameWho(w, initialBy)) ? whoKey(initialBy) : whoKey(list.find((w) => w.side !== 'you') ?? youWho(c));
  const [mode, setMode] = useState<'attack' | 'save' | 'damage'>('attack');
  const [byKey, setBy] = useState(first);
  const [targetKey, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('');
  const [what, setWhat] = useState('');
  const [ability, setAbility] = useState<Ability>('con');
  const [dmgAbility, setDmgAbility] = useState<Ability>('dex');
  const [half, setHalf] = useState(true);
  const [conc, setConc] = useState(false);
  const [dc, setDc] = useState('');
  const [lastBy, setLastBy] = useState(initialBy ? whoKey(initialBy) : '');
  // Whoever's turn comes up next becomes the one acting.
  if (initialBy && whoKey(initialBy) !== lastBy) {
    setLastBy(whoKey(initialBy));
    if (list.some((w) => sameWho(w, initialBy))) setBy(whoKey(initialBy));
  }
  const by = list.find((w) => whoKey(w) === byKey) ?? list[0];
  // An enemy's turn aims at you by default; anyone else's at an enemy.
  const targets = list.filter((w) => !sameWho(w, by));
  const target = targets.find((w) => whoKey(w) === targetKey) ?? (by?.side === 'enemy' ? targets.find((w) => w.side === 'you') : targets.find((w) => w.side === 'enemy')) ?? targets[0];
  const n = Math.max(0, parseInt(amount, 10) || 0);
  const reset = () => (setAmount(''), setWhat(''));
  if (!by) return null;
  const select = (id: string, label: string, value: string, set: (v: string) => void, options: BattleWho[]) => (
    <select id={id} className="input" value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
      {options.map((w) => (
        <option key={whoKey(w)} value={whoKey(w)}>
          {w.name} ({SIDE_NAME[w.side]})
        </option>
      ))}
    </select>
  );
  return (
    <section className="log-turn">
      <h4>{title}</h4>
      <div className="seg" role="group" aria-label="What happened">
        {(
          [
            ['attack', 'Attack'],
            ['save', 'Saving throw'],
            ['damage', 'Spell or effect'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="log-grid">
        <label className="field">
          <span>{mode === 'save' ? 'Who saved' : 'Who'}</span>
          {select('log-by', 'Who acted', whoKey(by), setBy, list)}
        </label>
        {mode !== 'save' && target && (
          <label className="field">
            <span>At</span>
            {select('log-at', 'At whom', whoKey(target), setTarget, targets)}
          </label>
        )}
        {mode === 'save' ? (
          <>
            <label className="field">
              <span>Save</span>
              <select className="input" value={ability} onChange={(e) => setAbility(e.target.value as Ability)} aria-label="Which save">
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {ABILITY_NAMES[a]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>DC (if known)</span>
              <input className="input" inputMode="numeric" value={dc} onChange={(e) => setDc(e.target.value)} placeholder="—" />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>{mode === 'damage' ? 'Full damage' : 'Damage (if it hit)'}</span>
              <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </label>
            <label className="field">
              <span>Type</span>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Damage type">
                <option value="">—</option>
                {DAMAGE_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {cap(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>With (optional)</span>
              <input className="input" value={what} onChange={(e) => setWhat(e.target.value)} placeholder={mode === 'damage' ? 'Fireball' : 'Longsword'} />
            </label>
          </>
        )}
        {mode === 'damage' && (
          <label className="field">
            <span>Their save</span>
            <select className="input" value={dmgAbility} onChange={(e) => setDmgAbility(e.target.value as Ability)} aria-label="Which save it allows">
              {ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {ABILITY_NAMES[a]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {mode === 'save' && <Check label="To keep concentrating" id="log-conc" checked={conc} onChange={(v) => (setConc(v), v && setAbility('con'))} />}
      {mode === 'damage' && <Check label="Half damage on a made save" id="log-half" checked={half} onChange={setHalf} />}
      <div className="row log-buttons">
        {mode === 'attack' &&
          target &&
          (['hit', 'crit', 'miss'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`btn small${r === 'miss' ? ' ghost' : ''}`}
              onClick={() => {
                t.logAction({ kind: 'attack', by, target, result: r, amount: r === 'miss' ? 0 : n, type, what });
                reset();
              }}
            >
              {r === 'hit' ? 'Hit' : r === 'crit' ? 'Crit' : 'Missed'}
            </button>
          ))}
        {mode === 'save' &&
          ([true, false] as const).map((made) => (
            <button
              key={String(made)}
              type="button"
              className="btn small"
              onClick={() => {
                const d = parseInt(dc, 10);
                t.logAction({ kind: 'save', by: null, who: by, ability, made, concentration: conc, dc: Number.isFinite(d) ? d : null, what: '' });
                setDc('');
              }}
            >
              {made ? 'Made it' : 'Failed'}
            </button>
          ))}
        {mode === 'damage' &&
          target &&
          (
            [
              ['failed', 'Failed the save'],
              ['saved', 'Made the save'],
              ['unknown', 'Save not known'],
              ['none', 'No save'],
            ] as const
          ).map(([save, label]) => (
            <button
              key={save}
              type="button"
              className={`btn small${save === 'unknown' ? ' primary' : ''}`}
              disabled={n <= 0}
              onClick={() => {
                t.logAction({ kind: 'damage', by, target, amount: n, type, what, save, half, ability: dmgAbility });
                reset();
              }}
            >
              {label}
            </button>
          ))}
      </div>
      {mode === 'damage' && <p className="hint" style={{ margin: 0 }}>Not known: the battle counts {half ? 'half' : 'none'} to all of it until you answer.</p>}
    </section>
  );
}

/** Battles you've ended: their numbers, what happened, and copying or saving them. */
function PastBattles() {
  const { char: c, update } = useChar();
  const cat = useCatalog();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  if (!c.battles.length) return null;
  return (
    <section className="past-battles">
      <h4>Archive ({c.battles.length})</h4>
      <div className="list">
        {c.battles.map((b) => (
          <div className="item" key={b.id}>
            <div className="item-head">
              <button type="button" className="item-title" onClick={() => setOpen(open === b.id ? null : b.id)} aria-expanded={open === b.id}>
                <b>{battleName(b)}</b>
                <small>
                  {when(b.started)}
                  {b.checkpoint ? ' · snapshot' : ''}
                  {b.rounds ? ` · ${b.rounds} round${b.rounds === 1 ? '' : 's'}` : ''} · {summaryLine(b, c)}
                </small>
              </button>
            </div>
            {open === b.id && (
              <div className="item-body">
                <label className="field">
                  <span>Name</span>
                  <input
                    className="input"
                    value={b.name}
                    onChange={(e) =>
                      update((d) => {
                        const x = d.battles.find((y) => y.id === b.id);
                        if (x) x.name = e.target.value.slice(0, 120);
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Notes</span>
                  <textarea
                    className="input"
                    value={b.notes}
                    placeholder="What happened, loot, who fell…"
                    onChange={(e) =>
                      update((d) => {
                        const x = d.battles.find((y) => y.id === b.id);
                        if (x) x.notes = e.target.value.slice(0, 4000);
                      })
                    }
                  />
                </label>
                {b.checkpoint && <p className="hint">A snapshot, saved mid-fight on {when(b.ended ?? b.started)}.</p>}
                <StatsList b={b} />
                {b.field.length > 0 ? (
                  <section>
                    <h4>The Enemies panel, as it was</h4>
                    <div className="archived-field">
                      {b.field.map((e) => (
                        <ArchivedEnemy key={e.id} e={e} />
                      ))}
                    </div>
                  </section>
                ) : (
                  b.enemies.length > 0 && <p className="hint">Enemies: {b.enemies.map((e) => `${e.name} (${e.status === 'down' ? 'down' : e.status === 'healthy' ? 'standing' : e.status === 'badly' ? 'badly hurt' : 'bloodied'})`).join(', ')}</p>
                )}
                <EventLog b={b} />
                {b.field.length > 0 && (
                  <div className="row">
                    <ConfirmButton
                      label="Bring back to the table"
                      confirmLabel={c.enemies.length || c.battle ? 'Set aside what’s there and bring it back?' : 'Bring it back?'}
                      onConfirm={() => {
                        update((d) => void resumeBattle(d, b.id, cat?.creatures ?? []));
                        setMsg(`${battleName(b)} is back on the Enemies panel, its log going again${c.enemies.length || c.battle ? '. What was there is in the archive' : ''}.`);
                      }}
                    />
                  </div>
                )}
                <div className="row">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      navigator.clipboard?.writeText(battleText(b)).then(
                        () => setMsg('Copied: paste it anywhere.'),
                        () => setMsg('Couldn’t copy here.'),
                      )
                    }
                  >
                    Copy as text
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={async () => {
                      const r = await saveFileToDevice(fileName(b), battleFile(b));
                      setMsg(r.message);
                    }}
                  >
                    Save as a file
                  </button>
                  {isNative() && !isMacApp() && (
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={async () => {
                        const r = await shareFile(fileName(b), battleFile(b));
                        setMsg(r.message);
                      }}
                    >
                      Share…
                    </button>
                  )}
                  <ConfirmButton label="Delete" confirmLabel="Delete?" className="btn small ghost" onConfirm={() => update((d) => void (d.battles = d.battles.filter((x) => x.id !== b.id)))} />
                </div>
                {msg && (
                  <p className="hint" role="status">
                    {msg}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** "You hit 5 of 7 (71%), dealt 34–46". */
function summaryLine(b: Battle, c: Character): string {
  const me = battleStats(b).find((s) => s.who.side === 'you') ?? battleStats(b).find((s) => sameWho(s.who, youWho(c)));
  if (!me) return `${b.events.length} things kept`;
  return [me.attacks ? `you hit ${hitRateText(me)}` : '', me.dealt.high ? `dealt ${rangeText(me.dealt)}` : ''].filter(Boolean).join(', ') || `${b.events.length} things kept`;
}

/** An enemy card from the archive, as it was: read only. */
function ArchivedEnemy({ e }: { e: Enemy }) {
  const cat = useCatalog();
  const creatures = cat?.creatures ?? [];
  const t = tally(e);
  const max = knownMaxHp(e, creatures);
  const status = statusOf(e, creatures);
  const by = [t.you ? `you ${t.you}` : '', ...t.companions.map(([n, v]) => `${n} ${v}`), ...t.party.map(([n, v]) => `${n} ${v}`)].filter(Boolean);
  const traits = [...e.conditions.map(conditionName), ...e.marks.map((m) => m.name)];
  const defences = [e.resist.length ? `Resists ${e.resist.join(', ')}` : '', e.immune.length ? `Immune to ${e.immune.join(', ')}` : '', e.vulnerable.length ? `Vulnerable to ${e.vulnerable.join(', ')}` : ''].filter(Boolean);
  return (
    <div className={`archived-enemy status-${status}`}>
      <b>{e.name}</b> <small className="hint">{STATUS_NAMES[status]}</small>
      <div>
        {acText(e, creatures)}
        {max !== null ? ` · ${max} HP` : ''} · took {t.total}
        {max !== null ? ` (${Math.max(0, max - t.total)} left)` : ''}
      </div>
      {traits.length > 0 && <div>{traits.join(' · ')}</div>}
      {defences.length > 0 && <div>{defences.join(' · ')}</div>}
      {by.length > 0 && <div className="hint">By {by.join(', ')}</div>}
      {e.notes.trim() && <p className="hint" style={{ margin: 0 }}>“{e.notes.trim()}”</p>}
      {e.hits.length > 0 && (
        <details>
          <summary className="hint">Each hit ({e.hits.length})</summary>
          <ul className="hit-log">
            {e.hits.map((h) => (
              <li key={h.id}>
                <span>
                  {h.who === 'you' ? 'You' : h.name || 'Party'}
                  {h.what ? `: ${h.what}` : ''}
                </span>
                <span>
                  {h.amount}
                  {h.type ? ` ${h.type}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
