import { createContext, useContext } from 'react';
import type { Character } from '../systems/dnd5e/model';

export interface CharacterApi {
  char: Character;
  /** Mutate a copy of the character; the sheet re-renders and autosaves. */
  update: (fn: (c: Character) => void) => void;
}

export const CharacterContext = createContext<CharacterApi | null>(null);

export function useChar(): CharacterApi {
  const c = useContext(CharacterContext);
  if (!c) throw new Error('useChar outside CharacterContext');
  return c;
}
