// Game states: where a session stands, apart from the character it's played on. A save point
// copies the whole character; a game state keeps only what changes in play (hit points, spent
// slots or spell points, used features, conditions, the enemies and the damage done to them,
// the initiative order, counters, companions' hit points, coins and item counts). So it can be
// saved on one device, carried to another as a file, and loaded onto a newer copy of the
// character (after an update or a level up) without undoing those changes.
//
// Loading matches things by name: features (with their source), companions, classes (for Hit
// Point Dice) and items. Anything that isn't on the sheet it's loaded onto is reported, not
// guessed at.

import { CONDITIONS, type ConditionId } from './data';
import { blankEnemy, normalizeCharacter, uid, type Character, type Counter, type Effect, type Enemy, type Fight, type Turn } from './model';

export interface PlayState {
  hp: { current: number; temp: number };
  deathSaves: { successes: number; failures: number };
  exhaustion: number;
  heroicInspiration: boolean;
  conditions: ConditionId[];
  effects: Effect[];
  turn: Turn;
  magic: { slotsUsed: number[]; pactUsed: number; pointsUsed: number; highUsed: number[]; concentratingOn: string | null };
  hitDice: { classId: string; used: number }[];
  uses: { name: string; source: string; spent: number }[];
  companions: { name: string; hp: number; tempHp: number; conditions: ConditionId[]; turn: Turn }[];
  enemies: Enemy[];
  targetId: string | null;
  party: string[];
  fight: Fight | null;
  counters: Counter[];
  currency: Character['currency'];
  items: { name: string; qty: number }[];
}

export interface GameState {
  id: string;
  name: string;
  savedAt: number;
  /** The character it was saved from (it can be loaded onto any). */
  characterId: string;
  characterName: string;
  state: PlayState;
}

export const GAME_STATE_FORMAT = 'arcane-tome-game-state';

const norm = (s: string) => s.trim().toLowerCase();

export function capturePlay(c: Character): PlayState {
  const copy = <T,>(v: T): T => structuredClone(v);
  return {
    hp: { current: c.hp.current, temp: c.hp.temp },
    deathSaves: { ...c.deathSaves },
    exhaustion: c.exhaustion,
    heroicInspiration: c.heroicInspiration,
    conditions: [...c.conditions],
    effects: copy(c.effects),
    turn: { ...c.turn },
    magic: {
      slotsUsed: [...c.spellcasting.slotsUsed],
      pactUsed: c.spellcasting.pactUsed,
      pointsUsed: c.spellcasting.pointsUsed,
      highUsed: [...c.spellcasting.highUsed],
      concentratingOn: c.spellcasting.concentratingOn,
    },
    hitDice: c.classes.map((k) => ({ classId: k.classId, used: k.hitDiceUsed })),
    uses: c.features.filter((f) => f.usesMax !== null).map((f) => ({ name: f.name, source: f.source, spent: f.usesSpent })),
    companions: c.companions.map((k) => ({ name: k.name, hp: k.hp, tempHp: k.tempHp, conditions: [...k.conditions], turn: { ...k.turn } })),
    enemies: copy(c.enemies),
    targetId: c.targetId,
    party: [...c.party],
    fight: copy(c.fight),
    counters: copy(c.counters),
    currency: { ...c.currency },
    items: c.inventory.map((i) => ({ name: i.name, qty: i.qty })),
  };
}

export function makeGameState(c: Character, name: string): GameState {
  return { id: uid(), name: name.trim() || 'Game state', savedAt: Date.now(), characterId: c.id, characterName: c.name, state: capturePlay(c) };
}

/**
 * Puts a game state onto a character (changing it in place). Returns what couldn't be placed:
 * features, companions or items the sheet doesn't have.
 */
