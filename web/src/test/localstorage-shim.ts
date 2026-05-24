// Side-effect-only module: install an in-memory `localStorage` shim BEFORE
// any other module (in particular `@/api`) imports it at top level. Must be
// the FIRST import in `setup.ts` — ES-module imports execute in source
// order, so any later import gets the shimmed `localStorage`.
//
// Why this exists: Node 22+ ships a native `localStorage` (gated behind
// --localstorage-file). When jsdom boots inside vitest, the two collide and
// leave a partial object where `localStorage.clear` / `.getItem` are
// undefined. `api.ts` reads `localStorage.getItem('access_token')` at module
// load time, so if the shim is installed in the body of `setup.ts` (after
// the imports have already executed) it's too late — `api.ts` has already
// crashed. Extracting the shim into its own file fixes the ordering.

if (typeof globalThis !== 'undefined') {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    key: (i: number): string | null => Array.from(store.keys())[i] ?? null,
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: shim,
      writable: true,
      configurable: true,
    });
  }
}
