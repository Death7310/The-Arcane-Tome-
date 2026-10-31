import { useRef, useState } from 'react';
import { useChar } from '../state/character';
import { useTable } from '../state/table';
import { ARMOR, DAMAGE_TYPES, STANDARD_ACTIONS, UNARMORED_DEFENSES, WEAPONS, type Ability, type DamageType } from '../systems/dnd5e/data';
import { blankWeapon, uid, type Weapon } from '../systems/dnd5e/model';
import { itemDefFromWeapon, parseItemText } from '../systems/dnd5e/items';
import { addItemsToLibrary } from '../state/library';
import { useCatalog } from '../state/catalog';
import { AddItemDialog } from './Items';
import { armorClass, armorWarnings, hitDice, maxHp, signed, speed, weaponAttack, weaponDamageBonus } from '../systems/dnd5e/rules';
import { Check, ConfirmButton, NumField, Panel, SelectField, TextField, mathText } from './ui';
import { isValid } from '../engine/dice';

export function VitalsPanel() {
  const { char: c, update } = useChar();
  const t = useTable();
  const [amount, setAmount] = useState(5);
  const dialRef = useRef<HTMLDivElement>(null);
  const max = maxHp(c).total;
  const pct = Math.max(0, Math.min(1, c.hp.current / max));
  const R = 48;
  const C = 2 * Math.PI * R;
  const ac = armorClass(c);
  const warnings = armorWarnings(c);
  const armor = ARMOR.find((a) => a.id === c.armor.armorId) ?? ARMOR[0];

  return (
    <Panel title="Vitals" tab="combat">
      <div className="hp">
        <div className="hp-dial" ref={dialRef} aria-label={`Hit points ${c.hp.current} of ${max}`}>
          <svg viewBox="0 0 112 112" aria-hidden="true">
            <circle cx="56" cy="56" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
            <circle
              cx="56"
              cy="56"
              r={R}
              fill="none"
              stroke={pct > 0.5 ? 'var(--good)' : pct > 0.2 ? 'var(--warn)' : 'var(--bad)'}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${C * pct} ${C}`}
              style={{ transition: 'stroke-dasharray 0.4s ease' }}
            />
          </svg>
          <div>
            <div className="now">{c.hp.current}</div>
            <div className="of">of {max}{c.hp.temp ? ` · +${c.hp.temp} temp` : ''}</div>
          </div>
        </div>
        <div className="hp-controls">
          <div className="row">
            <NumField value={amount} min={0} ariaLabel="Amount" id="hp-amount" onChange={setAmount} />
            <button type="button" className="btn" style={{ color: 'var(--bad)' }} onClick={() => t.damageSelf(amount, dialRef.current)}>
              Damage
            </button>
            <button type="button" className="btn" style={{ color: 'var(--good)' }} onClick={() => t.healSelf(amount, dialRef.current)}>
              Heal
            </button>
          </div>
          <div className="grid-2">
            <NumField label="Current HP" id="hp-current" value={c.hp.current} min={0} max={max} onChange={(n) => update((d) => void (d.hp.current = n))} />
            <NumField label="Temp HP" id="hp-temp" value={c.hp.temp} min={0} onChange={(n) => update((d) => void (d.hp.temp = n))} />
          </div>
        </div>
      </div>

      {c.hp.current === 0 && (
        <>
          <h3>Death saving throws</h3>
          <div className="row">
            <span className="hint">Successes</span>
            <span className="pips">
              {[0, 1, 2].map((i) => (
                <button key={i} type="button" className="pip ok" aria-pressed={i < c.deathSaves.successes} aria-label={`Success ${i + 1}`} onClick={() => update((d) => void (d.deathSaves.successes = i < d.deathSaves.successes ? i : i + 1))} />
              ))}
            </span>
            <span className="hint">Failures</span>
            <span className="pips">
              {[0, 1, 2].map((i) => (
                <button key={i} type="button" className="pip fail" aria-pressed={i < c.deathSaves.failures} aria-label={`Failure ${i + 1}`} onClick={() => update((d) => void (d.deathSaves.failures = i < d.deathSaves.failures ? i : i + 1))} />
              ))}
            </span>
            <button type="button" className="btn small primary" onClick={(e) => t.deathSave(e.currentTarget)}>
              Roll death save
            </button>
          </div>
        </>
      )}

      <h3>Armor Class {ac.total}</h3>
      <div className="grid-2">
        <SelectField label="Armor" id="armor" value={c.armor.armorId} options={ARMOR.map((a) => ({ id: a.id, name: a.category === 'none' ? a.name : `${a.name} (${a.category}, ${a.base})` }))} onChange={(v) => update((d) => void (d.armor.armorId = v))} />
        {armor.category === 'none' ? (
          <SelectField label="Unarmored" id="unarmored" value={c.armor.unarmored} options={UNARMORED_DEFENSES.map((u) => ({ id: u.id, name: `${u.name} (${u.formula})` }))} onChange={(v) => update((d) => void (d.armor.unarmored = v))} />
        ) : (
          <NumField label="Armor +" id="armor-magic" value={c.armor.magicBonus} onChange={(n) => update((d) => void (d.armor.magicBonus = n))} />
        )}
        <NumField label="Other AC +" id="ac-bonus" value={c.bonus.ac} onChange={(n) => update((d) => void (d.bonus.ac = n))} />
        <div className="field">
          <span>Shield</span>
          <Check label="Shield (+2)" id="shield" checked={c.armor.shield} onChange={(b) => update((d) => void (d.armor.shield = b))} />
        </div>
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>{mathText(ac, false)}</p>
      {warnings.map((w) => (
        <p key={w} className="hint" style={{ color: 'var(--warn)', margin: '4px 0 0' }}>
          {w}
        </p>
      ))}

      <h3>Hit Point Dice</h3>
      <div className="row">
        {hitDice(c).map((p) => (
          <button key={p.die} type="button" className="btn small" disabled={p.used >= p.total || c.hp.current >= max} onClick={(e) => t.spendHitDie(p.die, e.currentTarget)} title="Spend one during a Short Rest">
            d{p.die} · {p.total - p.used}/{p.total} left
          </button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <Check label="Heroic Inspiration" id="inspiration" checked={c.heroicInspiration} onChange={(b) => update((d) => void (d.heroicInspiration = b))} />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => t.rest('short')}>
          Short Rest
        </button>
        <button type="button" className="btn" onClick={() => t.rest('long')}>
          Long Rest
        </button>
      </div>
    </Panel>
  );
}

export function TurnPanel() {
  const { char: c, update } = useChar();
  const t = useTable();
  const [feet, setFeet] = useState(5);
  const budget = speed(c).total * (1 + c.turn.dashes);
  const left = Math.max(0, budget - c.turn.movementUsed);
  const econ: { key: 'action' | 'bonus' | 'reaction'; label: string }[] = [
    { key: 'action', label: 'Action' },
    { key: 'bonus', label: 'Bonus Action' },
    { key: 'reaction', label: 'Reaction' },
  ];
  return (
    <Panel
      title="Your turn"
      tab="combat"
      actions={
        <button type="button" className="btn small primary" onClick={t.newTurn}>
          New turn
        </button>
      }
    >
      <div className="economy">
        {econ.map((e) => (
          <button key={e.key} type="button" aria-pressed={c.turn[e.key]} onClick={() => update((d) => void (d.turn[e.key] = !d.turn[e.key]))}>
            {e.label}
            <small>{c.turn[e.key] ? 'Used' : 'Ready'}</small>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="row" style={{ gap: 6, flexWrap: 'nowrap' }} htmlFor="target-ac">
          <span className="hint">Target AC</span>
          <input
            id="target-ac"
            className="input ac"
            inputMode="numeric"
            placeholder="—"
            value={t.targetAc ?? ''}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              t.setTargetAc(Number.isFinite(n) && n > 0 ? n : null);
            }}
          />
        </label>
        <span className="hint">Optional. With an AC set, attacks show hit or miss and roll damage only on a hit.</span>
      </div>
      <h3>
        Movement · {left} of {budget} ft left
      </h3>
      <div className="meter" aria-hidden="true">
        <i style={{ width: `${budget ? (left / budget) * 100 : 0}%` }} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {[5, 10, 15, 30].map((f) => (
          <button key={f} type="button" className="btn small" onClick={(e) => t.move(f, e.currentTarget)}>
            Move {f} ft
          </button>
        ))}
        <NumField value={feet} min={0} step={5} ariaLabel="Custom distance in feet" id="move-ft" onChange={setFeet} className="ac" />
        <button type="button" className="btn small" onClick={(e) => t.move(feet, e.currentTarget)}>
          Move
        </button>
      </div>
      <h3>Actions</h3>
      <div className="actions-grid">
        {STANDARD_ACTIONS.map((a) => (
          <button key={a.id} type="button" className="btn small" title={a.summary} onClick={(e) => t.standardAction(a.id, e.currentTarget)}>
            {a.name}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        Attacks, spells and features mark the Action, Bonus Action or Reaction they use. Hover an action for its rule.
      </p>
    </Panel>
  );
}

const ABILITY_OPTIONS: { id: Ability | 'auto'; name: string }[] = [
  { id: 'auto', name: 'Auto (STR / DEX)' },
  { id: 'str', name: 'Strength' },
  { id: 'dex', name: 'Dexterity' },
  { id: 'con', name: 'Constitution' },
  { id: 'int', name: 'Intelligence' },
  { id: 'wis', name: 'Wisdom' },
  { id: 'cha', name: 'Charisma' },
];

const DAMAGE_OPTIONS = DAMAGE_TYPES.map((d) => ({ id: d, name: d.charAt(0).toUpperCase() + d.slice(1) }));

export function AttacksPanel() {
  const { char: c, update } = useChar();
  const t = useTable();
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const [adding, setAdding] = useState(false);
  return (
    <Panel title="Attacks" tab="combat">
      {adding && <AddItemDialog mode="weapon" onClose={() => setAdding(false)} />}
      <div className="list">
        {c.weapons.length === 0 && <p className="hint">No weapons yet. Add one below.</p>}
        {c.weapons.map((w, idx) => {
          const atk = weaponAttack(c, w);
          const bonus = weaponDamageBonus(c, w);
          const dmgText = w.damage.map((d, i) => `${i === 0 && bonus ? `${d.dice}${signed(bonus)}` : d.dice} ${d.type}`).join(' + ');
          const el = w.damage[0]?.type ?? 'bludgeoning';
          return (
            <div className={`item el-${el}`} key={w.id}>
              <div className="item-head">
                <button type="button" className="item-title" onClick={() => setOpen(open === w.id ? null : w.id)} aria-expanded={open === w.id}>
                  <b>{w.name}</b>
                  <small>
                    {signed(atk.total)} to hit · {dmgText}
                    {w.mastery ? ` · ${w.mastery}` : ''}
                  </small>
                </button>
                <button type="button" className="cast" title={mathText(atk)} onClick={(e) => t.attack(w, e.currentTarget)}>
                  Attack {signed(atk.total)}
                </button>
              </div>
              {open === w.id && (
                <div className="item-body">
                  <div className="grid-2">
                    <TextField label="Name" id={`w-name-${w.id}`} value={w.name} onChange={(v) => update((d) => void (d.weapons[idx].name = v))} />
                    <SelectField label="Ability" id={`w-ab-${w.id}`} value={w.ability} options={ABILITY_OPTIONS} onChange={(v) => update((d) => void (d.weapons[idx].ability = v))} />
                    <NumField label="Magic +" id={`w-magic-${w.id}`} value={w.magicBonus} onChange={(n) => update((d) => void (d.weapons[idx].magicBonus = n))} />
                    <TextField label="Mastery" id={`w-mastery-${w.id}`} value={w.mastery} onChange={(v) => update((d) => void (d.weapons[idx].mastery = v))} />
                  </div>
                  {w.damage.map((part, pi) => (
                    <div className="damage-row" key={pi}>
                      <TextField label={pi === 0 ? 'Damage dice' : 'Extra damage'} id={`w-dice-${w.id}-${pi}`} value={part.dice} onChange={(v) => update((d) => void (d.weapons[idx].damage[pi].dice = v))} />
                      <SelectField label="Type" id={`w-type-${w.id}-${pi}`} value={part.type} options={DAMAGE_OPTIONS} onChange={(v) => update((d) => void (d.weapons[idx].damage[pi].type = v as DamageType))} />
                      {pi > 0 ? (
                        <button type="button" className="btn small ghost" onClick={() => update((d) => void d.weapons[idx].damage.splice(pi, 1))}>
                          Remove
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                  {w.damage.some((p) => !isValid(p.dice)) && <p className="hint" style={{ color: 'var(--bad)' }}>Dice must look like 1d8, 2d6 or 1d4+1.</p>}
                  <div className="row">
                    <Check label="Proficient" id={`w-prof-${w.id}`} checked={w.proficient} onChange={(b) => update((d) => void (d.weapons[idx].proficient = b))} />
                    <Check label="Finesse" id={`w-fin-${w.id}`} checked={w.finesse} onChange={(b) => update((d) => void (d.weapons[idx].finesse = b))} />
                    <Check label="Ranged" id={`w-rng-${w.id}`} checked={w.ranged} onChange={(b) => update((d) => void (d.weapons[idx].ranged = b))} />
                  </div>
                  <TextField label="Properties" id={`w-props-${w.id}`} value={w.properties} onChange={(v) => update((d) => void (d.weapons[idx].properties = v))} />
                  <TextField label="Description" id={`w-notes-${w.id}`} multiline value={w.notes} placeholder="What the weapon does, its rarity, attunement…" onChange={(v) => update((d) => void (d.weapons[idx].notes = v))} />
                  <FillFromText weapon={w} onApply={(next) => update((d) => void (d.weapons[idx] = { ...next, id: w.id }))} />
                  <div className="row">
                    <button type="button" className="btn small" onClick={() => update((d) => void d.weapons[idx].damage.push({ dice: '1d6', type: 'fire' }))}>
                      Add extra damage (e.g. Flame Tongue)
                    </button>
                    <ConfirmButton label="Delete weapon" onConfirm={() => update((d) => void d.weapons.splice(idx, 1))} />
                  </div>
                  <SaveWeapon weapon={w} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <select className="input" style={{ flex: 1, minWidth: 0 }} value={pick} id="add-weapon" aria-label="Weapon to add" onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose a weapon…</option>
          {(['simple', 'martial'] as const).map((cat) => (
            <optgroup key={cat} label={cat === 'simple' ? 'Simple weapons' : 'Martial weapons'}>
              {WEAPONS.filter((w) => w.category === cat).map((w) => (
                <option key={w.name} value={w.name}>
                  {w.name} ({w.dice} {w.type})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          className="btn small"
          disabled={!pick}
          onClick={() => {
            const def = WEAPONS.find((w) => w.name === pick);
            if (!def) return;
            const id = uid();
            update((d) => void d.weapons.push(blankWeapon({ id, name: def.name, damage: [{ dice: def.dice, type: def.type }], finesse: !!def.finesse, ranged: def.ranged, properties: def.properties, mastery: def.mastery })));
            setPick('');
          }}
        >
          Add
        </button>
        <button type="button" className="btn small ghost" onClick={() => setAdding(true)} title="Magic weapons, your rules library's weapons, or paste a stat block">
          More…
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            const w = blankWeapon();
            update((d) => void d.weapons.push(w));
            setOpen(w.id);
          }}
        >
          Custom
        </button>
      </div>
    </Panel>
  );
}

/** Paste a stat block into a weapon you already have: its damage, properties, bonus and description are filled in. */
function FillFromText({ weapon, onApply }: { weapon: Weapon; onApply: (w: Weapon) => void }) {
  const cat = useCatalog();
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState('');
  if (text === null)
    return (
      <div className="row">
        <button type="button" className="btn small ghost" onClick={() => (setText(''), setNote(''))}>
          Fill from a pasted stat block
        </button>
        {note && (
          <span className="hint" role="status">
            {note}
          </span>
        )}
      </div>
    );
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label className="field" htmlFor={`w-paste-${weapon.id}`}>
        <span>Paste the weapon’s stat block or description</span>
        <textarea id={`w-paste-${weapon.id}`} className="input" style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </label>
      <div className="row">
        <button
          type="button"
          className="btn small primary"
          disabled={!text.trim()}
          onClick={() => {
            // The pasted block renames the weapon only if it starts with a name (a short line, not a
            // sentence or a "Damage: …" field); otherwise this weapon keeps its own.
            const first = text.trim().split('\n')[0];
            const named = first.length <= 50 && !/[.:]/.test(first.replace(/\d+\.\d+/g, '')) && !/^(weapon|armou?r|damage|properties|mastery|range|weight)\b/i.test(first);
            const p = parseItemText(named ? text : `${weapon.name}\n${text}`, cat?.items ?? []);
            if (!p.weapon) {
              setNote('That didn’t read as a weapon: no damage dice or base weapon found.');
              setText(null);
              return;
            }
            onApply({ ...p.weapon, name: p.name === 'New item' ? weapon.name : p.name, proficient: weapon.proficient, ability: weapon.ability });
            setNote(`Filled in: ${p.found.slice(0, 3).join('; ')}${p.check.length ? `. Check: ${p.check.join(' ')}` : ''}`);
            setText(null);
          }}
        >
          Fill it in
        </button>
        <button type="button" className="btn small ghost" onClick={() => setText(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Saves a weapon as you've set it up to your item library, to add again or to another character. */
function SaveWeapon({ weapon: w }: { weapon: Weapon }) {
  const { char: c } = useChar();
  const [pack, setPack] = useState('My items');
  const [message, setMessage] = useState('');
  const weight = c.inventory.find((i) => i.name.toLowerCase() === w.name.toLowerCase())?.weight ?? 0;
  return (
    <div className="row">
      <button
        type="button"
        className="btn small ghost"
        disabled={!w.name.trim() || !pack.trim()}
        onClick={async () => {
          try {
            const r = await addItemsToLibrary(pack.trim(), [itemDefFromWeapon(w, weight)], 'your Attacks');
            setMessage(`${r.replaced ? 'Updated' : 'Saved'} ${w.name} in ${pack.trim()}: find it in the item list.`);
          } catch (err) {
            setMessage((err as Error).message);
          }
        }}
      >
        Save to my item library
      </button>
      <input className="input" style={{ width: 120 }} value={pack} onChange={(e) => setPack(e.target.value)} aria-label="Library list to save the weapon in" />
      {message && (
        <span className="hint" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
