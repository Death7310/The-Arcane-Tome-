import { describe, expect, it } from 'vitest';
import { isNewer, latestPublished, readPublished } from './updates';

describe('checking for a newer app', () => {
  it('reads the site’s version file and compares build numbers', () => {
    const p = readPublished({ version: '0.5.0', build: 61, date: '2026-11-13T18:00:00Z', files: ['arcane-tome.apk', 7] });
    expect(p).toEqual({ version: '0.5.0', build: 61, date: '2026-11-13T18:00:00Z', files: ['arcane-tome.apk'] });
    expect(isNewer(p, 60)).toBe(true);
    expect(isNewer(p, 61)).toBe(false);
    // A local build (0) is older than anything published.
    expect(isNewer(p, 0)).toBe(true);
    expect(() => readPublished({ version: '0.5.0' })).toThrow(/unreadable/);
    expect(() => readPublished('<html>')).toThrow(/unreadable/);
  });

  it('asks the site without a cache, and reports a failed answer', async () => {
    const asked: string[] = [];
    const ok = (async (url: string) => (asked.push(url), new Response(JSON.stringify({ version: '0.5.0', build: 3, files: [] })))) as unknown as typeof fetch;
    expect((await latestPublished(ok)).build).toBe(3);
    expect(asked[0]).toMatch(/^https:\/\/death7310\.github\.io\/The-Arcane-Tome-\/version\.json\?t=\d+$/);
    const missing = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    await expect(latestPublished(missing)).rejects.toThrow(/404/);
  });
});
