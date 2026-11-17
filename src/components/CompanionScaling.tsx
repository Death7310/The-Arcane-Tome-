// "Make its numbers follow you": for a companion whose stat block prints fixed numbers (D&D
// Beyond prints a drake's worked out for your level), pick what each number follows, keeping
// today's value, or take a known companion's rules whole.

import { useState, type ReactNode } from 'react';
import { useChar } from '../state/character';
import { ABILITIES, ABILITY_NAMES, CLASSES, type Ability } from '../systems/dnd5e/data';
import { compEval, compMaxHp, originOf, ownerLevel } from '../systems/dnd5e/companion';
import { describeFormula } from '../systems/dnd5e/formula';
import type { Character, Companion, CompanionAction } from '../systems/dnd5e/model';
import { signed } from '../systems/dnd5e/rules';
import { addPart, applyRuleSet, damageFormula, fitConstant, hpPart, RULE_SETS, ruleSetFor, ruleSetLine, splitDamage, withConstant, type AddRule, type HpRule } from '../systems/dnd5e/scaling';

type Set = (fn: (k: Companion) => void) => void;

const className = (id: string) => CLASSES.find((k) => k.id === id)?.name ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');

/** One number: its rule, a fitted constant you can change, what it comes to, and Use this. */
function Row({ label, now, formula, value, onUse, children }: { label: string; now: string; formula: string; value: string; onUse: () => void; children: ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <div className="scale-row">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{label}</b>
        <span className="hint">now {now}</span>
      </div>
      <div className="row">{children}</div>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 8 }}>
        <span className="hint">
          → {describeFormula(formula)} = <b>{value}</b> for you now
        </span>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            onUse();
            setDone(true);
          }}
        >
          {done ? 'Used ✓' : 'Use this'}
        </button>
      </div>
    </div>
  );
}

