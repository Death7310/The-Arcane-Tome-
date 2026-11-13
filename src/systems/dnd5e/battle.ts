// Battles: what happened in a fight, kept for its stats. Every attack (hit, miss, or not yet
// known), every saving throw (made, failed, or not yet known), and the damage each one dealt,
// by and to everyone: you, your companions, your party and the enemies.
//
// The DM doesn't always say whether an enemy made its save. Until someone does, a save spell's
// damage counts as a range: the least it can have done (the save made: half, or none) to the
// most (the save failed: the full roll). An attack whose hit the DM hasn't confirmed counts from
// nothing to its full damage. Answering later (on the roll, or in the battle's list of open
// rolls) lands the damage on the enemy and narrows the range to what happened.
//
// The battle starts by itself with the first thing that happens while there are enemies on the
// field or a fight in initiative, and is kept when you end it.

import type { CreatureDef } from './srd';
import { damageTo, hurt, statusOf } from './enemies';
import { MAX_BATTLES, uid, type Battle, type BattleEvent, type BattleWho, type Character, type Enemy, type RolledDamage } from './model';
import type { Ability } from './data';

export const youWho = (c: Pick<Character, 'name'>): BattleWho => ({ side: 'you', name: c.name.trim() || 'You', ref: '' });
export const enemyWho = (e: Pick<Enemy, 'id' | 'name'>): BattleWho => ({ side: 'enemy', name: e.name, ref: e.id });
export const companionWho = (k: { id: string; name: string }): BattleWho => ({ side: 'companion', name: k.name, ref: k.id });
export const allyWho = (name: string): BattleWho => ({ side: 'ally', name: name.trim() || 'Party', ref: '' });

/** One key per combatant: enemies by id (two can share a name), everyone else by name. */
export const whoKey = (w: BattleWho): string => (w.side === 'you' ? 'you' : w.side === 'enemy' && w.ref ? `enemy:${w.ref}` : `${w.side}:${w.name.trim().toLowerCase()}`);
export const sameWho = (a: BattleWho | null | undefined, b: BattleWho | null | undefined): boolean => !!a && !!b && whoKey(a) === whoKey(b);

/** Whether the table is in a battle: a fight in initiative, enemies on the field, or one already going. */
export const inBattle = (c: Pick<Character, 'fight' | 'enemies' | 'battle'>): boolean => !!c.fight || c.enemies.length > 0 || !!c.battle;

/** Everyone on the field now: you, your companions, your party in the fight, and the enemies. */
export function presentWho(c: Character): BattleWho[] {
  const out: BattleWho[] = [youWho(c), ...c.companions.map(companionWho)];
  for (const x of c.fight?.order ?? []) if (x.kind === 'ally') out.push(allyWho(x.name));
  out.push(...c.enemies.map(enemyWho));
  return out;
}

const startBattle = (c: Character): Battle => ({ id: uid(), name: '', started: Date.now(), ended: null, rounds: c.fight?.round ?? 0, combatants: presentWho(c), events: [], enemies: [] });

export type NewEvent = Omit<BattleEvent, 'id' | 'time' | 'round'>;

/**
 * Adds something that happened to the battle going on, starting one if there are enemies on the
 * field or a fight. Outside a battle nothing is kept (false).
 */
export function logEvent(d: Character, ev: NewEvent): boolean {
  if (!inBattle(d)) return false;
  if (!d.battle) d.battle = startBattle(d);
  const b = d.battle;
  b.rounds = Math.max(b.rounds, d.fight?.round ?? 0);
  for (const w of [ev.by, ev.target]) if (w && !b.combatants.some((x) => sameWho(x, w))) b.combatants.push({ ...w });
  b.events.push({ ...ev, id: uid(), time: Date.now(), round: d.fight?.round ?? 0 });
  return true;
}

// ── Damage ───────────────────────────────────────────────────────────────────

/** What rolled damage comes to on an enemy after its resistances (or as rolled, on anyone else). */
export function took(e: Enemy | undefined, pieces: Pick<RolledDamage, 'amount' | 'type'>[]): number {
  return pieces.reduce((a, p) => a + (e ? damageTo(e, p.amount, p.type).amount : Math.max(0, p.amount)), 0);
}

/** A made save's share of the damage: half of each roll (rounded down), or none. */
export const onASave = <T extends Pick<RolledDamage, 'amount'>>(pieces: T[], half: boolean): T[] => (half ? pieces.map((p) => ({ ...p, amount: Math.floor(p.amount / 2) })) : []);

/** Whether the event still waits on the DM: a hit not confirmed, or a save not known. */
export const isOpen = (e: BattleEvent): boolean => e.result === 'unknown' || (e.kind === 'save' && e.saved === null);

