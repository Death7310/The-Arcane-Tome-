import { useMemo, useState } from 'react';
import { centerOf, performCondition } from '../fx';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { useTable } from '../state/table';
import { ABILITIES, ABILITY_NAMES, CONDITIONS, DAMAGE_TYPES, INCAPACITATING, type Ability, type ConditionId } from '../systems/dnd5e/data';
import { carriedWeight, carryingCapacity, companionAc, companionWeaponAttack, compMod, compPb, compWeaponAbility, walkSpeed } from '../systems/dnd5e/companion';
import { describeFormula, evalFormula, isFormula } from '../systems/dnd5e/formula';
import { blankCompanion, blankCompanionAction, uid, type Character, type Companion, type CompanionAction } from '../systems/dnd5e/model';
import { abilityMod, resolveTokens, signed } from '../systems/dnd5e/rules';
import { COMPANION_AI_PROMPT, companionFromCreature, parseStatBlock } from '../systems/dnd5e/statblock';
import { AddItemDialog } from './Items';
import { RulesText } from './RulesText';
import { Check, ConfirmButton, Dialog, NumField, Panel, SelectField, TextField } from './ui';

const KINDS: { id: CompanionAction['kind']; name: string }[] = [
  { id: 'trait', name: 'Trait' },
  { id: 'action', name: 'Action' },
  { id: 'bonus', name: 'Bonus Action' },
  { id: 'reaction', name: 'Reaction' },
  { id: 'legendary', name: 'Legendary Action' },
];

const num = (text: string, c: Character, fallback = 0) => evalFormula(text, c) ?? fallback;

/** "+5 · 1d8 + 3 piercing" or "DC 12 CON · 2d6 fire", for an action button. */
function actionSummary(a: CompanionAction, c: Character): string {
  const parts: string[] = [];
  if (a.attack) parts.push(signed(num(a.toHit, c)));
  if (a.save) parts.push(`DC ${evalFormula(a.dc, c) ?? '?'} ${a.save.toUpperCase()}`);
  if (a.damage) parts.push(`${resolveTokens(a.damage, c).replace(/\s+/g, '')} ${a.damageType}`.trim());
  return parts.join(' · ');
}

/**
 * Companions: familiars, steeds, drakes, homunculi, summoned spirits, or ones you made up.
 * Each has a micro sheet (HP, AC, its actions as roll buttons) that opens into its whole
 * stat block. Numbers can be formulas over your stats, so class companions keep pace.
 */
export function CompanionsPanel() {
  const { char: c, update } = useChar();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel
      title="Companions"
      tab="combat"
      actions={
        <button type="button" className="btn small" onClick={() => setAdding(true)}>
          Add
        </button>
      }
    >
      {c.companions.length === 0 && (
        <p className="hint" style={{ margin: 0 }}>
          Familiars, steeds, drakes, a homunculus, summoned spirits… Add one from the creature list, paste its stat block, or make one up.
        </p>
      )}
      <div className="companions">
        {c.companions.map((k, idx) => (
          <CompanionCard key={k.id} comp={k} idx={idx} expanded={open === k.id} onToggle={() => setOpen(open === k.id ? null : k.id)} />
        ))}
      </div>
      {adding && (
        <AddCompanion
          onClose={() => setAdding(false)}
          onAdd={(comp) => {
            const hp = evalFormula(comp.maxHp, c);
            update((d) => void d.companions.push({ ...comp, hp: hp ?? comp.hp }));
            setOpen(comp.id);
            setAdding(false);
          }}
        />
      )}
    </Panel>
  );
}

