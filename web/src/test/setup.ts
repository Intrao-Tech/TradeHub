// TEST-AUTH-070 — vitest global setup. Wires up jest-dom matchers, MSW
// server (default handlers from ./handlers.ts), and resets module-state
// caches between tests (currently: useAccountMe — cleared by dispatching
// the `auth-changed` window event the hook already listens for, per
// TEST-AUTH-084).

import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw-server';

// Boot MSW with `error` so any unhandled fetch becomes a loud test failure
// instead of a silent network call (per Acceptance Criteria — "no real
// network requests escape").
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Clear localStorage between tests so api.ts module-state doesn't leak
  // tokens across cases.
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