/** The damage an event comes to, as far as anyone knows: certain (low = high), or a range. */
export function rangeOf(ev: Pick<BattleEvent, 'kind' | 'result' | 'saved' | 'half' | 'pieces' | 'low' | 'high'>, e?: Enemy): { low: number; high: number } {
  if (!ev.pieces) return { low: ev.low, high: ev.high };
  if (ev.result === 'miss') return { low: 0, high: 0 };
  const full = took(e, ev.pieces);
  if (ev.result === 'unknown') return { low: 0, high: full };
  if (ev.kind === 'save') {
    const part = took(e, onASave(ev.pieces, !!ev.half));
    return ev.saved === null || ev.saved === undefined ? { low: part, high: full } : ev.saved ? { low: part, high: part } : { low: full, high: full };
  }
  return { low: full, high: full };
}

const mainType = (pieces: Pick<RolledDamage, 'type' | 'amount'>[]): string => [...pieces].sort((a, b) => b.amount - a.amount)[0]?.type ?? '';

/** Builds an event whose damage is worked out from its rolls (at an enemy, after its resistances). */
export function withDamage(d: Pick<Character, 'enemies'>, ev: Omit<NewEvent, 'low' | 'high' | 'type'> & { pieces: RolledDamage[]; type?: string }): NewEvent {
  const e = ev.target?.side === 'enemy' ? d.enemies.find((x) => x.id === ev.target!.ref) : undefined;
  return { ...ev, type: ev.type ?? mainType(ev.pieces), ...rangeOf({ ...ev, low: 0, high: 0 }, e) };
}

// ── The DM's answer ──────────────────────────────────────────────────────────

export type Answer = 'hit' | 'miss' | 'saved' | 'failed';

/** The damage that lands for an answer: all of it on a hit or a failed save, a made save's share, none on a miss. */
export function landing<T extends Pick<RolledDamage, 'amount'>>(pieces: T[], answer: Answer, half: boolean): T[] {
  return answer === 'hit' || answer === 'failed' ? pieces : answer === 'saved' ? onASave(pieces, half) : [];
}

/**
 * What answering a roll for one target would do: the damage to land on it, and the battle's open
 * events it settles. With no battle record of the roll, `fallback` (the roll card's own damage)
 * is used, as before battles existed. Already settled (from the battle's list): nothing lands.
 */
export function settlePlan(
  c: Pick<Character, 'battle'>,
  roll: string,
  ref: string,
  answer: Answer,
  fallback?: { pieces: RolledDamage[]; half: boolean },
): { land: RolledDamage[]; events: string[]; already: boolean } {
  const evs = (c.battle?.events ?? []).filter((e) => e.roll === roll && (e.target?.ref ?? '') === ref);
  if (!evs.length) return { land: fallback ? landing(fallback.pieces, answer, fallback.half) : [], events: [], already: false };
  const open = evs.filter(isOpen);
  if (!open.length) return { land: [], events: [], already: true };
  const answers = (e: BattleEvent): Answer => (e.kind === 'save' ? (answer === 'hit' ? 'failed' : answer === 'miss' ? 'saved' : answer) : answer === 'failed' ? 'hit' : answer === 'saved' ? 'miss' : answer);
  return { land: open.flatMap((e) => landing(e.pieces ?? [], answers(e), !!e.half)), events: open.map((e) => e.id), already: false };
}

/** Settles a roll for one target: lands its damage on the enemy and closes the battle's events for it. */
export function settleRoll(d: Character, roll: string, ref: string, answer: Answer, fallback?: { pieces: RolledDamage[]; half: boolean }): void {
  const plan = settlePlan(d, roll, ref, answer, fallback);
  const enemy = d.enemies.find((x) => x.id === ref);
  if (enemy) for (const p of plan.land) hurt(enemy, { roll, who: p.who, name: p.name, amount: p.amount, type: p.type, what: p.what });
  for (const ev of d.battle?.events ?? []) {
    if (!plan.events.includes(ev.id)) continue;
    if (ev.kind === 'save') ev.saved = answer === 'saved' || answer === 'miss';
    else ev.result = answer === 'hit' || answer === 'failed' ? 'hit' : 'miss';
    Object.assign(ev, rangeOf(ev, enemy));
  }
}

/** A roll moved to another enemy (it was meant for Goblin 3): its events follow, worked out against the new one. */
export function retarget(d: Character, roll: string, fromRef: string, to: Enemy): void {
  for (const ev of d.battle?.events ?? []) {
    if (ev.roll !== roll || ev.target?.ref !== fromRef) continue;
    ev.target = enemyWho(to);
    Object.assign(ev, rangeOf(ev, to));
    if (d.battle && !d.battle.combatants.some((x) => sameWho(x, ev.target))) d.battle.combatants.push(enemyWho(to));
  }
}

/** Every event still waiting on the DM, oldest first. */
export const openEvents = (b: Battle | null): BattleEvent[] => (b ? b.events.filter(isOpen) : []);

