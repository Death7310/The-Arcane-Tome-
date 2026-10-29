import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// Build modes:
//   (default)       dist/       installable offline web app (service worker + manifest)
//   --mode single   dist-single/ one self-contained index.html that runs from disk, no server
//   --mode native   dist-native/ the files packed into the Android app (see capacitor.config.json)
const theme = '#15131b';
const define = { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_TIME__: JSON.stringify(new Date().toISOString()) };

const homeScreenTags = (): Plugin => ({
  name: 'home-screen-tags',
  transformIndexHtml: () => [
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: 'icons/apple-touch-icon.png' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }, injectTo: 'head' },
  ],
});

export default defineConfig(({ mode }) => {
  if (mode === 'single' || mode === 'native') {
    // No service worker: the single file runs from disk, and the Android app ships its files inside the APK.
    return {
      base: './',
      define,
      publicDir: false,
      plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
      resolve: { alias: { 'virtual:pwa-register': '/src/state/pwa-stub.ts' } },
      build: { outDir: mode === 'single' ? 'dist-single' : 'dist-native' },
    };
  }
  return {
    base: './',
    define,
    plugins: [
      react(),
      homeScreenTags(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          name: 'Arcane Tome',
          short_name: 'Arcane Tome',
          description: 'Animated, auto-calculating D&D 5e character sheet with a built-in dice roller. Works offline.',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'any',
          background_color: theme,
          theme_color: theme,
          categories: ['games', 'entertainment', 'utilities'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'icons/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          // Everything the app needs is precached on first visit; nothing is fetched afterwards.
          globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          // Take control of the page that installed it, so the first visit can later receive updates.
          clientsClaim: true,
        },
      }),
    ],
    build: { outDir: 'dist' },
  };
});
