import { useEffect, useState } from 'react';
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

const CATEGORY_OPTIONS: Array<{ value: FlagCategory; label: string }> = [
  { value: 'PAYMENT_LATE', label: 'Payment is overdue' },
  { value: 'PAYMENT_REFUSED', label: 'The other party refuses to pay' },
  { value: 'WORK_QUALITY', label: 'Work quality is unacceptable' },
  { value: 'WORK_NOT_DONE', label: 'Work was not completed as agreed' },
  { value: 'SAFETY_CONCERN', label: 'Site safety / health concern' },
  { value: 'MISREPRESENTATION', label: 'The other party misrepresented themselves' },
  { value: 'ABUSIVE_BEHAVIOUR', label: 'Abusive / threatening behaviour' },
  { value: 'OTHER', label: 'Something else (detail required)' },
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
      toast.success('Flag submitted — staff will review');
      onOpenChange(false);
      onFlagged?.();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Could not submit flag.');
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
            Flag this collaboration
          </DialogTitle>
          <DialogDescription>
            Pick a reason category. Staff will review the flag and may contact
            either party.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="flag-category">Reason category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as FlagCategory)}
            >
              <SelectTrigger id="flag-category">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="flag-detail">
              Detail{' '}
              <span className="text-fg-muted">
                {category === 'OTHER' ? '(required, ≥ 10 chars)' : '(optional)'}
              </span>
            </Label>
            <Textarea
              id="flag-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Add anything that helps staff understand the situation."
              rows={4}
              maxLength={250}
            />
            {otherInvalid && trimmedDetail.length > 0 ? (
              <p className="text-xs text-danger">
                Add at least {OTHER_DETAIL_MIN} characters of detail when picking
                Other.
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
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {submitting ? 'Submitting…' : 'Submit flag'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
FlagCollaborationDialog.displayName = 'FlagCollaborationDialog';
