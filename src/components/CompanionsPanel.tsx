import { useMemo, useState } from 'react';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { useTable } from '../state/table';
import { ABILITIES, ABILITY_NAMES, DAMAGE_TYPES, type Ability } from '../systems/dnd5e/data';
import { describeFormula, evalFormula, isFormula } from '../systems/dnd5e/formula';
import { blankCompanion, blankCompanionAction, type Character, type Companion, type CompanionAction } from '../systems/dnd5e/model';
import { abilityMod, resolveTokens, signed } from '../systems/dnd5e/rules';
import { COMPANION_AI_PROMPT, companionFromCreature, parseStatBlock } from '../systems/dnd5e/statblock';
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
  const max = Math.max(1, num(comp.maxHp, c, comp.hp));
  const ac = evalFormula(comp.ac, c);
  const pb = num(comp.pb, c, 2);
  const set = (fn: (k: Companion) => void) => update((d) => fn(d.companions[idx]));
  const hpPct = Math.max(0, Math.min(100, (comp.hp / max) * 100));
  const usable = comp.actions.filter((a) => a.kind !== 'trait');
  const traits = comp.actions.filter((a) => a.kind === 'trait');

  const hurt = (n: number) =>
    set((k) => {
      const fromTemp = Math.min(k.tempHp, n);
      k.tempHp -= fromTemp;
      k.hp = Math.max(0, k.hp - (n - fromTemp));
    });

  return (
    <div className="companion">
      <div className="comp-head">
        <button type="button" className="comp-title" onClick={onToggle} aria-expanded={expanded}>
          <b>{comp.name}</b>
          <small>{[comp.kind || `${comp.size} ${comp.type}`, comp.cr ? `CR ${comp.cr}` : ''].filter(Boolean).join(' · ')}</small>
        </button>
        <div className="comp-stats">
          <span title={isFormula(comp.ac) ? comp.ac : undefined}>
            <b>{ac ?? '?'}</b> AC
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
        <span className="hint">{comp.speed}</span>
      </div>
      {usable.length > 0 && (
        <div className="comp-actions">
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
          <div className="comp-abilities">
            {ABILITIES.map((a) => {
              const m = abilityMod(comp.abilities[a]);
              const save = m + (comp.saves.includes(a) ? pb : 0);
              return (
                <div key={a} className="comp-ability">
                  <span className="k">{a.toUpperCase()}</span>
                  <button type="button" className="v" onClick={(e) => t.companionTest(comp, `${ABILITY_NAMES[a]} check`, m, e.currentTarget)} title={`${ABILITY_NAMES[a]} check`}>
                    {signed(m)}
                  </button>
                  <small>{comp.abilities[a]}</small>
                  <button type="button" className={`save${comp.saves.includes(a) ? ' prof' : ''}`} onClick={(e) => t.companionTest(comp, `${ABILITY_NAMES[a]} save`, save, e.currentTarget)} title={`${ABILITY_NAMES[a]} save`}>
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
            {comp.source}. Tap a modifier for a check; your Advantage chip applies to its rolls.
          </p>
          <div className="row">
            <button type="button" className="btn small" onClick={() => setEditing(true)}>
              Edit
            </button>
            <ConfirmButton label="Remove companion" onConfirm={() => update((d) => void d.companions.splice(idx, 1))} />
          </div>
        </div>
      )}
      {expanded && editing && <CompanionEditor comp={comp} idx={idx} onDone={() => setEditing(false)} />}
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
