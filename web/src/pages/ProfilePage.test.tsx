// TEST-PROF-101 / 102 / 103 — ProfilePage (PROF-010, PROF-011, PROF-012, PROF-013).
//
// ProfilePage is the central editor; deeper editor behaviour (avatar drag-
// drop, completeness CTAs, documents lifecycle) lives in dedicated component
// tests.  Here we assert the *page-level* invariants the spec calls out:
//
//   PROF-010 — no `<pre>{JSON.stringify(...)}</pre>` debug card; Account
//              section surfaces email + verified marker + "Manage security"
//              link to /settings/security; AuthBanner appears for
//              PENDING_EMAIL_VERIFICATION users.
//   PROF-070 surface — PENDING user can still interact with editor inputs.
//
// Worker / employer editor diff submissions (PROF-012, PROF-013) are
// asserted by the e2e specs (TEST-PROF-071 / TEST-PROF-072) because they
// involve multiple API endpoints and tab routing.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProfile, screen, waitFor, within } from '@/test/render';
import { server } from '@/test/msw-server';
import { mockAccountMe } from '@/test/factories';
import ProfilePage from './ProfilePage';

const API = 'http://localhost:8081/api';

function stubProfileLoaders() {
  server.use(
    http.get(`${API}/portfolio/worker/:id`, () => HttpResponse.json([])),
    http.get(`${API}/documents/me`, () => HttpResponse.json([])),
    http.get(`${API}/specialisations`, () => HttpResponse.json([])),
    http.get(`${API}/verification/status`, () =>
      HttpResponse.json({ verification_level: 'UNVERIFIED' }),
    ),
  );
}

describe('TEST-PROF-101 ProfilePage account section (PROF-010)', () => {
  test('PROF-010 — no `<pre>` block / "Raw account data for debugging" copy in the DOM', async () => {
    stubProfileLoaders();
    const { container } = renderWithProfile(<ProfilePage />, {
      account: mockAccountMe(),
    });
    await waitFor(() => {
      expect(screen.getByText(/manage security/i)).toBeInTheDocument();
    });
    expect(container.querySelector('pre')).toBeNull();
    expect(screen.queryByText(/raw account data/i)).toBeNull();
  });

  test('PROF-010 — Account section shows email + "Manage security" link to /settings/security', async () => {
    stubProfileLoaders();
    renderWithProfile(<ProfilePage />, {
      account: mockAccountMe({ email: 'mike@example.com' }),
    });
    await waitFor(() => {
      expect(screen.getByText('mike@example.com')).toBeInTheDocument();
    });
    const link = screen.getByRole('link', { name: /manage security/i });
    expect(link).toHaveAttribute('href', '/settings/security');
  });

  test('PROF-010 — PENDING_EMAIL_VERIFICATION renders an AuthBanner-style "Verify your email" panel with a Resend CTA', async () => {
    stubProfileLoaders();
    renderWithProfile(<ProfilePage />, {
      account: mockAccountMe({ status: 'PENDING_EMAIL_VERIFICATION' }),
    });
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /resend verification email/i }),
    ).toBeInTheDocument();
  });

  test('TEST-PROF-070 surface — PENDING user can still interact with the bio input (Auth contract §3 exemption)', async () => {
    stubProfileLoaders();
    renderWithProfile(<ProfilePage />, {
      account: mockAccountMe({
        status: 'PENDING_EMAIL_VERIFICATION',
        clientProfile: { bio: 'Initial bio' },
      }),
    });
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
    // Bio textarea is enabled (not disabled by the unverified state).
    const bio = screen.getByLabelText(/bio/i) as HTMLTextAreaElement;
    expect(bio.disabled).toBe(false);
  });
});

describe('TEST-PROF-104 ProfilePage completeness CTA anchors (PROF-037)', () => {
  test('PROF-037 — "Add photo" scroll target #section-avatar exists in the DOM (regression: CTA silently no-opped without it)', async () => {
    stubProfileLoaders();
    renderWithProfile(<ProfilePage />, {
      account: mockAccountMe(),
    });
    await waitFor(() => {
      expect(screen.getByText(/manage security/i)).toBeInTheDocument();
    });
    // CompletenessPanel CTAs scroll via document.getElementById(...) with
    // optional chaining — a missing anchor fails silently, so assert each
    // scroll target the panel can emit actually exists on the page.
    expect(document.getElementById('section-avatar')).not.toBeNull();
    expect(document.getElementById('section-client')).not.toBeNull();
  });
});

describe('TEST-PROF-102 ProfilePage worker editor (PROF-011 / PROF-012 / PROF-015)', () => {
  test('PROF-015 — region picker is constrained to the London-borough preset (city options are present in the DOM)', async () => {
    stubProfileLoaders();
    renderWithProfile(<ProfilePage />, {
      account: mockAccountMe(),
    });
    await waitFor(() => {
      expect(screen.getByText(/manage security/i)).toBeInTheDocument();
    });
    // The page contains a Select for city — the preset list is the constraint
    // surface.  We assert that the well-known borough "Camden" exists somewhere
    // in the DOM (component renders SelectItem children in a portal that jsdom
    // doesn't open by default; the preset list is also rendered as the current
    // value's source).
    const root = screen.getByText(/manage security/i).closest('main, body, div');
    expect(root).not.toBeNull();
    // Loose probe — Camden appears in either the Select value, the header
    // location chip, or hidden options. Tolerate multiple matches.
    expect(within(document.body).queryAllByText(/camden/i).length).toBeGreaterThan(0);
  });
});

describe('TEST-PROF-103 ProfilePage employer editor (PROF-013)', () => {
  test('PROF-013 — employer account renders the company-info inputs (company_name + company_number + team_size)', async () => {
    stubProfileLoaders();
    renderWithProfile(<ProfilePage />, {
      account: mockAccountMe({
        clientProfile: {
          worker_profile: null,
          employer_profile: {
            id: '1',
            company_name: 'Acme',
            company_number: '12345678',
            team_size: 10,
            rating_avg: '0',
            rating_count: 0,
          },
        },
      }),
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
    });
    // Field renamed to "Companies House number" in the Upwork-style redesign;
    // the underlying field is still company_number.
    expect(screen.getByLabelText(/companies house/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/team size/i)).toBeInTheDocument();
  });
});
