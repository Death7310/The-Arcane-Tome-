// The foes in a fight, as you know them: their AC (or what your hits and misses have shown
// about it), how hurt they look, their conditions, the marks you've put on them (Hunter's
// Mark, Hex) and the damage they've taken from you, your companions and your party.
//
// Their conditions change your attacks the way the 2024 rules say (SRD 5.2.1, Rules Glossary):
// Advantage against a Blinded, Paralyzed, Petrified, Restrained, Stunned or Unconscious foe,
// against a Prone one from within 5 feet (Disadvantage from farther), Disadvantage against an
// Invisible one, and hits from within 5 feet on a Paralyzed or Unconscious foe are critical.

import { CONDITIONS, type Ability, type ConditionId } from './data';
import { blankEnemy, uid, type Character, type Enemy, type EnemyHit, type EnemyMark, type EnemyStatus, type Fight, type FightEntry, type Spell } from './model';
import type { CreatureDef } from './srd';

const conditionName = (id: ConditionId) => CONDITIONS.find((k) => k.id === id)?.name ?? id;

/** "Goblin" ×3 → Goblin 1, Goblin 2, Goblin 3 (continuing from any Goblins already there). */
export function numberedNames(base: string, count: number, existing: Pick<Enemy, 'name'>[]): string[] {
  const name = base.trim() || 'Enemy';
  if (count <= 1 && !existing.some((e) => e.name === name || e.name.startsWith(`${name} `))) return [name];
  const taken = existing.map((e) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`).exec(e.name)?.[1]).filter(Boolean).map(Number);
  const start = Math.max(0, ...taken) + 1;
  return Array.from({ length: count }, (_, i) => `${name} ${start + i}`);
}

/** Enemies typed in quickly: a name, how many, and whatever the DM has told you. */
export function quickEnemies(name: string, count: number, existing: Enemy[], known: { ac?: number | null; maxHp?: number | null } = {}): Enemy[] {
  return numberedNames(name, Math.max(1, Math.min(20, count)), existing).map((n) => blankEnemy({ name: n, ac: known.ac ?? null, maxHp: known.maxHp ?? null }));
}

/**
 * Enemies from the creature list. Kept hidden (the default), the app knows its name only: its
 * AC and HP stay out of sight and out of the maths until you reveal them, so nothing is spoiled.
 */
export function enemiesFromCreature(def: CreatureDef, count: number, existing: Enemy[], revealed: boolean): Enemy[] {
  return numberedNames(def.name, Math.max(1, Math.min(20, count)), existing).map((n) => blankEnemy({ name: n, creatureId: def.srd, revealed }));
}

/** Its AC as the app may use it: what you've been told or worked out, or its stat block's once revealed. */
export function knownAc(e: Enemy, creatures: CreatureDef[] = []): number | null {
  if (e.ac !== null) return e.ac;
  if (e.revealed && e.creatureId) return creatures.find((c) => c.srd === e.creatureId)?.ac ?? null;
  return null;
}

/** Its HP maximum as the app may use it (yours, or the revealed stat block's). */
export function knownMaxHp(e: Enemy, creatures: CreatureDef[] = []): number | null {
  if (e.maxHp !== null) return e.maxHp;
  if (e.revealed && e.creatureId) return creatures.find((c) => c.srd === e.creatureId)?.hp ?? null;
  return null;
}

/** "AC 13", "AC 15–17", "AC 15+", "AC ≤17" or "AC ?". */
export function acText(e: Enemy, creatures: CreatureDef[] = []): string {
  const ac = knownAc(e, creatures);
  if (ac !== null) return `AC ${ac}`;
  const lo = e.acAtLeast;
  const hi = e.acAtMost;
  if (lo !== null && hi !== null) return lo === hi ? `AC ${lo}` : `AC ${lo}–${hi}`;
  if (lo !== null) return `AC ${lo}+`;
  if (hi !== null) return `AC ≤${hi}`;
  return 'AC ?';
}

/**
 * What a hit or miss says about an unknown AC: a total that hits means AC ≤ total, one that
 * misses means AC ≥ total + 1. Natural 20s and 1s hit or miss whatever the AC, so they say
 * nothing. When the range closes, the AC is known.
 */
export function learnAc(e: Enemy, total: number, hit: boolean, nat?: number): void {
  if (e.ac !== null || nat === 20 || nat === 1) return;
  if (hit) e.acAtMost = e.acAtMost === null ? total : Math.min(e.acAtMost, total);
  else e.acAtLeast = e.acAtLeast === null ? total + 1 : Math.max(e.acAtLeast, total + 1);
  if (e.acAtLeast !== null && e.acAtMost !== null && e.acAtLeast >= e.acAtMost) e.ac = e.acAtMost;
}

/** Whether you're within 5 feet of it for this attack: as set on the enemy, else melee yes, ranged no. */
export const isNear = (e: Enemy, ranged: boolean) => e.near ?? !ranged;

/** How the enemy's conditions change an attack roll against it. */
export function attackAgainst(e: Enemy, ranged: boolean): { adv: string[]; dis: string[]; autoCrit: string | null } {
  const has = (id: ConditionId) => e.conditions.includes(id);
  const near = isNear(e, ranged);
  const adv: string[] = [];
  const dis: string[] = [];
  for (const id of ['blinded', 'paralyzed', 'petrified', 'restrained', 'stunned', 'unconscious'] as ConditionId[]) if (has(id)) adv.push(`it's ${conditionName(id)}`);
  if (has('prone')) (near ? adv : dis).push(`it's Prone${near ? ' (within 5 ft)' : ' (beyond 5 ft)'}`);
  if (has('invisible')) dis.push("it's Invisible");
  const autoCrit = near && (has('paralyzed') || has('unconscious')) ? `${has('paralyzed') ? 'Paralyzed' : 'Unconscious'} within 5 ft: a hit is a critical hit` : null;
  return { adv, dis, autoCrit };
}

/** Whether it automatically fails a saving throw (Paralyzed, Petrified, Stunned and Unconscious fail STR and DEX saves). */
export function autoFailsSave(e: Enemy, ability: Ability): string | null {
  if (ability !== 'str' && ability !== 'dex') return null;
  const by = (['paralyzed', 'petrified', 'stunned', 'unconscious'] as ConditionId[]).find((id) => e.conditions.includes(id));
  return by ? `${conditionName(by)}: it fails ${ability.toUpperCase()} saves` : null;
}

/** Damage after its resistances, immunities and vulnerabilities (Petrified resists everything). */
export function damageTo(e: Enemy, amount: number, type: string): { amount: number; note: string } {
  const t = type.toLowerCase();
  if (e.immune.includes(t)) return { amount: 0, note: `immune to ${t}` };
  let n = amount;
  const notes: string[] = [];
  const resists = e.resist.includes(t) || e.conditions.includes('petrified');
  if (resists) {
    n = Math.floor(n / 2);
    notes.push(e.resist.includes(t) ? `resists ${t}: halved` : 'Petrified: resists all damage, halved');
  }
  if (e.vulnerable.includes(t)) {
    n *= 2;
    notes.push(`vulnerable to ${t}: doubled`);
  }
  return { amount: n, note: notes.join(', ') };
}

/** Records damage on an enemy (after its resistances). Returns what it actually took. */
export function hurt(e: Enemy, hit: Omit<EnemyHit, 'id' | 'time' | 'amount'> & { amount: number }): { amount: number; note: string } {
  const r = damageTo(e, Math.max(0, hit.amount), hit.type);
  e.hits.push({ ...hit, amount: r.amount, id: uid(), time: Date.now() });
  return r;
}

/** Damage taken, by whom: you, each companion, each party member, and the total. */
export function tally(e: Enemy): { you: number; companions: [string, number][]; party: [string, number][]; total: number } {
  const by = (who: EnemyHit['who']) => {
    const m = new Map<string, number>();
    for (const h of e.hits) if (h.who === who) m.set(h.name || 'Party', (m.get(h.name || 'Party') ?? 0) + h.amount);
    return [...m.entries()];
  };
  const you = e.hits.filter((h) => h.who === 'you').reduce((a, h) => a + h.amount, 0);
  return { you, companions: by('companion'), party: by('party'), total: e.hits.reduce((a, h) => a + h.amount, 0) };
}

/** How hurt it is: from its HP when known (Bloodied at half or less), else as you set it. */
export function statusOf(e: Enemy, creatures: CreatureDef[] = []): EnemyStatus {
  const max = knownMaxHp(e, creatures);
  if (max === null || max <= 0) return e.status;
  const left = max - tally(e).total;
  return left <= 0 ? 'down' : left <= max / 4 ? 'badly' : left <= max / 2 ? 'bloodied' : 'healthy';
}

export const STATUS_NAMES: Record<EnemyStatus, string> = { healthy: 'Healthy', bloodied: 'Bloodied', badly: 'Badly hurt', down: 'Down' };

/**
 * A spell that marks its target for extra damage on your hits ("you deal an extra 1d6 Force
 * damage to the target whenever you hit it with an attack roll": Hunter's Mark, Hex).
 */
export function markFromSpell(s: Pick<Spell, 'name' | 'description' | 'concentration'>): Omit<EnemyMark, 'id'> | null {
  const m = /extra (\d+d\d+) (\w+) damage to (?:the |that )?(?:cursed |marked )?(?:target|creature)\b[^.]*\bwhenever you hit it\b/i.exec(s.description.replace(/\s+/g, ' '));
  if (!m) return null;
  return { name: s.name, dice: m[1], type: m[2].toLowerCase(), spell: s.concentration ? s.name : '' };
}

/** The extra damage your marks on this enemy add to a hit with an attack roll. */
export const markDamage = (e: Enemy) => e.marks.filter((m) => m.dice.trim());

/** The Constitution save to keep concentrating after taking damage: DC 10 or half the damage, up to 30. */
export const concentrationDc = (damage: number) => Math.min(30, Math.max(10, Math.floor(damage / 2)));

/**
 * Ends your concentration, and with it the marks that spell put on enemies. Returns the
 * spell that ended, or null if you weren't concentrating.
 */
export function endConcentration(d: Character): string | null {
  const spell = d.spellcasting.concentratingOn;
  if (!spell) return null;
  d.spellcasting.concentratingOn = null;
  for (const e of d.enemies) e.marks = e.marks.filter((m) => m.spell !== spell);
  return spell;
}

/** The enemy your attacks go at, if it's still on the field. */
export const targetOf = (c: Pick<Character, 'enemies' | 'targetId'>): Enemy | null => c.enemies.find((e) => e.id === c.targetId) ?? null;

/** A short line for an enemy: "AC 13 · Bloodied · Prone · Hunter's Mark". */
export function enemySummary(e: Enemy, creatures: CreatureDef[] = []): string {
  return [acText(e, creatures), STATUS_NAMES[statusOf(e, creatures)], ...e.conditions.map(conditionName), ...e.marks.map((m) => m.name)].join(' · ');
}

// ── Initiative ───────────────────────────────────────────────────────────────

/**
 * The order of a fight from everyone's initiative: highest first. Your companions go right
 * after you (as class companions do), whatever their own number. Ties keep the order given.
 */
export function startFight(c: Pick<Character, 'name' | 'companions' | 'enemies'>, mine: number, others: { enemies: Record<string, number>; allies: [string, number][] }): Fight {
  const you: FightEntry = { id: uid(), kind: 'you', ref: '', name: c.name || 'You', initiative: mine };
  const rest: FightEntry[] = [
    ...c.enemies.filter((e) => others.enemies[e.id] !== undefined).map((e) => ({ id: uid(), kind: 'enemy' as const, ref: e.id, name: e.name, initiative: others.enemies[e.id] })),
    ...others.allies.map(([name, n]) => ({ id: uid(), kind: 'ally' as const, ref: '', name, initiative: n })),
  ];
  const sorted = [you, ...rest].map((x, i) => ({ x, i })).sort((a, b) => b.x.initiative - a.x.initiative || a.i - b.i).map(({ x }) => x);
  const at = sorted.indexOf(you);
  const companions = c.companions.map((k) => ({ id: uid(), kind: 'companion' as const, ref: k.id, name: k.name, initiative: mine }));
  sorted.splice(at + 1, 0, ...companions);
  return { round: 1, turn: 0, order: sorted };
}

/** Whether a place in the order is skipped: an enemy that's down or no longer on the field. */
export function skipped(x: FightEntry, enemies: Enemy[], creatures: CreatureDef[] = []): boolean {
  if (x.kind !== 'enemy') return false;
  const e = enemies.find((y) => y.id === x.ref);
  return !e || statusOf(e, creatures) === 'down';
}

/** The next turn: on down the list, skipping enemies that are down, and round by round. */
export function nextTurn(f: Fight, enemies: Enemy[], creatures: CreatureDef[] = []): { fight: Fight; newRound: boolean } {
  let { turn, round } = f;
  let newRound = false;
  for (let step = 0; step < f.order.length; step++) {
    turn += 1;
    if (turn >= f.order.length) {
      turn = 0;
      round += 1;
      newRound = true;
    }
    if (!skipped(f.order[turn], enemies, creatures)) break;
  }
  return { fight: { ...f, turn, round }, newRound };
}
