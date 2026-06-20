import { useState } from 'react';
import { Copy, Check, HandHelping } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { parseApiError } from '@/api';
import { createHandoff, type Handoff } from './api';

/**
 * "Hand off this job" — a worker who won't take a job gives it to a mate.
 * Generates a targeted link to send; if a hire results the hander keeps the
 * referral commission (unless they opt out). Distinct from the anonymous
 * "Share for commission" link: the recipient lands on a clear handoff page
 * and the employer sees who handed it over.
 */
export function HandoffButton({
  jobId,
  jobTitle,
  className,
}: {
  jobId: string | number;
  jobTitle?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [earnCommission, setEarnCommission] = useState(true);
  const [creating, setCreating] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setMessage('');
    setEarnCommission(true);
    setHandoff(null);
    setCopied(false);
    setCreating(false);
  }

  async function generate() {
    setCreating(true);
    try {
      const h = await createHandoff(jobId, {
        message: message.trim() || undefined,
        earn_commission: earnCommission,
      });
      setHandoff(h);
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not create handoff');
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!handoff) return;
    await navigator.clipboard.writeText(handoff.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={className}>
          <HandHelping className="h-4 w-4" />
          Hand off this job
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand off this job</DialogTitle>
          <DialogDescription>
            Not for you, but right for a mate? Send them this job directly.
            They’ll land on a page showing you handed it over and can apply in
            one tap.
          </DialogDescription>
        </DialogHeader>

        {handoff ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-fg">
              Send this link to your mate. It expires in 30 days.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border-default bg-subtle px-3 py-2 text-xs">
                {handoff.link}
              </code>
              <Button type="button" variant="outline" onClick={copyLink}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs text-fg-muted">
              {handoff.earn_commission
                ? 'You’ll earn your referral commission if they’re hired — paid from the platform fee, never from their pay.'
                : 'You chose not to take a commission on this handoff.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {jobTitle ? (
              <p className="text-xs text-fg-muted">
                Handing off: <strong>{jobTitle}</strong>
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="handoff-message">Add a note (optional)</Label>
              <Textarea
                id="handoff-message"
                value={message}
                maxLength={1000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. This one’s in your area — thought of you."
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-fg">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={earnCommission}
                onChange={(e) => setEarnCommission(e.target.checked)}
              />
              <span>
                Keep my referral commission if they’re hired
                <span className="block text-xs text-fg-muted">
                  Paid from the platform fee, never from their pay.
                </span>
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          {handoff ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          ) : (
            <Button type="button" onClick={() => void generate()} disabled={creating}>
              {creating ? 'Creating…' : 'Create handoff link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
