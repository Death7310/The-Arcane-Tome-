import { useEffect, useRef, useState } from 'react';
import { isValid } from '../engine/dice';
import { useTable, type RollEntry } from '../state/table';

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
          <span className="tot">{l.total}</span>
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

const DICE = [4, 6, 8, 10, 12, 20, 100];

export function DiceTray() {
  const t = useTable();
  const [expr, setExpr] = useState('2d6+3');
  const [logOpen, setLogOpen] = useState(false);
  const [acText, setAcText] = useState('');
  const exprRef = useRef<HTMLInputElement>(null);
  const valid = isValid(expr);
  return (
    <>
      <div className="tray" role="toolbar" aria-label="Dice tray">
        <div className="seg" role="group" aria-label="Advantage for the next d20 roll">
          {(
            [
              ['dis', 'Dis'],
              ['normal', 'Normal'],
              ['adv', 'Adv'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={t.adv === k} title={k === 'normal' ? 'Roll one d20' : `${k === 'adv' ? 'Advantage' : 'Disadvantage'} on your next d20 roll`} onClick={() => t.setAdv(k)}>
              {label}
            </button>
          ))}
        </div>
        <label className="row" style={{ gap: 6, flexWrap: 'nowrap' }} htmlFor="target-ac" title="Optional. With a target AC, attacks show hit or miss and only roll damage on a hit.">
          <span className="hint">Target AC</span>
          <input
            id="target-ac"
            className="input ac"
            inputMode="numeric"
            placeholder="—"
            value={acText}
            onChange={(e) => {
              setAcText(e.target.value);
              const n = parseInt(e.target.value, 10);
              t.setTargetAc(Number.isFinite(n) && n > 0 ? n : null);
            }}
          />
        </label>
        <span className="spacer" />
        <div className="dice">
          {DICE.map((d) => (
            <button key={d} type="button" className="die" onClick={(e) => t.freeRoll(`1d${d}`, `d${d}`, e.currentTarget)}>
              d{d}
            </button>
          ))}
        </div>
        <form
          className="row"
          style={{ flexWrap: 'nowrap', flex: '1 1 200px', maxWidth: 260 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) t.freeRoll(expr, undefined, exprRef.current);
          }}
        >
          <input
            ref={exprRef}
            id="dice-expr"
            className="input expr"
            value={expr}
            aria-label="Dice to roll, like 2d6+3, 4d6kh3 or 6d10>=8"
            aria-invalid={!valid}
            style={valid ? undefined : { borderColor: 'var(--bad)' }}
            onChange={(e) => setExpr(e.target.value)}
          />
          <button type="submit" className="btn primary" disabled={!valid}>
            Roll
          </button>
        </form>
        <button type="button" className="btn ghost" aria-expanded={logOpen} onClick={() => setLogOpen((o) => !o)}>
          Log{t.log.length ? ` (${t.log.length})` : ''}
        </button>
      </div>
      {logOpen && (
        <div className="log" role="log" aria-label="Roll log">
          <header>
            <h2>Roll log</h2>
            <div className="row">
              <button type="button" className="btn small ghost" onClick={t.clearLog}>
                Clear
              </button>
              <button type="button" className="btn small" onClick={() => setLogOpen(false)}>
                Close
              </button>
            </div>
          </header>
          {t.log.length === 0 && <p className="hint">Nothing rolled yet. Tap any number on the sheet.</p>}
          {t.log.map((e) => (
            <EntryView key={e.id} e={e} />
          ))}
        </div>
      )}
    </>
  );
}
