// TEST-AUTH-070 — MSW v2 server bootstrapped with the default handler set.
// Per-test overrides happen via `server.use(...)`.

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
