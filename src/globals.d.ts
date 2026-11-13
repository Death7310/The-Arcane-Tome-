declare const __APP_VERSION__: string;
/** CI's run number for this build ("0" for a local build). */
declare const __APP_BUILD__: string;
declare const __BUILD_TIME__: string;
declare module 'pdfjs-dist/build/pdf.worker.min.mjs';

/** The Mac app's bridge to itself (desktop/preload.cjs); absent everywhere else. */
interface Window {
  arcaneDesktop?: {
    selfUpdate: {
      available(): Promise<{ ok: boolean; why: string }>;
      run(): Promise<{ ok: boolean; message: string }>;
      onProgress(cb: (p: { received: number; total: number }) => void): () => void;
    };
  };
}
