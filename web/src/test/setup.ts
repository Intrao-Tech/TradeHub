// TEST-AUTH-070 — vitest global setup. Wires up jest-dom matchers, MSW
// server (default handlers from ./handlers.ts), and resets module-state
// caches between tests (currently: useAccountMe — cleared by dispatching
// the `auth-changed` window event the hook already listens for, per
// TEST-AUTH-084).

// MUST be the first import — installs the in-memory `localStorage` shim as
// a side-effect, BEFORE any module that reads `localStorage` at top level
// (notably `@/api`, which caches the access/refresh tokens at module load).
import './localstorage-shim';
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { server } from './msw-server';
import { clearTokens } from '@/api';

// Swap the production i18n (HTTP backend + Suspense) for a synchronous test
// instance with the real English bundles inlined — see ./i18n.ts. Hoisted by
// Vitest and applied to every test file, so `useTranslation()` / formatMoney
// resolve without a network call or a <Suspense> boundary.
vi.mock('@/i18n', async () => await import('./i18n'));

// Eagerly initialise that instance for EVERY test file. The vi.mock above only
// runs its factory when a module imports `@/i18n`; a component that imports just
// `react-i18next` (e.g. NewCollaborationSheet, EditJobPage, MyJobsPage) would
// otherwise leave the i18next singleton un-init'd, so `useTranslation()` returns
// raw keys instead of the English copy. Importing the side-effecting init here
// guarantees the singleton is ready before any render.
import './i18n';

// Raise the async-util timeout used by `waitFor` / `findBy*`. The 1000ms
// default flakes when ~56 test files contend for a loaded machine — a
// re-render that normally lands in <100ms can slip past 1s under load.
configure({ asyncUtilTimeout: 5_000 });

// jsdom does not implement Pointer Events (needed by Radix Select / Dialog
// since Radix v1.x). Polyfill the no-op shims so tests that interact with
// `<Select>` triggers don't blow up — TEST-COLLAB-140 was the first test
// in the repo to drive a Radix Select with userEvent and surfaced this.
if (typeof window !== 'undefined') {
  if (!('PointerEvent' in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent =
      class extends MouseEvent {} as unknown as typeof MouseEvent;
  }
  const proto = Element.prototype as unknown as {
    hasPointerCapture?: () => boolean;
    setPointerCapture?: () => void;
    releasePointerCapture?: () => void;
    scrollIntoView?: () => void;
  };
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
}

// Boot MSW with `error` so any unhandled fetch becomes a loud test failure
// instead of a silent network call (per Acceptance Criteria — "no real
// network requests escape").
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // api.ts caches access/refresh in module-level `let` vars (initialised once
  // from localStorage). Clearing localStorage alone doesn't reset those — call
  // clearTokens() so the next test starts with a guest token state.
  clearTokens();
  localStorage.clear();
  // Reset the useAccountMe module cache without touching production code —
  // the hook already listens for this event (App.tsx dispatches it on
  // login / logout).
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth-changed'));
  }
  vi.clearAllMocks();
});

afterAll(() => server.close());
