import { useMemo, useState } from 'react';
import { isValid } from '../engine/dice';
import { ELEMENTS, SHAPES, type Element } from '../fx/types';
import { useChar } from '../state/character';
import { ordinal, useTable, type SlotChoice } from '../state/table';
import { ABILITIES, ABILITY_NAMES, DAMAGE_TYPES, type Ability, type DamageType } from '../systems/dnd5e/data';
import { blankSpell, uid, type Spell } from '../systems/dnd5e/model';
import { defaultSpellAbility, pactSlots, planSpell, signed, spellAttack, spellSaveDc, spellSlots } from '../systems/dnd5e/rules';
import { SPELL_LIBRARY } from '../systems/dnd5e/spells';
import { Check, ConfirmButton, Dialog, NumField, Panel, Pips, SelectField, TextField, mathText } from './ui';

const ABILITY_SELECT = [{ id: 'auto' as const, name: 'From class' }, ...ABILITIES.map((a) => ({ id: a, name: ABILITY_NAMES[a] }))];

export function SpellsPanel() {
  const { char: c, update } = useChar();
  const [libOpen, setLibOpen] = useState(false);
  const slots = spellSlots(c);
  const pact = pactSlots(c);
  const maxLevel = Math.max(0, ...c.spells.map((s) => s.level));
  const levels = Array.from({ length: maxLevel + 1 }, (_, i) => i).filter((l) => c.spells.some((s) => s.level === l));
  const ability = c.spellcasting.ability ?? defaultSpellAbility(c);

  return (
    <Panel
      title="Spellcasting"
      tab="magic"
      actions={
        <button type="button" className="btn small primary" onClick={() => setLibOpen(true)}>
          Add spell
        </button>
      }
    >
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
          <h3>Spell slots</h3>
          <div className="slots">
            {slots.map((n, i) =>
              n > 0 ? (
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
      <SlotOverride />

      {c.spellcasting.concentratingOn && (
        <div className="conc" style={{ marginTop: 10 }}>
          <span style={{ flex: 1 }}>
            Concentrating on <b>{c.spellcasting.concentratingOn}</b>
          </span>
          <button type="button" className="btn small" onClick={() => update((d) => void (d.spellcasting.concentratingOn = null))}>
            End
          </button>
        </div>
      )}

      {c.spells.length === 0 && <p className="hint">No spells yet. Add one from the library or write your own.</p>}
      {levels.map((lvl) => (
        <div className="level-group" key={lvl}>
          <h3>{lvl === 0 ? 'Cantrips' : `${ordinal(lvl)} level`}</h3>
          <div className="list">
            {c.spells
              .filter((s) => s.level === lvl)
              .map((s) => (
                <SpellRow key={s.id} spell={s} slots={slots} pact={pact} />
              ))}
          </div>
        </div>
      ))}
      {libOpen && <SpellLibrary onClose={() => setLibOpen(false)} />}
    </Panel>
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

function SpellRow({ spell: s, slots, pact }: { spell: Spell; slots: number[]; pact: { count: number; level: number } }) {
  const { char: c } = useChar();
  const t = useTable();
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const plan = planSpell(c, s, s.level);
  const choices = t.slotChoices(s, slots, pact);
  const castWith = (choice: SlotChoice, el: HTMLElement) => {
    setChoosing(false);
    t.cast(s, choice, el);
  };
  return (
    <div className={`item el-${s.element}`}>
      <div className="item-head">
        <button type="button" className="item-title" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <b>
            {s.name}
            {s.concentration ? ' ◆' : ''}
          </b>
          <small>{spellSummary(s, plan, spellSaveDc(c, s).total, spellAttack(c, s).total)}</small>
        </button>
        <button
          type="button"
          className="cast"
          onClick={(e) => {
            if (s.level === 0) castWith({ kind: 'free', level: 0 }, e.currentTarget);
            else setChoosing((v) => !v);
          }}
          aria-expanded={s.level > 0 ? choosing : undefined}
        >
          Cast
        </button>
      </div>
      {choosing && (
        <div className="popover" role="group" aria-label={`Cast ${s.name} with`}>
          {choices.map((ch) => (
            <button key={`${ch.kind}-${ch.level}`} type="button" className="btn small" onClick={(e) => castWith(ch, e.currentTarget)}>
              {ch.kind === 'pact' ? `Pact slot (${ordinal(ch.level)})` : `${ordinal(ch.level)}-level slot`}
              {ch.kind === 'slot' && ch.level > s.level ? ' ↑' : ''}
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
        <p>{s.description || 'No description.'}</p>
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
          <ConfirmButton label="Remove" onConfirm={() => update((d) => void (d.spells = d.spells.filter((x) => x.id !== s.id)))} />
        </div>
      </div>
    );
  }

  const badDice = [...s.damage.map((d) => d.dice), s.healing, s.upcastDice].filter((x) => x.trim() && !isValid(x.replace(/\{\w+\}/g, '1')));
  return (
    <div className="item-body">
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

function SpellLibrary({ onClose }: { onClose: () => void }) {
  const { char: c, update } = useChar();
  const t = useTable();
  const [q, setQ] = useState('');
  const known = new Set(c.spells.map((s) => s.name));
  const list = useMemo(() => SPELL_LIBRARY.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <Dialog title="Add a spell" onClose={onClose}>
      <div className="row">
        <input className="input" style={{ flex: 1 }} placeholder="Search spells" value={q} id="spell-search" aria-label="Search spells" onChange={(e) => setQ(e.target.value)} autoFocus />
        <button
          type="button"
          className="btn"
          onClick={() => {
            update((d) => void d.spells.push(blankSpell({ id: uid(), name: q.trim() || 'New spell' })));
            onClose();
          }}
        >
          Write my own
        </button>
      </div>
      <div className="lib">
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`el-${s.element}`}
            onClick={(e) => {
              update((d) => void d.spells.push({ ...structuredClone(s), id: uid() }));
              t.preview(s.element, s.shape, s.level, e.currentTarget);
            }}
          >
            <span>
              <b>{s.name}</b>
              <span className="hint"> · {s.level === 0 ? 'Cantrip' : `${ordinal(s.level)} level`} · {s.school}</span>
            </span>
            <span className="chip">{known.has(s.name) ? 'Added' : ELEMENTS.find((e) => e.id === s.element)?.name}</span>
          </button>
        ))}
      </div>
      <p className="hint">
        Mechanics from the D&amp;D System Reference Document 5.2 (CC-BY-4.0). Descriptions are short summaries; check your Player’s Handbook for full rules.
      </p>
    </Dialog>
  );
}
