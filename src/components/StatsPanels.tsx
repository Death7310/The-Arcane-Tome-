import { useState } from 'react';
import { useChar } from '../state/character';
import { useTable } from '../state/table';
import { ABILITIES, ABILITY_NAMES, CLASSES, SKILLS, classById, type CasterType } from '../systems/dnd5e/data';
import { uid, type ProfLevel } from '../systems/dnd5e/model';
import {
  abilityCheck,
  armorClass,
  carryingCapacity,
  initiative,
  inventoryWeight,
  isSpellcaster,
  jump,
  maxHp,
  mod,
  passive,
  pb,
  savingThrow,
  signed,
  skillCheck,
  skillProfLevel,
  speed,
  spellAttack,
  spellSaveDc,
  totalLevel,
} from '../systems/dnd5e/rules';
import { ConfirmButton, NumField, Panel, SelectField, Stat, TextField, mathText } from './ui';

const CASTER_OPTIONS: { id: CasterType | 'class'; name: string }[] = [
  { id: 'class', name: 'Class default' },
  { id: 'none', name: 'No spellcasting' },
  { id: 'full', name: 'Full caster' },
  { id: 'half', name: 'Half caster' },
  { id: 'third', name: 'Third caster (Eldritch Knight, Arcane Trickster)' },
  { id: 'pact', name: 'Pact Magic' },
];

export function IdentityPanel() {
  const { char: c, update } = useChar();
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title="Character"
      tab="stats"
      actions={
        <button type="button" className="btn small ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Done' : 'Edit'}
        </button>
      }
    >
      {!open ? (
        <div className="grid-2">
          <div className="stat">
            <span className="v">{totalLevel(c)}</span>
            <span className="k">Level · PB {signed(pb(c))}</span>
          </div>
          <div className="stat">
            <span className="v" style={{ fontSize: 16, lineHeight: 1.25 }}>
              {c.species || '—'}
            </span>
            <span className="k">{c.background || 'Background'}</span>
          </div>
          <p className="hint" style={{ gridColumn: '1 / -1', margin: 0 }}>
            {c.classes.map((k) => `${classById(k.classId).name}${k.subclass ? ` (${k.subclass})` : ''} ${k.level}`).join(' / ')}
            {c.alignment ? ` · ${c.alignment}` : ''}
            {c.xp ? ` · ${c.xp.toLocaleString()} XP` : ''}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <TextField label="Name" value={c.name} onChange={(v) => update((d) => void (d.name = v))} id="char-name" />
          <div className="grid-2">
            <TextField label="Species" value={c.species} onChange={(v) => update((d) => void (d.species = v))} id="char-species" />
            <TextField label="Background" value={c.background} onChange={(v) => update((d) => void (d.background = v))} id="char-bg" />
            <TextField label="Alignment" value={c.alignment} onChange={(v) => update((d) => void (d.alignment = v))} id="char-align" />
            <NumField label="XP" value={c.xp} min={0} onChange={(n) => update((d) => void (d.xp = n))} id="char-xp" />
            <TextField label="Player" value={c.player} onChange={(v) => update((d) => void (d.player = v))} id="char-player" />
            <TextField label="Size" value={c.size} onChange={(v) => update((d) => void (d.size = v))} id="char-size" />
          </div>
          <h3>Classes</h3>
          {c.classes.map((k, idx) => (
            <div key={k.id} className="item" style={{ padding: 10, display: 'grid', gap: 8 }}>
              <div className="grid-2">
                <SelectField
                  label="Class"
                  id={`class-${k.id}`}
                  value={k.classId}
                  options={CLASSES}
                  onChange={(v) =>
                    update((d) => {
                      d.classes[idx].classId = v;
                      if (idx === 0) {
                        const saves = classById(v).saves;
                        ABILITIES.forEach((a) => (d.saveProfs[a] = saves.includes(a)));
                      }
                    })
                  }
                />
                <NumField label="Level" id={`level-${k.id}`} value={k.level} min={1} max={20} onChange={(n) => update((d) => void (d.classes[idx].level = n))} />
                <TextField label="Subclass" id={`sub-${k.id}`} value={k.subclass} onChange={(v) => update((d) => void (d.classes[idx].subclass = v))} />
                <SelectField
                  label="Spellcasting"
                  id={`caster-${k.id}`}
                  value={k.casterOverride ?? 'class'}
                  options={CASTER_OPTIONS}
                  onChange={(v) => update((d) => void (d.classes[idx].casterOverride = v === 'class' ? undefined : v))}
                />
              </div>
              {c.classes.length > 1 && <ConfirmButton label="Remove class" onConfirm={() => update((d) => void d.classes.splice(idx, 1))} />}
            </div>
          ))}
          <button
            type="button"
            className="btn small"
            onClick={() => update((d) => void d.classes.push({ id: uid(), classId: 'fighter', subclass: '', level: 1, hitDiceUsed: 0 }))}
          >
            Add a class (multiclass)
          </button>
          <p className="hint" style={{ margin: 0 }}>
            The first class sets your saving throw proficiencies and level-1 hit points.
          </p>
        </div>
      )}
    </Panel>
  );
}

