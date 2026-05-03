// TEST-AUTH-070 helper — render a component inside the standard providers
// (Router, Toaster). Components don't have global state today; if Profiles
// adds a context provider, wrap it here.

import type { ReactElement } from 'react';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