export function applyPlay(d: Character, s: PlayState): string[] {
  const missed: string[] = [];
  d.hp.current = s.hp.current;
  d.hp.temp = s.hp.temp;
  d.deathSaves = { ...s.deathSaves };
  d.exhaustion = s.exhaustion;
  d.heroicInspiration = s.heroicInspiration;
  d.conditions = [...s.conditions];
  d.effects = structuredClone(s.effects);
  d.turn = { ...s.turn };
  d.spellcasting.slotsUsed = Array.from({ length: 9 }, (_, i) => s.magic.slotsUsed[i] ?? 0);
  d.spellcasting.pactUsed = s.magic.pactUsed;
  d.spellcasting.pointsUsed = s.magic.pointsUsed;
  d.spellcasting.highUsed = [...s.magic.highUsed];
  d.spellcasting.concentratingOn = s.magic.concentratingOn;
  for (const h of s.hitDice) {
    const k = d.classes.find((x) => x.classId === h.classId);
    if (k) k.hitDiceUsed = Math.min(k.level, h.used);
  }
  // Features with uses: by name and source, then by name alone (each used once).
  const taken = new Set<string>();
  for (const u of s.uses) {
    const f =
      d.features.find((x) => !taken.has(x.id) && norm(x.name) === norm(u.name) && norm(x.source) === norm(u.source)) ??
      d.features.find((x) => !taken.has(x.id) && norm(x.name) === norm(u.name));
    if (!f) {
      if (u.spent > 0) missed.push(`${u.name} (${u.spent} used)`);
      continue;
    }
    taken.add(f.id);
    f.usesSpent = u.spent;
  }
  for (const k of s.companions) {
    const mine = d.companions.find((x) => norm(x.name) === norm(k.name));
    if (!mine) {
      missed.push(`companion ${k.name}`);
      continue;
    }
    mine.hp = k.hp;
    mine.tempHp = k.tempHp;
    mine.conditions = [...k.conditions];
    mine.turn = { ...k.turn };
  }
  d.enemies = structuredClone(s.enemies);
  d.targetId = s.targetId && d.enemies.some((e) => e.id === s.targetId) ? s.targetId : null;
  d.party = [...s.party];
  // The initiative order points at companions by id; this sheet's may differ, so match by name.
  d.fight = s.fight
    ? {
        ...structuredClone(s.fight),
        order: s.fight.order.map((x) => (x.kind === 'companion' ? { ...x, ref: d.companions.find((k) => norm(k.name) === norm(x.name))?.id ?? x.ref } : { ...x })),
      }
    : null;
  d.counters = structuredClone(s.counters);
  d.currency = { ...s.currency };
  for (const it of s.items) {
    const mine = d.inventory.find((x) => norm(x.name) === norm(it.name));
    if (mine) mine.qty = it.qty;
    else if (it.qty > 0) missed.push(`item ${it.name}`);
  }
  return missed;
}

/** A game state as a file to keep or carry to another device. */
export const gameStateFile = (g: GameState): string => JSON.stringify({ format: GAME_STATE_FORMAT, version: 1, ...g }, null, 2);

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const conditions = (v: unknown): ConditionId[] => (Array.isArray(v) ? v.filter((x): x is ConditionId => CONDITIONS.some((k) => k.id === x)) : []);
const turnOf = (v: unknown): Turn => {
  const t = (v && typeof v === 'object' ? v : {}) as Partial<Turn>;
  return {
    action: !!t.action,
    bonus: !!t.bonus,
    reaction: !!t.reaction,
    movementUsed: num(t.movementUsed),
    dashes: num(t.dashes),
    attacks: num(t.attacks),
    lightWith: Array.isArray(t.lightWith) ? t.lightWith.filter((x): x is string => typeof x === 'string') : [],
    lightExtra: !!t.lightExtra,
  };
};

