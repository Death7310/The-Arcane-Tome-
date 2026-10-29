import { useEffect, useRef, useState } from 'react';
import { isValid } from '../engine/dice';
import { setDiceSurface } from '../fx';
import { ELEMENTS } from '../fx/types';
import { useChar } from '../state/character';
import { useTable } from '../state/table';
import { blankCustomDie, type CustomDie } from '../systems/dnd5e/model';
import { resolveTokens } from '../systems/dnd5e/rules';
import { AdvSegment, EntryView } from './Results';
import { ConfirmButton, NumField, Panel, SelectField, TextField } from './ui';

const STANDARD = [4, 6, 8, 10, 12, 20, 100] as const;

/** Small outline of each die, matching the shapes that roll on the table. */
export function DieIcon({ sides, size = 30 }: { sides: number; size?: number }) {
  const shape = (() => {
    switch (sides) {
      case 4:
        return <polygon points="0,-11 9.5,6 -9.5,6" />;
      case 6:
        return <rect x="-8.5" y="-8.5" width="17" height="17" rx="3" />;
      case 8:
        return (
          <>
            <polygon points="0,-11 10,0 0,11 -10,0" />
            <line x1="-10" y1="0" x2="10" y2="0" />
          </>
        );
      case 10:
      case 100:
        return (
          <>
            <polygon points="0,-11 10,-0.5 0,11 -10,-0.5" />
            <polyline points="-10,-0.5 0,4.5 10,-0.5" />
          </>
        );
      case 12:
        return <polygon points="0,-11 10.5,-3.4 6.5,8.9 -6.5,8.9 -10.5,-3.4" />;
      default:
        return (
          <>
            <polygon points="0,-11.5 10,-5.75 10,5.75 0,11.5 -10,5.75 -10,-5.75" />
            <polygon points="0,-6 5.4,3.6 -5.4,3.6" />
          </>
        );
    }
  })();
  return (
    <svg width={size} height={size} viewBox="-13 -13 26 26" aria-hidden="true" className="die-icon">
      {shape}
    </svg>
  );
}

function poolExpression(pool: Record<number, number>, mod: number): string {
  const dice = Object.entries(pool)
    .filter(([, n]) => n > 0)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([s, n]) => `${n}d${s}`);
  if (!dice.length) return '';
  return dice.join('+') + (mod ? (mod > 0 ? `+${mod}` : `${mod}`) : '');
}

export function DicePanel() {
  const t = useTable();
  const feltRef = useRef<HTMLDivElement>(null);
  const [pool, setPool] = useState<Record<number, number>>({ 20: 1 });
  const [mod, setMod] = useState(0);
  const [typed, setTyped] = useState('4d6kh3');
  const expr = poolExpression(pool, mod);
  const last = t.log[0];

  // While this page is showing, dice land on its felt instead of across the screen.
  useEffect(() => {
    setDiceSurface(feltRef.current);
    return () => setDiceSurface(null);
  }, []);

  const add = (s: number, by: number) => setPool((p) => ({ ...p, [s]: Math.max(0, Math.min(20, (p[s] ?? 0) + by)) }));

  return (
    <>
      <Panel title="Dice" tab="dice" actions={<AdvSegment />}>
        <div className="felt" ref={feltRef} aria-live="polite">
          {last ? (
            <div className="felt-last">
              <span className="felt-total num">{last.lines.find((l) => l.kind !== 'info')?.text ?? last.lines.find((l) => l.kind !== 'info')?.total ?? ''}</span>
              <span className="felt-label">{last.title}</span>
            </div>
          ) : (
            <p className="felt-hint">Pick dice below, then roll. Every roll on the sheet lands here while this page is open.</p>
          )}
        </div>

        <div className="dice-picker" role="group" aria-label="Add dice to your roll">
          {STANDARD.map((s) => (
            <button key={s} type="button" className="die-pick" onClick={() => add(s, 1)} aria-label={`Add a d${s}${pool[s] ? `, ${pool[s]} in the roll` : ''}`}>
              <DieIcon sides={s} />
              <span>d{s}</span>
              {pool[s] ? <b className="count">{pool[s]}</b> : null}
            </button>
          ))}
        </div>

        <div className="pool">
          <div className="pool-chips">
            {Object.entries(pool)
              .filter(([, n]) => n > 0)
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([s, n]) => (
                <span className="pool-chip" key={s}>
                  {n}d{s}
                  <button type="button" aria-label={`Remove a d${s}`} onClick={() => add(Number(s), -1)}>
                    −
                  </button>
                </span>
              ))}
            {!expr && <span className="hint">No dice yet. Tap a die above.</span>}
          </div>
          <div className="row">
            <span className="hint">Modifier</span>
            <button type="button" className="btn small icon" aria-label="Lower modifier" onClick={() => setMod((m) => m - 1)}>
              −
            </button>
            <span className="mod-value num" aria-live="polite">
              {mod >= 0 ? `+${mod}` : `−${-mod}`}
            </span>
            <button type="button" className="btn small icon" aria-label="Raise modifier" onClick={() => setMod((m) => m + 1)}>
              +
            </button>
            <button type="button" className="btn small ghost" onClick={() => (setPool({}), setMod(0))}>
              Clear
            </button>
          </div>
          <button type="button" className="btn primary roll-big" disabled={!expr} onClick={(e) => t.freeRoll(expr, expr, e.currentTarget)}>
            {expr ? `Roll ${expr}` : 'Roll'}
          </button>
        </div>

        <form
          className="row"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (isValid(typed)) t.freeRoll(typed, typed, e.currentTarget.querySelector('button'));
          }}
        >
          <input
            id="dice-typed"
            className="input"
            style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-data)' }}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="Type any roll, like 4d6kh3, 2d20kl1 or 6d10>=8"
            aria-invalid={!isValid(typed)}
          />
          <button type="submit" className="btn" disabled={!isValid(typed)}>
            Roll
          </button>
        </form>
        <p className="hint" style={{ marginBottom: 0 }}>
          Typed rolls understand <span className="mono">kh</span>/<span className="mono">kl</span> (keep highest/lowest), <span className="mono">!</span> (exploding) and{' '}
          <span className="mono">&gt;=8</span> (count successes).
        </p>
      </Panel>
      <div className="dice-side">
        <CustomDicePanel />
        <HistoryPanel />
      </div>
    </>
  );
}

