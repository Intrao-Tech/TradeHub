import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, userEvent, waitFor } from '../../test/render';
import { server } from '../../test/msw-server';
import { clearTokens, setTokens } from '../../api';
import { AttachmentList } from './AttachmentList';

const API = 'http://localhost:8081/api';

describe('<AttachmentList>', () => {
  it('renders nothing when there are no attachments', () => {
    const { container } = renderWithRouter(
      <AttachmentList heading="Attachments" attachments={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one button per attachment with the file size', () => {
    renderWithRouter(
      <AttachmentList
        heading="Attachments"
        attachments={[
          {
            id: 12,
            original_name: 'plan.pdf',
            mime_type: 'application/pdf',
            size_bytes: 5_242_880,
          },
          {
            id: '13',
            original_name: 'kitchen.jpg',
            mime_type: 'image/jpeg',
            size_bytes: 1024,
          },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /plan\.pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kitchen\.jpg/i })).toBeInTheDocument();
    expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();
  });

  it('clicking a button fetches with the Authorization header (so authed downloads succeed)', async () => {
    let capturedAuth: string | null = null;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    window.open = vi.fn(() => null) as unknown as typeof window.open;
    setTokens('jwt-token-here', 'refresh-token');
    server.use(
      http.get(`${API}/job-attachments/42/download`, ({ request }) => {
        capturedAuth = request.headers.get('authorization');
        return new HttpResponse(new Blob(['fake-bytes']), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }),
    );
    renderWithRouter(
      <AttachmentList
        attachments={[
          {
            id: 42,
            original_name: 'avatar.png',
            mime_type: 'image/png',
            size_bytes: 2048,
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /avatar\.png/i }));
    await waitFor(() => {
      expect(capturedAuth).toBe('Bearer jwt-token-here');
    });
    clearTokens();
  });

  it('shows a friendly error on 403', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    server.use(
      http.get(`${API}/job-attachments/99/download`, () =>
        new HttpResponse(JSON.stringify({ code: 'FORBIDDEN' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    renderWithRouter(
      <AttachmentList
        attachments={[
          {
            id: 99,
            original_name: 'private.png',
            mime_type: 'image/png',
            size_bytes: 1024,
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /private\.png/i }));
    await screen.findByText(/You don't have access to this attachment\./i);
  });
});
