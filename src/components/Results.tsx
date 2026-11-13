import { useEffect, useState } from 'react';
import { multiplyDice } from '../engine/dice';
import { useChar } from '../state/character';
import { useTable, type Advantage, type RollEntry } from '../state/table';
import { availableBoosts } from '../systems/dnd5e/companion';
import { ElementPicker } from './CompanionsPanel';

export function EntryView({ e, onApplyHealing }: { e: RollEntry; onApplyHealing?: (n: number, el: HTMLElement) => void }) {
  return (
    <div className={`entry ${e.element ? `el-${e.element}` : ''}`}>
      <div className="entry-title">
        <b>{e.title}</b>
        <small>{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
      </div>
      {e.subtitle && <div className="sub">{e.subtitle}</div>}
      {e.lines.map((l, i) => (
        <div className="line" key={i} data-kind={l.kind} data-outcome={l.outcome}>
          <span className="lab">
            {l.label}{' '}
            {l.nat === 20 && <span className="tag nat20">Natural 20</span>}
            {l.nat === 1 && <span className="tag nat1">Natural 1</span>}
            {l.kind === 'd20' && l.outcome === 'crit' && !l.nat && <span className="tag crit">Critical</span>}
            {l.kind === 'd20' && l.outcome === 'hit' && <span className="tag hit">Hit</span>}
            {l.kind === 'd20' && l.outcome === 'miss' && l.nat !== 1 && <span className="tag miss">Miss</span>}
          </span>
          <span className="tot" data-text={l.text ? '' : undefined}>{l.text ?? l.total}</span>
          <span className="det">{l.detail}</span>
        </div>
      ))}
      {e.healing !== undefined && e.healing > 0 && onApplyHealing && (
        <div className="row">
          <button type="button" className="btn small" onClick={(ev) => onApplyHealing(e.healing!, ev.currentTarget)}>
            Heal myself {e.healing}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * On a weapon hit: your companions' reactions that add damage to it (a drake's Infused
 * Strikes), as buttons. Each rolls its dice (doubled on a critical hit) into this result.
 */
export function BoostButtons({ e }: { e: RollEntry }) {
  const t = useTable();
  const { char: c } = useChar();
  if (!e.boost) return null;
  const boosts = availableBoosts(c, e.boost.attacker).filter((b) => !e.boost!.used.includes(`${b.comp.id}:${b.action.id}`));
  if (!boosts.length) return null;
  return (
    <div className="row boosts">
      {boosts.map((b) => {
        const dice = e.boost!.crit ? multiplyDice(b.dice, 2) : b.dice;
        return (
          <span key={`${b.comp.id}:${b.action.id}`} className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className={`btn small boost el-${b.type || 'arcane'}`}
              disabled={!!b.blocked}
              title={b.blocked ? `${b.comp.name} can’t: ${b.blocked}` : `${b.comp.name} uses its reaction: ${b.action.text}`}
              onClick={(ev) => t.boostHit(e.id, b.comp, b.action, ev.currentTarget)}
            >
              {b.comp.name}: {b.action.name} +{dice}
              {b.type ? ` ${b.type}` : ''}
              {b.blocked ? ` (${b.blocked})` : ''}
            </button>
            {/* No element chosen yet: pick it right here before rolling. */}
            {!b.type && <ElementPicker companionId={b.comp.id} compact />}
          </span>
        );
      })}
    </div>
  );
}

/** Damage taken while concentrating: the save to keep the spell, one tap away. */
function ConcentrationButton({ e }: { e: RollEntry }) {
  const t = useTable();
  if (!e.concentration || e.concentration.done) return null;
  return (
    <div className="row boosts">
      <button type="button" className="btn small primary" onClick={(ev) => t.concentrationSave(e.id, ev.currentTarget)}>
        Roll concentration save (DC {e.concentration.dc})
      </button>
    </div>
  );
}

/** A saving throw in a battle: did it make the DC? Kept for the battle's stats (save rates, CON saves). */
function SaveCheckButtons({ e }: { e: RollEntry }) {
  const t = useTable();
  if (!e.saveCheck || e.saveCheck.done) return null;
  return (
    <div className="row boosts">
      <span className="hint">For the battle:</span>
      <button type="button" className="btn small" onClick={() => t.settleSaveCheck(e.id, true)}>
        Made it
      </button>
      <button type="button" className="btn small" onClick={() => t.settleSaveCheck(e.id, false)}>
        Failed
      </button>
    </div>
  );
}

/**
 * A roll at enemies, still to settle: the DM's Hit or Miss for an unknown AC, each enemy's
 * Failed or Saved for a save spell, and moving it to another enemy if it went to the wrong one.
 */
function TargetActions({ e }: { e: RollEntry }) {
  const t = useTable();
  const { char: c } = useChar();
  if (!e.targets?.length) return null;
  const sum = (pieces: { amount: number }[]) => pieces.reduce((a, p) => a + p.amount, 0);
  return (
    <>
      {e.targets.map((r, i) =>
        r.enemies.map((en) => (
          <div className="row boosts target-actions" key={`${i}-${en.id}`}>
            {en.state === 'pending' && r.kind === 'attack' && (
              <>
                <span className="hint">
                  {e.targets!.length > 1 ? `#${i + 1} ` : ''}Did {r.total} hit {en.name}?
                </span>
                <button type="button" className="btn small primary" onClick={() => t.settleHit(e.id, i, en.id, true)}>
                  Hit
                </button>
                <button type="button" className="btn small" onClick={() => t.settleHit(e.id, i, en.id, false)}>
                  Miss
                </button>
              </>
            )}
            {en.state === 'pending' && r.kind === 'save' && (
              <>
                <span className="hint">{en.name}’s save:</span>
                <button type="button" className="btn small primary" onClick={() => t.settleSave(e.id, i, en.id, false)}>
                  Failed ({sum(r.pieces)})
                </button>
                <button type="button" className="btn small" onClick={() => t.settleSave(e.id, i, en.id, true)}>
                  Saved ({r.half ? Math.floor(sum(r.pieces) / 2) : 0})
                </button>
              </>
            )}
            {r.kind === 'attack' && c.enemies.length > 1 && (
              <label className="move-roll">
                <span className="hint">{en.state === 'pending' ? 'At' : 'Meant for someone else?'}</span>
                <select value={en.id} onChange={(ev) => t.moveRoll(e.id, i, en.id, ev.target.value)} aria-label="Move this roll to another enemy">
                  {c.enemies.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )),
      )}
    </>
  );
}

/** What can still be done from a result: a companion's reaction, a concentration save, a hit's target. */
export function EntryActions({ e }: { e: RollEntry }) {
  return (
    <>
      <TargetActions e={e} />
      <BoostButtons e={e} />
      <ConcentrationButton e={e} />
      <SaveCheckButtons e={e} />
    </>
  );
}

export function ResultCard() {
  const t = useTable();
  const { char: c } = useChar();
  const e = t.latest;
  const [hover, setHover] = useState(false);
  // A hit a companion can still add to stays up longer, so there's time to decide.
  const offering =
    (!!e?.boost && availableBoosts(c, e.boost.attacker).some((b) => !b.blocked && !e.boost!.used.includes(`${b.comp.id}:${b.action.id}`))) ||
    (!!e?.concentration && !e.concentration.done) ||
    (!!e?.saveCheck && !e.saveCheck.done) ||
    !!e?.targets?.some((r) => r.enemies.some((x) => x.state === 'pending'));
  // A roll waiting on the DM (Hit or Miss, an enemy's save) stays up until it's answered or closed.
  const waiting = !!e?.targets?.some((r) => r.enemies.some((x) => x.state === 'pending'));
  useEffect(() => {
    if (!e || hover || waiting) return;
    const ms = Math.min(14000, 6000 + e.lines.length * 900) + (offering ? 8000 : 0);
    const id = setTimeout(t.dismissLatest, ms);
    return () => clearTimeout(id);
  }, [e, hover, offering, waiting, t.dismissLatest]);
  if (!e) return null;
  return (
    <div
      className={`result rolling ${e.element ? `el-${e.element}` : ''}`}
      key={e.id}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <button type="button" className="btn ghost small" style={{ float: 'right', marginLeft: 8 }} onClick={t.dismissLatest} aria-label="Dismiss result">
        ✕
      </button>
      <EntryView
        e={e}
        onApplyHealing={(n, el) => {
          t.healSelf(n, el);
          t.dismissLatest();
        }}
      />
      <EntryActions e={e} />
    </div>
  );
}

const ADV_NEXT: Record<Advantage, Advantage> = { normal: 'adv', adv: 'dis', dis: 'normal' };
const ADV_LABEL: Record<Advantage, string> = { normal: 'd20: Normal', adv: 'd20: Advantage', dis: 'd20: Disadvantage' };

/** Floating switch for the next d20 roll. Tap to cycle Normal → Advantage → Disadvantage; it resets after one roll. */
export function AdvChip() {
  const t = useTable();
  return (
    <button
      type="button"
      className="adv-chip"
      data-adv={t.adv}
      onClick={() => t.setAdv(ADV_NEXT[t.adv])}
      aria-label={`${ADV_LABEL[t.adv]}. Tap to change. Applies to your next d20 roll.`}
      title="Applies to your next d20 roll, then resets"
    >
      {ADV_LABEL[t.adv]}
    </button>
  );
}

export function AdvSegment() {
  const t = useTable();
  return (
    <div className="seg" role="group" aria-label="Advantage for the next d20 roll">
      {(
        [
          ['dis', 'Disadvantage'],
          ['normal', 'Normal'],
          ['adv', 'Advantage'],
        ] as const
      ).map(([k, label]) => (
        <button key={k} type="button" aria-pressed={t.adv === k} onClick={() => t.setAdv(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
