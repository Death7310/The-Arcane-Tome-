import { useEffect, useId, useState } from 'react';
import { isValid } from '../engine/dice';
import { ELEMENTS, SHAPES, type Element } from '../fx/types';
import { useChar } from '../state/character';
import { choiceLabel, ordinal, useTable, type SlotChoice } from '../state/table';
import { ABILITIES, ABILITY_NAMES, DAMAGE_TYPES, type Ability, type DamageType } from '../systems/dnd5e/data';
import { blankSpell, uid, type Character, type Spell } from '../systems/dnd5e/model';
import { defaultSpellAbility, pactSlots, planSpell, signed, spellAbility, spellAttack, spellPoints, spellSaveDc, spellSlots, SPELL_POINT_COST, usesSpellPoints } from '../systems/dnd5e/rules';
import { useCatalog } from '../state/catalog';
import { spellCounts } from '../systems/dnd5e/leveling';
import { RulesText } from './RulesText';
import { Check, ConfirmButton, CopyTextButton, Dialog, NumField, Panel, Pips, SelectField, TextField, mathText } from './ui';
import { SpellBrowser, SpellImport } from './SpellBrowser';
import { TargetStrip } from './Enemies';
import { endConcentration, markFromSpell } from '../systems/dnd5e/enemies';
import { freeCastSources, inferSources, sourceName, sourceOptions } from '../systems/dnd5e/spellsource';
import { fillSpell, spellDefFromSpell, spellFromDef, tunedSpells } from '../systems/dnd5e/spells';
import { describeSpellDef, readPastedSpells, spellToText, type SpellPart } from '../systems/dnd5e/spellimport';
import type { SpellDef } from '../systems/dnd5e/srd';
import { addSpellsToLibrary } from '../state/library';
import { ABILITY_NAMES as ABILITY_LONG } from '../systems/dnd5e/data';

const ABILITY_SELECT = [{ id: 'auto' as const, name: 'From class' }, ...ABILITIES.map((a) => ({ id: a, name: ABILITY_NAMES[a] }))];