export function AbilitiesPanel() {
  const { char: c, update } = useChar();
  const t = useTable();
  return (
    <Panel title="Abilities" tab="stats">
      <div className="abilities">
        {ABILITIES.map((a) => {
          const m = mod(c, a);
          const save = savingThrow(c, a);
          return (
            <div className="ability" key={a}>
              <span className="abbr">{a.toUpperCase()}</span>
              <button
                type="button"
                className="mod"
                title={`Roll a ${ABILITY_NAMES[a]} check: ${mathText(abilityCheck(c, a))}`}
                onClick={(e) => t.test(`${ABILITY_NAMES[a]} check`, abilityCheck(c, a), e.currentTarget)}
              >
                {signed(m)}
              </button>
              <NumField value={c.abilities[a]} min={1} max={30} ariaLabel={`${ABILITY_NAMES[a]} score`} id={`score-${a}`} onChange={(n) => update((d) => void (d.abilities[a] = n))} />
              <span className="save">
                <button
                  type="button"
                  className="prof-dot"
                  data-level={c.saveProfs[a] ? 1 : 0}
                  aria-pressed={c.saveProfs[a]}
                  aria-label={`${ABILITY_NAMES[a]} save proficiency`}
                  onClick={() => update((d) => void (d.saveProfs[a] = !d.saveProfs[a]))}
                />
                Save
                <button type="button" className="roll" title={mathText(save)} onClick={(e) => t.test(`${ABILITY_NAMES[a]} save`, save, e.currentTarget)}>
                  {signed(save.total)}
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        Tap a modifier to roll a check, or a save button to roll that save. The dot marks save proficiency.
      </p>
    </Panel>
  );
}

export function GlancePanel() {
  const { char: c, update } = useChar();
  const t = useTable();
  const [showMath, setShowMath] = useState(false);
  const cap = carryingCapacity(c);
  const j = jump(c);
  const caster = isSpellcaster(c);
  const weight = inventoryWeight(c);
  return (
    <Panel
      title="At a glance"
      tab="stats combat"
      actions={
        <button type="button" className="btn small ghost" aria-pressed={showMath} onClick={() => setShowMath((s) => !s)}>
          {showMath ? 'Hide the math' : 'Show the math'}
        </button>
      }
    >
      <div className="glance">
        <Stat label="Proficiency" b={{ total: pb(c), parts: [{ label: `Level ${totalLevel(c)}`, value: pb(c) }] }} bonus showMath={showMath} />
        <Stat label="Armor Class" b={armorClass(c)} showMath={showMath} />
        <Stat label="Initiative" b={initiative(c)} bonus showMath={showMath} onRoll={(el) => t.test('Initiative', initiative(c), el)} />
        <Stat label="Speed" b={speed(c)} suffix=" ft" showMath={showMath} />
        <Stat label="Max HP" b={maxHp(c)} showMath={showMath} />
        <Stat label="Passive Perception" b={passive(c, 'perception')} showMath={showMath} />
        <Stat label="Passive Insight" b={passive(c, 'insight')} showMath={showMath} />
        <Stat label="Passive Investigation" b={passive(c, 'investigation')} showMath={showMath} />
        {caster && <Stat label="Spell save DC" b={spellSaveDc(c)} showMath={showMath} />}
        {caster && <Stat label="Spell attack" b={spellAttack(c)} bonus showMath={showMath} onRoll={(el) => t.test('Spell attack', spellAttack(c), el)} />}
        <Stat label="Carry (lb)" b={{ total: cap.carry, parts: [{ label: `STR ${c.abilities.str} × 15`, value: cap.carry }] }} showMath={showMath} />
        <Stat label="Long / high jump" b={{ total: j.long, parts: [{ label: `Long = STR score; high = 3 + STR mod = ${j.high} ft`, value: j.long }] }} suffix={` / ${j.high} ft`} showMath={showMath} />
      </div>
      {weight > cap.carry && <p className="hint" style={{ color: 'var(--warn)' }}>You carry {weight} lb, more than your capacity of {cap.carry} lb.</p>}
      <h3>Adjustments</h3>
      <div className="grid-auto">
        <NumField label="Base speed" id="adj-speed" value={c.speed} min={0} step={5} onChange={(n) => update((d) => void (d.speed = n))} />
        <NumField label="Initiative +" id="adj-init" value={c.bonus.initiative} onChange={(n) => update((d) => void (d.bonus.initiative = n))} />
        <NumField label="All saves +" id="adj-saves" value={c.bonus.saves} onChange={(n) => update((d) => void (d.bonus.saves = n))} />
        <NumField label="All checks +" id="adj-checks" value={c.bonus.checks} onChange={(n) => update((d) => void (d.bonus.checks = n))} />
        <NumField label="HP per level +" id="adj-hp" value={c.bonus.hpPerLevel} onChange={(n) => update((d) => void (d.bonus.hpPerLevel = n))} />
        <NumField label="Max HP override" id="adj-maxhp" value={c.hp.maxOverride ?? 0} min={0} onChange={(n) => update((d) => void (d.hp.maxOverride = n > 0 ? n : null))} />
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        Max HP uses the fixed value per level (half the die + 1); set an override if you rolled. Leave it at 0 to auto-calculate.
      </p>
    </Panel>
  );
}

const nextProf = (p: ProfLevel): ProfLevel => (p === 0 ? 1 : p === 1 ? 2 : 0);

export function SkillsPanel() {
  const { char: c, update } = useChar();
  const t = useTable();
  return (
    <Panel
      title="Skills"
      tab="stats"
      actions={
        <label className="check" htmlFor="joat">
          <input id="joat" type="checkbox" checked={c.jackOfAllTrades} onChange={(e) => update((d) => void (d.jackOfAllTrades = e.target.checked))} />
          Jack of All Trades
        </label>
      }
    >
      <div className="skills">
        {SKILLS.map((s) => {
          const b = skillCheck(c, s.id);
          const lvl = skillProfLevel(c, s.id);
          return (
            <div className="skill" key={s.id}>
              <button
                type="button"
                className="prof-dot"
                data-level={lvl}
                aria-label={`${s.name}: ${lvl === 2 ? 'expertise' : lvl === 1 ? 'proficient' : 'not proficient'}. Tap to change.`}
                title="Tap to cycle: none → proficient → expertise"
                onClick={() => update((d) => void (d.skills[s.id] = nextProf(d.skills[s.id])))}
              />
              <span className="name">{s.name}</span>
              <span className="ab">{s.ability.toUpperCase()}</span>
              <button type="button" className="roll" title={mathText(b)} onClick={(e) => t.test(s.name, b, e.currentTarget, `${ABILITY_NAMES[s.ability]} check`)}>
                {signed(b.total)}
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
