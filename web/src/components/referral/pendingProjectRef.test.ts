// Tests for the pending-project-ref bridge — carries a logged-out project
// referral click across the auth gap (no DB change; localStorage only).

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw-server';
import { setTokens } from '@/api';
import {
  savePendingProjectRef,
  readPendingProjectRef,
  clearPendingProjectRef,
  replayPendingProjectRef,
} from './pendingProjectRef';

const API = 'http://localhost:8081/api';
const KEY = 'th.pendingProjectRef';

beforeEach(() => {
  localStorage.clear();
});

describe('pendingProjectRef storage', () => {
  test('save → read round-trips the click', () => {
    savePendingProjectRef({
      code: 'BG8Y-4MES',
      target_id: 5,
    });
    expect(readPendingProjectRef()).toEqual({
      code: 'BG8Y-4MES',
      target_id: 5,
    });
  });

  test('clear removes the stash', () => {
    savePendingProjectRef({
      code: 'ABCD-EFGH',
      target_id: 1,
    });
    clearPendingProjectRef();
    expect(readPendingProjectRef()).toBeNull();
  });

  test('read returns null for an expired stash (> 30 days)', () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      KEY,
      JSON.stringify({
        code: 'OLD0-CODE',
        target_id: 2,
        savedAt: old,
      }),
    );
    expect(readPendingProjectRef()).toBeNull();
  });

  test('read returns null for a malformed stash', () => {
    localStorage.setItem(KEY, '{"code":"X"}'); // missing fields
    expect(readPendingProjectRef()).toBeNull();
    localStorage.setItem(KEY, 'not json at all');
    expect(readPendingProjectRef()).toBeNull();
  });
});

describe('replayPendingProjectRef', () => {
  test('materialises a pending click as a project intent, then clears it', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/referral/intent`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          referrer_display_name: 'Mike',
          target: { type: 'JOB', id: '5', title: 'Roof' },
          recorded: true,
        });
      }),
    );
    setTokens('test', 'test');
    savePendingProjectRef({
      code: 'BG8Y-4MES',
      target_id: 5,
    });

    await replayPendingProjectRef();

    expect(body).toEqual({
      code: 'BG8Y-4MES',
      target_id: 5,
    });
    expect(readPendingProjectRef()).toBeNull();
  });

  test('no pending stash → no request fired', async () => {
    const spy = vi.fn();
    server.use(
      http.post(`${API}/referral/intent`, () => {
        spy();
        return HttpResponse.json({
          referrer_display_name: null,
          recorded: false,
        });
      }),
    );
    setTokens('test', 'test');
    await replayPendingProjectRef();
    expect(spy).not.toHaveBeenCalled();
  });

  test('clears the stash even when the intent call fails', async () => {
    server.use(
      http.post(`${API}/referral/intent`, () =>
        HttpResponse.json(
          { code: 'NOT_FOUND', message: 'Referral code not found' },
          { status: 404 },
        ),
      ),
    );
    setTokens('test', 'test');
    savePendingProjectRef({
      code: 'BAD0-CODE',
      target_id: 9,
    });

    await expect(replayPendingProjectRef()).resolves.toBeUndefined();
    expect(readPendingProjectRef()).toBeNull();
  });
});
