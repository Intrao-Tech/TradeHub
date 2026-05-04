// TEST-PROF-106 — DocumentsTab (PROF-028, PROF-030, PROF-033 user-side surface).

import { describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { DocumentsTab } from './DocumentsTab';

const API = 'http://localhost:8081/api';

describe('TEST-PROF-106 DocumentsTab (PROF-028, PROF-030)', () => {
  test('PROF-028 — auto-loads on mount, no "Load documents" button', async () => {
    let hits = 0;
    server.use(
      http.get(`${API}/documents/me`, () => {
        hits += 1;
        return HttpResponse.json([]);
      }),
    );
    renderWithProfile(
      <DocumentsTab isWorker={true} isEmployer={false} flash={vi.fn()} />,
    );
    await waitFor(() => {
      expect(hits).toBe(1);
    });
    expect(
      screen.queryByRole('button', { name: /load documents/i }),
    ).toBeNull();
  });

  test('PROF-030 — status badges follow the Pending/In review/Approved/Rejected mapping', async () => {
    server.use(
      http.get(`${API}/documents/me`, () =>
        HttpResponse.json([
          {
            id: '1',
            doc_type: 'CSCS_CARD',
            status: 'PENDING',
            file_url: '/uploads/p.pdf',
          },
          {
            id: '2',
            doc_type: 'INSURANCE',
            status: 'IN_REVIEW',
            file_url: '/uploads/i.pdf',
          },
          {
            id: '3',
            doc_type: 'ID_PHOTO',
            status: 'APPROVED',
            file_url: '/uploads/id.png',
          },
          {
            id: '4',
            doc_type: 'OTHER',
            status: 'REJECTED',
            file_url: '/uploads/o.pdf',
            rejection_reason: 'Blurred',
          },
        ]),
      ),
    );
    renderWithProfile(
      <DocumentsTab isWorker={true} isEmployer={false} flash={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/cscs card/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('In review').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Rejected').length).toBeGreaterThanOrEqual(1);
    // PROF-033 — staff-provided rejection reason rendered.
    expect(screen.getByText(/reason: blurred/i)).toBeInTheDocument();
  });

  test('PROF-030 — delete affordance is gated to PENDING documents only', async () => {
    server.use(
      http.get(`${API}/documents/me`, () =>
        HttpResponse.json([
          {
            id: '1',
            doc_type: 'CSCS_CARD',
            status: 'PENDING',
            file_url: '/uploads/p.pdf',
          },
          {
            id: '2',
            doc_type: 'INSURANCE',
            status: 'APPROVED',
            file_url: '/uploads/i.pdf',
          },
        ]),
      ),
    );
    renderWithProfile(
      <DocumentsTab isWorker={true} isEmployer={false} flash={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
    });
    const deleteButtons = screen.getAllByLabelText(/delete document/i);
    expect(deleteButtons).toHaveLength(1); // only the PENDING row
  });
});
