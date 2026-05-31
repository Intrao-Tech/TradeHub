import { useState } from 'react';
import { api, parseApiError } from '../../api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { AttachmentsField } from '@/components/jobs/AttachmentsField';
import {
  pendingFilesFromValue,
  type AttachedFile,
} from '@/components/jobs/attachmentValue';
import { uploadJobApplicationAttachment } from '@/components/jobs/attachmentApi';

type ApplyJobSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobPostId: string | number;
  jobTitle: string;
  onSuccess: (application: { id: string | number; status: string }) => void;
  onApiError: (
    parsed: ReturnType<typeof parseApiError>,
  ) => 'handled' | 'unhandled';
};

export function ApplyJobSheet({
  open,
  onOpenChange,
  jobPostId,
  jobTitle,
  onSuccess,
  onApiError,
}: ApplyJobSheetProps) {
  const [coverMessage, setCoverMessage] = useState('');
  const [proposedRate, setProposedRate] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setCoverMessage('');
    setProposedRate('');
    setAttachments([]);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (proposedRate) {
      const n = Number(proposedRate);
      if (Number.isNaN(n) || n <= 0) {
        setError('Proposed rate must be a positive number.');
        return;
      }
    }

    setSubmitting(true);
    try {
      let created: { id: string | number; status: string };
      try {
        created = await api<{ id: string | number; status: string }>(
          `/job-applications/jobs/${jobPostId}/apply`,
          {
            method: 'POST',
            body: JSON.stringify({
              cover_message: coverMessage.trim() || undefined,
              proposed_rate: proposedRate ? Number(proposedRate) : undefined,
            }),
          },
        );
      } catch (err) {
        const parsed = parseApiError(err);
        const handled = onApiError(parsed);
        if (handled === 'unhandled') {
          setError(parsed?.message ?? 'Could not submit application.');
        } else {
          onOpenChange(false);
          reset();
        }
        return;
      }

      // Parent-first attachments: upload onto the new application. Best-effort
      // — the application is already submitted, so a file failure must not
      // block the success path.
      for (const file of pendingFilesFromValue(attachments)) {
        try {
          await uploadJobApplicationAttachment(created.id, file);
        } catch {
          /* best-effort */
        }
      }

      onSuccess(created);
      onOpenChange(false);
      reset();
    } finally {
      setSubmitting(false);
    }
  }

  const coverShortHint =
    coverMessage.trim().length > 0 && coverMessage.trim().length < 100;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Apply to “{jobTitle}”</SheetTitle>
          <SheetDescription>
            A short message and a proposed rate help your application stand out.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex flex-col gap-3">
            <Label htmlFor="apply-cover">Cover message</Label>
            <Textarea
              id="apply-cover"
              rows={5}
              value={coverMessage}
              onChange={(e) => setCoverMessage(e.target.value)}
              maxLength={5000}
              placeholder="Why are you the right fit for this job?"
            />
            {coverShortHint ? (
              <p className="text-xs text-fg-muted">
                A short message gets twice the response — try 100 characters or
                more.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            <Label htmlFor="apply-rate">Proposed rate (£, optional)</Label>
            <Input
              id="apply-rate"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={proposedRate}
              onChange={(e) => setProposedRate(e.target.value)}
            />
          </div>
          <AttachmentsField
            value={attachments}
            onChange={setAttachments}
            helperText="Add work samples to strengthen your proposal. Please remove any contact details, as sharing these before a contract is against our policy."
          />
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
ApplyJobSheet.displayName = 'ApplyJobSheet';
