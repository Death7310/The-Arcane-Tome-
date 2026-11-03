// The Enemies page: the foes in the fight as the DM describes them, one line each until you tap
// one, which makes it your target (gold). Your weapons, spells and companions' attacks then go at
// it: its AC (or what your hits and misses have shown), its conditions (Advantage against a
// Prone foe within 5 feet…), your marks on it (Hunter's Mark) and the damage it has taken.

import { useMemo, useState } from 'react';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { ordinal, useTable, type SlotChoice } from '../state/table';
import { CONDITIONS, DAMAGE_TYPES, type ConditionId } from '../systems/dnd5e/data';
import { actionDice, actionType } from '../systems/dnd5e/companion';
import {
  acText,
  attackAgainst,
  enemiesFromCreature,
  enemySummary,
  hurt,
  knownAc,
  knownMaxHp,
  markFromSpell,
  quickEnemies,
  STATUS_NAMES,
  statusOf,
  tally,
} from '../systems/dnd5e/enemies';
import { uid, type Character, type Enemy, type EnemyStatus, type Spell } from '../systems/dnd5e/model';
import { pactSlots, signed, spellSlots, weaponAttack } from '../systems/dnd5e/rules';
import type { CreatureDef } from '../systems/dnd5e/srd';
import { ConfirmButton, Dialog, Panel } from './ui';