function CompanionCard({ comp, idx, expanded, onToggle }: { comp: Companion; idx: number; expanded: boolean; onToggle: () => void }) {
  const { char: c, update } = useChar();
  const t = useTable();
  const [amount, setAmount] = useState(5);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<'sheet' | 'gear' | 'conditions'>('sheet');
  const max = Math.max(1, num(comp.maxHp, c, comp.hp));
  const ac = companionAc(comp, c);
  const pb = compPb(comp, c);
  const set = (fn: (k: Companion) => void) => update((d) => fn(d.companions[idx]));
  const hpPct = Math.max(0, Math.min(100, (comp.hp / max) * 100));
  const usable = comp.actions.filter((a) => a.kind !== 'trait');
  const traits = comp.actions.filter((a) => a.kind === 'trait');
  const speed = walkSpeed(comp);
  const moveLeft = speed * (1 + comp.turn.dashes) - comp.turn.movementUsed;
  const down = comp.hp <= 0;
  const stopped = INCAPACITATING.find((x) => comp.conditions.includes(x));

  const hurt = (n: number) =>
    set((k) => {
      const fromTemp = Math.min(k.tempHp, n);
      k.tempHp -= fromTemp;
      k.hp = Math.max(0, k.hp - (n - fromTemp));
    });
  const toggleTurn = (part: 'action' | 'bonus' | 'reaction') => set((k) => void (k.turn[part] = !k.turn[part]));
  // Its conditions play their themed effect as they take hold or end, like yours.
  const toggleCondition = (id: ConditionId, el: HTMLElement) => {
    const ending = comp.conditions.includes(id);
    performCondition(id, centerOf(el), `${comp.name}: ${CONDITIONS.find((x) => x.id === id)?.name}`, ending);
    set((k) => void (k.conditions = ending ? k.conditions.filter((x) => x !== id) : [...k.conditions, id]));
  };

  return (
    <div className={`companion${down ? ' down' : ''}`}>
      <div className="comp-head">
        <button type="button" className="comp-title" onClick={onToggle} aria-expanded={expanded}>
          <b>{comp.name}</b>
          <small>{[comp.kind || `${comp.size} ${comp.type}`, comp.cr ? `CR ${comp.cr}` : ''].filter(Boolean).join(' · ')}</small>
        </button>
        <div className="comp-stats">
          <span title={ac.worn ? `Wearing ${ac.worn}` : isFormula(comp.ac) ? comp.ac : undefined}>
            <b>{ac.total}</b> AC
          </span>
          <span>
            <b>
              {comp.hp}
              {comp.tempHp ? `+${comp.tempHp}` : ''}
            </b>
            /{max} HP
          </span>
        </div>
      </div>
      <div className="comp-hpbar" aria-hidden="true">
        <span style={{ width: `${hpPct}%` }} />
      </div>
      <div className="row comp-hp">
        <NumField value={amount} min={0} ariaLabel={`Amount for ${comp.name}`} id={`comp-amt-${comp.id}`} onChange={setAmount} />
        <button type="button" className="btn small" style={{ color: 'var(--bad)' }} onClick={() => hurt(amount)}>
          Damage
        </button>
        <button type="button" className="btn small" style={{ color: 'var(--good)' }} onClick={() => set((k) => void (k.hp = Math.min(max, k.hp + amount)))}>
          Heal
        </button>
        {comp.hp < max && (
          <button type="button" className="btn small ghost" onClick={() => set((k) => void (k.hp = max))}>
            Full
          </button>
        )}
      </div>
      {down && <p className="hint" style={{ margin: 0, color: 'var(--bad)' }}>{comp.name} is at 0 Hit Points.</p>}

      {/* Its turn: what it has used, and how far it can still move. */}
      <div className="comp-turn" role="group" aria-label={`${comp.name}'s turn`}>
        {(['action', 'bonus', 'reaction'] as const).map((part) => (
          <button key={part} type="button" className="chip" aria-pressed={comp.turn[part]} title={comp.turn[part] ? 'Used this turn (tap to undo)' : 'Not used yet'} onClick={() => toggleTurn(part)}>
            {part === 'action' ? 'Action' : part === 'bonus' ? 'Bonus' : 'Reaction'}
          </button>
        ))}
        <span className="comp-move">
          <span className="hint">Moved</span>
          <NumField value={comp.turn.movementUsed} min={0} step={5} ariaLabel={`Feet ${comp.name} has moved`} id={`comp-move-${comp.id}`} className="ac" onChange={(n) => set((k) => void (k.turn.movementUsed = Math.max(0, n)))} />
          <span className="hint">of {speed * (1 + comp.turn.dashes)} ft{moveLeft < 0 ? ' (too far)' : ''}</span>
          <button type="button" className="btn small ghost" onClick={() => set((k) => void ((k.turn.dashes += 1), (k.turn.action = true)))} title="Dash: its Action, for as much movement again">
            Dash
          </button>
        </span>
        <button type="button" className="btn small ghost" onClick={() => t.companionNewTurn(comp)} title="Its turn starts over (your New turn does this too)">
          New turn
        </button>
      </div>
      {comp.conditions.length > 0 && (
        <div className="chips" aria-label={`${comp.name}'s conditions`}>
          {comp.conditions.map((id) => (
            <button key={id} type="button" className="chip cond-on" title={`${CONDITIONS.find((x) => x.id === id)?.summary} Tap to end it.`} onClick={(e) => toggleCondition(id, e.currentTarget)}>
              {CONDITIONS.find((x) => x.id === id)?.name} ✕
            </button>
          ))}
        </div>
      )}
      {stopped && <p className="hint" style={{ margin: 0, color: 'var(--warn)' }}>{CONDITIONS.find((x) => x.id === stopped)?.name}: it can’t take actions, Bonus Actions or Reactions.</p>}

      {(comp.weapons.length > 0 || usable.length > 0) && (
        <div className="comp-actions">
          {comp.weapons.map((w) => {
            const atk = companionWeaponAttack(comp, w, c);
            const mod = compMod(comp, compWeaponAbility(comp, w)) + w.magicBonus;
            return (
              <button key={w.id} type="button" className={`cast el-${w.damage[0]?.type ?? 'bludgeoning'}`} onClick={(e) => t.companionWeapon(comp, w, e.currentTarget)} title={mathLine(atk)}>
                <span>{w.name}</span>
                <small>
                  {signed(atk.total)} · {w.damage.map((d, i) => `${i === 0 && mod ? `${d.dice}${signed(mod)}` : d.dice} ${d.type}`).join(' + ')}
                </small>
              </button>
            );
          })}
          {usable.map((a) => (
            <button key={a.id} type="button" className="cast" onClick={(e) => t.companionAct(comp, a, e.currentTarget)} title={a.text}>
              <span>{a.name}</span>
              <small>{[a.kind !== 'action' ? KINDS.find((k) => k.id === a.kind)?.name : '', actionSummary(a, c)].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
        </div>
      )}

      {expanded && !editing && (
        <div className="comp-sheet">
          <div className="seg" role="radiogroup" aria-label={`${comp.name}: what to show`}>
            {(
              [
                ['sheet', 'Sheet'],
                ['gear', `Gear${comp.inventory.length + comp.weapons.length ? ` (${comp.inventory.length + comp.weapons.length})` : ''}`],
                ['conditions', `Conditions${comp.conditions.length ? ` (${comp.conditions.length})` : ''}`],
              ] as const
            ).map(([id, name]) => (
              <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)}>
                {name}
              </button>
            ))}
          </div>
          {view === 'sheet' && <CompanionSheet comp={comp} idx={idx} pb={pb} traits={traits} usable={usable} onEdit={() => setEditing(true)} />}
          {view === 'gear' && <CompanionGear comp={comp} idx={idx} />}
          {view === 'conditions' && (
            <div className="chips">
              {CONDITIONS.map((x) => (
                <button key={x.id} type="button" className="chip" aria-pressed={comp.conditions.includes(x.id)} title={x.summary} onClick={(e) => toggleCondition(x.id, e.currentTarget)}>
                  {x.name}
                </button>
              ))}
              <p className="hint" style={{ margin: 0, flexBasis: '100%' }}>
                Its conditions work on its rolls like yours do on yours: Poisoned or Frightened give Disadvantage, Invisible gives Advantage on attacks, and Paralyzed, Stunned, Petrified or Unconscious fail its Strength and Dexterity saves.
              </p>
            </div>
          )}
        </div>
      )}
      {expanded && editing && <CompanionEditor comp={comp} idx={idx} onDone={() => setEditing(false)} />}
    </div>
  );
}

const mathLine = (b: { total: number; parts: { label: string; value: number }[] }) => b.parts.map((p) => `${p.label} ${signed(p.value)}`).join(', ');

function CompanionSheet({ comp, idx, pb, traits, usable, onEdit }: { comp: Companion; idx: number; pb: number; traits: CompanionAction[]; usable: CompanionAction[]; onEdit: () => void }) {
  const { char: c, update } = useChar();
  const t = useTable();
  return (
    <>
      <div className="comp-abilities">
        {ABILITIES.map((a) => {
          const m = abilityMod(comp.abilities[a]);
          const save = m + (comp.saves.includes(a) ? pb : 0);
          return (
            <div key={a} className="comp-ability">
              <span className="k">{a.toUpperCase()}</span>
              <button type="button" className="v" onClick={(e) => t.companionTest(comp, `${ABILITY_NAMES[a]} check`, m, e.currentTarget, { type: 'check', ability: a })} title={`${ABILITY_NAMES[a]} check`}>
                {signed(m)}
              </button>
              <small>{comp.abilities[a]}</small>
              <button type="button" className={`save${comp.saves.includes(a) ? ' prof' : ''}`} onClick={(e) => t.companionTest(comp, `${ABILITY_NAMES[a]} save`, save, e.currentTarget, { type: 'save', ability: a })} title={`${ABILITY_NAMES[a]} save`}>
                Save {signed(save)}
              </button>
            </div>
          );
        })}
      </div>
      <dl className="comp-facts">
        <dt>Proficiency</dt>
        <dd>
          {signed(pb)}
          {isFormula(comp.pb) || /\{/.test(comp.pb) ? ' (yours)' : ''}
        </dd>
        <dt>Speed</dt>
        <dd>{comp.speed}</dd>
        {comp.skills && (
          <>
            <dt>Skills</dt>
            <dd>{comp.skills}</dd>
          </>
        )}
        {comp.senses && (
          <>
            <dt>Senses</dt>
            <dd>{comp.senses}</dd>
          </>
        )}
        {comp.languages && (
          <>
            <dt>Languages</dt>
            <dd>{comp.languages}</dd>
          </>
        )}
        {(isFormula(comp.ac) || isFormula(comp.maxHp)) && (
          <>
            <dt>Scales with you</dt>
            <dd>
              AC {describeFormula(comp.ac)} · HP {describeFormula(comp.maxHp)}
            </dd>
          </>
        )}
      </dl>
      {[...traits, ...usable].map((a) => (
        <div key={a.id} className="comp-entry">
          <b>{a.name}.</b> <small className="hint">{KINDS.find((k) => k.id === a.kind)?.name}</small>
          <RulesText text={a.text || actionSummary(a, c) || '—'} />
        </div>
      ))}
      {comp.notes && <RulesText text={comp.notes} className="hint" />}
      <p className="hint" style={{ margin: 0 }}>
        {comp.source}. Tap a modifier for a check; your Advantage chip and its own conditions apply to its rolls. Using one of its actions marks that part of its turn.
      </p>
      <div className="row">
        <button type="button" className="btn small" onClick={onEdit}>
          Edit
        </button>
        <ConfirmButton label="Remove companion" onConfirm={() => update((d) => void d.companions.splice(idx, 1))} />
      </div>
    </>
  );
}

/** Its gear: armor or barding it wears, weapons it wields, and what it carries. */
function CompanionGear({ comp, idx }: { comp: Companion; idx: number }) {
  const { char: c, update } = useChar();
  const [adding, setAdding] = useState<'list' | 'paste' | null>(null);
  const [name, setName] = useState('');
  const [editingWeapon, setEditingWeapon] = useState<string | null>(null);
  const set = (fn: (k: Companion) => void) => update((d) => fn(d.companions[idx]));
  const ac = companionAc(comp, c);
  const carried = carriedWeight(comp);
  const cap = carryingCapacity(comp);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {adding && <AddItemDialog mode="any" start={adding} companionId={comp.id} onClose={() => setAdding(null)} />}
      <div className="row">
        <button type="button" className="btn small" onClick={() => setAdding('list')}>
          Item list
        </button>
        <button type="button" className="btn small ghost" onClick={() => setAdding('paste')}>
          Paste a stat block
        </button>
      </div>

      <h4 style={{ margin: 0 }}>Armor</h4>
      <p className="hint" style={{ margin: 0 }}>
        {ac.worn ? (
          <>
            Wearing {ac.worn}: AC {ac.total} ({mathLine(ac)}).{' '}
            <button type="button" className="btn small ghost" onClick={() => set((k) => void (k.armor = null))}>
              Take it off
            </button>
          </>
        ) : (
          <>AC {ac.total} from its stat block. Wear armor or barding from the item list (“Wear”) to have its AC worked out from it.</>
        )}
      </p>

      <h4 style={{ margin: 0 }}>Weapons it wields</h4>
      {comp.weapons.length === 0 && <p className="hint" style={{ margin: 0 }}>None. Its natural attacks are under its actions; a creature with hands can wield weapons from the item list.</p>}
      {comp.weapons.map((w, wi) => (
        <div key={w.id} className="item" style={{ padding: '8px 10px', display: 'grid', gap: 6 }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <span>
              <b>{w.name}</b> <small className="hint">{mathLine(companionWeaponAttack(comp, w, c))}</small>
            </span>
            <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <button type="button" className="btn small ghost" aria-expanded={editingWeapon === w.id} onClick={() => setEditingWeapon(editingWeapon === w.id ? null : w.id)}>
                Edit
              </button>
              <ConfirmButton label="Remove" onConfirm={() => set((k) => void k.weapons.splice(wi, 1))} />
            </span>
          </div>
          {editingWeapon === w.id && (
            <div className="grid-2">
              <TextField label="Name" id={`cw-name-${w.id}`} value={w.name} onChange={(v) => set((k) => void (k.weapons[wi].name = v))} />
              <SelectField
                label="Attacks with"
                id={`cw-ab-${w.id}`}
                value={w.ability}
                options={[{ id: 'auto', name: 'Usual (STR, or DEX)' }, ...ABILITIES.map((a) => ({ id: a, name: ABILITY_NAMES[a] }))]}
                onChange={(v) => set((k) => void (k.weapons[wi].ability = v as typeof w.ability))}
              />
              <TextField label="Damage dice" id={`cw-dice-${w.id}`} value={w.damage[0]?.dice ?? ''} onChange={(v) => set((k) => void (k.weapons[wi].damage[0].dice = v))} />
              <SelectField label="Damage type" id={`cw-type-${w.id}`} value={w.damage[0]?.type ?? 'bludgeoning'} options={DAMAGE_TYPES.map((d) => ({ id: d, name: d.charAt(0).toUpperCase() + d.slice(1) }))} onChange={(v) => set((k) => void (k.weapons[wi].damage[0].type = v))} />
              <NumField label="Magic +" id={`cw-magic-${w.id}`} value={w.magicBonus} onChange={(n) => set((k) => void (k.weapons[wi].magicBonus = n))} />
              <Check label="Proficient" id={`cw-prof-${w.id}`} checked={w.proficient} onChange={(b) => set((k) => void (k.weapons[wi].proficient = b))} />
            </div>
          )}
        </div>
      ))}

      <h4 style={{ margin: 0 }}>
        Carrying · {carried} of {cap} lb
      </h4>
      {carried > cap && <p className="hint" style={{ margin: 0, color: 'var(--warn)' }}>That’s more than a {comp.size.toLowerCase()} creature with Strength {comp.abilities.str} can carry ({cap} lb).</p>}
      <div className="list">
        {comp.inventory.map((it, ii) => (
          <div key={it.id} className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 0 }} value={it.name} aria-label="Item name" onChange={(e) => set((k) => void (k.inventory[ii].name = e.target.value))} title={it.description || undefined} />
            <NumField value={it.qty} min={0} ariaLabel="Quantity" className="ac" onChange={(n) => set((k) => void (k.inventory[ii].qty = n))} />
            <NumField value={it.weight} min={0} step={0.1} ariaLabel="Weight each (lb)" className="ac" onChange={(n) => set((k) => void (k.inventory[ii].weight = n))} />
            <button type="button" className="btn small ghost icon" aria-label={`Remove ${it.name}`} onClick={() => set((k) => void k.inventory.splice(ii, 1))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          set((k) => void k.inventory.push({ id: uid(), name: name.trim(), qty: 1, weight: 0, notes: '' }));
          setName('');
        }}
      >
        <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder={`Give ${comp.name} an item`} value={name} aria-label={`New item for ${comp.name}`} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn small">
          Add
        </button>
      </form>
      <p className="hint" style={{ margin: 0 }}>Columns: name, quantity, weight each (lb). It can carry 15 × its Strength, halved if Tiny and doubled for each size above Medium.</p>
    </div>
  );
}

function CompanionEditor({ comp, idx, onDone }: { comp: Companion; idx: number; onDone: () => void }) {
  const { char: c, update } = useChar();
  const set = (fn: (k: Companion) => void) => update((d) => fn(d.companions[idx]));
  const setAction = (j: number, fn: (a: CompanionAction) => void) => set((k) => fn(k.actions[j]));
  const shown = (formula: string) => {
    const v = evalFormula(formula, c);
    return v === null ? 'can’t read this' : isFormula(formula) ? `= ${v} for you now` : '';
  };
  return (
    <div className="comp-sheet">
      <div className="grid-2">
        <TextField label="Name" id={`ce-name-${comp.id}`} value={comp.name} onChange={(v) => set((k) => void (k.name = v))} />
        <TextField label="What it is" id={`ce-kind-${comp.id}`} value={comp.kind} placeholder="Drake companion, owl familiar…" onChange={(v) => set((k) => void (k.kind = v))} />
        <TextField label="Size" id={`ce-size-${comp.id}`} value={comp.size} onChange={(v) => set((k) => void (k.size = v))} />
        <TextField label="Type" id={`ce-type-${comp.id}`} value={comp.type} onChange={(v) => set((k) => void (k.type = v))} />
        <label className="field">
          <span>AC {shown(comp.ac)}</span>
          <input className="input" value={comp.ac} onChange={(e) => set((k) => void (k.ac = e.target.value))} placeholder="14 or 13 + {PB}" aria-label="Armor Class" />
        </label>
        <label className="field">
          <span>Max HP {shown(comp.maxHp)}</span>
          <input className="input" value={comp.maxHp} onChange={(e) => set((k) => void (k.maxHp = e.target.value))} placeholder="22 or 5 + 5 * {LEVEL:ranger}" aria-label="Max HP" />
        </label>
        <TextField label="Speed" id={`ce-speed-${comp.id}`} value={comp.speed} onChange={(v) => set((k) => void (k.speed = v))} />
        <label className="field">
          <span>Proficiency Bonus {shown(comp.pb)}</span>
          <input className="input" value={comp.pb} onChange={(e) => set((k) => void (k.pb = e.target.value))} placeholder="2 or {PB}" aria-label="Proficiency Bonus" />
        </label>
        <NumField label="Temp HP" id={`ce-temp-${comp.id}`} value={comp.tempHp} min={0} onChange={(n) => set((k) => void (k.tempHp = n))} />
        <TextField label="CR" id={`ce-cr-${comp.id}`} value={comp.cr} onChange={(v) => set((k) => void (k.cr = v))} />
      </div>
      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
        {ABILITIES.map((a) => (
          <NumField key={a} label={a.toUpperCase()} ariaLabel={ABILITY_NAMES[a]} id={`ce-${a}-${comp.id}`} value={comp.abilities[a]} min={1} max={30} onChange={(n) => set((k) => void (k.abilities[a] = n))} />
        ))}
      </div>
      <div className="row">
        <span className="hint">Saving throw proficiencies:</span>
        {ABILITIES.map((a) => (
          <Check key={a} label={a.toUpperCase()} id={`ce-save-${a}-${comp.id}`} checked={comp.saves.includes(a)} onChange={(b) => set((k) => void (k.saves = b ? [...k.saves, a] : k.saves.filter((x) => x !== a)))} />
        ))}
      </div>
      <div className="grid-2">
        <TextField label="Skills" id={`ce-skills-${comp.id}`} value={comp.skills} onChange={(v) => set((k) => void (k.skills = v))} />
        <TextField label="Senses" id={`ce-senses-${comp.id}`} value={comp.senses} onChange={(v) => set((k) => void (k.senses = v))} />
        <TextField label="Languages" id={`ce-lang-${comp.id}`} value={comp.languages} onChange={(v) => set((k) => void (k.languages = v))} />
      </div>
      <h4 style={{ margin: '6px 0 0' }}>Traits and actions</h4>
      {comp.actions.map((a, j) => (
        <div key={a.id} className="item" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <div className="grid-2">
            <TextField label="Name" id={`ca-name-${a.id}`} value={a.name} onChange={(v) => setAction(j, (x) => void (x.name = v))} />
            <SelectField label="Kind" id={`ca-kind-${a.id}`} value={a.kind} options={KINDS} onChange={(v) => setAction(j, (x) => void (x.kind = v))} />
            <SelectField
              label="Attack"
              id={`ca-atk-${a.id}`}
              value={a.attack ?? 'none'}
              options={[
                { id: 'none', name: 'Not an attack' },
                { id: 'melee', name: 'Melee attack' },
                { id: 'ranged', name: 'Ranged attack' },
              ]}
              onChange={(v) => setAction(j, (x) => void (x.attack = v === 'none' ? null : v))}
            />
            {a.attack && (
              <label className="field">
                <span>To hit {shown(a.toHit)}</span>
                <input className="input" value={a.toHit} placeholder="5 or {SPELLATK}" onChange={(e) => setAction(j, (x) => void (x.toHit = e.target.value))} aria-label="To hit" />
              </label>
            )}
            {a.attack && <TextField label="Reach / range" id={`ca-reach-${a.id}`} value={a.reach} onChange={(v) => setAction(j, (x) => void (x.reach = v))} />}
            <TextField label="Damage dice" id={`ca-dmg-${a.id}`} value={a.damage} placeholder="1d8 + {PB}" onChange={(v) => setAction(j, (x) => void (x.damage = v))} />
            {a.damage && (
              <SelectField label="Damage type" id={`ca-type-${a.id}`} value={a.damageType || 'bludgeoning'} options={DAMAGE_TYPES.map((d) => ({ id: d, name: d.charAt(0).toUpperCase() + d.slice(1) }))} onChange={(v) => setAction(j, (x) => void (x.damageType = v))} />
            )}
            <SelectField
              label="Saving throw"
              id={`ca-save-${a.id}`}
              value={a.save ?? 'none'}
              options={[{ id: 'none', name: 'None' }, ...ABILITIES.map((x) => ({ id: x, name: ABILITY_NAMES[x] }))]}
              onChange={(v) => setAction(j, (x) => void (x.save = v === 'none' ? null : (v as Ability)))}
            />
            {a.save && (
              <label className="field">
                <span>DC {shown(a.dc)}</span>
                <input className="input" value={a.dc} placeholder="12 or {SPELLDC}" onChange={(e) => setAction(j, (x) => void (x.dc = e.target.value))} aria-label="Save DC" />
              </label>
            )}
          </div>
          <TextField label="What it does" id={`ca-text-${a.id}`} multiline value={a.text} onChange={(v) => setAction(j, (x) => void (x.text = v))} />
          <ConfirmButton label="Remove" onConfirm={() => set((k) => void k.actions.splice(j, 1))} />
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn small" onClick={() => set((k) => void k.actions.push(blankCompanionAction()))}>
          Add an action or trait
        </button>
      </div>
      <TextField label="Notes" id={`ce-notes-${comp.id}`} multiline value={comp.notes} onChange={(v) => set((k) => void (k.notes = v))} />
      <p className="hint" style={{ margin: 0 }}>
        Numbers can follow you: {'{PB}'} your Proficiency Bonus, {'{LEVEL}'} your level, {'{LEVEL:ranger}'} one class’s level, {'{SPELLATK}'} your spell attack, {'{SPELLDC}'} your
        spell save DC, {'{WIS}'} and the other ability modifiers, with + − × ÷.
      </p>
      <div className="row">
        <button type="button" className="btn small primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

const SCALING_TEMPLATE = (): Companion =>
  blankCompanion({
    name: 'My companion',
    kind: 'Companion that scales with you',
    size: 'Small',
    type: 'Beast',
    ac: '13 + {PB}',
    maxHp: '5 + 5 * {LEVEL}',
    pb: '{PB}',
    speed: '30 ft.',
    abilities: { str: 12, dex: 14, con: 14, int: 6, wis: 12, cha: 6 },
    source: 'Made up',
    actions: [
      blankCompanionAction({ name: 'Strike', kind: 'action', attack: 'melee', toHit: '{SPELLATK}', reach: 'reach 5 ft.', damage: '1d8 + {PB}', damageType: 'piercing', text: 'A starting point: change the numbers to match your companion’s stat block.' }),
    ],
  });

function AddCompanion({ onClose, onAdd }: { onClose: () => void; onAdd: (c: Companion) => void }) {
  const cat = useCatalog();
  const [mode, setMode] = useState<'list' | 'paste' | 'make'>('list');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [maxCr, setMaxCr] = useState(2);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Companion | null | 'bad'>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const types = useMemo(() => [...new Set((cat?.creatures ?? []).map((k) => k.type))].sort(), [cat]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (cat?.creatures ?? [])
      .filter((k) => (!needle || k.name.toLowerCase().includes(needle)) && (type === 'all' || k.type === type) && k.cr <= maxCr)
      .sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
  }, [cat, q, type, maxCr]);

  return (
    <Dialog title="Add a companion" onClose={onClose}>
      <div className="seg" role="radiogroup" aria-label="How to add">
        <button type="button" role="radio" aria-checked={mode === 'list'} onClick={() => setMode('list')}>
          Creature list
        </button>
        <button type="button" role="radio" aria-checked={mode === 'paste'} onClick={() => setMode('paste')}>
          Paste a stat block
        </button>
        <button type="button" role="radio" aria-checked={mode === 'make'} onClick={() => setMode('make')}>
          Make one up
        </button>
      </div>

      {mode === 'list' && (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Search creatures" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search creatures" autoFocus />
            <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Creature type">
              <option value="all">Any type</option>
              {types.map((k) => (
                <option key={k} value={k}>
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
            <select className="input" style={{ width: 'auto' }} value={maxCr} onChange={(e) => setMaxCr(Number(e.target.value))} aria-label="Highest CR">
              {[0, 0.25, 0.5, 1, 2, 3, 5, 8, 12, 30].map((n) => (
                <option key={n} value={n}>
                  CR {n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : n} or lower
                </option>
              ))}
            </select>
          </div>
          <div className="lib">
            {!cat && <p className="hint">Loading creatures…</p>}
            {list.slice(0, 120).map((k) => (
              <div key={`${k.source}:${k.srd}`} className="lib-row">
                <div className="lib-main" style={{ padding: '6px 10px' }}>
                  <span>
                    <b>{k.name}</b>
                    <span className="hint">
                      {' '}
                      · {k.size} {k.type} · CR {k.cr === 0.125 ? '1/8' : k.cr === 0.25 ? '1/4' : k.cr === 0.5 ? '1/2' : k.cr} · AC {k.ac} · HP {k.hp}
                      {k.source && k.source !== 'SRD 5.2.1' ? ` · ${k.source}` : ''}
                    </span>
                  </span>
                </div>
                <button type="button" className="btn small" onClick={() => onAdd(companionFromCreature(k))}>
                  Add
                </button>
              </div>
            ))}
            {list.length > 120 && <p className="hint">Showing 120 of {list.length}. Search or filter to narrow it down.</p>}
          </div>
          <p className="hint">Creatures from the System Reference Document 5.2.1 (CC-BY-4.0) and your rules library. Companions from other books (a Drakewarden’s drake, an Artificer’s homunculus servant) aren’t in the SRD: paste their stat block instead.</p>
        </>
      )}

      {mode === 'paste' && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <label className="field" htmlFor="comp-paste">
            <span>Paste the stat block, from your book, D&amp;D Beyond or anywhere else</span>
            <textarea id="comp-paste" className="input" style={{ minHeight: 180 }} value={text} onChange={(e) => (setText(e.target.value), setParsed(null))} placeholder={'Drake\nSmall Dragon, Neutral\nAC 14 plus your Proficiency Bonus\nHP 5 + five times your Ranger level\n…'} />
          </label>
          <div className="row">
            <button type="button" className="btn small primary" disabled={!text.trim()} onClick={() => setParsed(parseStatBlock(text) ?? 'bad')}>
              Read it
            </button>
            <button type="button" className="btn small ghost" aria-expanded={showPrompt} onClick={() => setShowPrompt((s) => !s)}>
              {showPrompt ? 'Hide' : 'Messy text? Let an AI tidy it first'}
            </button>
          </div>
          {showPrompt && (
            <>
              <p className="hint" style={{ margin: 0 }}>
                Paste this into ChatGPT, Claude, Gemini or another AI, add the creature underneath, then paste its answer above.
              </p>
              <textarea className="input mono" readOnly value={COMPANION_AI_PROMPT} aria-label="Prompt for an AI" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn small" onClick={() => void navigator.clipboard?.writeText(COMPANION_AI_PROMPT)}>
                Copy the prompt
              </button>
            </>
          )}
          {parsed === 'bad' && <p className="hint" style={{ color: 'var(--bad)' }}>That doesn’t look like a stat block: there’s no AC, HP or actions to read.</p>}
          {parsed && parsed !== 'bad' && (
            <div className="note good">
              <b>{parsed.name}</b>: AC {parsed.ac}, HP {parsed.maxHp}, {parsed.actions.length} traits and actions ({parsed.actions.filter((a) => a.attack).length} attacks).
              <div className="row" style={{ marginTop: 6 }}>
                <button type="button" className="btn small primary" onClick={() => onAdd(parsed)}>
                  Add {parsed.name}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'make' && (
        <div className="choices" style={{ marginTop: 10 }}>
          <button type="button" className="choice" onClick={() => onAdd(SCALING_TEMPLATE())}>
            <span>
              <b>A companion that scales with you</b>
              <span className="hint">AC 13 + your Proficiency Bonus, HP 5 + 5 × your level, an attack with your spell attack bonus. Adjust it to match the stat block.</span>
            </span>
          </button>
          <button type="button" className="choice" onClick={() => onAdd(blankCompanion())}>
            <span>
              <b>A blank companion</b>
              <span className="hint">Fill in everything yourself.</span>
            </span>
          </button>
        </div>
      )}
    </Dialog>
  );
}
