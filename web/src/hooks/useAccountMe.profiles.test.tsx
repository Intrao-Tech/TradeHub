// TEST-PROF-100 — Profiles-side useAccountMe shape contract (PROF-051).
//
// `useAccountMe.test.tsx` (TEST-AUTH-084) owns the cache + refetch behaviour.
// This file adds the Profiles consumer assertion: when /account/me returns
// hydrated client_profile.{worker_profile,employer_profile}, the hook
// surfaces them in the right boolean flags + nested shapes the editors read.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { mockAccountMe } from '@/test/factories';
import { useAccountMe } from './useAccountMe';

const API = 'http://localhost:8081/api';

describe('TEST-PROF-100 useAccountMe Profiles consumer (PROF-051)', () => {
  test('PROF-051 — worker account: isWorker=true, clientProfile.worker_profile populated, isEmployer=false', async () => {
    server.use(
      http.get(`${API}/account/me`, () =>
        HttpResponse.json(
          mockAccountMe({
            clientProfile: {
              worker_profile: {
                id: '1',
                years_experience: 7,
                day_rate_min: '200.00',
                day_rate_max: '350.00',
                available_from: null,
                is_available: true,
                rating_avg: '0',
                rating_count: 0,
                languages: ['en'],
                worker_specialisations: [],
              },
              employer_profile: null,
            },
          }),
        ),
      ),
    );
    const { result } = renderHook(() => useAccountMe());
    await waitFor(() => {
      expect(result.current.account).not.toBeNull();
    });
    expect(result.current.isWorker).toBe(true);
    expect(result.current.isEmployer).toBe(false);
    const wp = result.current.clientProfile?.worker_profile;
    expect(wp).toBeDefined();
    expect(wp?.years_experience).toBe(7);
    expect(wp?.languages).toEqual(['en']);
  });

  test('PROF-051 — employer account: isEmployer=true, clientProfile.employer_profile populated', async () => {
    server.use(
      http.get(`${API}/account/me`, () =>
        HttpResponse.json(
          mockAccountMe({
            clientProfile: {
              worker_profile: null,
              employer_profile: {
                id: '1',
                company_name: 'Acme Build',
                company_number: '12345678',
                team_size: 12,
                rating_avg: '0',
                rating_count: 0,
              },
            },
          }),
        ),
      ),
    );
    const { result } = renderHook(() => useAccountMe());
    await waitFor(() => {
      expect(result.current.account).not.toBeNull();
    });
    expect(result.current.isWorker).toBe(false);
    expect(result.current.isEmployer).toBe(true);
    expect(result.current.clientProfile?.employer_profile?.company_name).toBe(
      'Acme Build',
    );
  });

  test('PROF-051 — verificationState mirrors account.status, exposing PENDING_EMAIL_VERIFICATION', async () => {
    server.use(
      http.get(`${API}/account/me`, () =>
        HttpResponse.json(
          mockAccountMe({ status: 'PENDING_EMAIL_VERIFICATION' }),
        ),
      ),
    );
    const { result } = renderHook(() => useAccountMe());
    await waitFor(() => {
      expect(result.current.verificationState).toBe(
        'PENDING_EMAIL_VERIFICATION',
      );
    });
  });
});
