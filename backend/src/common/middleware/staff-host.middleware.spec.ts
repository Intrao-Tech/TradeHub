// TEST-AUTH-023 — StaffHostMiddleware unit tests.
// Source: backend/src/common/middleware/staff-host.middleware.ts
// Contract: AUTH-016-002 — accept request when EITHER request.Origin matches
// STAFF_FRONTEND_URL OR request.Host matches STAFF_LOGIN_HOST. Reject with 404.
// Decisions Log 2026-04-26 ("Staff host gate uses Origin OR Host"): the
// SPA-on-internal-host posting to api-on-localhost only carries the Origin
// header — the Host header is the API hostname, not the SPA's.

import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { StaffHostMiddleware } from './staff-host.middleware';

function buildMiddleware(env: {
  STAFF_LOGIN_HOST?: string;
  STAFF_FRONTEND_URL?: string;
}): StaffHostMiddleware {
  const config = {
    get: jest.fn((key: string) => env[key as keyof typeof env]),
  } as unknown as ConfigService;
  return new StaffHostMiddleware(config);
}

function req(headers: { origin?: string; host?: string }): Request {
  return { headers } as Request;
}

const next: NextFunction = jest.fn();

beforeEach(() => {
  (next as jest.Mock).mockReset();
});

describe('TEST-AUTH-023 StaffHostMiddleware — AUTH-016-002', () => {
  test('AUTH-016-002 — Origin header matches STAFF_FRONTEND_URL → passes', () => {
    const mw = buildMiddleware({
      STAFF_LOGIN_HOST: 'internal.tradehub.co.uk',
      STAFF_FRONTEND_URL: 'https://internal.tradehub.co.uk',
    });
    expect(() =>
      mw.use(
        req({ origin: 'https://internal.tradehub.co.uk', host: 'api.localhost:8081' }),
        {} as Response,
        next,
      ),
    ).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('AUTH-016-002 — Host header matches STAFF_LOGIN_HOST (curl path / no Origin) → passes', () => {
    const mw = buildMiddleware({
      STAFF_LOGIN_HOST: 'internal.localhost',
      STAFF_FRONTEND_URL: 'http://internal.localhost:3000',
    });
    expect(() =>
      mw.use(
        req({ host: 'internal.localhost:8081' }),
        {} as Response,
        next,
      ),
    ).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('AUTH-016-002 — neither Origin nor Host matches → throws NotFoundException (404)', () => {
    const mw = buildMiddleware({
      STAFF_LOGIN_HOST: 'internal.localhost',
      STAFF_FRONTEND_URL: 'http://internal.localhost:3000',
    });
    expect(() =>
      mw.use(
        req({ origin: 'http://app.localhost:3000', host: 'localhost:8081' }),
        {} as Response,
        next,
      ),
    ).toThrow(NotFoundException);
    expect(next).not.toHaveBeenCalled();
  });

  test('AUTH-016-002 — dev defaults (internal.localhost) work without explicit env (when env is set to defaults)', () => {
    // The middleware reads ConfigService at construction; we simulate the
    // dev .env defaults from contract §7 here.
    const mw = buildMiddleware({
      STAFF_LOGIN_HOST: 'internal.localhost',
      STAFF_FRONTEND_URL: 'http://internal.localhost:3000',
    });
    expect(() =>
      mw.use(
        req({
          origin: 'http://internal.localhost:3000',
          host: 'localhost:8081',
        }),
        {} as Response,
        next,
      ),
    ).not.toThrow();
  });

  test('AUTH-016-002 — port suffix on Host header is stripped before comparison', () => {
    const mw = buildMiddleware({
      STAFF_LOGIN_HOST: 'internal.localhost',
      STAFF_FRONTEND_URL: '',
    });
    expect(() =>
      mw.use(
        req({ host: 'internal.localhost:8081' }),
        {} as Response,
        next,
      ),
    ).not.toThrow();
  });

  test('AUTH-016-002 — Origin comparison is case-insensitive', () => {
    const mw = buildMiddleware({
      STAFF_FRONTEND_URL: 'https://internal.tradehub.co.uk',
      STAFF_LOGIN_HOST: 'internal.tradehub.co.uk',
    });
    expect(() =>
      mw.use(
        req({ origin: 'HTTPS://INTERNAL.TRADEHUB.CO.UK' }),
        {} as Response,
        next,
      ),
    ).not.toThrow();
  });

  test('AUTH-016-002 — both env values empty → debug-only no-op (always passes)', () => {
    const mw = buildMiddleware({
      STAFF_LOGIN_HOST: '',
      STAFF_FRONTEND_URL: '',
    });
    expect(() =>
      mw.use(
        req({ origin: 'http://anything.com', host: 'whatever' }),
        {} as Response,
        next,
      ),
    ).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
