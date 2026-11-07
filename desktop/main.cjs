// The Mac app: the same sheet as the website and the Android/iPad apps, in its own window.
// The web build (../dist-native, copied into ./app at build time) is served from inside the
// app over an app:// address, so it runs fully offline and keeps its saves (browser storage
// for that address) in ~/Library/Application Support/Arcane Tome.
//
// `--smoke-test` opens the sheet, checks it drew and can save, prints the result and quits;
// CI runs that on the finished app.

const { app, BrowserWindow, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'app');
const HOME = 'app://arcane-tome/index.html';
const SMOKE = process.argv.includes('--smoke-test');

// A standard, secure scheme gets its own storage (localStorage, IndexedDB) and module scripts.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();

function serveFiles() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return new Response('Not found', { status: 404 });
    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function openExternally(url) {
  if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 360,
    minHeight: 480,
    title: 'Arcane Tome',
    backgroundColor: '#15131b',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  // Links to websites (the install guide, rules pages) open in the person's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('app://arcane-tome/')) return;
    event.preventDefault();
    openExternally(url);
  });
  if (SMOKE) smokeTest(win);
  void win.loadURL(HOME);
  return win;
}

function smokeTest(win) {
  const errors = [];
  const finish = (result) => {
    console.log(`smoke-test ${JSON.stringify({ ...result, errors })}`);
    app.exit(result.ok && errors.length === 0 ? 0 : 1);
  };
  setTimeout(() => finish({ ok: false, reason: 'timed out' }), 60_000);
  // Electron 35+ passes one event object; older versions pass (event, level, message).
  win.webContents.on('console-message', (event, level, message) => {
    const lvl = event.level ?? level;
    if (lvl === 'error' || lvl === 3) errors.push(String(event.message ?? message).slice(0, 300));
  });
  win.webContents.on('render-process-gone', (_e, details) => finish({ ok: false, reason: `renderer gone: ${details.reason}` }));
  win.webContents.once('did-fail-load', (_e, code, desc) => finish({ ok: false, reason: `load failed: ${code} ${desc}` }));
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const page = await win.webContents.executeJavaScript(`(async () => {
          localStorage.setItem('arcane-tome:smoke', '1');
          const idb = await new Promise((done) => {
            const r = indexedDB.open('arcane-tome-smoke');
            r.onsuccess = () => { r.result.close(); done(true); };
            r.onerror = () => done(false);
          });
          return {
            drew: !!document.querySelector('.masthead') && document.body.innerText.length > 200,
            saved: localStorage.getItem('arcane-tome:smoke') === '1',
            idb,
            title: document.title,
            tabs: document.querySelectorAll('[role=tab]').length,
          };
        })()`);
        finish({ ok: page.drew && page.saved && page.idb, ...page });
      } catch (e) {
        finish({ ok: false, reason: String(e) });
      }
    }, 3000);
  });
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  serveFiles();
  // "Save a backup file" asks where to save, starting in Documents.
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save your Arcane Tome backup', defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
  });
  createWindow();
  // Clicking the Dock icon with no window open brings the sheet back.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || SMOKE) app.quit();
});
