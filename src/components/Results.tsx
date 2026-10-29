import { useEffect, useState } from 'react';
import { useTable, type Advantage, type RollEntry } from '../state/table';

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

export function ResultCard() {
  const t = useTable();
  const e = t.latest;
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!e || hover) return;
    const ms = Math.min(14000, 6000 + e.lines.length * 900);
    const id = setTimeout(t.dismissLatest, ms);
    return () => clearTimeout(id);
  }, [e, hover, t.dismissLatest]);
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