export function SpellsPanel() {
  const { char: c, update } = useChar();
  const cat = useCatalog();
  const [libOpen, setLibOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [view, setView] = useState('all');
  // Spells that don't say where they come from are filed under the one class of yours whose list has them.
  useEffect(() => {
    if (!cat || !c.spells.some((s) => !s.grantedBy)) return;
    const found = inferSources(c, cat.spells);
    if (Object.keys(found).length) update((d) => d.spells.forEach((s) => found[s.id] && !s.grantedBy && (s.grantedBy = found[s.id])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, c.spells.length, c.classes.map((k) => k.classId).join()]);
  // The sources to look at the list by: your spellcasting classes and spell-giving feats, plus any set on a spell.
  const sources = sourceOptions(c);
  for (const sp of c.spells) if (sp.grantedBy && !sources.some((x) => x.id === sp.grantedBy)) sources.push({ id: sp.grantedBy, name: sourceName(c, sp.grantedBy) });
  const unset = c.spells.some((sp) => !sp.grantedBy);
  const several = sources.filter((x) => c.spells.some((sp) => sp.grantedBy === x.id)).length + (unset ? 1 : 0) > 1;
  const shown = view === 'all' ? c.spells : c.spells.filter((sp) => sp.grantedBy === (view === 'unset' ? '' : view));
  const slots = spellSlots(c);
  const pact = pactSlots(c);
  const maxLevel = Math.max(0, ...shown.map((s) => s.level));
  const levels = Array.from({ length: maxLevel + 1 }, (_, i) => i).filter((l) => shown.some((s) => s.level === l));
  const ability = c.spellcasting.ability ?? defaultSpellAbility(c);

  return (
    <Panel
      title="Spellcasting"
      tab="magic"
      actions={
        <span className="row" style={{ gap: 4 }}>
          {(c.spells.length > 0 || removing) && (
            <button type="button" className="btn small ghost" aria-pressed={removing} onClick={() => setRemoving((r) => !r)}>
              {removing ? 'Done' : 'Remove spells'}
            </button>
          )}
          <button type="button" className="btn small primary" onClick={() => setLibOpen(true)}>
            Add spell
          </button>
        </span>
      }
    >
      <TargetStrip />
      <div className="grid-3">
        <SelectField
          label="Ability"
          id="spell-ability"
          value={c.spellcasting.ability ?? 'auto'}
          options={ABILITY_SELECT}
          onChange={(v) => update((d) => void (d.spellcasting.ability = v === 'auto' ? null : (v as Ability)))}
        />
        <div className="stat" title={mathText(spellSaveDc(c))}>
          <span className="v">{spellSaveDc(c).total}</span>
          <span className="k">Save DC</span>
        </div>
        <div className="stat" title={mathText(spellAttack(c))}>
          <span className="v">{signed(spellAttack(c).total)}</span>
          <span className="k">Spell attack</span>
        </div>
      </div>
      {!ability && <p className="hint">This class has no spellcasting. Pick an ability above if a species trait or feat gives you spells.</p>}

      {(slots.some((n) => n > 0) || pact.count > 0) && (
        <>
          <div className="row" style={{ alignItems: 'center', margin: '14px 0 6px' }}>
            <h3 style={{ margin: 0, flex: 1 }}>{usesSpellPoints(c) ? 'Spell points' : 'Spell slots'}</h3>
            {slots.some((n) => n > 0) && (
              <div className="seg" role="radiogroup" aria-label="Cast your spells with">
                {(['slots', 'points'] as const).map((sys) => (
                  <button
                    key={sys}
                    type="button"
                    role="radio"
                    aria-checked={c.spellcasting.system === sys}
                    title={sys === 'points' ? "The Dungeon Master's Guide variant: a pool of points instead of slots. Check with your DM." : 'The usual spell slots'}
                    onClick={() => update((d) => void (d.spellcasting.system = sys))}
                  >
                    {sys === 'slots' ? 'Slots' : 'Spell points'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {usesSpellPoints(c) && slots.some((n) => n > 0) && <SpellPointsMeter />}
          <div className="slots">
            {slots.map((n, i) =>
              n > 0 && !usesSpellPoints(c) ? (
                <span className="slot-row" key={i}>
                  {ordinal(i + 1)}
                  <Pips total={n} spent={Math.min(n, c.spellcasting.slotsUsed[i] ?? 0)} label={`${ordinal(i + 1)}-level slot`} onChange={(v) => update((d) => void (d.spellcasting.slotsUsed[i] = Math.max(0, Math.min(n, v))))} />
                </span>
              ) : null,
            )}
            {pact.count > 0 && (
              <span className="slot-row">
                Pact ({ordinal(pact.level)})
                <Pips total={pact.count} spent={Math.min(pact.count, c.spellcasting.pactUsed)} label="Pact slot" onChange={(v) => update((d) => void (d.spellcasting.pactUsed = Math.max(0, Math.min(pact.count, v))))} />
              </span>
            )}
          </div>
        </>
      )}
      {!usesSpellPoints(c) && <SlotOverride />}
      <SpellCounts />

      {c.spellcasting.concentratingOn && (
        <div className="conc" style={{ marginTop: 10 }}>
          <span style={{ flex: 1 }}>
            Concentrating on <b>{c.spellcasting.concentratingOn}</b>
          </span>
          <button type="button" className="btn small" onClick={() => update((d) => void endConcentration(d))} title="Ends the spell, and takes its marks off your enemies">
            End
          </button>
        </div>
      )}

      {(several || sources.length > 1) && c.spells.length > 0 && (
        <>
          <div className="seg spell-sources" role="radiogroup" aria-label="Show spells from">
            {[{ id: 'all', name: 'All' }, ...sources.filter((x) => c.spells.some((sp) => sp.grantedBy === x.id)), ...(unset ? [{ id: 'unset', name: 'Not set' }] : [])].map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={view === x.id} onClick={() => setView(x.id)}>
                {x.name}
                {x.id !== 'all' && <small> {c.spells.filter((sp) => sp.grantedBy === (x.id === 'unset' ? '' : x.id)).length}</small>}
              </button>
            ))}
          </div>
          <p className="hint spell-source-math" style={{ margin: '6px 0 0' }}>
            {sources
              .filter((x) => c.spells.some((sp) => sp.grantedBy === x.id) && (view === 'all' || view === x.id))
              .map((x) => {
                const like = c.spells.find((sp) => sp.grantedBy === x.id)!;
                const a = spellAbility(c, like);
                return `${x.name}: ${a ? ABILITY_LONG[a] : '—'} · save DC ${spellSaveDc(c, like).total} · attack ${signed(spellAttack(c, like).total)}`;
              })
              .join('  |  ')}
          </p>
        </>
      )}
      {c.spells.length === 0 && <p className="hint">No spells yet. Add one from the library or write your own.</p>}
      {levels.map((lvl) => (
        <div className="level-group" key={lvl}>
          <h3>{lvl === 0 ? 'Cantrips' : `${ordinal(lvl)} level`}</h3>
          <div className="list">
            {shown
              .filter((s) => s.level === lvl)
              .map((s) => (
                <SpellRow key={s.id} spell={s} slots={slots} pact={pact} removing={removing} tag={several && view === 'all' ? sourceName(c, s.grantedBy) : ''} />
              ))}
          </div>
        </div>
      ))}
      {libOpen && <SpellLibrary onClose={() => setLibOpen(false)} />}
    </Panel>
  );
}

/** The spell point pool: what's left, the highest slot it can make, and what each level costs. */
function SpellPointsMeter() {
  const { char: c, update } = useChar();
  const p = spellPoints(c);
  const used = c.spellcasting.pointsUsed;
  const levels = Array.from({ length: Math.max(1, p.maxLevel) }, (_, i) => i + 1);
  return (
    <div className="points" role="group" aria-label="Spell points">
      <div className="points-bar" aria-hidden="true">
        <span style={{ width: `${p.max ? (100 * p.left) / p.max : 0}%` }} />
      </div>
      <div className="row" style={{ alignItems: 'center' }}>
        <span style={{ flex: 1 }}>
          <b className="points-left">{p.left}</b> of {p.max} points left · highest slot you can make: {p.maxLevel ? `${ordinal(p.maxLevel)} level` : 'none'}
        </span>
        <button type="button" className="btn small ghost" aria-label="Spend a spell point" disabled={p.left === 0} onClick={() => update((d) => void (d.spellcasting.pointsUsed = Math.min(p.max, d.spellcasting.pointsUsed + 1)))}>
          −
        </button>
        <button type="button" className="btn small ghost" aria-label="Get a spell point back" disabled={used === 0} onClick={() => update((d) => void (d.spellcasting.pointsUsed = Math.max(0, d.spellcasting.pointsUsed - 1)))}>
          +
        </button>
      </div>
      <p className="hint" style={{ margin: '4px 0 0' }}>
        Cost: {levels.map((l) => `${ordinal(l)} ${SPELL_POINT_COST[l]}`).join(' · ')}
        {p.maxLevel < 9 ? ' (higher levels as you level up)' : ''}. Cast spends them; a Long Rest brings them all back.
        {c.spellcasting.highUsed.length > 0 && ` Made since your Long Rest: ${c.spellcasting.highUsed.map((l) => ordinal(l)).join(', ')} level (one each).`}
      </p>
    </div>
  );
}

function SlotOverride() {
  const { char: c, update } = useChar();
  const [open, setOpen] = useState(false);
  const auto = spellSlots({ ...c, spellcasting: { ...c.spellcasting, slotsOverride: null } });
  if (!open)
    return (
      <button type="button" className="btn small ghost" style={{ marginTop: 6 }} onClick={() => setOpen(true)}>
        {c.spellcasting.slotsOverride ? 'Slots set by hand · edit' : 'Set slots by hand'}
      </button>
    );
  const cur = c.spellcasting.slotsOverride ?? auto;
  return (
    <div className="item" style={{ padding: 10, marginTop: 8 }}>
      <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
        {cur.map((n, i) => (
          <NumField key={i} label={ordinal(i + 1)} id={`slot-ovr-${i}`} value={n} min={0} max={9} onChange={(v) => update((d) => void (d.spellcasting.slotsOverride = cur.map((x, j) => (j === i ? v : x))))} />
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn small" onClick={() => setOpen(false)}>
          Done
        </button>
        <button type="button" className="btn small ghost" onClick={() => (update((d) => void (d.spellcasting.slotsOverride = null)), setOpen(false))}>
          Back to automatic
        </button>
      </div>
    </div>
  );
}

function spellSummary(s: Spell, plan: ReturnType<typeof planSpell>, dc: number, atk: number): string {
  const bits: string[] = [];
  if (s.resolution === 'attack') bits.push(`${signed(atk)} to hit`);
  if (s.resolution === 'save') bits.push(`DC ${dc} ${s.saveAbility.toUpperCase()}`);
  if (plan.damage.length) bits.push(`${plan.instances > 1 ? `${plan.instances}× ` : ''}${plan.damage.map((d) => `${d.dice} ${d.type}`).join(' + ')}`);
  if (plan.healing) bits.push(`heals ${plan.healing}`);
  if (s.resolution === 'utility') bits.push(s.castingTimeText);
  bits.push(s.range);
  return bits.join(' · ');
}

function SpellRow({ spell: s, slots, pact, removing, tag }: { spell: Spell; slots: number[]; pact: { count: number; level: number }; removing: boolean; tag: string }) {
  const { char: c, update } = useChar();
  const t = useTable();
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const plan = planSpell(c, s, s.level);
  const choices = t.slotChoices(s, slots, pact);
  // At enemies: who it's at, starting with your target. Area spells (saves, automatic hits) can take several.
  const aimable = c.enemies.length > 0 && (s.resolution === 'attack' || s.resolution === 'save' || s.resolution === 'auto' || !!markFromSpell(s));
  const several = s.resolution === 'save' || s.resolution === 'auto';
  const [aim, setAim] = useState<string[]>([]);
  const castWith = (choice: SlotChoice, el: HTMLElement) => {
    setChoosing(false);
    t.cast(s, choice, el, aimable && s.level > 0 ? aim : undefined);
  };
  const openChoices = () => {
    setAim(c.targetId ? [c.targetId] : []);
    setChoosing((v) => !v);
  };
  // A feat's once-per-Long-Rest casting without a slot (Shadow-Touched, Magic Initiate…).
  // Casting it without a slot: a feat's free cast (Shadow-Touched) or a class feature's (Favored Enemy).
  const frees = freeCastSources(c, s);
  return (
    <div className={`item el-${s.element}`}>
      <div className="item-head">
        <button type="button" className="item-title" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <b>
            {s.name}
            {s.concentration ? ' ◆' : ''}
          </b>
          <small>
            {tag && <span className="spell-tag">{tag}</span>}
            {spellSummary(s, plan, spellSaveDc(c, s).total, spellAttack(c, s).total)}
          </small>
        </button>
        {removing ? (
          <ConfirmButton label="Remove" confirmLabel="Tap to remove" className="btn small" onConfirm={() => update((d) => void (d.spells = d.spells.filter((x) => x.id !== s.id)))} />
        ) : (
          <button
            type="button"
            className="cast"
            onClick={(e) => {
              if (s.level === 0) castWith({ kind: 'free', level: 0 }, e.currentTarget);
              else openChoices();
            }}
            aria-expanded={s.level > 0 ? choosing : undefined}
          >
            Cast
          </button>
        )}
      </div>
      {choosing && aimable && (
        <div className="popover aim" role="group" aria-label={`Cast ${s.name} at`}>
          <span className="hint">At:</span>
          {c.enemies.map((e) => (
            <button
              key={e.id}
              type="button"
              className="chip"
              aria-pressed={aim.includes(e.id)}
              onClick={() => setAim((a) => (several ? (a.includes(e.id) ? a.filter((x) => x !== e.id) : [...a, e.id]) : [e.id]))}
            >
              {e.name}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={aim.length === 0} onClick={() => setAim([])}>
            No target
          </button>
          {several && <span className="hint">Tap several for an area spell.</span>}
        </div>
      )}
      {choosing && (
        <div className="popover" role="group" aria-label={`Cast ${s.name} with`}>
          {choices.map((ch) => (
            <button key={`${ch.kind}-${ch.level}`} type="button" className="btn small" onClick={(e) => castWith(ch, e.currentTarget)}>
              {choiceLabel(ch)}
              {ch.kind === 'slot' && ch.level > s.level ? ' ↑' : ''}
            </button>
          ))}
          {frees.map((f) => (
            <button
              key={f.idx}
              type="button"
              className="btn small"
              disabled={f.left === 0}
              title={`${f.name}: without a spell slot, ${f.left} of ${f.max} left`}
              onClick={(e) => {
                update((d) => void (d.features[f.idx].usesSpent += 1));
                castWith({ kind: 'free', level: s.level }, e.currentTarget);
              }}
            >
              Free cast ({f.name}){f.left === 0 ? ': used' : f.max > 1 ? ` · ${f.left} left` : ''}
            </button>
          ))}
          {choices.length === 0 && <span className="hint">No slots left.</span>}
          <button type="button" className="btn small ghost" onClick={(e) => castWith({ kind: 'free', level: s.level }, e.currentTarget)} title="Ritual, free casting from a trait, or a scroll">
            Without a slot
          </button>
        </div>
      )}
      {open && <SpellEditor spell={s} />}
    </div>
  );
}

const RESOLUTIONS = [
  { id: 'attack', name: 'Spell attack roll' },
  { id: 'save', name: 'Saving throw' },
  { id: 'auto', name: 'Automatic hit' },
  { id: 'heal', name: 'Healing' },
  { id: 'utility', name: 'No roll' },
] as const;

const CAST_TIMES = [
  { id: 'action', name: 'Action' },
  { id: 'bonus', name: 'Bonus Action' },
  { id: 'reaction', name: 'Reaction' },
  { id: 'other', name: 'Longer / other' },
] as const;

const SCALING = [
  { id: 'none', name: 'None' },
  { id: 'cantrip_dice', name: 'Cantrip: more dice at 5/11/17' },
  { id: 'cantrip_beams', name: 'Cantrip: more beams at 5/11/17' },
] as const;

const DAMAGE_OPTIONS = DAMAGE_TYPES.map((d) => ({ id: d, name: d.charAt(0).toUpperCase() + d.slice(1) }));

function SpellEditor({ spell: s }: { spell: Spell }) {
  const { update } = useChar();
  const t = useTable();
  const [editing, setEditing] = useState(false);
  const set = (fn: (sp: Spell) => void) =>
    update((d) => {
      const target = d.spells.find((x) => x.id === s.id);
      if (target) fn(target);
    });

  if (!editing) {
    return (
      <div className="item-body">
        <RulesText text={s.description || 'No description.'} />
        <div className="row">
          <span className="chip">{ELEMENTS.find((e) => e.id === s.element)?.name}</span>
          <span className="chip plain">{SHAPES.find((x) => x.id === s.shape)?.name}</span>
          <span className="chip plain">{s.school}</span>
          <span className="chip plain">{s.castingTimeText}</span>
          <span className="chip plain">{s.components}</span>
          <span className="chip plain">{s.duration}</span>
          {s.ritual && <span className="chip plain">Ritual</span>}
        </div>
        <div className="row">
          <button type="button" className="btn small" onClick={(e) => t.preview(s.element, s.shape, s.level, e.currentTarget)}>
            Preview effect
          </button>
          <button type="button" className="btn small" onClick={() => setEditing(true)}>
            Edit spell
          </button>
          <CopySpellText spell={s} />
          <ConfirmButton label="Remove" onConfirm={() => update((d) => void (d.spells = d.spells.filter((x) => x.id !== s.id)))} />
        </div>
      </div>
    );
  }

  const badDice = [...s.damage.map((d) => d.dice), s.healing, s.upcastDice].filter((x) => x.trim() && !isValid(x.replace(/\{\w+\}/g, '1')));
  return (
    <div className="item-body">
      <FillSpellFromText spell={s} set={set} />
      <div className="grid-2">
        <TextField label="Name" id={`sp-name-${s.id}`} value={s.name} onChange={(v) => set((x) => void (x.name = v))} />
        <NumField label="Level (0 = cantrip)" id={`sp-lvl-${s.id}`} value={s.level} min={0} max={9} onChange={(n) => set((x) => void (x.level = n))} />
        <TextField label="School" id={`sp-school-${s.id}`} value={s.school} onChange={(v) => set((x) => void (x.school = v))} />
        <SelectField
          label="Casting time"
          id={`sp-ct-${s.id}`}
          value={s.castingTime}
          options={CAST_TIMES}
          onChange={(v) => set((x) => ((x.castingTime = v), (x.castingTimeText = CAST_TIMES.find((ct) => ct.id === v)!.name)))}
        />
        <TextField label="Range" id={`sp-range-${s.id}`} value={s.range} onChange={(v) => set((x) => void (x.range = v))} />
        <TextField label="Duration" id={`sp-dur-${s.id}`} value={s.duration} onChange={(v) => set((x) => void (x.duration = v))} />
        <TextField label="Components" id={`sp-comp-${s.id}`} value={s.components} onChange={(v) => set((x) => void (x.components = v))} />
        <SelectField label="Resolution" id={`sp-res-${s.id}`} value={s.resolution} options={RESOLUTIONS} onChange={(v) => set((x) => void (x.resolution = v))} />
        {s.resolution === 'save' && (
          <SelectField label="Save" id={`sp-save-${s.id}`} value={s.saveAbility} options={ABILITIES.map((a) => ({ id: a, name: ABILITY_NAMES[a] }))} onChange={(v) => set((x) => void (x.saveAbility = v))} />
        )}
        <SelectField
          label="Ability override"
          id={`sp-abo-${s.id}`}
          value={s.abilityOverride ?? 'auto'}
          options={ABILITY_SELECT}
          onChange={(v) => set((x) => void (x.abilityOverride = v === 'auto' ? null : (v as Ability)))}
        />
        <GrantedBy spell={s} set={set} />
      </div>
      <div className="row">
        <Check label="Concentration" id={`sp-conc-${s.id}`} checked={s.concentration} onChange={(b) => set((x) => void (x.concentration = b))} />
        <Check label="Ritual" id={`sp-rit-${s.id}`} checked={s.ritual} onChange={(b) => set((x) => void (x.ritual = b))} />
        {s.resolution === 'save' && <Check label="Half damage on a success" id={`sp-half-${s.id}`} checked={s.halfOnSave} onChange={(b) => set((x) => void (x.halfOnSave = b))} />}
      </div>

      {s.resolution !== 'heal' && s.resolution !== 'utility' && (
        <>
          {s.damage.map((part, i) => (
            <div className="damage-row" key={i}>
              <TextField label={i === 0 ? 'Damage dice' : 'More damage'} id={`sp-dice-${s.id}-${i}`} value={part.dice} onChange={(v) => set((x) => void (x.damage[i].dice = v))} />
              <SelectField
                label="Type"
                id={`sp-type-${s.id}-${i}`}
                value={part.type}
                options={DAMAGE_OPTIONS}
                onChange={(v) =>
                  set((x) => {
                    x.damage[i].type = v as DamageType;
                    if (i === 0) x.element = v as Element;
                  })
                }
              />
              <button type="button" className="btn small ghost" onClick={() => set((x) => void x.damage.splice(i, 1))}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => set((x) => void x.damage.push({ dice: '1d6', type: (x.damage[0]?.type ?? 'fire') as DamageType }))}>
            Add damage
          </button>
        </>
      )}
      {s.resolution === 'heal' && <TextField label="Healing dice" id={`sp-heal-${s.id}`} value={s.healing} placeholder="2d8+{MOD}" onChange={(v) => set((x) => void (x.healing = v))} />}
      <div className="grid-2">
        <TextField label="Upcast dice per slot level" id={`sp-up-${s.id}`} value={s.upcastDice} placeholder="1d6" onChange={(v) => set((x) => void (x.upcastDice = v))} />
        <NumField label="Attacks / darts / rays" id={`sp-inst-${s.id}`} value={s.instances} min={1} max={20} onChange={(n) => set((x) => void (x.instances = n))} />
        <NumField label="Extra per slot level" id={`sp-upi-${s.id}`} value={s.upcastInstances} min={0} max={5} onChange={(n) => set((x) => void (x.upcastInstances = n))} />
        <SelectField label="Cantrip scaling" id={`sp-scale-${s.id}`} value={s.scaling} options={SCALING} onChange={(v) => set((x) => void (x.scaling = v))} />
        <SelectField label="Look (element)" id={`sp-el-${s.id}`} value={s.element} options={ELEMENTS} onChange={(v) => set((x) => void (x.element = v))} />
        <SelectField label="Motion (shape)" id={`sp-shape-${s.id}`} value={s.shape} options={SHAPES} onChange={(v) => set((x) => void (x.shape = v))} />
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Dice can use <span className="mono">{'{MOD}'}</span> (spellcasting modifier), <span className="mono">{'{PB}'}</span> and <span className="mono">{'{LEVEL}'}</span>.
      </p>
      {badDice.length > 0 && <p className="hint" style={{ color: 'var(--bad)', margin: 0 }}>Can't read: {badDice.join(', ')}. Use dice like 3d6 or 2d8+{'{MOD}'}.</p>}
      <TextField label="Description" id={`sp-desc-${s.id}`} multiline value={s.description} onChange={(v) => set((x) => void (x.description = v))} />
      <SpellVersion spell={s} set={set} />
      <div className="row">
        <button type="button" className="btn small" onClick={(e) => t.preview(s.element, s.shape, s.level, e.currentTarget)}>
          Preview effect
        </button>
        <button type="button" className="btn small primary" onClick={() => setEditing(false)}>
          Done
        </button>
      </div>
    </div>
  );
}

/** Where a spell comes from: one of your classes, a feat, or something else you name. */
function GrantedBy({ spell: s, set }: { spell: Spell; set: (fn: (sp: Spell) => void) => void }) {
  const { char: c } = useChar();
  const options = sourceOptions(c);
  const known = !s.grantedBy || options.some((o) => o.id === s.grantedBy);
  const [custom, setCustom] = useState(!known);
  return (
    <>
      <SelectField
        label="Granted by"
        id={`sp-from-${s.id}`}
        value={custom ? '__other' : s.grantedBy}
        options={[...options, { id: '', name: 'Not set' }, { id: '__other', name: 'A feat or something else…' }]}
        onChange={(v) => {
          if (v === '__other') return setCustom(true);
          setCustom(false);
          set((x) => void (x.grantedBy = v));
        }}
      />
      {custom && (
        <TextField
          label="Its name (a feat, item or species trait)"
          id={`sp-from-name-${s.id}`}
          value={s.grantedBy.startsWith('feat:') ? s.grantedBy.slice(5) : ''}
          placeholder="Shadow-Touched"
          onChange={(v) => set((x) => void (x.grantedBy = v.trim() ? `feat:${v}` : ''))}
        />
      )}
    </>
  );
}

/**
 * Your version of a spell: save it to your library as a new spell (the original stays as it
 * was), or put it back to the rules' original.
 */
function SpellVersion({ spell: s, set }: { spell: Spell; set: (fn: (sp: Spell) => void) => void }) {
  const cat = useCatalog();
  const original = cat ? tunedSpells(cat.spells).find((d) => d.name.toLowerCase() === (s.basedOn || s.name).toLowerCase()) : undefined;
  const cls = s.grantedBy && !s.grantedBy.startsWith('feat:') ? s.grantedBy.split(':').pop()! : '';
  const [name, setName] = useState(() => (original && original.name === s.name ? `${s.name} (custom)` : s.name));
  const [pack, setPack] = useState('My spells');
  const [message, setMessage] = useState('');
  const sameAsRules = !!original && original.name.toLowerCase() === name.trim().toLowerCase();
  return (
    <div className="spell-version">
      <h4 style={{ margin: 0 }}>Your version</h4>
      <p className="hint" style={{ margin: 0 }}>
        Save this spell as it is now to your library under its own name: it shows in the spell list{cls ? ` for ${cls.charAt(0).toUpperCase() + cls.slice(1)}` : ''} next to the original, which stays as it was.
      </p>
      <div className="grid-2">
        <TextField label="New spell’s name" id={`sp-newname-${s.id}`} value={name} onChange={setName} />
        <TextField label="Save it in" id={`sp-pack-${s.id}`} value={pack} onChange={setPack} />
      </div>
      {sameAsRules && <p className="hint" style={{ margin: 0, color: 'var(--warn)' }}>That’s the original’s name: give your version its own so both stay in the list.</p>}
      <div className="row">
        <button
          type="button"
          className="btn small primary"
          disabled={!name.trim() || !pack.trim() || sameAsRules}
          onClick={async () => {
            const n = name.trim();
            await addSpellsToLibrary(pack.trim(), [spellDefFromSpell({ ...s, name: n }, n, cls ? [cls] : (original?.classes ?? []))], 'edited on the sheet');
            set((x) => void ((x.name = n), (x.basedOn ||= original?.name ?? '')));
            setMessage(`Saved “${n}” to ${pack.trim()}. This spell on your sheet is now your version.`);
          }}
        >
          Save as a new spell in my library
        </button>
        {original && (
          <ConfirmButton
            label={`Reset to the original ${original.name}`}
            confirmLabel="Tap again to reset it"
            onConfirm={() => {
              set((x) => {
                const fresh = spellFromDef(original, x.id, x.grantedBy);
                Object.assign(x, { ...fresh, prepared: x.prepared, abilityOverride: x.abilityOverride });
              });
              setMessage(`Back to the original ${original.name}.`);
            }}
          />
        )}
      </div>
      {message && (
        <p className="hint" role="status" style={{ margin: 0, color: 'var(--good)' }}>
          {message}
        </p>
      )}
    </div>
  );
}

function SpellLibrary({ onClose }: { onClose: () => void }) {
  const { update } = useChar();
  const [tab, setTab] = useState<'list' | 'paste' | 'import'>('list');
  const [message, setMessage] = useState('');
  return (
    <Dialog title="Add a spell" onClose={onClose}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="seg wrap" role="radiogroup" aria-label="How to add">
          <button type="button" role="radio" aria-checked={tab === 'list'} onClick={() => setTab('list')}>
            Spell list
          </button>
          <button type="button" role="radio" aria-checked={tab === 'paste'} onClick={() => setTab('paste')}>
            Paste a spell
          </button>
          <button type="button" role="radio" aria-checked={tab === 'import'} onClick={() => setTab('import')}>
            Import spells
          </button>
        </div>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            update((d) => void d.spells.push(blankSpell({ id: uid(), name: 'New spell' })));
            onClose();
          }}
        >
          Write my own
        </button>
      </div>
      {message && (
        <p className="note good" role="status">
          {message}
        </p>
      )}
      <div style={{ marginTop: 10 }}>
        {tab === 'paste' ? (
          <PasteSpells onDone={(m) => (setMessage(m), setTab('list'))} />
        ) : tab === 'list' ? (
          <>
            <SpellBrowser pageSize={150} />
            <p className="hint">
              Spells from the System Reference Document 5.2.1 by Wizards of the Coast (CC-BY-4.0), plus your own from the rules library. Not every published spell is in the SRD: import the ones you
              need with “Import spells”, from pasted text or a document.
            </p>
          </>
        ) : (
          <SpellImport onSaved={(m) => (setMessage(m), setTab('list'))} />
        )}
      </div>
    </Dialog>
  );
}

/** How many cantrips and prepared spells each class allows at its level, against what's on the sheet. */
function SpellCounts() {
  const { char: c } = useChar();
  const cat = useCatalog();
  if (!cat) return null;
  const allowed = spellCounts(c, cat);
  if (!allowed.length) return null;
  // Spells a feat gives (Shadow-Touched, Magic Initiate) are always prepared and don't count against your classes'.
  const classSpells = c.spells.filter((s) => !s.grantedBy.startsWith('feat:'));
  const fromFeats = c.spells.length - classSpells.length;
  const cantrips = classSpells.filter((s) => s.level === 0).length;
  const prepared = classSpells.filter((s) => s.level > 0 && s.prepared).length;
  const sum = (k: 'cantrips' | 'prepared') => allowed.reduce((a, x) => a + (x[k] ?? 0), 0);
  const many = allowed.length > 1;
  return (
    <p className="hint spell-counts">
      Cantrips <b className={cantrips > sum('cantrips') ? 'over' : ''}>{cantrips}</b> of {sum('cantrips')} · Prepared spells <b className={prepared > sum('prepared') ? 'over' : ''}>{prepared}</b> of {sum('prepared')}
      {many && ` (${allowed.map((x) => `${x.className}: ${x.cantrips ?? 0} + ${x.prepared ?? 0}`).join(', ')})`}
      {fromFeats > 0 && ` · plus ${fromFeats} from feats, which don’t count`}
    </p>
  );
}

/** The classes a sheet spell is on, for its text: the class it's from, else its original's list. */
function spellClasses(s: Spell, cat: ReturnType<typeof useCatalog>, c: Character): string[] {
  if (s.grantedBy && !s.grantedBy.startsWith('feat:') && c.classes.some((k) => k.classId === s.grantedBy)) return [s.grantedBy];
  return cat?.spells.find((d) => d.name.toLowerCase() === (s.basedOn || s.name).toLowerCase())?.classes ?? [];
}

/** Copies a spell as text (a rulebook-style entry plus its exact numbers), to share or paste back. */
function CopySpellText({ spell: s }: { spell: Spell }) {
  const { char: c } = useChar();
  const cat = useCatalog();
  return <CopyTextButton getText={() => spellToText(s, spellClasses(s, cat, c))} title="Copy the whole spell as text: paste it into Add spell → Paste a spell (here or in someone else's app), or anywhere else" />;
}

/** Things a pasted spell left out, worth a look before adding it. */
const missing = (parts: Set<SpellPart>) =>
  (
    [
      ['level', 'level'],
      ['time', 'casting time'],
      ['range', 'range'],
      ['components', 'components'],
      ['duration', 'duration'],
    ] as const
  )
    .filter(([k]) => !parts.has(k))
    .map(([, name]) => name);

/** Paste a spell (or several), from a book, D&D Beyond, a friend or your own notes, and add it. */
function PasteSpells({ onDone }: { onDone: (message: string) => void }) {
  const idBase = useId();
  const { char: c, update } = useChar();
  const sources = sourceOptions(c);
  const casters = sources.filter((x) => !x.id.startsWith('feat:'));
  const [text, setText] = useState('');
  const [found, setFound] = useState<ReturnType<typeof readPastedSpells> | null>(null);
  const [addAs, setAddAs] = useState(casters.length === 1 ? casters[0].id : 'auto');
  const [keep, setKeep] = useState(true);
  const [pack, setPack] = useState('My spells');
  const [error, setError] = useState('');
  /** Where each spell comes from: your choice, else the one class of yours that it lists. */
  const sourceFor = (d: SpellDef) => (addAs !== 'auto' ? addAs : (casters.find((k) => d.classes?.includes(k.id))?.id ?? ''));
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="field" htmlFor={`${idBase}-spell-paste-one`}>
        <span>Paste a spell, as much of it as you have: its name, level, casting time, range and description. Several at once work too.</span>
        <textarea
          id={`${idBase}-spell-paste-one`}
          className="input"
          style={{ minHeight: 170 }}
          value={text}
          onChange={(e) => (setText(e.target.value), setFound(null))}
          placeholder={'Grave Hook\nLevel 1 Necromancy (Warlock)\nCasting Time: Action\nRange: 60 feet\nComponents: V, S\nDuration: Instantaneous\nMake a ranged spell attack… 2d8 Necrotic damage…'}
        />
      </label>
      <div className="row">
        <button
          type="button"
          className="btn small primary"
          disabled={!text.trim()}
          onClick={() => {
            const r = readPastedSpells(text);
            setFound(r);
            setError(r.length ? '' : 'Nothing to read there.');
          }}
        >
          Read it
        </button>
      </div>
      {error && <p className="hint" style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      {found && found.length > 0 && (
        <div className="note good" style={{ display: 'grid', gap: 8 }}>
          {found.map(({ def, parts }, i) => (
            <div key={i} style={{ display: 'grid', gap: 4 }}>
              <label className="field">
                <span>Name</span>
                <input className="input" value={def.name} aria-label={`Name of spell ${i + 1}`} onChange={(e) => setFound((f) => f && f.map((x, j) => (j === i ? { ...x, def: { ...x.def, name: e.target.value } } : x)))} />
              </label>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {describeSpellDef(def).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {missing(parts).length > 0 && (
                <p className="hint" style={{ margin: 0, color: 'var(--warn)' }}>
                  Not in the text: {missing(parts).join(', ')}. It’s added with defaults; set them with Edit spell.
                </p>
              )}
            </div>
          ))}
          <div className="grid-2">
            <label className="field">
              <span>It’s a spell from</span>
              <select value={addAs} onChange={(e) => setAddAs(e.target.value)} aria-label="Where the spell comes from">
                <option value="auto">The class of mine it lists</option>
                {sources.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
                <option value="">Not set</option>
              </select>
            </label>
            <label className="field">
              <span>Save it in my spell library as</span>
              <input className="input" value={pack} onChange={(e) => setPack(e.target.value)} disabled={!keep} aria-label="Library list to save the spell in" />
            </label>
          </div>
          <Check label="Also save it to my spell library, to use again or on another character" checked={keep} onChange={setKeep} />
          <div className="row">
            <button
              type="button"
              className="btn small primary"
              disabled={found.some((f) => !f.def.name.trim())}
              onClick={async () => {
                const defs = found.map((f) => f.def);
                update((d) => {
                  for (const def of defs) d.spells.push(spellFromDef(def, uid(), sourceFor(def)));
                });
                let saved = '';
                if (keep && pack.trim()) {
                  // A spell that names no class is filed under the class it's added as.
                  const filed = defs.map((def) => (def.classes?.length || !sourceFor(def) || sourceFor(def).startsWith('feat:') ? def : { ...def, classes: [sourceFor(def)] }));
                  await addSpellsToLibrary(pack.trim(), filed, 'pasted text').then(
                    () => (saved = `, and saved to ${pack.trim()}`),
                    (e: Error) => (saved = `; it couldn’t be saved to the library (${e.message})`),
                  );
                }
                setText('');
                setFound(null);
                onDone(`${defs.map((d) => d.name).join(', ')} added to your spells${saved}.`);
              }}
            >
              Add {found.length === 1 ? 'it' : `all ${found.length}`} to my spells
            </button>
          </div>
        </div>
      )}
      <p className="hint" style={{ margin: 0 }}>
        Copied a spell from this app (Copy as text)? It pastes back exactly, your changes included: its dice, extra damage, rays and animation.
      </p>
    </div>
  );
}

/** Pastes a spell's text into a spell you already have: whatever the text gives replaces what's there. */
function FillSpellFromText({ spell: s, set }: { spell: Spell; set: (fn: (sp: Spell) => void) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState('');
  if (text === null)
    return (
      <div className="row">
        <button type="button" className="btn small ghost" onClick={() => (setText(''), setNote(''))}>
          Fill in from pasted text
        </button>
        {note && (
          <span className="hint" role="status">
            {note}
          </span>
        )}
      </div>
    );
  return (
    <div className="note" style={{ display: 'grid', gap: 6 }}>
      <label className="field" htmlFor={`sp-paste-${s.id}`}>
        <span>Paste the spell (all of it, or just a description): what it gives fills in the fields below</span>
        <textarea id={`sp-paste-${s.id}`} className="input" style={{ minHeight: 130 }} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </label>
      <div className="row">
        <button
          type="button"
          className="btn small primary"
          disabled={!text.trim()}
          onClick={() => {
            const [r] = readPastedSpells(text, s.name);
            if (!r) return setNote('Nothing to read there.');
            const preview = structuredClone(s);
            const changed = fillSpell(preview, r.def, r.parts);
            set((x) => void fillSpell(x, r.def, r.parts));
            setNote(changed.length ? `Filled in: ${changed.join(', ')}.` : 'Nothing new in that text.');
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