function AddPicker({ rule, onChange, slot, id }: { rule: AddRule; onChange: (r: AddRule) => void; slot: boolean; id: string }) {
  return (
    <>
      <select className="input" style={{ width: 'auto' }} id={id} aria-label="What it follows" value={rule.kind} onChange={(e) => onChange(e.target.value === 'mod' ? { kind: 'mod', ability: 'wis' } : { kind: e.target.value as 'pb' | 'slot' })}>
        <option value="pb">+ your Proficiency Bonus</option>
        {slot && <option value="slot">+ the spell’s level</option>}
        <option value="mod">+ one of your modifiers</option>
      </select>
      {rule.kind === 'mod' && (
        <select className="input" style={{ width: 'auto' }} aria-label="Which modifier" value={rule.ability} onChange={(e) => onChange({ kind: 'mod', ability: e.target.value as Ability })}>
          {ABILITIES.map((a) => (
            <option key={a} value={a}>
              {ABILITY_NAMES[a]}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="row" style={{ gap: 4 }}>
      <span className="hint">{label}</span>
      <input className="input" type="number" style={{ width: 70 }} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

function AcRow({ comp, owner, set }: { comp: Companion; owner: Character; set: Set }) {
  const spell = originOf(comp).kind === 'spell';
  const now = compEval(comp, comp.ac, owner) ?? 10;
  const [rule, setRule] = useState<AddRule>({ kind: spell ? 'slot' : 'pb' });
  const [base, setBase] = useState<number | null>(null);
  const rest = addPart(rule);
  const a = base ?? fitConstant(now, rest, comp, owner);
  const formula = withConstant(a, rest);
  return (
    <Row label="Armor Class" now={String(now)} formula={formula} value={String(compEval(comp, formula, owner) ?? '?')} onUse={() => set((k) => void (k.ac = formula))}>
      <Num label="base" value={a} onChange={setBase} />
      <AddPicker id={`sc-ac-${comp.id}`} rule={rule} slot={spell} onChange={(r) => (setRule(r), setBase(null))} />
    </Row>
  );
}

function HpRow({ comp, owner, set }: { comp: Companion; owner: Character; set: Set }) {
  const o = originOf(comp);
  const now = compMaxHp(comp, owner);
  const mine = owner.classes.filter((k, i, all) => all.findIndex((x) => x.classId === k.classId) === i).map((k) => k.classId);
  const classes = [...new Set([...(o.classId ? [o.classId] : []), ...mine])];
  const [rule, setRule] = useState<HpRule>(o.kind === 'spell' ? { kind: 'above', per: 5, base: o.base } : { kind: 'class', per: 5, classId: classes[0] ?? '', ability: '' });
  const [base, setBase] = useState<number | null>(null);
  const rest = hpPart(rule);
  const a = base ?? fitConstant(now, rest, comp, owner);
  const formula = withConstant(a, rest);
  const change = (r: HpRule) => (setRule(r), setBase(null));
  return (
    <Row
      label="Hit Points"
      now={String(now)}
      formula={formula}
      value={String(compEval(comp, formula, owner) ?? '?')}
      onUse={() =>
        set((k) => {
          const full = k.hp >= compMaxHp(k, owner);
          k.maxHp = formula;
          const max = compMaxHp(k, owner);
          k.hp = full ? max : Math.min(k.hp, max);
        })
      }
    >
      <Num label="base" value={a} onChange={setBase} />
      <Num label="+" value={rule.per} onChange={(n) => change({ ...rule, per: n })} />
      <span className="hint">×</span>
      <select
        className="input"
        style={{ width: 'auto' }}
        aria-label="What it counts"
        value={rule.kind === 'class' ? `class:${rule.classId}` : rule.kind}
        onChange={(e) => {
          const v = e.target.value;
          change(v.startsWith('class:') ? { kind: 'class', per: rule.per, classId: v.slice(6), ability: rule.kind === 'class' ? rule.ability : '' } : v === 'above' ? { kind: 'above', per: rule.per, base: o.base } : { kind: 'per', per: rule.per });
        }}
      >
        {classes.map((id) => (
          <option key={id} value={`class:${id}`}>
            your {className(id)} level ({ownerLevel(owner, id)})
          </option>
        ))}
        <option value="class:">your character level ({ownerLevel(owner)})</option>
        <option value="above">each spell level above the spell’s own ({o.base})</option>
        <option value="per">the spell’s level</option>
      </select>
      {rule.kind === 'class' && (
        <select className="input" style={{ width: 'auto' }} aria-label="Plus a modifier" value={rule.ability} onChange={(e) => change({ ...rule, ability: e.target.value as Ability | '' })}>
          <option value="">(no modifier)</option>
          {ABILITIES.map((ab) => (
            <option key={ab} value={ab}>
              + your {ABILITY_NAMES[ab]} modifier
            </option>
          ))}
        </select>
      )}
    </Row>
  );
}

function AttackRows({ comp, a, j, owner, set }: { comp: Companion; a: CompanionAction; j: number; owner: Character; set: Set }) {
  const spell = originOf(comp).kind === 'spell';
  const hitNow = compEval(comp, a.toHit, owner) ?? 0;
  const [hitRule, setHitRule] = useState<'spellatk' | 'pb'>('spellatk');
  const [hitBase, setHitBase] = useState<number | null>(null);
  const hitA = hitBase ?? fitConstant(hitNow, '{PB}', comp, owner);
  const hitFormula = hitRule === 'spellatk' ? '{SPELLATK}' : withConstant(hitA, '{PB}');
  const split = splitDamage(a, comp, owner);
  const [dmgRule, setDmgRule] = useState<AddRule>({ kind: spell ? 'slot' : 'pb' });
  const [dmgBase, setDmgBase] = useState<number | null>(null);
  const dmgA = dmgBase ?? fitConstant(split.flat, addPart(dmgRule), comp, owner);
  const dmgFormula = damageFormula(split.dice, dmgA, dmgRule);
  const dmgNow = (f: string) => {
    const probe = { ...a, damage: f, levelDice: [] };
    return splitDamage(probe, comp, owner);
  };
  const after = dmgNow(dmgFormula);
  return (
    <>
      {a.attack && (
        <Row label={`${a.name}: to hit`} now={signed(hitNow)} formula={hitFormula} value={signed(compEval(comp, hitFormula, owner) ?? 0)} onUse={() => set((k) => void (k.actions[j].toHit = hitFormula))}>
          <select className="input" style={{ width: 'auto' }} aria-label={`${a.name}: to hit follows`} value={hitRule} onChange={(e) => (setHitRule(e.target.value as 'spellatk' | 'pb'), setHitBase(null))}>
            <option value="spellatk">your spell attack modifier</option>
            <option value="pb">a base + your Proficiency Bonus</option>
          </select>
          {hitRule === 'pb' && <Num label="base" value={hitA} onChange={setHitBase} />}
        </Row>
      )}
      {split.dice && (
        <Row label={`${a.name}: damage`} now={[split.dice, split.flat ? signed(split.flat) : ''].join(' ').trim()} formula={dmgFormula} value={[after.dice, after.flat ? signed(after.flat) : ''].join(' ').trim()} onUse={() => set((k) => void (k.actions[j].damage = dmgFormula))}>
          <span className="hint">{split.dice} +</span>
          <Num label="base" value={dmgA} onChange={setDmgBase} />
          <AddPicker id={`sc-dmg-${a.id}`} rule={dmgRule} slot={spell} onChange={(r) => (setDmgRule(r), setDmgBase(null))} />
        </Row>
      )}
    </>
  );
}

/**
 * Its numbers as rules that follow you: one at a time (AC, HP, each attack), each keeping
 * today's value, or a known companion's rules whole.
 */
export function ScaleHelper({ comp, idx }: { comp: Companion; idx: number }) {
  const { char: c, update } = useChar();
  const set: Set = (fn) => update((d) => fn(d.companions[idx]));
  const known = ruleSetFor(comp.name) ?? ruleSetFor(comp.kind);
  const [pick, setPick] = useState(known?.id ?? '');
  const [said, setSaid] = useState('');
  const chosen = RULE_SETS.find((r) => r.id === pick);
  return (
    <div className="scale-help">
      <p className="hint" style={{ margin: 0 }}>
        For a stat block printed with fixed numbers (D&amp;D Beyond prints a class companion’s worked out for your level): choose what each number follows. The base is set so today’s number stays the same; change it if your stat block was printed for another level.
      </p>
      <div className="note" style={{ display: 'grid', gap: 6 }}>
        <span>
          <b>A known companion’s rules</b>
        </span>
        <div className="row">
          <select className="input" style={{ width: 'auto' }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Known companion">
            <option value="">Choose…</option>
            {RULE_SETS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn small"
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return;
              update((d) => applyRuleSet(d.companions[idx], chosen, d));
              setSaid(`${chosen.name}’s rules taken.`);
            }}
          >
            Use these rules
          </button>
        </div>
        {chosen && (
          <span className="hint">
            {describeFormula(ruleSetLine(chosen))}. From {chosen.source}; check them against your book.
          </span>
        )}
        {said && (
          <span className="hint" role="status">
            {said}
          </span>
        )}
      </div>
      <AcRow comp={comp} owner={c} set={set} />
      <HpRow comp={comp} owner={c} set={set} />
      {comp.actions.map((a, j) => (a.attack || a.damage ? <AttackRows key={a.id} comp={comp} a={a} j={j} owner={c} set={set} /> : null))}
    </div>
  );
}