// ── Stats ────────────────────────────────────────────────────────────────────

export interface Range {
  low: number;
  high: number;
}

export interface WhoStats {
  who: BattleWho;
  attacks: number;
  hits: number;
  crits: number;
  misses: number;
  /** Attacks the DM hasn't said hit or missed. */
  unknown: number;
  /** Hits (crits included) out of the attacks whose result is known; null with none known. */
  hitRate: number | null;
  dealt: Range;
  taken: Range;
  /** Saving throws this one made (or didn't). */
  saves: { made: number; failed: number; unknown: number };
  con: { made: number; failed: number };
  concentration: { kept: number; lost: number };
  /** Saves others made against this one's spells and effects. */
  forced: { made: number; failed: number; unknown: number };
}

const blankStats = (who: BattleWho): WhoStats => ({
  who,
  attacks: 0,
  hits: 0,
  crits: 0,
  misses: 0,
  unknown: 0,
  hitRate: null,
  dealt: { low: 0, high: 0 },
  taken: { low: 0, high: 0 },
  saves: { made: 0, failed: 0, unknown: 0 },
  con: { made: 0, failed: 0 },
  concentration: { kept: 0, lost: 0 },
  forced: { made: 0, failed: 0, unknown: 0 },
});

const SIDE_ORDER: Record<BattleWho['side'], number> = { you: 0, companion: 1, ally: 2, enemy: 3 };

/** Everyone's numbers for a battle: you first, then companions, party and enemies. */
export function battleStats(b: Battle): WhoStats[] {
  const rows = new Map<string, WhoStats>();
  const row = (w: BattleWho) => {
    const k = whoKey(w);
    if (!rows.has(k)) rows.set(k, blankStats(w));
    return rows.get(k)!;
  };
  b.combatants.forEach(row);
  for (const e of b.events) {
    const by = e.by ? row(e.by) : null;
    const at = e.target ? row(e.target) : null;
    if (by) {
      by.dealt.low += e.low;
      by.dealt.high += e.high;
    }
    if (at) {
      at.taken.low += e.low;
      at.taken.high += e.high;
    }
    if (e.kind === 'attack' && by) {
      by.attacks += 1;
      if (e.result === 'crit') (by.hits += 1), (by.crits += 1);
      else if (e.result === 'hit') by.hits += 1;
      else if (e.result === 'miss') by.misses += 1;
      else by.unknown += 1;
    }
    if (e.kind === 'save') {
      const tally = (s: { made: number; failed: number; unknown?: number }) => {
        if (e.saved === true) s.made += 1;
        else if (e.saved === false) s.failed += 1;
        else if (s.unknown !== undefined) s.unknown += 1;
      };
      if (at) {
        tally(at.saves);
        if (e.ability === 'con' && e.saved !== null && e.saved !== undefined) tally(at.con);
        if (e.concentration && e.saved !== null && e.saved !== undefined) e.saved ? (at.concentration.kept += 1) : (at.concentration.lost += 1);
      }
      if (by) tally(by.forced);
    }
  }
  for (const r of rows.values()) r.hitRate = r.hits + r.misses ? r.hits / (r.hits + r.misses) : null;
  const firstSeen = [...rows.keys()];
  return [...rows.values()].sort((a, b) => SIDE_ORDER[a.who.side] - SIDE_ORDER[b.who.side] || firstSeen.indexOf(whoKey(a.who)) - firstSeen.indexOf(whoKey(b.who)));
}

/** "34" when certain, "34–46" while saves or hits are unknown. */
export const rangeText = (r: Range): string => (r.low === r.high ? `${r.low}` : `${r.low}–${r.high}`);

/** "5 of 7 (71%)", or "—" with no attacks whose result is known. */
export const hitRateText = (s: WhoStats): string => (s.hitRate === null ? '—' : `${s.hits} of ${s.hits + s.misses} (${Math.round(s.hitRate * 100)}%)`);

/** Whether this one did or suffered anything worth a line. */
export const didSomething = (s: WhoStats): boolean =>
  s.attacks > 0 || s.dealt.high > 0 || s.taken.high > 0 || s.saves.made + s.saves.failed + s.saves.unknown > 0 || s.forced.made + s.forced.failed + s.forced.unknown > 0;

// ── Naming, ending, sharing ──────────────────────────────────────────────────

/** A name from its enemies: "Goblin ×3, Bugbear", or "Battle". */
export function autoName(b: Pick<Battle, 'combatants'>): string {
  const counts = new Map<string, number>();
  for (const w of b.combatants) if (w.side === 'enemy') counts.set(w.name.replace(/\s+\d+$/, ''), (counts.get(w.name.replace(/\s+\d+$/, '')) ?? 0) + 1);
  const parts = [...counts.entries()].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n));
  return parts.length ? parts.slice(0, 4).join(', ') + (parts.length > 4 ? '…' : '') : 'Battle';
}

