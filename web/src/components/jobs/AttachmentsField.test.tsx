// <AttachmentsField> — parent-first attachments picker.
//
// The field does NO network work: it validates picked files client-side and
// holds them locally. The owning form uploads them after it has saved the
// parent (job post / application). So these tests never touch MSW.

import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { renderWithRouter, screen, userEvent } from '../../test/render';
import { AttachmentsField } from './AttachmentsField';
import type { AttachedFile } from './attachmentValue';

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

function pickFile(file: File) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], writable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('<AttachmentsField>', () => {
  it('renders heading, helper, file-count cap, and the paperclip CTA', () => {
    renderWithRouter(<Harness />);
    expect(
      screen.getByRole('heading', { name: /attachments/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Add work samples\./i)).toBeInTheDocument();
    expect(
      screen.getByText(/Up to 10 files \(max 25 MB each\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /attach files/i }),
    ).toBeEnabled();
  });

  it('rejects a non-allowlisted MIME at the client', async () => {
    renderWithRouter(<Harness />);
    pickFile(new File(['x'], 'evil.zip', { type: 'application/zip' }));
    await screen.findByText(/Use a PDF, JPEG, PNG, or WebP file\./i);
  });

  it('rejects an oversize file at the client', async () => {
    renderWithRouter(<Harness />);
    pickFile(
      new File([new Uint8Array(26 * 1024 * 1024)], 'big.pdf', {
        type: 'application/pdf',
      }),
    );
    await screen.findByText(/Files must be under 25 MB\./i);
  });

  it('queues a valid file as a pending row (no upload until the form submits)', async () => {
    renderWithRouter(<Harness />);
    pickFile(new File(['%PDF-1.4'], 'spec.pdf', { type: 'application/pdf' }));
    await screen.findByText('spec.pdf');
    // Parent-first: the row is queued locally — it never shows an upload state.
    expect(screen.queryByText(/uploading/i)).not.toBeInTheDocument();
  });

  it('removes a saved file row on ✕ click', async () => {
    renderWithRouter(
      <Harness
        initial={[
          {
            kind: 'saved',
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
    expect(screen.queryByText('plan.pdf')).not.toBeInTheDocument();
  });

  it('disables the Attach button at the 10-file cap', () => {
    const tenFiles: AttachedFile[] = Array.from({ length: 10 }, (_, i) => ({
      kind: 'saved' as const,
      id: i + 1,
      name: `f${i + 1}.pdf`,
      size: 100,
      mime: 'application/pdf',
    }));
    renderWithRouter(<Harness initial={tenFiles} />);
    expect(
      screen.getByRole('button', { name: /attach files/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Limit reached — remove a file to add another\./i),
    ).toBeInTheDocument();
  });
});
