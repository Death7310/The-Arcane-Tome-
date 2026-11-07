import { describe, expect, it } from 'vitest';
import { neighbour, swipeDir } from './swipe';

describe('sliding between pages', () => {
  const order = ['stats', 'combat', 'magic', 'dice'];

  it('goes to the next page for a swipe left and the previous for a swipe right, stopping at the ends', () => {
    expect(neighbour(order, 'combat', 1)).toBe('magic');
    expect(neighbour(order, 'combat', -1)).toBe('stats');
    expect(neighbour(order, 'stats', -1)).toBeNull();
    expect(neighbour(order, 'dice', 1)).toBeNull();
    expect(neighbour(order, 'gone', 1)).toBe('stats');
  });

  it('counts only quick, mostly sideways movements as swipes', () => {
    expect(swipeDir(-120, 10, 250)).toBe(1);
    expect(swipeDir(140, -20, 300)).toBe(-1);
    // Too short, too slanted (a scroll), or too slow.
    expect(swipeDir(-40, 0, 200)).toBe(0);
    expect(swipeDir(-100, 90, 200)).toBe(0);
    expect(swipeDir(-200, 0, 2000)).toBe(0);
  });
});
