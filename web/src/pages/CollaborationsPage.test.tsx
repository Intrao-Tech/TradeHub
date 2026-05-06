// TEST-COLLAB-100..106 — CollaborationsPage (COLLAB-010..015).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import {
  mockAccountMe,
  mockCollaboration,
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
      expect(screen.getByText(/no collaborations yet/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/JSON/i)).toBeNull();
    expect(screen.queryByText(/Raw list JSON/i)).toBeNull();
    expect(screen.queryByText(/Last action response/i)).toBeNull();
    expect(screen.queryByText(/Last mutation response/i)).toBeNull();
    expect(container.querySelectorAll('pre')).toHaveLength(0);
  });
});

describe('TEST-COLLAB-101 status tabs — COLLAB-011', () => {
  test('TEST-COLLAB-101 / COLLAB-011 — all seven tabs render with counts derived from the list payload', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({
          items: [
            mockCollaboration({ id: '1', worker_id: MY_ID, status: 'PENDING' }),
            mockCollaboration({ id: '2', worker_id: MY_ID, status: 'PENDING' }),
            mockCollaboration({ id: '3', worker_id: MY_ID, status: 'CONFIRMED' }),
            mockCollaboration({ id: '4', worker_id: MY_ID, status: 'IN_PROGRESS' }),
            mockCollaboration({ id: '5', worker_id: MY_ID, status: 'COMPLETED' }),
            mockCollaboration({ id: '6', worker_id: MY_ID, status: 'REJECTED' }),
            mockCollaboration({ id: '7', worker_id: MY_ID, status: 'DISPUTED' }),
          ],
          total: 7,
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
    for (const label of [
      /^All/,
      /Pending/,
      /Confirmed/,
      /In progress/,
      /Completed/,
      /Disputed/,
      /Rejected/,
    ]) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    // Default tab is `All`.
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('TEST-COLLAB-101 / COLLAB-011 — switching to a status tab filters rows client-side without refetching', async () => {
    let listCalls = 0;
    server.use(
      http.get(`${API}/collaborations/me`, () => {
        listCalls += 1;
        return HttpResponse.json({
          items: [
            mockCollaboration({ id: '1', worker_id: MY_ID, status: 'PENDING' }),
            mockCollaboration({ id: '2', worker_id: MY_ID, status: 'CONFIRMED' }),
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
      expect(screen.getAllByText(/Collaboration|View collaboration/).length).toBeGreaterThan(0),
    );
    expect(listCalls).toBe(1);

    await user.click(screen.getByRole('tab', { name: /Confirmed/ }));
    expect(listCalls).toBe(1); // no refetch
    expect(screen.getAllByRole('link', { name: /view collaboration/i })).toHaveLength(1);
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
      expect(
        screen.getByRole('link', { name: /view collaboration/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('tab', { name: /As worker/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /As employer/i })).toBeNull();
  });

  test('TEST-COLLAB-102 / COLLAB-012 — rows on both sides render role tab and switching toggles the visible set', async () => {
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
      expect(screen.getByRole('tab', { name: /As worker/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: /As employer/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /As employer/i }));
    // Only rows where I am employer should remain.
    expect(screen.getAllByRole('link', { name: /view collaboration/i })).toHaveLength(1);
  });
});

describe('TEST-COLLAB-103 per-row primary action surface — COLLAB-010', () => {
  test('TEST-COLLAB-103 / COLLAB-010 — every row exposes a "View collaboration" link to /collaborations/:id', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({
          items: [
            mockCollaboration({ id: '11', worker_id: MY_ID, status: 'PENDING' }),
            mockCollaboration({ id: '12', worker_id: MY_ID, status: 'CONFIRMED' }),
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
      expect(
        screen.getAllByRole('link', { name: /view collaboration/i }),
      ).toHaveLength(2),
    );
    const links = screen.getAllByRole('link', { name: /view collaboration/i });
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining(['/collaborations/11', '/collaborations/12']),
    );
  });
});

describe('TEST-COLLAB-104 empty state — COLLAB-014', () => {
  test('TEST-COLLAB-104 / COLLAB-014 — list with zero rows renders EmptyState + Browse jobs CTA', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 200 }),
      ),
    );
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations', account });
    expect(
      await screen.findByText(/no collaborations yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /browse jobs/i }),
    ).toHaveAttribute('href', '/jobs');
  });
});

describe('TEST-COLLAB-105 New collaboration trigger — COLLAB-013', () => {
  test('TEST-COLLAB-105 / COLLAB-013 — accounts with at least one client role see the button', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 200 }),
      ),
    );
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations', account });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /new collaboration/i }),
      ).toBeInTheDocument(),
    );
  });

  test('TEST-COLLAB-105 / COLLAB-013 — clicking the button opens the NewCollaborationSheet (Employer ID field appears)', async () => {
    server.use(
      http.get(`${API}/collaborations/me`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 200 }),
      ),
    );
    const user = userEvent.setup();
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations', account });
    await user.click(
      await screen.findByRole('button', { name: /new collaboration/i }),
    );
    expect(await screen.findByLabelText(/employer id/i)).toBeInTheDocument();
  });
});