const STATUSES: EnemyStatus[] = ['healthy', 'bloodied', 'badly', 'down'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function EnemiesPanel() {
  const { char: c, update } = useChar();
  const cat = useCatalog();
  const creatures = cat?.creatures ?? [];
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(c.targetId);
  const target = c.enemies.find((e) => e.id === c.targetId) ?? null;
  // Tapping an enemy makes it your target and opens it; tapping your target again folds it.
  const tap = (e: Enemy) => {
    if (c.targetId !== e.id) {
      update((d) => void (d.targetId = e.id));
      setOpen(e.id);
    } else setOpen(open === e.id ? null : e.id);
  };
  return (
    <Panel
      title="Enemies"
      tab="enemies"
      actions={
        <button type="button" className="btn small" onClick={() => setAdding(true)}>
          Add
        </button>
      }
    >
      {c.enemies.length === 0 && (
        <p className="hint" style={{ margin: 0 }}>
          No enemies yet. Add them as the DM describes them: a name is enough, and you fill in their AC, conditions and how hurt they look as you learn it. Tap one to make it your target:
          your attacks and spells then go at it.
        </p>
      )}
      <div className="enemy-list">
        {c.enemies.map((e) => {
          const isTarget = e.id === c.targetId;
          const t = tally(e);
          const status = statusOf(e, creatures);
          return (
            <div key={e.id} className={`enemy${isTarget ? ' target' : ''} status-${status}`}>
              <button type="button" className="enemy-line" onClick={() => tap(e)} aria-expanded={open === e.id} aria-pressed={isTarget}>
                <b>{e.name}</b>
                <small>
                  {[enemySummary(e, creatures), t.total ? `${t.total} damage` : ''].filter(Boolean).join(' · ')}
                  {isTarget && <span className="target-tag"> · target</span>}
                </small>
              </button>
              {open === e.id && isTarget && <EnemyCard e={e} creatures={creatures} />}
            </div>
          );
        })}
      </div>
      {c.enemies.length > 0 && (
        <div className="row" style={{ marginTop: 10 }}>
          {target && (
            <button type="button" className="btn small ghost" onClick={() => update((d) => void (d.targetId = null))}>
              No target
            </button>
          )}
          <ConfirmButton
            label="Clear the battlefield"
            confirmLabel="Remove every enemy?"
            className="btn small ghost"
            onConfirm={() =>
              update((d) => {
                d.enemies = [];
                d.targetId = null;
                if (d.fight) d.fight.order = d.fight.order.filter((x) => x.kind !== 'enemy');
              })
            }
          />
        </div>
      )}
      {adding && <AddEnemyDialog onClose={() => setAdding(false)} />}
    </Panel>
  );
}

/** Your target, everything about it, and everything you can do to it. */
function EnemyCard({ e, creatures }: { e: Enemy; creatures: CreatureDef[] }) {
  const { char: c, update } = useChar();
  const set = (fn: (x: Enemy) => void) =>
    update((d) => {
      const x = d.enemies.find((y) => y.id === e.id);
      if (x) fn(x);
    });
  const def = e.creatureId ? creatures.find((x) => x.srd === e.creatureId) : undefined;
  const ac = knownAc(e, creatures);
  const max = knownMaxHp(e, creatures);
  const t = tally(e);
  const melee = attackAgainst(e, false);
  const ranged = attackAgainst(e, true);
  const effect = (a: ReturnType<typeof attackAgainst>) =>
    a.adv.length && a.dis.length ? 'normal (Advantage and Disadvantage cancel)' : a.adv.length ? `Advantage (${a.adv.join(', ')})` : a.dis.length ? `Disadvantage (${a.dis.join(', ')})` : 'normal';
  return (
    <div className="enemy-card">
      <AttackButtons c={c} />

      <section>
        <h4>Conditions</h4>
        <div className="chips">
          {CONDITIONS.map((k) => (
            <button
              key={k.id}
              type="button"
              className="chip"
              aria-pressed={e.conditions.includes(k.id)}
              title={k.summary}
              onClick={() => set((x) => void (x.conditions = x.conditions.includes(k.id) ? x.conditions.filter((y) => y !== k.id) : [...x.conditions, k.id as ConditionId]))}
            >
              {k.name}
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          Your melee attacks: {effect(melee)}
          {melee.autoCrit ? `, and ${melee.autoCrit.split(': ')[1]}` : ''}. Ranged: {effect(ranged)}.
        </p>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="hint">Within 5 feet of you:</span>
          <div className="seg" role="radiogroup" aria-label="Within 5 feet of you">
            {(
              [
                [null, 'By the attack'],
                [true, 'Yes'],
                [false, 'No'],
              ] as const
            ).map(([v, name]) => (
              <button key={name} type="button" role="radio" aria-checked={e.near === v} onClick={() => set((x) => void (x.near = v))}>
                {name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h4>Your marks on it</h4>
        <Marks e={e} set={set} />
      </section>

      <section className="grid-2">
        <label className="field">
          <span>AC {ac === null && e.acAtLeast === null && e.acAtMost === null ? '(unknown)' : ''}</span>
          <input
            className="input"
            inputMode="numeric"
            placeholder={acText(e, creatures).replace('AC ', '') || '?'}
            value={e.ac ?? ''}
            onChange={(ev) => {
              const n = parseInt(ev.target.value, 10);
              set((x) => void (x.ac = Number.isFinite(n) && n > 0 ? Math.min(40, n) : null));
            }}
            aria-label={`${e.name}: Armor Class`}
          />
        </label>
        <label className="field">
          <span>HP maximum (if you learn it)</span>
          <input
            className="input"
            inputMode="numeric"
            placeholder="?"
            value={e.maxHp ?? ''}
            onChange={(ev) => {
              const n = parseInt(ev.target.value, 10);
              set((x) => void (x.maxHp = Number.isFinite(n) && n > 0 ? n : null));
            }}
            aria-label={`${e.name}: HP maximum`}
          />
        </label>
      </section>
      {e.ac === null && (e.acAtLeast !== null || e.acAtMost !== null) && (
        <p className="hint" style={{ margin: 0 }}>
          From your hits and misses: <b>{acText(e, creatures)}</b>.{' '}
          <button type="button" className="btn small ghost" onClick={() => set((x) => void ((x.acAtLeast = null), (x.acAtMost = null)))}>
            Forget it
          </button>
        </p>
      )}

      <section>
        <h4>How hurt it looks</h4>
        {max !== null ? (
          <p className="hint" style={{ margin: 0 }}>
            {STATUS_NAMES[statusOf(e, creatures)]}: {Math.max(0, max - t.total)} of {max} HP left.
          </p>
        ) : (
          <div className="seg wrap" role="radiogroup" aria-label={`${e.name}: how hurt it looks`}>
            {STATUSES.map((st) => (
              <button key={st} type="button" role="radio" aria-checked={e.status === st} onClick={() => set((x) => void (x.status = st))}>
                {STATUS_NAMES[st]}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4>Damage taken: {t.total}</h4>
        <p className="hint" style={{ margin: 0 }}>
          {[`You ${t.you}`, ...t.companions.map(([n, v]) => `${n} ${v}`), ...t.party.map(([n, v]) => `${n} ${v}`)].join(' · ')}
        </p>
        <PartyDamage e={e} />
        {e.hits.length > 0 && (
          <details>
            <summary className="hint">Each hit ({e.hits.length})</summary>
            <ul className="hit-log">
              {[...e.hits].reverse().map((h) => (
                <li key={h.id}>
                  <span>
                    {h.amount} {h.type} · {h.who === 'you' ? 'you' : h.name}
                    {h.what ? ` (${h.what})` : ''}
                  </span>
                  <button type="button" className="btn small ghost icon" aria-label="Remove this damage" onClick={() => set((x) => void (x.hits = x.hits.filter((y) => y.id !== h.id)))}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <details>
        <summary className="hint">Resistances, immunities and vulnerabilities{e.resist.length + e.immune.length + e.vulnerable.length ? ` (${e.resist.length + e.immune.length + e.vulnerable.length})` : ''}</summary>
        {(['resist', 'immune', 'vulnerable'] as const).map((k) => (
          <div key={k} style={{ marginTop: 6 }}>
            <span className="hint">{k === 'resist' ? 'Resists (half damage)' : k === 'immune' ? 'Immune (no damage)' : 'Vulnerable (double damage)'}</span>
            <div className="chips">
              {DAMAGE_TYPES.map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={e[k].includes(d)} onClick={() => set((x) => void (x[k] = x[k].includes(d) ? x[k].filter((y) => y !== d) : [...x[k], d]))}>
                  {cap(d)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </details>

      {def && (
        <p className="hint" style={{ margin: 0 }}>
          From the creature list: {def.name}.{' '}
          {e.revealed ? `Its stats are in use: AC ${def.ac}, HP ${def.hp}, ${def.size} ${def.type}.` : 'Its stats stay hidden, so nothing is spoiled.'}{' '}
          <button type="button" className="btn small ghost" onClick={() => set((x) => void (x.revealed = !x.revealed))}>
            {e.revealed ? 'Hide them again' : 'Reveal its stats'}
          </button>
        </p>
      )}

      <label className="field">
        <span>Notes</span>
        <textarea className="input" value={e.notes} placeholder="What the DM has told you: what it is, what it did…" onChange={(ev) => set((x) => void (x.notes = ev.target.value))} aria-label={`${e.name}: notes`} />
      </label>
      <div className="row">
        <button
          type="button"
          className="btn small ghost"
          onClick={() =>
            update((d) => {
              const base = e.name.replace(/\s+\d+$/, '');
              // A lone "Goblin" becomes Goblin 1, and the new one Goblin 2.
              const lone = d.enemies.find((x) => x.name === base);
              if (lone) lone.name = `${base} 1`;
              const [copy] = quickEnemies(base, 1, d.enemies, { ac: e.ac, maxHp: e.maxHp });
              d.enemies.push({ ...copy, creatureId: e.creatureId, revealed: e.revealed, resist: [...e.resist], immune: [...e.immune], vulnerable: [...e.vulnerable] });
            })
          }
        >
          Add another like it
        </button>
        <ConfirmButton
          label="Remove"
          confirmLabel={`Remove ${e.name}?`}
          className="btn small ghost"
          onConfirm={() =>
            update((d) => {
              d.enemies = d.enemies.filter((x) => x.id !== e.id);
              if (d.targetId === e.id) d.targetId = null;
              if (d.fight) d.fight.order = d.fight.order.filter((x) => x.ref !== e.id);
            })
          }
        />
      </div>
    </div>
  );
}

/** Your weapons, spells and companions' attacks, aimed at the target. */
function AttackButtons({ c }: { c: Character }) {
  const t = useTable();
  const [casting, setCasting] = useState(false);
  const aimed = c.spells.filter((s) => s.level === 0 || s.prepared).filter((s) => s.resolution === 'attack' || s.resolution === 'save' || s.resolution === 'auto' || markFromSpell(s));
  const companionAttacks: { key: string; label: string; sub?: string; run: (el: HTMLElement) => void }[] = c.companions.flatMap((k) => [
    ...k.weapons.map((w) => ({ key: `${k.id}-${w.id}`, label: `${k.name}: ${w.name}`, run: (el: HTMLElement) => t.companionWeapon(k, w, el) })),
    ...k.actions.filter((a) => a.attack).map((a) => ({ key: `${k.id}-${a.id}`, label: `${k.name}: ${a.name}`, sub: `${actionDice(a, c)} ${actionType(k, a)}`.trim(), run: (el: HTMLElement) => t.companionAct(k, a, el) })),
  ]);
  return (
    <section>
      <h4>Attack it</h4>
      <div className="comp-actions">
        {c.weapons.map((w) => (
          <button key={w.id} type="button" className={`cast el-${w.damage[0]?.type ?? 'bludgeoning'}`} onClick={(e) => t.attack(w, e.currentTarget)}>
            <span>{w.name}</span>
            <small>{signed(weaponAttack(c, w).total)} to hit</small>
          </button>
        ))}
        {companionAttacks.map((a) => (
          <button key={a.key} type="button" className="cast" onClick={(e) => a.run(e.currentTarget)}>
            <span>{a.label}</span>
            {a.sub && <small>{a.sub}</small>}
          </button>
        ))}
        {aimed.length > 0 && (
          <button type="button" className="cast" onClick={() => setCasting((v) => !v)} aria-expanded={casting}>
            <span>Cast…</span>
            <small>{aimed.length} spells</small>
          </button>
        )}
      </div>
      {casting && <SpellPicker spells={aimed} c={c} onDone={() => setCasting(false)} />}
    </section>
  );
}

/** A spell at the target: cantrips go at once; levelled spells ask which slot. */
function SpellPicker({ spells, c, onDone }: { spells: Spell[]; c: Character; onDone: () => void }) {
  const t = useTable();
  const [pick, setPick] = useState<Spell | null>(null);
  const slots = spellSlots(c);
  const pact = pactSlots(c);
  const go = (s: Spell, choice: SlotChoice, el: HTMLElement) => {
    t.cast(s, choice, el);
    setPick(null);
    onDone();
  };
  return (
    <div className="popover" role="group" aria-label="Cast a spell at your target">
      {!pick &&
        spells.map((s) => (
          <button key={s.id} type="button" className="btn small" onClick={(e) => (s.level === 0 ? go(s, { kind: 'free', level: 0 }, e.currentTarget) : setPick(s))}>
            {s.name}
            {s.level ? ` (${ordinal(s.level)})` : ''}
          </button>
        ))}
      {pick && (
        <>
          <span className="hint">{pick.name} with:</span>
          {t.slotChoices(pick, slots, pact).map((ch) => (
            <button key={`${ch.kind}-${ch.level}`} type="button" className="btn small" onClick={(e) => go(pick, ch, e.currentTarget)}>
              {ch.kind === 'pact' ? `Pact slot (${ordinal(ch.level)})` : `${ordinal(ch.level)}-level slot`}
            </button>
          ))}
          <button type="button" className="btn small ghost" onClick={(e) => go(pick, { kind: 'free', level: pick.level }, e.currentTarget)}>
            Without a slot
          </button>
          <button type="button" className="btn small ghost" onClick={() => setPick(null)}>
            Back
          </button>
        </>
      )}
    </div>
  );
}

/** Hunter's Mark and the like: added when you cast them at the target, or by hand; moved when the target drops. */
function Marks({ e, set }: { e: Enemy; set: (fn: (x: Enemy) => void) => void }) {
  const { char: c, update } = useChar();
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState('');
  const [dice, setDice] = useState('1d6');
  const [type, setType] = useState('force');
  const presets = c.spells.map((s) => ({ s, m: markFromSpell(s) })).filter((x) => x.m && !e.marks.some((m) => m.name === x.s.name));
  const others = c.enemies.filter((x) => x.id !== e.id);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {e.marks.length === 0 && <span className="hint">None. Cast Hunter’s Mark or Hex at it, or add one here.</span>}
      {e.marks.map((m) => (
        <div key={m.id} className="row">
          <span className={`chip el-${m.type}`}>
            {m.name} +{m.dice} {m.type}
          </span>
          {others.length > 0 && (
            <select
              value=""
              aria-label={`Move ${m.name} to another enemy`}
              onChange={(ev) => {
                const to = ev.target.value;
                if (!to) return;
                update((d) => {
                  const from = d.enemies.find((y) => y.id === e.id);
                  const dest = d.enemies.find((y) => y.id === to);
                  if (!from || !dest) return;
                  from.marks = from.marks.filter((y) => y.id !== m.id);
                  dest.marks.push(m);
                });
              }}
            >
              <option value="">Move to…</option>
              {others.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn small ghost icon" aria-label={`Remove ${m.name}`} onClick={() => set((x) => void (x.marks = x.marks.filter((y) => y.id !== m.id)))}>
            ✕
          </button>
        </div>
      ))}
      <div className="row">
        {presets.map(({ s, m }) => (
          <button
            key={s.id}
            type="button"
            className="btn small ghost"
            title="Already cast it? Put its mark here without casting again"
            onClick={() => set((x) => void x.marks.push({ ...m!, id: uid(), spell: c.spellcasting.concentratingOn === s.name ? s.name : '' }))}
          >
            + {s.name}
          </button>
        ))}
        <button type="button" className="btn small ghost" onClick={() => setCustom((v) => !v)} aria-expanded={custom}>
          + Other
        </button>
      </div>
      {custom && (
        <div className="row">
          <input className="input" style={{ width: 130 }} placeholder="Name" value={name} onChange={(ev) => setName(ev.target.value)} aria-label="Mark name" />
          <input className="input" style={{ width: 70 }} placeholder="1d6" value={dice} onChange={(ev) => setDice(ev.target.value)} aria-label="Extra dice on your hits" />
          <select value={type} onChange={(ev) => setType(ev.target.value)} aria-label="Damage type">
            {DAMAGE_TYPES.map((d) => (
              <option key={d} value={d}>
                {cap(d)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn small"
            disabled={!name.trim() || !/^\d*d\d+([+-]\d+)?$/.test(dice.trim())}
            onClick={() => {
              set((x) => void x.marks.push({ id: uid(), name: name.trim(), dice: dice.trim(), type, spell: '' }));
              setName('');
              setCustom(false);
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

/** Damage from the rest of your party, with their names remembered. */
function PartyDamage({ e }: { e: Enemy }) {
  const { char: c, update } = useChar();
  const [amount, setAmount] = useState('');
  const [who, setWho] = useState(c.party[0] ?? '');
  const [type, setType] = useState('');
  const n = parseInt(amount, 10);
  const add = () =>
    update((d) => {
      const x = d.enemies.find((y) => y.id === e.id);
      const name = who.trim() || 'Party';
      if (!x || !Number.isFinite(n) || n <= 0) return;
      hurt(x, { roll: uid(), who: 'party', name, amount: n, type, what: '' });
      if (name !== 'Party' && !d.party.includes(name)) d.party.push(name);
    });
  return (
    <div className="party-damage">
      <span className="hint">Party damage:</span>
      <input className="input" inputMode="numeric" style={{ width: 64 }} placeholder="0" value={amount} onChange={(ev) => setAmount(ev.target.value)} aria-label="Damage a party member did" />
      <input className="input" style={{ width: 110 }} placeholder="Who (or Party)" value={who} onChange={(ev) => setWho(ev.target.value)} aria-label="Who did it" list={`party-${e.id}`} />
      <datalist id={`party-${e.id}`}>
        {c.party.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <select value={type} onChange={(ev) => setType(ev.target.value)} aria-label="Damage type (optional)">
        <option value="">Type…</option>
        {DAMAGE_TYPES.map((d) => (
          <option key={d} value={d}>
            {cap(d)}
          </option>
        ))}
      </select>
      <button type="button" className="btn small" disabled={!Number.isFinite(n) || n <= 0} onClick={() => (add(), setAmount(''))}>
        Add
      </button>
      {c.party.length > 0 && (
        <div className="chips" style={{ flexBasis: '100%' }}>
          {c.party.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={who === p} onClick={() => setWho(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Adding enemies: typed in quickly, or picked from the creature list with its numbers hidden. */
function AddEnemyDialog({ onClose }: { onClose: () => void }) {
  const { char: c, update } = useChar();
  const cat = useCatalog();
  const [tab, setTab] = useState<'quick' | 'list'>('quick');
  const [name, setName] = useState('');
  const [count, setCount] = useState('1');
  const [ac, setAc] = useState('');
  const [hp, setHp] = useState('');
  const [q, setQ] = useState('');
  const [hidden, setHidden] = useState(true);
  const [picked, setPicked] = useState<CreatureDef | null>(null);
  const n = Math.max(1, Math.min(20, parseInt(count, 10) || 1));
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (cat?.creatures ?? []).filter((x) => !needle || x.name.toLowerCase().includes(needle)).slice(0, 60);
  }, [cat, q]);
  const add = (made: Enemy[]) => {
    update((d) => {
      d.enemies.push(...made);
      // The first one becomes your target if you didn't have one.
      if (!d.targetId && made[0]) d.targetId = made[0].id;
    });
    onClose();
  };
  return (
    <Dialog title="Add enemies" onClose={onClose}>
      <div className="seg" role="radiogroup" aria-label="How to add">
        <button type="button" role="radio" aria-checked={tab === 'quick'} onClick={() => setTab('quick')}>
          Type it in
        </button>
        <button type="button" role="radio" aria-checked={tab === 'list'} onClick={() => setTab('list')}>
          From the creature list
        </button>
      </div>
      {tab === 'quick' && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div className="grid-2">
            <label className="field">
              <span>Name</span>
              <input className="input" value={name} placeholder="Goblin, Bandit captain…" onChange={(e) => setName(e.target.value)} aria-label="Enemy name" autoFocus />
            </label>
            <label className="field">
              <span>How many</span>
              <input className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} aria-label="How many" />
            </label>
            <label className="field">
              <span>AC, if the DM said</span>
              <input className="input" inputMode="numeric" value={ac} placeholder="?" onChange={(e) => setAc(e.target.value)} aria-label="Armor Class" />
            </label>
            <label className="field">
              <span>HP, if the DM said</span>
              <input className="input" inputMode="numeric" value={hp} placeholder="?" onChange={(e) => setHp(e.target.value)} aria-label="Hit points" />
            </label>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            {n > 1 ? `Adds ${quickEnemies(name || 'Enemy', n, c.enemies).map((e) => e.name).join(', ')}.` : 'Leave what you don’t know blank: an unknown AC is worked out from your hits and misses.'}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn small primary"
              disabled={!name.trim()}
              onClick={() => add(quickEnemies(name, n, c.enemies, { ac: parseInt(ac, 10) || null, maxHp: parseInt(hp, 10) || null }))}
            >
              Add {n > 1 ? `${n} enemies` : 'enemy'}
            </button>
          </div>
        </div>
      )}
      {tab === 'list' && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input className="input" value={q} placeholder="Search: goblin, bandit, wolf…" onChange={(e) => (setQ(e.target.value), setPicked(null))} aria-label="Search the creature list" autoFocus />
          {!picked && (
            <div className="list" style={{ maxHeight: 320, overflow: 'auto' }}>
              {list.map((x) => (
                <button key={x.srd} type="button" className="item-title enemy-pick" onClick={() => setPicked(x)}>
                  <b>{x.name}</b>
                  <small>
                    {x.size} {x.type}
                  </small>
                </button>
              ))}
              {cat && !list.length && <p className="hint">Nothing by that name. Type it in instead.</p>}
            </div>
          )}
          {picked && (
            <div className="note" style={{ display: 'grid', gap: 8 }}>
              <b>{picked.name}</b>
              <label className="field">
                <span>How many</span>
                <input className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} aria-label="How many" />
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Keep its stats hidden (no metagaming): only its name is used until you reveal them
              </label>
              <div className="row">
                <button type="button" className="btn small primary" onClick={() => add(enemiesFromCreature(picked, n, c.enemies, !hidden))}>
                  Add {n > 1 ? `${n}` : picked.name}
                </button>
                <button type="button" className="btn small ghost" onClick={() => setPicked(null)}>
                  Back
                </button>
              </div>
            </div>
          )}
          <p className="hint" style={{ margin: 0 }}>
            The creatures of the System Reference Document 5.2.1 and your rules library. The DM may have changed a creature, which is one more reason to keep its stats hidden.
          </p>
        </div>
      )}
    </Dialog>
  );
}

/**
 * Your target, shown above your attacks and spells (on any page), with a quick switch:
 * every attack and spell goes at it until you change it.
 */
export function TargetStrip() {
  const { char: c, update } = useChar();
  const cat = useCatalog();
  if (!c.enemies.length) return null;
  const target = c.enemies.find((e) => e.id === c.targetId) ?? null;
  return (
    <div className={`target-strip${target ? ' on' : ''}`}>
      <label>
        <span>Target</span>
        <select value={c.targetId ?? ''} onChange={(e) => update((d) => void (d.targetId = e.target.value || null))} aria-label="Your target">
          <option value="">No target</option>
          {c.enemies.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      {target && <small>{enemySummary(target, cat?.creatures ?? [])}</small>}
    </div>
  );
}
