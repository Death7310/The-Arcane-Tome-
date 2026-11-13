// Update a character from a newer copy of its sheet: read the file, show what differs in
// sections you can tick, then apply only those (after a save point, so it can be undone).

import { useRef, useState } from 'react';
import { extractFromFile, UnsupportedFile } from '../import/extract';
import { loadCatalog, useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { buildCharacter, importFromText, looksLikeAiJson, readAiJson } from '../systems/dnd5e/importer';
import { normalizeCharacter, type Character } from '../systems/dnd5e/model';
import { applyUpdate, planUpdate, type SectionId } from '../systems/dnd5e/sheetupdate';
import { Dialog } from './ui';

const ACCEPT = '.pdf,.docx,.odt,.txt,.md,.markdown,.html,.htm,.rtf,.json,application/pdf,text/*';
const SHOWN = 8;

/** Reads a sheet file into a character (the same reader as Import). */
export async function readSheetFile(f: File): Promise<Character> {
  const catalog = await loadCatalog().catch(() => undefined);
  if (/\.json$/i.test(f.name)) {
    const data = JSON.parse((await f.text()).trim());
    if (looksLikeAiJson(data)) return buildCharacter(readAiJson(data), catalog).character;
    const one = Array.isArray(data) ? data[0] : data?.characters ? data.characters[0] : data;
    return normalizeCharacter(one);
  }
  const ex = await extractFromFile(f);
  return importFromText(ex.text, ex.fields, { positions: ex.positions, catalog }).character;
}

/** The differences between the character and the sheet, to tick and apply. */
export function SheetUpdateReview(props: { sheet: Character; source: string; onDone: (message: string) => void; onBack: () => void }) {
  const { char: c, update, savePoint } = useChar();
  const cat = useCatalog();
  const plan = planUpdate(c, props.sheet);
  const [on, setOn] = useState<Set<SectionId>>(() => new Set(plan.sections.filter((s) => s.on).map((s) => s.id)));
  const [open, setOpen] = useState<Set<SectionId>>(new Set());
  const toggle = (set: Set<SectionId>, id: SectionId) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const who = c.name || 'this character';
  if (!plan.sections.length)
    return (
      <div className="import-review">
        <p className="hint" style={{ marginTop: 0 }}>
          Read from <b>{props.source}</b>: it matches {who} already. Nothing to update.
        </p>
        <button type="button" className="btn" onClick={props.onBack}>
          Back
        </button>
      </div>
    );
  return (
    <div className="import-review sheet-update">
      <p className="hint" style={{ marginTop: 0 }}>
        Read from <b>{props.source}</b>. Tick what to take from it. A save point of {who} as it is now is made first, so you can go back.
      </p>
      {plan.sections.map((s) => {
        const more = s.lines.length > SHOWN && !open.has(s.id);
        return (
          <div key={s.id} className={`item update-section${on.has(s.id) ? ' on' : ''}`}>
            <label className="check">
              <input type="checkbox" checked={on.has(s.id)} onChange={() => setOn((x) => toggle(x, s.id))} />
              <b>{s.title}</b>
            </label>
            <ul>
              {(more ? s.lines.slice(0, SHOWN) : s.lines).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {more && (
              <button type="button" className="btn small ghost" onClick={() => setOpen((x) => toggle(x, s.id))}>
                and {s.lines.length - SHOWN} more
              </button>
            )}
            {s.note && <p className="hint" style={{ margin: 0 }}>{s.note}</p>}
          </div>
        );
      })}
      <p className="hint">
        Kept as they are: companions (and their hit points), your hit points now, spent slots and uses, conditions, enemies and the fight, counters, game states, your portrait, tiles and dice.
        New class levels bring their class and subclass features, as Level up does.
      </p>
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={on.size === 0 || !cat}
          onClick={() => {
            if (!cat) return;
            savePoint?.(`Before updating from ${props.source}`);
            const done = applyUpdate(structuredClone(c), plan, on, cat);
            update((d) => void applyUpdate(d, plan, on, cat));
            props.onDone(`Updated ${who} from ${props.source}: ${done.join(', ') || 'no changes'}. The save point “Before updating…” has the old version.`);
          }}
        >
          Update {who}
        </button>
        <button type="button" className="btn ghost" onClick={props.onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

/** Pick a sheet file, then review and apply the update. */
export function SheetUpdateDialog(props: { onClose: () => void; onDone: (message: string) => void }) {
  const { char: c } = useChar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<{ character: Character; source: string } | null>(null);
  return (
    <Dialog title={`Update ${c.name || 'this character'} from a sheet`} onClose={props.onClose}>
      {sheet ? (
        <SheetUpdateReview sheet={sheet.character} source={sheet.source} onBack={() => setSheet(null)} onDone={(m) => (props.onDone(m), props.onClose())} />
      ) : (
        <div className="import">
          <p className="hint" style={{ marginTop: 0 }}>
            Bring a newer copy of this character’s sheet up to date in the app: a D&amp;D Beyond PDF from after a level up, a Word or text file, an AI’s write-up, or an Arcane Tome export. You
            see what differs before anything changes. It’s read on this device; nothing is uploaded.
          </p>
          <div className="row">
            <button type="button" className="btn primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              Choose the sheet
            </button>
            {busy && <span className="hint">{busy}</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            hidden
            aria-label="Character sheet file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setError('');
              setBusy(`Reading ${f.name}…`);
              try {
                setSheet({ character: await readSheetFile(f), source: f.name });
              } catch (err) {
                setError(err instanceof UnsupportedFile ? err.message : `Couldn’t read that file: ${(err as Error).message}`);
              } finally {
                setBusy('');
              }
            }}
          />
          {error && (
            <p className="hint" role="alert" style={{ color: 'var(--bad)' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
