import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('jobs');
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
        setError(t('apply.rateError'));
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
          setError(parsed?.message ?? t('apply.submitError'));
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
          <SheetTitle>{t('apply.title', { title: jobTitle })}</SheetTitle>
          <SheetDescription>{t('apply.description')}</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apply-cover">{t('apply.coverLabel')}</Label>
            <Textarea
              id="apply-cover"
              rows={5}
              value={coverMessage}
              onChange={(e) => setCoverMessage(e.target.value)}
              maxLength={5000}
              placeholder={t('apply.coverPlaceholder')}
            />
            {coverShortHint ? (
              <p className="text-xs text-fg-muted">{t('apply.coverHint')}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="apply-rate">{t('apply.rateLabel')}</Label>
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
            helperText={t('apply.attachmentsHelper')}
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
              {t('apply.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('apply.submitting') : t('apply.submit')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
ApplyJobSheet.displayName = 'ApplyJobSheet';
