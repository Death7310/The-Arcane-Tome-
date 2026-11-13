// Updating the Mac app from inside it, without a paid Apple signing certificate (which
// macOS's own auto-update framework requires).
//
// The app downloads the new DMG itself (a file the app writes isn't marked as downloaded from
// the internet, so macOS doesn't stop the new app from opening), checks it against the SHA-256
// the site publishes, then quits and hands over to SWAP_SCRIPT. That waits for the app to
// close, opens the DMG, copies the new app next to the old one, swaps them (putting the old one
// back if anything fails), and reopens the app. CI runs the script on a real Mac.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SITE = 'https://death7310.github.io/The-Arcane-Tome-/';
const DMG_URL = `${SITE}arcane-tome-mac.dmg`;
const VERSION_URL = `${SITE}version.json`;

/** The .app bundle an executable is inside, or null (e.g. running from source). */
function bundlePath(execPath) {
  const m = /^(.*?\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath);
  return m ? m[1] : null;
}

/** Whether this copy can replace itself, and if not, why (in words for the person). */
function canReplace(execPath, platform = process.platform, access = fs.accessSync) {
  if (platform !== 'darwin') return { ok: false, why: 'Updating from inside the app works on a Mac only.' };
  const app = bundlePath(execPath);
  if (!app) return { ok: false, why: 'This copy isn’t running as an installed app.' };
  if (app.includes('/AppTranslocation/'))
    return { ok: false, why: 'macOS is running this copy from a temporary place. Drag Arcane Tome into Applications, open it from there, and try again.' };
  try {
    access(path.dirname(app), fs.constants.W_OK);
    access(app, fs.constants.W_OK);
  } catch {
    return { ok: false, why: `This Mac account can’t change ${path.dirname(app)}. Use Download the update instead, or update from an administrator account.` };
  }
  return { ok: true, app };
}

/**
 * Downloads `url` to `dest`, reporting progress, and checks its SHA-256 when one is given.
 * `fetcher` is Electron's net.fetch in the app (anything fetch-like in tests).
 */
async function download(url, dest, { fetcher, sha256, onProgress } = {}) {
  const res = await fetcher(url, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`the site answered ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(dest);
  let received = 0;
  let last = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.length;
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      const now = Date.now();
      if (onProgress && now - last > 200) {
        last = now;
        onProgress({ received, total });
      }
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  onProgress?.({ received, total: total || received });
  const digest = hash.digest('hex');
  if (sha256 && digest !== sha256.toLowerCase()) {
    fs.rmSync(dest, { force: true });
    throw new Error('the download doesn’t match the published file (it may have been cut off); try again');
  }
  return { bytes: received, sha256: digest };
}

/** Run as: sh swap.sh <pid of the app> <path to the new DMG> <path to the installed .app>. Set NO_OPEN=1 not to reopen it. */
const SWAP_SCRIPT = `#!/bin/sh
# Arcane Tome's updater: waits for the app to close, swaps in the app from the new DMG, reopens it.
pid="$1"; dmg="$2"; app="$3"
exec >>"\${TMPDIR:-/tmp}/arcane-tome-update.log" 2>&1
echo "$(date): updating $app from $dmg"
i=0
while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 600 ]; do sleep 0.2; i=$((i + 1)); done
reopen() { [ -n "$NO_OPEN" ] || open "$app"; }
mnt=$(mktemp -d "\${TMPDIR:-/tmp}/arcane-tome-dmg.XXXXXX") || { reopen; exit 1; }
if ! hdiutil attach -nobrowse -noautoopen -quiet -mountpoint "$mnt" "$dmg"; then
  echo "couldn't open the update"; rmdir "$mnt"; reopen; exit 1
fi
new="$mnt/Arcane Tome.app"
dir=$(dirname "$app")
stage="$dir/.Arcane Tome (updating).app"
old="$dir/.Arcane Tome (previous).app"
rm -rf "$stage" "$old"
ok=0
if [ -d "$new" ] && ditto "$new" "$stage"; then
  if mv "$app" "$old"; then
    if mv "$stage" "$app"; then ok=1; rm -rf "$old"; else mv "$old" "$app"; fi
  fi
fi
rm -rf "$stage"
hdiutil detach -quiet "$mnt" || hdiutil detach -force -quiet "$mnt"
rmdir "$mnt" 2>/dev/null
xattr -dr com.apple.quarantine "$app" 2>/dev/null
if [ "$ok" = 1 ]; then echo "updated"; rm -f "$dmg"; else echo "update failed; kept the old app"; fi
reopen
[ "$ok" = 1 ]
`;

module.exports = { SITE, DMG_URL, VERSION_URL, bundlePath, canReplace, download, SWAP_SCRIPT };