function CustomDicePanel() {
  const { char: c, update } = useChar();
  const t = useTable();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Panel
      title="My dice"
      tab="dice"
      actions={
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const d = blankCustomDie({ name: 'Sneak Attack', formula: '3d6' });
            update((x) => void x.customDice.push(d));
            setEditing(d.id);
          }}
        >
          Add a die
        </button>
      }
    >
      {c.customDice.length === 0 && (
        <p className="hint" style={{ marginTop: 0 }}>
          Save rolls you make often (Sneak Attack 3d6, Wild Magic d100) or make a die with its own faces (a weather die: Sun, Rain, Storm, Fog).
        </p>
      )}
      <div className="list">
        {c.customDice.map((d) => {
          const summary = d.kind === 'formula' ? resolveTokens(d.formula, c) : `${d.count > 1 ? `${d.count}× ` : ''}${d.faces.filter(Boolean).join(' · ')}`;
          return (
            <div key={d.id} className={`item el-${d.element}`}>
              <div className="item-head">
                <button type="button" className="item-title" onClick={() => setEditing(editing === d.id ? null : d.id)} aria-expanded={editing === d.id}>
                  <b>{d.name}</b>
                  <small>{summary || 'Not set up yet'}</small>
                </button>
                <button type="button" className="cast" onClick={(e) => t.rollCustom(d, e.currentTarget)} disabled={!usable(d, c)}>
                  Roll
                </button>
              </div>
              {editing === d.id && <CustomDieEditor die={d} onDone={() => setEditing(null)} />}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const usable = (d: CustomDie, c: Parameters<typeof resolveTokens>[1]) =>
  d.kind === 'formula' ? isValid(resolveTokens(d.formula, c)) : d.faces.filter((f) => f.trim()).length >= 2;

function CustomDieEditor({ die, onDone }: { die: CustomDie; onDone: () => void }) {
  const { char: c, update } = useChar();
  const set = (fn: (d: CustomDie) => void) =>
    update((x) => {
      const target = x.customDice.find((d) => d.id === die.id);
      if (target) fn(target);
    });
  return (
    <div className="item-body">
      <div className="grid-2">
        <TextField label="Name" id={`cd-name-${die.id}`} value={die.name} onChange={(v) => set((d) => void (d.name = v))} />
        <SelectField
          label="Kind"
          id={`cd-kind-${die.id}`}
          value={die.kind}
          options={[
            { id: 'formula', name: 'A roll (like 3d6+2)' },
            { id: 'faces', name: 'A die with my own faces' },
          ]}
          onChange={(v) => set((d) => void (d.kind = v))}
        />
      </div>
      {die.kind === 'formula' ? (
        <>
          <TextField label="Roll" id={`cd-formula-${die.id}`} value={die.formula} placeholder="3d6+{DEX}" onChange={(v) => set((d) => void (d.formula = v))} />
          {!isValid(resolveTokens(die.formula, c)) && <p className="hint" style={{ color: 'var(--bad)', margin: 0 }}>Write it like 3d6, 1d100 or 2d8+{'{STR}'}.</p>}
        </>
      ) : (
        <>
          <TextField
            label="Faces (one per line)"
            id={`cd-faces-${die.id}`}
            multiline
            value={die.faces.join('\n')}
            placeholder={'Sun\nRain\nStorm\nFog'}
            onChange={(v) => set((d) => void (d.faces = v.split('\n')))}
          />
          <NumField label="How many to roll" id={`cd-count-${die.id}`} value={die.count} min={1} max={10} onChange={(n) => set((d) => void (d.count = n))} />
        </>
      )}
      <SelectField label="Colour" id={`cd-el-${die.id}`} value={die.element} options={ELEMENTS} onChange={(v) => set((d) => void (d.element = v))} />
      <p className="hint" style={{ margin: 0 }}>
        Rolls can use your numbers: <span className="mono">{'{STR}'}</span>…<span className="mono">{'{CHA}'}</span> modifiers, <span className="mono">{'{PB}'}</span>, <span className="mono">{'{LEVEL}'}</span>.
      </p>
      <div className="row">
        <button type="button" className="btn small primary" onClick={onDone}>
          Done
        </button>
        <ConfirmButton label="Delete" onConfirm={() => update((x) => void (x.customDice = x.customDice.filter((d) => d.id !== die.id)))} />
      </div>
    </div>
  );
}

function HistoryPanel() {
  const t = useTable();
  return (
    <Panel
      title="Roll history"
      tab="dice"
      actions={
        t.log.length ? (
          <button type="button" className="btn small ghost" onClick={t.clearLog}>
            Clear
          </button>
        ) : undefined
      }
    >
      {t.log.length === 0 && <p className="hint" style={{ margin: 0 }}>Nothing rolled yet. Rolls from every page show up here.</p>}
      <div className="history">
        {t.log.slice(0, 40).map((e) => (
          <EntryView key={e.id} e={e} />
        ))}
      </div>
    </Panel>
  );
}
