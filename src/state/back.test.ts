import { describe, expect, it } from 'vitest';
import { backDepth, goBack, onBack } from './back';

describe('the Back button', () => {
  it('closes the newest thing first, then the one under it, then reports nothing left', () => {
    const closed: string[] = [];
    const offPage = onBack(() => closed.push('page'));
    const offDialog = onBack(() => closed.push('dialog'));
    expect(goBack()).toBe(true);
    offDialog();
    expect(goBack()).toBe(true);
    offPage();
    expect(goBack()).toBe(false);
    expect(closed).toEqual(['dialog', 'page']);
    expect(backDepth()).toBe(0);
  });

  it('lets Escape close dialogs but not flip pages', () => {
    const closed: string[] = [];
    const offPage = onBack(() => closed.push('page'), 'page');
    expect(goBack(false)).toBe(false);
    const offDialog = onBack(() => closed.push('dialog'));
    expect(goBack(false)).toBe(true);
    offDialog();
    expect(goBack(true)).toBe(true);
    offPage();
    expect(closed).toEqual(['dialog', 'page']);
  });

  it('forgets a handler that unregisters out of order', () => {
    const a = onBack(() => {});
    const b = onBack(() => {});
    a();
    expect(backDepth()).toBe(1);
    b();
    expect(backDepth()).toBe(0);
  });
});
