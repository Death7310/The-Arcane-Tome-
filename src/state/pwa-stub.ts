// Stand-in for vite-plugin-pwa's registerSW in the single-file build, which runs from
// disk where service workers are unavailable. Everything still works; it just isn't installable.
export function registerSW(): (reload?: boolean) => Promise<void> {
  return async () => {};
}
