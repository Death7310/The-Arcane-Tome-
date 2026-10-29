import type { DamageType } from '../systems/dnd5e/data';

/** Visual + audio "flavour" of an effect. Damage types map 1:1; the rest cover non-damaging magic and actions. */
export type Element = DamageType | 'healing' | 'arcane' | 'shadow' | 'nature';

/** How an effect travels across the page. */
export type Shape =
  | 'bolt' // projectile from you to the target, then an impact
  | 'ray' // instant beam
  | 'burst' // explosion at the target point (Fireball)
  | 'cone' // fans out from you (Burning Hands)
  | 'line' // a beam across the whole page (Lightning Bolt)
  | 'rain' // falls from the top of the page onto the target (Sacred Flame, Ice Storm)
  | 'aura' // swirls around you (Shield, Spirit Guardians, healing yourself)
  | 'touch'; // erupts right where you are (Shocking Grasp, melee hits)

export type ActionMotion = 'move' | 'dash' | 'dodge' | 'disengage' | 'hide' | 'help' | 'search' | 'generic';

export const ELEMENTS: { id: Element; name: string }[] = [
  { id: 'fire', name: 'Fire' },
  { id: 'cold', name: 'Cold' },
  { id: 'lightning', name: 'Lightning' },
  { id: 'thunder', name: 'Thunder' },
  { id: 'acid', name: 'Acid' },
  { id: 'poison', name: 'Poison' },
  { id: 'necrotic', name: 'Necrotic' },
  { id: 'radiant', name: 'Radiant' },
  { id: 'force', name: 'Force' },
  { id: 'psychic', name: 'Psychic' },
  { id: 'slashing', name: 'Slashing' },
  { id: 'piercing', name: 'Piercing' },
  { id: 'bludgeoning', name: 'Bludgeoning' },
  { id: 'healing', name: 'Healing' },
  { id: 'arcane', name: 'Arcane' },
  { id: 'shadow', name: 'Shadow' },
  { id: 'nature', name: 'Nature' },
];

export const SHAPES: { id: Shape; name: string }[] = [
  { id: 'bolt', name: 'Bolt (projectile)' },
  { id: 'ray', name: 'Ray (beam)' },
  { id: 'burst', name: 'Burst (explosion)' },
  { id: 'cone', name: 'Cone' },
  { id: 'line', name: 'Line' },
  { id: 'rain', name: 'From above' },
  { id: 'aura', name: 'Aura (around you)' },
  { id: 'touch', name: 'Touch' },
];

export type Outcome = 'hit' | 'miss' | 'crit' | 'none';

export interface Point {
  x: number;
  y: number;
}

export interface EffectRequest {
  element: Element;
  shape: Shape;
  from: Point;
  to?: Point;
  /** 0 (cantrip) … 9 (9th-level slot). Scales size, duration and loudness. */
  power: number;
  outcome?: Outcome;
  /** Floating text at the target, e.g. "14 fire" or "MISS". */
  label?: string;
  delayMs?: number;
}

export type FxLevel = 'full' | 'reduced' | 'off';
