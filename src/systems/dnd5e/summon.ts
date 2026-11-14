// The creature a summoning spell brings (Summon Beast's Bestial Spirit, Summon Fey's Fey Spirit…),
// as a companion: its stat block resolved for the form you choose (Air, Land or Water; Fuming,
// Mirthful or Tricksy…) and the level you cast the spell at, so every number is one the app can
// roll. "11 + the level of the spell" at 3rd level is 14; "20 (Air only) or 30 (Land and Water
// only)" as a Land beast is 30; a trait marked "(Air Only)" goes with the other forms.

import { parseStatBlock } from './statblock';
import type { Companion } from './model';

/** The forms a stat block offers, from its "(X only)" notes, in the order they first appear. */
export function summonForms(block: string): string[] {
  const out: string[] = [];
  for (const m of block.matchAll(/\(([^()]*?)\s+only\)/gi))
    for (const f of m[1].split(/\s*(?:,|\band\b|\bor\b)\s*/i)) {
      const name = f.trim().replace(/^\w/, (ch) => ch.toUpperCase());
      if (name && /^[A-Za-z' -]{2,20}$/.test(name) && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
    }
  return out;
}

const forForm = (qualifier: string, form: string) => qualifier.split(/\s*(?:,|\band\b|\bor\b)\s*/i).some((f) => f.trim().toLowerCase() === form.toLowerCase());

/**
 * A line with only its form's parts: an item noted "(Water only)" for another form goes, back to
 * the separator before it ("; swim 30 ft. (Water only)", "or 30 (Land and Water only)",
 * "+ 2 (Defender only)"); one for this form stays, without its note.
 */
function lineForForm(line: string, form: string): string {
  let out = line;
  for (let guard = 0; guard < 20; guard++) {
    const m = /\s*\(([^()]*?)\s+only\)/i.exec(out);
    if (!m) break;
    const before = out.slice(0, m.index);
    const after = out.slice(m.index + m[0].length);
    if (forForm(m[1], form)) {
      out = before + after;
      continue;
    }
    const at = Math.max(...['; ', ', ', ' or ', ' + '].map((sep) => before.lastIndexOf(sep)));
    if (at >= 0) out = before.slice(0, at) + after;
    else {
      // The value's first item: keep the label ("Hit Points "), drop the item and the "or" after it.
      const label = /^([A-Z][A-Za-z]*(?: [A-Z][a-z]+)?\s+)/.exec(before)?.[1] ?? '';
      out = label + after.replace(/^\s*(?:or|;|,)\s*/, '');
    }
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** "1d8 + 4 + the spell's level" at 3rd level → "1d8 + 4 + 3"; "+ 5 for each spell level above 2nd" → "+ 5". */
function atLevel(text: string, level: number): string {
  return text
    .replace(/\s*\+\s*(\d+)\s+for each (?:spell )?(?:slot )?level above (?:the )?(\d)(?:st|nd|rd|th)?/gi, (_, n: string, b: string) => {
      const extra = Number(n) * Math.max(0, level - Number(b));
      return extra ? ` + ${extra}` : '';
    })
    .replace(/half (?:of )?(?:this|the) spell'?s level \(rounded down\)/gi, String(Math.floor(level / 2)))
    .replace(/\b(?:the level of (?:the|this) spell|(?:the|this) spell'?s level|the spell level)\b/gi, String(level))
    .replace(/makes a number of attacks equal to (\d+)/gi, (_, n: string) => `makes ${n} attack${n === '1' ? '' : 's'}`);
}

/** "11 + 3" → "14"; anything that isn't plain sums of whole numbers stays as it is. */
const sum = (t: string) => (/^\d+(?:\s*[+-]\s*\d+)*$/.test(t.trim()) ? String(t.match(/[+-]?\s*\d+/g)!.reduce((a, x) => a + Number(x.replace(/\s/g, '')), 0)) : t);

/**
 * The creature as a companion, for a form (null for a creature with only one) and the level you
 * cast the spell at. Null if the text isn't a stat block.
 */
export function summonCompanion(block: string, opts: { spell: string; level: number; form: string | null }): Companion | null {
  const lines = block.split('\n').flatMap((raw) => {
    const l = raw.trim();
    if (!l || !opts.form) return [l];
    // A trait or action of one form only: "Flyby (Air Only). …".
    const entry = /^([^.]{1,60}?)\s*\(([^()]*?)\s+only\)\.\s*(.*)$/i.exec(l);
    if (entry) return forForm(entry[2], opts.form) ? [`${entry[1]}. ${entry[3]}`] : [];
    return [lineForForm(l, opts.form)];
  });
  const text = atLevel(lines.join('\n'), opts.level);
  const c = parseStatBlock(text);
  if (!c) return null;
  c.ac = sum(c.ac);
  c.maxHp = sum(c.maxHp);
  const hp = Number(c.maxHp);
  if (Number.isFinite(hp)) c.hp = hp;
  // "1d8 + 4 + 3" → "1d8 + 7".
  for (const a of c.actions)
    for (let k = 0; k < 5 && /\b\d+\s*\+\s*\d+\b(?![d\d])/.test(a.damage); k++) a.damage = a.damage.replace(/\b(\d+)\s*\+\s*(\d+)\b(?![d\d])/, (_, x: string, y: string) => String(Number(x) + Number(y)));
  const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  c.source = opts.spell;
  c.notes = `Summoned by ${opts.spell} at ${ord(opts.level)} level${opts.form ? `, ${opts.form} form` : ''}. Its numbers are for that casting: add it again from the spell when you cast it at another level or form.`;
  return c;
}
