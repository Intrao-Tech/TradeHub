// TEST-AUTH-025 — GlobalExceptionFilter regression guard.
//
// Decisions Log 2026-04-26 (Critical bug fix): the original filter stripped
// HttpException bodies down to `{ statusCode, message, timestamp }`, dropping
// `code`, `email`, `reasons`, etc. — silently breaking every typed error
// flow on the SPA. This spec asserts the FIX: structured object bodies are
// merged into the response so the SPA can read `code` and friends.

import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

function fakeHost() {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();
  const response = { status, json };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, response, status, json };
}

describe('TEST-AUTH-025 GlobalExceptionFilter — Decisions Log 2026-04-26 critical bug fix', () => {
  test('object body with `code`, `email`, `message` is preserved (NOT stripped) so SPA can read structured codes', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = fakeHost();

    const exc = new HttpException(
      {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address.',
        email: 'p@x.io',
        access_token: 'a',
        refresh_token: 'r',
      },
      403,
    );
    filter.catch(exc, host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledTimes(1);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(body.email).toBe('p@x.io');
    expect(body.message).toBe('Please verify your email address.');
    expect(body.access_token).toBe('a');
    expect(body.refresh_token).toBe('r');
    expect(body.statusCode).toBe(403);
    expect(body.timestamp).toEqual(expect.any(String));
  });

  test('class-validator array `message` is flattened to a comma-joined string for SPA convenience', () => {
    const filter = new GlobalExceptionFilter();
    const { host, json } = fakeHost();

    const exc = new BadRequestException({
      statusCode: 400,
      message: ['email must be an email', 'password should not be empty'],
      error: 'Bad Request',
    });
    filter.catch(exc, host);

    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body.message).toBe(
      'email must be an email, password should not be empty',
    );
    expect(body.error).toBe('Bad Request');
  });

  test('string-body HttpException becomes `{ statusCode, message, timestamp }`', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = fakeHost();

    filter.catch(new HttpException('not allowed', 401), host);

    expect(status).toHaveBeenCalledWith(401);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toEqual({
      statusCode: 401,
      message: 'not allowed',
      timestamp: expect.any(String),
    });
  });

  test('unknown / non-Http exception → 500 with generic message (does not leak internals)', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = fakeHost();

    filter.catch(new Error('database is on fire'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(body.message).not.toContain('database');
  });

  test('Decisions Log 2026-04-26 — InternalServerErrorException with object body (rare) still keeps structured payload', () => {
    const filter = new GlobalExceptionFilter();
    const { host, json } = fakeHost();

    filter.catch(
      new InternalServerErrorException({
        code: 'STRIPE_DOWN',
        message: 'Stripe API unreachable',
        retry_after: 30,
      }),
      host,
    );

    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body.code).toBe('STRIPE_DOWN');
    expect(body.retry_after).toBe(30);
  });
});
