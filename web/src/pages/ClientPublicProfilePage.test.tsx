// TEST-PROF-112 — ClientPublicProfilePage (PROF-003).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import ClientPublicProfilePage from './ClientPublicProfilePage';

const API = 'http://localhost:8081/api';

describe('TEST-PROF-112 ClientPublicProfilePage (PROF-003)', () => {
  test('PROF-003 — renders without auth using GET /client-profiles/:slug', async () => {
    server.use(
      http.get(`${API}/client-profiles/mike-builder-abcdef`, () =>
        HttpResponse.json({
          id: '1',
          slug: 'mike-builder-abcdef',
          display_name: 'Mike Builder',
          city: 'Camden',
          postcode_area: 'NW1',
          verification_level: 'KYC',
          bio: 'Friendly chippy.',
        }),
      ),
    );
    renderWithProfile(
      <Routes>
        <Route path="/clients/:slug" element={<ClientPublicProfilePage />} />
      </Routes>,
      { route: '/clients/mike-builder-abcdef', account: null },
    );
    await waitFor(() => {
      expect(screen.getByText('Mike Builder')).toBeInTheDocument();
    });
    expect(screen.getByText(/kyc verified/i)).toBeInTheDocument();
  });
});
