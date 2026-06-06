import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import { api, parseApiError } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

/**
 * COLLAB-040 / COLLAB-041 / COLLAB-042 / COLLAB-043 — structured flag dialog.
 *
 * Submitted reason is `<CATEGORY>: <detail>` (or just `<CATEGORY>` if detail is empty).
 * `OTHER` requires ≥ 10 chars of detail.
 */

export type FlagCategory =
  | 'PAYMENT_LATE'
  | 'PAYMENT_REFUSED'
  | 'WORK_QUALITY'
  | 'WORK_NOT_DONE'
  | 'SAFETY_CONCERN'
  | 'MISREPRESENTATION'
  | 'ABUSIVE_BEHAVIOUR'
  | 'OTHER';

// Labels live in the `collaborations` namespace under `flag.category.<value>`.
const CATEGORY_VALUES: FlagCategory[] = [
  'PAYMENT_LATE',
  'PAYMENT_REFUSED',
  'WORK_QUALITY',
  'WORK_NOT_DONE',
  'SAFETY_CONCERN',
  'MISREPRESENTATION',
  'ABUSIVE_BEHAVIOUR',
  'OTHER',
];

const OTHER_DETAIL_MIN = 10;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborationId: string | number;
  onFlagged?: () => void;
};

export function FlagCollaborationDialog({
  open,
  onOpenChange,
  collaborationId,
  onFlagged,
}: Props) {
  const { t } = useTranslation('collaborations');
  const [category, setCategory] = useState<FlagCategory | ''>('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setCategory('');
      setDetail('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const trimmedDetail = detail.trim();
  const otherInvalid =
    category === 'OTHER' && trimmedDetail.length < OTHER_DETAIL_MIN;
  const canSubmit = category !== '' && !otherInvalid && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    const reason = trimmedDetail
      ? `${category}: ${trimmedDetail}`
      : (category as string);
    setSubmitting(true);
    setError('');
    try {
      await api(`/collaborations/${collaborationId}/flag`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      toast.success(t('flag.submitted'));
      onOpenChange(false);
      onFlagged?.();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? t('flag.submitError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            {t('flag.title')}
          </DialogTitle>
          <DialogDescription>{t('flag.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="flag-category">{t('flag.categoryLabel')}</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as FlagCategory)}
            >
              <SelectTrigger id="flag-category">
                <SelectValue placeholder={t('flag.categoryPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`flag.category.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="flag-detail">
              {t('flag.detailLabel')}{' '}
              <span className="text-fg-muted">
                {category === 'OTHER'
                  ? t('flag.detailRequired', { count: OTHER_DETAIL_MIN })
                  : t('flag.detailOptional')}
              </span>
            </Label>
            <Textarea
              id="flag-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={t('flag.detailPlaceholder')}
              rows={4}
              maxLength={250}
            />
            {otherInvalid && trimmedDetail.length > 0 ? (
              <p className="text-xs text-danger">
                {t('flag.detailTooShort', { count: OTHER_DETAIL_MIN })}
              </p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('flag.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {submitting ? t('flag.submitting') : t('flag.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
FlagCollaborationDialog.displayName = 'FlagCollaborationDialog';
