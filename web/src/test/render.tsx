// TEST-AUTH-070 / TEST-PROF-003 — render helper for component tests.
//
// `renderWithRouter` is the auth-flow original (single MemoryRouter wrapper).
// `renderWithProfile` adds the Profiles-side providers per TEST-PROF-003:
//   - <BrowserRouter> / <MemoryRouter> route tree
//   - Sonner <Toaster /> so toast() calls don't blow up
//   - a default `useAccountMe` MSW response (overridable per test)
//
// Both keep `* from '@testing-library/react'` for ergonomic destructuring.

import type { ReactElement } from 'react';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { http, HttpResponse } from 'msw';
import { server } from './msw-server';
import { mockAccountMe } from './factories';

const API = 'http://localhost:8081/api';

export function renderWithRouter(
  ui: ReactElement,
  {
    route = '/',
    ...options
  }: { route?: string } & Omit<RenderOptions, 'wrapper'> = {},
) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    ),
    ...options,
  });
}

type ProfileRenderOptions = {
  /** initial route — defaults to `/profile` */
  route?: string;
  /**
   * Override `GET /account/me` for this render.  Pass `null` to short-
   * circuit the cache to a no-account state without registering a
   * handler (handlers in `handlers.ts` already return a default).  Pass
   * an object to install a per-test handler that returns the supplied
   * shape.
   */
  account?: ReturnType<typeof mockAccountMe> | null | undefined;
} & Omit<RenderOptions, 'wrapper'>;

export function renderWithProfile(
  ui: ReactElement,
  { route = '/profile', account, ...options }: ProfileRenderOptions = {},
) {
  if (account !== undefined) {
    server.use(
      http.get(`${API}/account/me`, () =>
        account === null
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json(account),
      ),
    );
  }
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>
        {children}
        <Toaster />
      </MemoryRouter>
    ),
    ...options,
  });
}

export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
