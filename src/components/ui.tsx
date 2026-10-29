import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Breakdown } from '../systems/dnd5e/rules';
import { signed } from '../systems/dnd5e/rules';

export function Panel(props: { title: string; tab: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="panel" data-tab={props.tab} id={props.id} aria-label={props.title}>
      <header>
        <h2>{props.title}</h2>
        {props.actions}
      </header>
      {props.children}
    </section>
  );
}

/** Number input that keeps its own text while typing, so "-" or "" don't snap back mid-edit. */
export function NumField(props: {
  label?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const auto = useId();
  const id = props.id ?? auto;
  const [text, setText] = useState(String(props.value));
  useEffect(() => {
    if (Number(text) !== props.value) setText(String(props.value));
  }, [props.value]);
  const input = (
    <input
      id={id}
      className={props.label ? undefined : `input ${props.className ?? ''}`}
      type="number"
      inputMode="numeric"
      value={text}
      min={props.min}
      max={props.max}
      step={props.step}
      aria-label={props.ariaLabel ?? props.label}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) {
          const clamped = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, n));
          props.onChange(clamped);
        }
      }}
      onBlur={() => setText(String(props.value))}
    />
  );
  if (!props.label) return input;
  return (
    <label className={`field ${props.className ?? ''}`} htmlFor={id}>
      <span>{props.label}</span>
      {input}
    </label>
  );
}

export function TextField(props: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; multiline?: boolean; id?: string }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <label className="field" htmlFor={id}>
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea id={id} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input id={id} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
      )}
    </label>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { id: T; name: string }[];
  onChange: (v: T) => void;
  id?: string;
}) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <label className="field" htmlFor={id}>
      <span>{props.label}</span>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Check(props: { label: string; checked: boolean; onChange: (b: boolean) => void; id?: string }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <label className="check" htmlFor={id}>
      <input id={id} type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

/** Usage pips: filled = available, hollow = spent. Clicking toggles the pip. */
export function Pips(props: { total: number; spent: number; onChange: (spent: number) => void; label: string }) {
  return (
    <span className="pips" role="group" aria-label={props.label}>
      {Array.from({ length: props.total }, (_, i) => {
        const used = i >= props.total - props.spent;
        return (
          <button
            key={i}
            type="button"
            className="pip"
            aria-pressed={used}
            aria-label={`${props.label} ${i + 1}: ${used ? 'spent' : 'available'}`}
            onClick={() => props.onChange(used ? props.spent - 1 : props.spent + 1)}
          />
        );
      })}
    </span>
  );
}

export const mathText = (b: Breakdown, asBonus = true): string =>
  b.parts.length ? b.parts.map((p, i) => `${i === 0 && !asBonus ? p.value : signed(p.value)} ${p.label.toLowerCase()}`).join(' ') : 'No modifiers';

/** A derived number with its explanation. Rollable when onRoll is given. */
export function Stat(props: { label: string; b: Breakdown; bonus?: boolean; showMath: boolean; onRoll?: (el: HTMLElement) => void; suffix?: string }) {
  const value = props.bonus ? signed(props.b.total) : `${props.b.total}${props.suffix ?? ''}`;
  const math = mathText(props.b, props.bonus);
  const content = (
    <>
      <span className="v">{value}</span>
      <span className="k">{props.label}</span>
      {props.showMath && <span className="math">{math}</span>}
    </>
  );
  if (props.onRoll) {
    return (
      <button type="button" className="stat" title={`Roll ${props.label}: ${math}`} onClick={(e) => props.onRoll!(e.currentTarget)}>
        {content}
      </button>
    );
  }
  return (
    <div className="stat" title={math}>
      {content}
    </div>
  );
}

export function Dialog(props: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2>{props.title}</h2>
          <button type="button" className="btn ghost small" onClick={props.onClose}>
            Close
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

/** Two-step delete: no browser confirm() (blocked in embedded viewers). */
export function ConfirmButton(props: { label: string; confirmLabel?: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`btn small ${armed ? 'danger' : 'ghost'} ${props.className ?? ''}`}
      onClick={() => (armed ? (setArmed(false), props.onConfirm()) : setArmed(true))}
    >
      {armed ? (props.confirmLabel ?? 'Tap again to confirm') : props.label}
    </button>
  );
}
