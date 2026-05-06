import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { renderWithRouter, screen, userEvent, waitFor } from '../../test/render';
import { server } from '../../test/msw-server';
import {
  AttachmentsField,
  type AttachedFile,
} from './AttachmentsField';

const API = 'http://localhost:8081/api';

function Harness({ initial = [] }: { initial?: AttachedFile[] }) {
  const [value, setValue] = useState<AttachedFile[]>(initial);
  return (
    <AttachmentsField
      value={value}
      onChange={setValue}
      helperText="Add work samples."
    />
  );
}

describe('<AttachmentsField>', () => {
  it('renders the screenshot copy: heading, helper, file-count cap, paperclip CTA', () => {
    renderWithRouter(<Harness />);
    expect(screen.getByRole('heading', { name: /attachments/i })).toBeInTheDocument();
    expect(screen.getByText(/Add work samples\./i)).toBeInTheDocument();
    expect(screen.getByText(/Up to 10 files \(max 25 MB each\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /attach files/i })).toBeEnabled();
  });

  it('rejects non-allowlisted MIME at the client without firing a network request', async () => {
    const fetchSpy = vi.fn();
    server.use(
      http.post(`${API}/job-attachments`, async () => {
        fetchSpy();
        return HttpResponse.json({ id: 'should-not-be-called' });
      }),
    );
    renderWithRouter(<Harness />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['x'], 'evil.zip', { type: 'application/zip' });
    Object.defineProperty(input, 'files', { value: [file], writable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await screen.findByText(/Use a PDF, JPEG, PNG, or WebP file\./i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects oversize files at the client', async () => {
    renderWithRouter(<Harness />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const tooBig = new File([new Uint8Array(26 * 1024 * 1024)], 'big.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(input, 'files', { value: [tooBig], writable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await screen.findByText(/Files must be under 25 MB\./i);
  });

  it('uploads happy-path PDF and renders the row with size', async () => {
    server.use(
      http.post(`${API}/job-attachments`, () =>
        HttpResponse.json({
          id: '42',
          original_name: 'spec.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1024,
          job_post_id: null,
          job_application_id: null,
          download_url: '/api/job-attachments/42/download',
        }),
      ),
    );
    renderWithRouter(<Harness />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'spec.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(input, 'files', { value: [file], writable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => {
      expect(screen.getByText('spec.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText(/1 KB|0 KB/)).toBeInTheDocument();
  });

  it('removes an uploaded file on ✕ click and fires DELETE', async () => {
    let deleteCalled = false;
    server.use(
      http.delete(`${API}/job-attachments/42`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithRouter(
      <Harness
        initial={[
          {
            kind: 'uploaded',
            id: 42,
            name: 'plan.pdf',
            size: 2048,
            mime: 'application/pdf',
          },
        ]}
      />,
    );
    expect(screen.getByText('plan.pdf')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /remove plan\.pdf/i }),
    );
    await waitFor(() => {
      expect(screen.queryByText('plan.pdf')).not.toBeInTheDocument();
    });
    expect(deleteCalled).toBe(true);
  });

  it('disables the Attach button when at the 10-file cap', () => {
    const tenFiles: AttachedFile[] = Array.from({ length: 10 }, (_, i) => ({
      kind: 'uploaded' as const,
      id: i + 1,
      name: `f${i + 1}.pdf`,
      size: 100,
      mime: 'application/pdf',
    }));
    renderWithRouter(<Harness initial={tenFiles} />);
    expect(screen.getByRole('button', { name: /attach files/i })).toBeDisabled();
    expect(
      screen.getByText(/Limit reached — remove a file to add another\./i),
    ).toBeInTheDocument();
  });
});
