// "App version" in Settings: which version this is, and a button to update to the latest.

import { useEffect, useState } from 'react';
import { applyUpdate, checkWebUpdate, usePwa } from '../state/pwa';
import { APP_BUILD, APP_FILE, APP_VERSION, KIND_NAME, SITE, appKind, isNewer, latestPublished, openOutside, type Published } from '../state/updates';

type Status = { kind: 'idle' } | { kind: 'checking' } | { kind: 'latest'; p?: Published } | { kind: 'available'; p: Published } | { kind: 'error'; message: string };

const HOW: Record<'android' | 'ios' | 'mac', string> = {
  android: 'When it has downloaded, open it and tap Update. Android installs it over this app and keeps all your characters.',
  ios: 'It downloads in Safari. Install it the way you installed this app (in AltStore: My Apps → +, then pick the file). With the same Apple ID it replaces this app and keeps your characters.',
  mac: 'It downloads in your browser. Open it, drag Arcane Tome onto Applications and choose Replace. Your characters stay.',
};

export function UpdateSection(props: { autoCheck?: boolean }) {
  const kind = appKind();
  const pwa = usePwa();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // The Mac app can replace itself in place (desktop/updater.cjs): whether this copy can, and how far along it is.
  const bridge = typeof window !== 'undefined' ? window.arcaneDesktop?.selfUpdate : undefined;
  const [self, setSelf] = useState<{ ok: boolean; why: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [selfMessage, setSelfMessage] = useState<{ text: string; good: boolean } | null>(null);
  useEffect(() => {
    if (!bridge) return;
    void bridge.available().then(setSelf).catch(() => setSelf({ ok: false, why: '' }));
    return bridge.onProgress((p) => setProgress(p.total ? Math.round((100 * p.received) / p.total) : null));
  }, [bridge]);
  const selfUpdate = async () => {
    if (!bridge) return;
    setSelfMessage(null);
    setProgress(0);
    const r = await bridge.run().catch((e: Error) => ({ ok: false, message: e.message }));
    if (!r.ok) setProgress(null);
    setSelfMessage({ text: r.message, good: r.ok });
  };

  const check = async () => {
    setStatus({ kind: 'checking' });
    if (kind === 'web') {
      if (pwa.mode !== 'pwa') {
        setStatus({ kind: 'error', message: 'This single-file copy can’t update itself. Download the latest from the site, or use the website.' });
        return;
      }
      const ready = await checkWebUpdate();
      const p = await latestPublished().catch(() => undefined);
      // Either the service worker has the new files ready, or the site says a newer build is out
      // (Update now then fetches and switches to it).
      if (ready || (p && isNewer(p))) setStatus({ kind: 'available', p: p ?? { version: '', build: 0, date: '', files: [] } });
      else setStatus({ kind: 'latest', p });
      return;
    }
    try {
      const p = await latestPublished();
      setStatus(isNewer(p) ? { kind: 'available', p } : { kind: 'latest', p });
    } catch (e) {
      setStatus({ kind: 'error', message: `Couldn’t reach the site (${(e as Error).message}). Check your internet connection and try again.` });
    }
  };

  // Opening Settings in an app checks once by itself.
  useEffect(() => {
    if (props.autoCheck && kind !== 'web') void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const file = kind === 'web' ? null : APP_FILE[kind];
  const fileMissing = status.kind === 'available' && file && status.p.files.length > 0 && !status.p.files.includes(file);
  const newer = (p: Published) => `Version ${p.version}${p.build ? ` (build ${p.build})` : ''}${p.date ? `, published ${new Date(p.date).toLocaleDateString()}` : ''}`;
  return (
    <>
      <h3 style={{ margin: 0 }}>App version</h3>
      <p className="hint" style={{ margin: 0 }}>
        Arcane Tome {APP_VERSION}
        {APP_BUILD ? ` (build ${APP_BUILD})` : ' (a local build)'} · the {KIND_NAME[kind]}
      </p>
      <div className="row" style={{ alignItems: 'center' }}>
        {(pwa.needRefresh && kind === 'web') || (status.kind === 'available' && kind === 'web') ? (
          <button type="button" className="btn primary" onClick={applyUpdate}>
            Update now
          </button>
        ) : status.kind === 'available' && kind === 'mac' && self?.ok && !fileMissing && selfMessage?.good !== true ? (
          <button type="button" className="btn primary" disabled={progress !== null} onClick={() => void selfUpdate()}>
            {progress === null ? 'Update and restart' : `Downloading… ${progress}%`}
          </button>
        ) : status.kind === 'available' && file && !fileMissing ? (
          <button type="button" className="btn primary" onClick={() => openOutside(`${SITE}${file}`)}>
            Download the update
          </button>
        ) : (
          <button type="button" className="btn" disabled={status.kind === 'checking'} onClick={() => void check()}>
            {status.kind === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        )}
        <span className="hint" role="status">
          {status.kind === 'latest' && `You have the latest version${status.p ? ` (${status.p.version}, build ${status.p.build})` : ''}.`}
          {status.kind === 'available' && kind === 'web' && `A new version is ready${status.p.version ? `: ${newer(status.p)}` : ''}. Update now switches to it; your characters stay.`}
          {status.kind === 'available' && kind !== 'web' && !fileMissing && `${newer(status.p)} is out.`}
          {status.kind === 'available' && fileMissing && `${newer(status.p)} is out, but its ${KIND_NAME[kind]} isn’t on the site yet. Try again later.`}
          {status.kind === 'error' && status.message}
        </span>
      </div>
      {progress !== null && (
        <div className="points-bar" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      {selfMessage && (
        <p className="hint" role="alert" style={{ margin: 0, color: selfMessage.good ? 'var(--good)' : 'var(--bad)' }}>
          {selfMessage.text}
        </p>
      )}
      {status.kind === 'available' && file && !fileMissing && kind !== 'web' && (
        <p className="hint" style={{ margin: 0 }}>
          {kind === 'mac' && self?.ok
            ? 'Update and restart downloads it, checks it’s the published file, then Arcane Tome closes, replaces itself in Applications and opens again on the new version. Your characters stay.'
            : HOW[kind]}
          {kind === 'mac' && self && !self.ok && self.why ? ` (${self.why})` : ''} If you want a copy first, use Save a backup below.
        </p>
      )}
    </>
  );
}
