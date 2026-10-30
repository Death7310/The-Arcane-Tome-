import { useState } from 'react';
import { isValid } from '../engine/dice';
import { centerOf, performCondition, performEffect, performEnd } from '../fx';
import { useChar } from '../state/character';
import { CONDITIONS, EFFECT_PRESETS, type ConditionId } from '../systems/dnd5e/data';
import { blankEffect, type Effect } from '../systems/dnd5e/model';
import { Check, ConfirmButton, NumField, Panel, TextField } from './ui';

const appliesText = (e: Effect) =>
  [e.attacks && 'attacks', e.saves && 'saves', e.checks && 'checks'].filter(Boolean).join(', ');

export function effectSummary(e: Effect): string {
  const bits: string[] = [];
  if (e.bonus.trim() && appliesText(e)) bits.push(`${/^[+-]/.test(e.bonus.trim()) ? e.bonus.trim() : `+${e.bonus.trim()}`} to ${appliesText(e)}`);
  if (e.ac) bits.push(`${e.ac > 0 ? '+' : ''}${e.ac} AC`);
  bits.push(e.rounds === null ? 'until removed' : `${e.rounds} round${e.rounds === 1 ? '' : 's'} left`);
  return bits.join(' · ');
}

export function ConditionsPanel() {
  const { char: c, update } = useChar();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Effect>(() => blankEffect({ name: '' }));
  const active = CONDITIONS.filter((k) => c.conditions.includes(k.id));
  // Each condition plays its own effect as it takes hold, and a lifting light as it ends.
  const toggle = (id: ConditionId, el: HTMLElement) => {
    const ending = c.conditions.includes(id);
    performCondition(id, centerOf(el), CONDITIONS.find((k) => k.id === id)!.name, ending);
    update((d) => void (d.conditions = ending ? d.conditions.filter((x) => x !== id) : [...d.conditions, id]));
  };
  const setExhaustion = (n: number) => {
    const at = centerOf(document.getElementById('exhaustion'));
    if (n > c.exhaustion) performCondition('exhaustion', at, `Exhaustion ${n}`);
    else if (n === 0 && c.exhaustion > 0) performCondition('exhaustion', at, 'Exhaustion', true);
    update((d) => void (d.exhaustion = n));
  };
  const badDice = draft.bonus.trim() !== '' && !isValid(draft.bonus.trim().replace(/^\+/, ''));

  return (
    <Panel title="Conditions & effects" tab="combat">
      <div className="conditions" role="group" aria-label="Conditions">
        {CONDITIONS.map((k) => (
          <button key={k.id} type="button" className="cond" aria-pressed={c.conditions.includes(k.id)} title={k.summary} onClick={(e) => toggle(k.id, e.currentTarget)}>
            {k.name}
          </button>
        ))}
      </div>
      {active.length > 0 && (
        <ul className="cond-notes">
          {active.map((k) => (
            <li key={k.id}>
              <b>{k.name}.</b> {k.summary}
            </li>
          ))}
        </ul>
      )}
      <p className="hint" style={{ margin: '6px 0 0' }}>
        Your rolls apply these automatically: Disadvantage from Poisoned, Prone, Blinded, Restrained or Frightened, Advantage from Invisible, failed Strength and Dexterity saves while Paralyzed,
        Stunned, Petrified or Unconscious, and Speed 0 where it applies.
      </p>

      <h3>Exhaustion</h3>
      <div className="row">
        <NumField value={c.exhaustion} min={0} max={6} ariaLabel="Exhaustion level, 0 to 6" id="exhaustion" className="ac" onChange={setExhaustion} />
        <span className="hint" style={{ color: c.exhaustion >= 6 ? 'var(--bad)' : c.exhaustion ? 'var(--warn)' : undefined }}>
          {c.exhaustion === 0
            ? 'None. Each level gives −2 to every d20 Test and −5 ft Speed; a Long Rest removes one.'
            : c.exhaustion >= 6
              ? 'Level 6: you die.'
              : `Level ${c.exhaustion}: −${c.exhaustion * 2} to every d20 Test and −${c.exhaustion * 5} ft Speed, already applied.`}
        </span>
      </div>

      <h3>Temporary effects</h3>
      <div className="list">
        {c.effects.length === 0 && <p className="hint" style={{ margin: 0 }}>Spells and abilities affecting you right now, like Bless or Shield of Faith. Rounds count down when you tap New turn.</p>}
        {c.effects.map((e) => (
          <div className="item effect" key={e.id} data-effect={e.id}>
            <div className="item-head">
              <span className="item-title">
                <b>{e.name}</b>
                <small>
                  {effectSummary(e)}
                  {e.note ? ` · ${e.note}` : ''}
                </small>
              </span>
              <span className="row" style={{ flexWrap: 'nowrap' }}>
                {e.rounds !== null && (
                  <button type="button" className="btn small ghost icon" aria-label={`One more round of ${e.name}`} onClick={() => update((d) => void (d.effects.find((x) => x.id === e.id)!.rounds = (e.rounds ?? 0) + 1))}>
                    +1
                  </button>
                )}
                <ConfirmButton
                  label="End"
                  confirmLabel="End it?"
                  onConfirm={() => {
                    performEnd(e.name, centerOf(document.querySelector(`[data-effect="${e.id}"]`)));
                    update((d) => void (d.effects = d.effects.filter((x) => x.id !== e.id)));
                  }}
                />
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {EFFECT_PRESETS.map((p) => (
          <button key={p.name} type="button" className="btn small" onClick={(ev) => (performEffect(p.name, centerOf(ev.currentTarget)), update((d) => void d.effects.push(blankEffect({ ...p }))))} title={p.note}>
            + {p.name}
          </button>
        ))}
        <button type="button" className="btn small ghost" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          Custom…
        </button>
      </div>
      {adding && (
        <form
          className="item"
          style={{ padding: 10, marginTop: 8, display: 'grid', gap: 8 }}
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!draft.name.trim() || badDice) return;
            update((d) => void d.effects.push(blankEffect({ ...draft, name: draft.name.trim() })));
            performEffect(draft.name.trim(), centerOf(ev.currentTarget));
            setDraft(blankEffect({ name: '' }));
            setAdding(false);
          }}
        >
          <div className="grid-2">
            <TextField label="Name" id="effect-name" value={draft.name} placeholder="Rage, Haste, Hex…" onChange={(v) => setDraft({ ...draft, name: v })} />
            <NumField label="Rounds (0 = until removed)" id="effect-rounds" value={draft.rounds ?? 0} min={0} max={1000} onChange={(n) => setDraft({ ...draft, rounds: n > 0 ? n : null })} />
            <TextField label="Bonus to rolls" id="effect-bonus" value={draft.bonus} placeholder="1d4, -1d4, 2" onChange={(v) => setDraft({ ...draft, bonus: v })} />
            <NumField label="AC bonus" id="effect-ac" value={draft.ac} min={-10} max={10} onChange={(n) => setDraft({ ...draft, ac: n })} />
          </div>
          <div className="row">
            <span className="hint">Bonus applies to</span>
            <Check label="Attacks" id="effect-attacks" checked={draft.attacks} onChange={(b) => setDraft({ ...draft, attacks: b })} />
            <Check label="Saves" id="effect-saves" checked={draft.saves} onChange={(b) => setDraft({ ...draft, saves: b })} />
            <Check label="Checks" id="effect-checks" checked={draft.checks} onChange={(b) => setDraft({ ...draft, checks: b })} />
          </div>
          {badDice && <p className="hint" style={{ color: 'var(--bad)', margin: 0 }}>Write the bonus like 1d4, -1d4 or 2.</p>}
          <TextField label="Note" id="effect-note" value={draft.note} placeholder="Concentration, ends if…" onChange={(v) => setDraft({ ...draft, note: v })} />
          <div className="row">
            <button type="submit" className="btn small primary" disabled={!draft.name.trim() || badDice}>
              Add effect
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}

/** One line of chips under the header so active conditions are never forgotten. */
export function StatusStrip({ onOpen }: { onOpen: () => void }) {
  const { char: c } = useChar();
  const items = [
    ...CONDITIONS.filter((k) => c.conditions.includes(k.id)).map((k) => ({ key: k.id, text: k.name, kind: 'cond' })),
    ...(c.exhaustion ? [{ key: 'exh', text: `Exhaustion ${c.exhaustion}`, kind: 'cond' }] : []),
    ...c.effects.map((e) => ({ key: e.id, text: e.rounds === null ? e.name : `${e.name} (${e.rounds})`, kind: 'effect' })),
  ];
  if (!items.length) return null;
  return (
    <button type="button" className="status-strip" onClick={onOpen} aria-label="Active conditions and effects. Open the Combat page.">
      {items.map((i) => (
        <span key={i.key} className={`status ${i.kind}`}>
          {i.text}
        </span>
      ))}
    </button>
  );
}
