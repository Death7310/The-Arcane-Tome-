// node --test desktop/updater-checks.cjs  (named so Vitest doesn't pick it up; CI also runs SWAP_SCRIPT for real on macOS)
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { bundlePath, canReplace, download, SWAP_SCRIPT } = require('./updater.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'updater-test-'));

test('finds the app bundle and whether it can replace itself', () => {
  assert.equal(bundlePath('/Applications/Arcane Tome.app/Contents/MacOS/Arcane Tome'), '/Applications/Arcane Tome.app');
  assert.equal(bundlePath('/usr/lib/electron/electron'), null);
  const ok = () => {};
  const no = () => {
    throw new Error('EACCES');
  };
  assert.deepEqual(canReplace('/Applications/Arcane Tome.app/Contents/MacOS/Arcane Tome', 'darwin', ok), { ok: true, app: '/Applications/Arcane Tome.app' });
  assert.match(canReplace('/Applications/Arcane Tome.app/Contents/MacOS/Arcane Tome', 'darwin', no).why, /can’t change \/Applications/);
  assert.match(canReplace('/private/var/folders/x/AppTranslocation/1/d/Arcane Tome.app/Contents/MacOS/Arcane Tome', 'darwin', ok).why, /Applications/);
  assert.match(canReplace('/x/Arcane Tome.app/Contents/MacOS/Arcane Tome', 'linux', ok).why, /Mac only/);
});

test('downloads with progress and checks the SHA-256', async () => {
  const data = crypto.randomBytes(300_000);
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  const fetcher = async () => new Response(data, { headers: { 'content-length': String(data.length) } });
  const dir = tmp();
  const seen = [];
  const r = await download('https://x/a.dmg', path.join(dir, 'a.dmg'), { fetcher, sha256: sha, onProgress: (p) => seen.push(p) });
  assert.equal(r.bytes, data.length);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'a.dmg')), data);
  assert.deepEqual(seen.at(-1), { received: data.length, total: data.length });
  await assert.rejects(download('https://x/a.dmg', path.join(dir, 'b.dmg'), { fetcher, sha256: 'f'.repeat(64) }), /doesn’t match/);
  assert.equal(fs.existsSync(path.join(dir, 'b.dmg')), false);
  await assert.rejects(download('https://x/a.dmg', path.join(dir, 'c.dmg'), { fetcher: async () => new Response('no', { status: 404 }) }), /404/);
});

test('the swap script replaces the app from the DMG, or keeps the old one if the DMG is bad', () => {
  // Stand-ins for the macOS tools: "attaching" the DMG copies a folder to the mount point.
  const dir = tmp();
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const tool = (name, body) => fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  tool('hdiutil', 'if [ "$1" = attach ]; then eval last=\\${$#}; for a; do case "$prev" in -mountpoint) mp="$a";; esac; prev="$a"; done; [ -d "$last" ] || exit 1; cp -R "$last/." "$mp/"; fi; exit 0');
  tool('ditto', 'cp -R "$1" "$2"');
  tool('xattr', 'exit 0');
  tool('open', 'echo "opened $1" >> "$OPEN_LOG"');
  const script = path.join(dir, 'swap.sh');
  fs.writeFileSync(script, SWAP_SCRIPT);
  const apps = path.join(dir, 'Applications');
  const app = path.join(apps, 'Arcane Tome.app');
  fs.mkdirSync(path.join(app, 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'version'), 'old');
  // The "DMG" (a folder our hdiutil stand-in can attach) holding the new app.
  const dmg = path.join(dir, 'new.dmg');
  fs.mkdirSync(path.join(dmg, 'Arcane Tome.app', 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(dmg, 'Arcane Tome.app', 'Contents', 'version'), 'new');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: dir, OPEN_LOG: path.join(dir, 'open.log') };
  execFileSync('/bin/sh', [script, '999999', dmg, app], { env });
  assert.equal(fs.readFileSync(path.join(app, 'Contents', 'version'), 'utf8'), 'new');
  assert.deepEqual(fs.readdirSync(apps), ['Arcane Tome.app']); // no staging or previous copies left
  assert.match(fs.readFileSync(path.join(dir, 'open.log'), 'utf8'), /opened .*Arcane Tome\.app/);
  // A DMG that won't open: the app stays as it was and is reopened.
  assert.throws(() => execFileSync('/bin/sh', [script, '999999', path.join(dir, 'missing.dmg'), app], { env }));
  assert.equal(fs.readFileSync(path.join(app, 'Contents', 'version'), 'utf8'), 'new');
  assert.match(fs.readFileSync(path.join(dir, 'arcane-tome-update.log'), 'utf8'), /couldn't open the update/);
});
