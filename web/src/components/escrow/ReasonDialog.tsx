import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type ReasonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Min chars for the reason field (defaults to 5). */
  minChars?: number;
  /** Max chars for the reason field (defaults to 500). */
  maxChars?: number;
  placeholder?: string;
  /** Confirm button label. */
  confirmLabel: string;
  /** "default" | "destructive" — affects confirm button styling. */
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
};

/**
 * Reusable confirmation dialog with a required reason textarea.
 * Replaces the ugly `confirm() + prompt()` pattern for escrow actions
 * (cancel contract, decline contract, refund, etc.).
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  minChars = 5,
  maxChars = 500,
  placeholder,
  confirmLabel,
  destructive,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (reason.trim().length < minChars) {
      setError(`Reason must be at least ${minChars} characters.`);
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) {
          setReason('');
          setError('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason-dialog-textarea">Reason</Label>
          <Textarea
            id="reason-dialog-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            rows={4}
            maxLength={maxChars}
            disabled={busy}
          />
          <p className="text-xs text-fg-muted">
            {reason.trim().length}/{minChars} min · {maxChars} max
          </p>
          {error ? (
            <div role="alert" className="text-xs text-danger">
              {error}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={busy || reason.trim().length < minChars}
            variant={destructive ? 'destructive' : 'default'}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
