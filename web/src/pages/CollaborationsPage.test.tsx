// TEST-COLLAB-100..104 — CollaborationsPage (COLLAB-010..014).
//
// Post-CR-003: a Collaboration is a relationship-only binding; lifecycle
// lives on Contract. The page derives a per-row state (Chat only / Proposed
// / Active / Ended) from `row.contracts` — there is no collaboration status.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import {
  mockAccountMe,
  mockCollaboration,
  mockCollaborationContract,
  mockClientProfile,
  mockEmployerProfile,
  mockWorkerProfile,
} from '@/test/factories';
import CollaborationsPage from './CollaborationsPage';

const API = 'http://localhost:8081/api';
const MY_ID = '1';

function withRoute() {
  return (
    <Routes>
      <Route path="/collaborations" element={<CollaborationsPage />} />
      <Route
        path="/collaborations/:id"
        element={<div>COLLAB-DETAIL-FALLBACK</div>}
      />
      <Route path="/jobs" element={<div>JOBS-FALLBACK</div>} />
    </Routes>
  );
}

async function asWorker() {
  const { setTokens } = await import('@/api');
  setTokens('t', 'r');
  return mockAccountMe({
    clientProfile: mockClientProfile({
      id: MY_ID,
      worker_profile: mockWorkerProfile({ id: MY_ID }),
      employer_profile: null,
    }),
  });
}

async function asDualRole() {
  const { setTokens } = await import('@/api');
  setTokens('t', 'r');
  return mockAccountMe({
    clientProfile: mockClientProfile({
      id: MY_ID,
      worker_profile: mockWorkerProfile({ id: MY_ID }),
      employer_profile: mockEmployerProfile({ id: MY_ID }),
    }),
  });
}

describe('TEST-COLLAB-100 — COLLAB-001 zero JSON dumps on the list page', () => {
  test('TEST-COLLAB-100 / COLLAB-001 — no JSON, no Raw list copy, no <pre> stringified payload', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 200 }),
      ),
    );
    const account = await asWorker();
    const { container } = renderWithProfile(withRoute(), {
      route: '/collaborations',
      account,
    });
    await waitFor(() =>
      expect(screen.getByText(/no collaborations here/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/JSON/i)).toBeNull();
    expect(screen.queryByText(/Raw list JSON/i)).toBeNull();
    expect(screen.queryByText(/Last action response/i)).toBeNull();
    expect(container.querySelectorAll('pre')).toHaveLength(0);
  });
});

describe('TEST-COLLAB-101 status tabs — COLLAB-011', () => {
  test('TEST-COLLAB-101 / COLLAB-011 — the five contract-derived tabs render; All is the default', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({
          items: [
            // No contract → "Chat only".
            mockCollaboration({ id: '1', worker_id: MY_ID }),
            // PROPOSED contract → "Proposed".
            mockCollaboration({
              id: '2',
              worker_id: MY_ID,
              contracts: [mockCollaborationContract({ status: 'PROPOSED' })],
            }),
            // ACTIVE contract → "Active".
            mockCollaboration({
              id: '3',
              worker_id: MY_ID,
              contracts: [mockCollaborationContract({ status: 'ACTIVE' })],
            }),
            // Only ENDED contracts → "Ended".
            mockCollaboration({
              id: '4',
              worker_id: MY_ID,
              contracts: [mockCollaborationContract({ status: 'ENDED' })],
            }),
          ],
          total: 4,
          page: 1,
          limit: 200,
        }),
      ),
    );
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations', account });

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /^All/ })).toBeInTheDocument(),
    );
    for (const label of [/^All/, /Chat only/, /Proposed/, /Active/, /Ended/]) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('TEST-COLLAB-101 / COLLAB-011 — switching to a tab filters rows client-side without refetching', async () => {
    let listCalls = 0;
    server.use(
      http.get(`${API}/collaborations/me`, () => {
        listCalls += 1;
        return HttpResponse.json({
          items: [
            mockCollaboration({
              id: '1',
              worker_id: MY_ID,
              contracts: [mockCollaborationContract({ status: 'PROPOSED' })],
            }),
            mockCollaboration({
              id: '2',
              worker_id: MY_ID,
              contracts: [mockCollaborationContract({ status: 'ACTIVE' })],
            }),
          ],
          total: 2,
          page: 1,
          limit: 200,
        });
      }),
    );
    const user = userEvent.setup();
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations', account });

    await waitFor(() =>
      expect(
        screen.getAllByRole('link', { name: /open/i }).length,
      ).toBeGreaterThan(0),
    );
    expect(listCalls).toBe(1);

    await user.click(screen.getByRole('tab', { name: /Active/ }));
    expect(listCalls).toBe(1); // no refetch — client-side filter
    expect(screen.getAllByRole('link', { name: /open/i })).toHaveLength(1);
  });
});

describe('TEST-COLLAB-102 role tab visibility — COLLAB-012', () => {
  test('TEST-COLLAB-102 / COLLAB-012 — single-role rows hide the role tab', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({
          items: [mockCollaboration({ id: '1', worker_id: MY_ID })],
          total: 1,
          page: 1,
          limit: 200,
        }),
      ),
    );
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations', account });

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /open/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('tab', { name: /As worker/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /As employer/i })).toBeNull();
  });

  test('TEST-COLLAB-102 / COLLAB-012 — rows on both sides render the role tab and switching filters', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({
          items: [
            mockCollaboration({
              id: '1',
              worker_id: MY_ID,
              employer_id: '900',
            }),
            mockCollaboration({
              id: '2',
              worker_id: '500',
              employer_id: MY_ID,
            }),
          ],
          total: 2,
          page: 1,
          limit: 200,
        }),
      ),
    );
    const user = userEvent.setup();
    const account = await asDualRole();
    renderWithProfile(withRoute(), { route: '/collaborations', account });

    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: /As worker/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('tab', { name: /As employer/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /As employer/i }));
    // Only the row where I am the employer remains.
    expect(screen.getAllByRole('link', { name: /open/i })).toHaveLength(1);
  });
});

describe('TEST-COLLAB-103 per-row primary action surface — COLLAB-010', () => {
  test('TEST-COLLAB-103 / COLLAB-010 — every row exposes an Open link to /collaborations/:id', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({
          items: [
            mockCollaboration({ id: '11', worker_id: MY_ID }),
            mockCollaboration({ id: '12', worker_id: MY_ID }),
          ],
          total: 2,
          page: 1,
          limit: 200,
        }),
      ),
    );
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations', account });

    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /open/i })).toHaveLength(2),
    );
    const hrefs = screen
      .getAllByRole('link', { name: /open/i })
      .map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining(['/collaborations/11', '/collaborations/12']),
    );
  });
});

describe('TEST-COLLAB-104 empty state — COLLAB-014', () => {
  test('TEST-COLLAB-104 / COLLAB-014 — list with zero rows renders the EmptyState', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 200 }),
      ),
    );
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations', account });
    expect(
      await screen.findByText(/no collaborations here/i),
    ).toBeInTheDocument();
  });
});
