import { useState } from 'react';
import { api, parseApiError } from '../../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

type InviteWorkerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobPostId: string | number;
  onInvited: () => void;
};

export function InviteWorkerSheet({
  open,
  onOpenChange,
  jobPostId,
  onInvited,
}: InviteWorkerSheetProps) {
  const [workerId, setWorkerId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setWorkerId('');
    setMessage('');
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = workerId.trim();
    if (!trimmed) {
      setError('Worker ID is required.');
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) {
      setError('Worker ID must be a positive whole number.');
      return;
    }

    setSubmitting(true);
    try {
      await api(`/job-applications/jobs/${jobPostId}/invite`, {
        method: 'POST',
        body: JSON.stringify({
          worker_id: n,
          message: message.trim() || undefined,
        }),
      });
      toast.success('Worker invited');
      reset();
      onInvited();
      onOpenChange(false);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Could not send invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Invite a worker</SheetTitle>
          <SheetDescription>
            Worker IDs can be found on a worker's profile page. Search by name
            is coming soon.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-worker-id">Worker ID</Label>
            <Input
              id="invite-worker-id"
              type="number"
              inputMode="numeric"
              min="1"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-message">Message (optional)</Label>
            <Textarea
              id="invite-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              placeholder="A short note for the worker."
            />
          </div>
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
              {submitting ? 'Sending…' : 'Send invitation'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
InviteWorkerSheet.displayName = 'InviteWorkerSheet';