export const battleName = (b: Battle): string => b.name.trim() || autoName(b);

/**
 * Ends the battle and keeps it (newest first), with how each enemy ended up. A battle where
 * nothing happened isn't kept. Returns the kept battle, or null.
 */
export function endBattle(d: Character, creatures: CreatureDef[] = []): Battle | null {
  const b = d.battle;
  d.battle = null;
  if (!b || !b.events.length) return null;
  b.ended = Date.now();
  b.rounds = Math.max(b.rounds, d.fight?.round ?? 0);
  b.enemies = b.combatants
    .filter((w) => w.side === 'enemy')
    .map((w) => {
      const e = d.enemies.find((x) => x.id === w.ref);
      return { ref: w.ref, name: w.name, status: e ? statusOf(e, creatures) : 'healthy' };
    });
  if (!b.name.trim()) b.name = autoName(b);
  // Settled events keep their numbers; only open ones need their rolls (to answer later).
  for (const e of b.events) if (!isOpen(e)) delete e.pieces;
  d.battles = [b, ...d.battles.filter((x) => x.id !== b.id)].slice(0, MAX_BATTLES);
  return b;
}

const ABILITY_SHORT: Record<Ability, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

/** One line about an event, for the battle's log: "Round 2 · Anaurys → Goblin 1: Scimitar, hit, 7 slashing". */
export function eventText(e: BattleEvent): string {
  const who = e.by?.name ?? '';
  const at = e.target?.name ?? '';
  const dmg = e.high > 0 ? `${rangeText(e)}${e.type ? ` ${e.type}` : ''}` : '';
  let body: string;
  if (e.kind === 'attack') body = `${who}${at ? ` → ${at}` : ''}: ${e.what || 'attack'}, ${e.result === 'unknown' ? 'hit not known' : e.result}${dmg ? `, ${dmg}` : ''}`;
  else if (e.kind === 'save') {
    const save = `${e.ability ? ABILITY_SHORT[e.ability] : ''} ${e.concentration ? 'concentration ' : ''}save${e.dc ? ` (DC ${e.dc})` : ''}`.trim();
    const outcome = e.saved === null || e.saved === undefined ? 'not known' : e.saved ? 'made' : 'failed';
    body = `${at || 'Someone'}: ${save} ${outcome}${who ? ` against ${who}’s ${e.what || 'effect'}` : e.what && !e.concentration ? ` (${e.what})` : ''}${dmg ? `, ${dmg}` : ''}`;
  } else body = `${who || 'Damage'}${at ? ` → ${at}` : ''}: ${e.what || 'damage'}${dmg ? `, ${dmg}` : ''}${e.result === 'unknown' ? ' (if it hit)' : ''}`;
  return `${e.round ? `Round ${e.round} · ` : ''}${body}`;
}

/** The battle as text to paste anywhere: who did what, then what happened, in order. */
export function battleText(b: Battle): string {
  const when = new Date(b.started).toLocaleString();
  const lines = [`${battleName(b)} — ${when}${b.rounds ? ` · ${b.rounds} round${b.rounds === 1 ? '' : 's'}` : ''}`, ''];
  for (const s of battleStats(b).filter(didSomething)) {
    const parts = [
      s.attacks ? `hit ${hitRateText(s)}${s.crits ? `, ${s.crits} crit${s.crits === 1 ? '' : 's'}` : ''}${s.unknown ? `, ${s.unknown} not known` : ''}` : '',
      s.dealt.high ? `dealt ${rangeText(s.dealt)}` : '',
      s.taken.high ? `took ${rangeText(s.taken)}` : '',
      s.saves.made + s.saves.failed ? `saves ${s.saves.made}/${s.saves.made + s.saves.failed}` : '',
      s.con.made + s.con.failed ? `CON ${s.con.made}/${s.con.made + s.con.failed}` : '',
      s.concentration.kept + s.concentration.lost ? `concentration kept ${s.concentration.kept} of ${s.concentration.kept + s.concentration.lost}` : '',
    ].filter(Boolean);
    lines.push(`${s.who.name}: ${parts.join('; ')}`);
  }
  if (b.enemies.length) lines.push('', `Enemies: ${b.enemies.map((e) => `${e.name} (${e.status === 'down' ? 'down' : e.status === 'healthy' ? 'standing' : e.status === 'badly' ? 'badly hurt' : 'bloodied'})`).join(', ')}`);
  lines.push('', ...b.events.map(eventText));
  return lines.join('\n');
}

export const BATTLE_FORMAT = 'arcane-tome-battle';

/** The battle as a file to keep. */
export const battleFile = (b: Battle): string => JSON.stringify({ format: BATTLE_FORMAT, version: 1, battle: b }, null, 2);