/** Reads a saved or imported game state, repairing what it can (the file may come from anywhere). */
export function readGameState(raw: unknown): GameState {
  const g = (raw && typeof raw === 'object' ? raw : null) as (Partial<GameState> & { format?: unknown }) | null;
  if (!g || !g.state || typeof g.state !== 'object') throw new Error('That file isn’t an Arcane Tome game state.');
  const s = g.state as Partial<PlayState>;
  // The parts shaped like a character's go through the character reader, which repairs them.
  const as = normalizeCharacter({
    effects: s.effects,
    enemies: s.enemies,
    fight: s.fight,
    counters: s.counters,
    targetId: s.targetId,
    party: s.party,
    currency: s.currency,
  });
  const list = <T,>(v: unknown, f: (x: Record<string, unknown>) => T | null): T[] =>
    Array.isArray(v) ? v.flatMap((x) => (x && typeof x === 'object' ? [f(x as Record<string, unknown>)].filter((y): y is T => y !== null) : [])) : [];
  const m = (s.magic ?? {}) as Partial<PlayState['magic']>;
  return {
    id: str(g.id) || uid(),
    name: str(g.name, 'Game state').slice(0, 80) || 'Game state',
    savedAt: num(g.savedAt, Date.now()),
    characterId: str(g.characterId),
    characterName: str(g.characterName),
    state: {
      hp: { current: num(s.hp?.current), temp: Math.max(0, num(s.hp?.temp)) },
      deathSaves: { successes: Math.min(3, Math.max(0, num(s.deathSaves?.successes))), failures: Math.min(3, Math.max(0, num(s.deathSaves?.failures))) },
      exhaustion: Math.min(6, Math.max(0, num(s.exhaustion))),
      heroicInspiration: !!s.heroicInspiration,
      conditions: conditions(s.conditions),
      effects: as.effects,
      turn: turnOf(s.turn),
      magic: {
        slotsUsed: Array.from({ length: 9 }, (_, i) => Math.max(0, num(Array.isArray(m.slotsUsed) ? m.slotsUsed[i] : 0))),
        pactUsed: Math.max(0, num(m.pactUsed)),
        pointsUsed: Math.max(0, num(m.pointsUsed)),
        highUsed: Array.isArray(m.highUsed) ? m.highUsed.filter((n): n is number => Number.isInteger(n) && n >= 6 && n <= 9) : [],
        concentratingOn: typeof m.concentratingOn === 'string' ? m.concentratingOn : null,
      },
      hitDice: list(s.hitDice, (x) => (typeof x.classId === 'string' ? { classId: x.classId, used: Math.max(0, num(x.used)) } : null)),
      uses: list(s.uses, (x) => (typeof x.name === 'string' ? { name: x.name, source: str(x.source), spent: Math.max(0, num(x.spent)) } : null)),
      companions: list(s.companions, (x) => (typeof x.name === 'string' ? { name: x.name, hp: num(x.hp), tempHp: Math.max(0, num(x.tempHp)), conditions: conditions(x.conditions), turn: turnOf(x.turn) } : null)),
      enemies: as.enemies.map((e) => blankEnemy(e)),
      targetId: as.targetId,
      party: as.party,
      fight: as.fight,
      counters: as.counters,
      currency: as.currency,
      items: list(s.items, (x) => (typeof x.name === 'string' ? { name: x.name, qty: Math.max(0, num(x.qty)) } : null)),
    },
  };
}

/** Reads a game state file's text. */
export function parseGameStateFile(text: string): GameState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That isn’t a game state file (it isn’t valid JSON).');
  }
  if ((data as { format?: unknown })?.format !== GAME_STATE_FORMAT) throw new Error('That file isn’t an Arcane Tome game state. (Character backups go under Settings → Restore.)');
  return readGameState(data);
}

/** A short summary of what a game state holds, for its list entry. */
export function describePlay(s: PlayState): string {
  const hurt = s.enemies.filter((e) => e.hits.length || e.status !== 'healthy').length;
  const parts = [
    `${s.hp.current} HP`,
    s.enemies.length ? `${s.enemies.length} enem${s.enemies.length === 1 ? 'y' : 'ies'}${hurt ? ` (${hurt} hurt)` : ''}` : '',
    s.fight ? `round ${s.fight.round}` : '',
    s.magic.slotsUsed.some((n) => n > 0) || s.magic.pactUsed || s.magic.pointsUsed ? 'spells spent' : '',
    s.conditions.length ? `${s.conditions.length} condition${s.conditions.length === 1 ? '' : 's'}` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
