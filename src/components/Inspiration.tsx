// Heroic Inspiration: one slot you either have or don't (2024 rules). Tap to gain it when your
// DM awards it, tap again to spend it. Spending lets you reroll one die you just rolled; you
// must use the new roll.

import { useChar } from '../state/character';
import { useTable } from '../state/table';

export function InspirationSlot({ compact = false }: { compact?: boolean }) {
  const { char: c, update } = useChar();
  const t = useTable();
  const has = c.heroicInspiration;
  return (
    <button
      type="button"
      className={['stat', 'inspiration', has && 'has', compact && 'compact'].filter(Boolean).join(' ')}
      aria-pressed={has}
      aria-label={has ? 'Heroic Inspiration: you have it. Tap to spend it.' : 'Heroic Inspiration: none. Tap when you gain it.'}
      title={has ? 'Spend it to reroll one die you just rolled (you use the new roll).' : 'Tap when your DM awards it, or a feature gives it to you.'}
      onClick={() => {
        update((d) => void (d.heroicInspiration = !has));
        if (has) t.note('Heroic Inspiration spent', 'Reroll one die you just rolled, and use the new roll.');
      }}
    >
      <span className="v" aria-hidden="true">
        {has ? '★' : '☆'}
      </span>
      <span className="k">{has ? 'Inspiration · tap to spend' : 'Inspiration · none'}</span>
    </button>
  );
}
