// Small arithmetic formulas for numbers that scale with a character, like a companion's
// "AC 13 + {PB}" or "HP 5 + 5 × {LEVEL:ranger}". Tokens are filled in from the owner, then
// the arithmetic is worked out by a tiny parser (numbers, + − × ÷, brackets, and floor,
// ceil, min, max), never by eval, so text from imported documents can't run as code.

import type { Character } from './model';
import { resolveTokens } from './rules';

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'fn'; v: string } | { t: '(' } | { t: ')' } | { t: ',' };

function lex(src: string): Tok[] | null {
  const out: Tok[] = [];
  // "×", and an "x" between numbers ("5 x 3"), multiply; function names like max keep their x.
  const s = src.replace(/×/g, '*').replace(/(\d)\s*x\s*(?=[\d(])/gi, '$1*').replace(/÷/g, '/').replace(/[−–]/g, '-');
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[\d.]/.test(ch)) {
      const m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i))!;
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if ('+-*/'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
    } else if (ch === '(' || ch === ')' || ch === ',') {
      out.push({ t: ch });
      i++;
    } else {
      const m = /^(floor|ceil|min|max|round)\b/i.exec(s.slice(i));
      if (!m) return null;
      out.push({ t: 'fn', v: m[1].toLowerCase() });
      i += m[1].length;
    }
  }
  return out;
}

/** Recursive descent: expr = term (+|- term)*; term = unary (*|/ unary)*; unary = -unary | atom. */
function parse(tokens: Tok[]): number | null {
  let p = 0;
  const peek = () => tokens[p];
  const expr = (): number => {
    let v = term();
    while (peek()?.t === 'op' && ((peek() as { v: string }).v === '+' || (peek() as { v: string }).v === '-')) {
      const op = (tokens[p++] as { v: string }).v;
      v = op === '+' ? v + term() : v - term();
    }
    return v;
  };
  const term = (): number => {
    let v = unary();
    while (peek()?.t === 'op' && ((peek() as { v: string }).v === '*' || (peek() as { v: string }).v === '/')) {
      const op = (tokens[p++] as { v: string }).v;
      v = op === '*' ? v * unary() : v / unary();
    }
    return v;
  };
  const unary = (): number => {
    const tk = peek();
    if (tk?.t === 'op' && tk.v === '-') {
      p++;
      return -unary();
    }
    if (tk?.t === 'op' && tk.v === '+') {
      p++;
      return unary();
    }
    return atom();
  };
  const atom = (): number => {
    const tk = tokens[p++];
    if (!tk) throw new Error('end');
    if (tk.t === 'num') return tk.v;
    if (tk.t === '(') {
      const v = expr();
      if (tokens[p++]?.t !== ')') throw new Error(')');
      return v;
    }
    if (tk.t === 'fn') {
      if (tokens[p++]?.t !== '(') throw new Error('(');
      const args = [expr()];
      while (peek()?.t === ',') {
        p++;
        args.push(expr());
      }
      if (tokens[p++]?.t !== ')') throw new Error(')');
      switch (tk.v) {
        case 'floor':
          return Math.floor(args[0]);
        case 'ceil':
          return Math.ceil(args[0]);
        case 'round':
          return Math.round(args[0]);
        case 'min':
          return Math.min(...args);
        default:
          return Math.max(...args);
      }
    }
    throw new Error('token');
  };
  try {
    const v = expr();
    return p === tokens.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Works out a formula's number for this character, rounded down; null if it can't be read. */
export function evalFormula(text: string, c: Character): number | null {
  const filled = resolveTokens(String(text ?? '').trim(), c);
  if (!filled) return null;
  const tokens = lex(filled);
  if (!tokens || !tokens.length) return null;
  const v = parse(tokens);
  return v === null ? null : Math.floor(v);
}

/** True when a formula has tokens or arithmetic (worth showing how it's worked out). */
export const isFormula = (text: string) => /[{}*/×]|[+-]\s*\d|\d\s*[+-]/.test(text);

const ABILITY_TOKEN: Record<string, string> = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };

/** A formula in words: "13 + {PB}" → "13 + your Proficiency Bonus". */
export function describeFormula(text: string): string {
  return text
    .replace(/\{PB\}/gi, 'your Proficiency Bonus')
    .replace(/\{LEVEL:(\w+)\}/gi, (_, k: string) => `your ${k.charAt(0).toUpperCase()}${k.slice(1)} level`)
    .replace(/\{LEVEL\}/gi, 'your level')
    .replace(/\{SPELLATK\}/gi, 'your spell attack bonus')
    .replace(/\{SPELLDC\}/gi, 'your spell save DC')
    .replace(/\{MOD\}/gi, 'your spellcasting modifier')
    .replace(/\{(STR|DEX|CON|INT|WIS|CHA)\}/gi, (_, a: string) => `your ${ABILITY_TOKEN[a.toUpperCase()]} modifier`)
    .replace(/\s*\*\s*/g, ' × ');
}
