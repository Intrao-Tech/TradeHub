import { useEffect, useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getOwnReferralCode } from '@/components/escrow';

type Kind = 'JOB' | 'WORKER';

export function ShareForCommissionButton({
  kind,
  targetId,
  targetTitle,
  className,
}: {
  kind: Kind;
  targetId: string | number;
  targetTitle?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || code) return;
    void getOwnReferralCode().then((r) => setCode(r.code));
  }, [open, code]);

  const base =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const path =
    kind === 'JOB' ? `/jobs/${targetId}` : `/workers/${targetId}`;
  const link = code ? `${base}${path}?ref=${code}` : '';

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const label =
    kind === 'JOB' ? 'Share for commission' : 'Share with another employer';
  const description =
    kind === 'JOB'
      ? 'Send this link to a worker. If they apply and get hired, you earn the W→W referral % of the agreed amount, paid from platform fee.'
      : 'Send this link to another employer. If they hire this same worker, you earn the E→E referral % of the agreed amount, paid from platform fee.';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={className}>
          <Share2 className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {targetTitle ? (
            <p className="text-xs text-fg-muted">
              Sharing: <strong>{targetTitle}</strong>
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border-default bg-subtle px-3 py-2 text-xs">
              {link || 'Loading link…'}
            </code>
            <Button type="button" variant="outline" onClick={copyLink} disabled={!link}>
              <Copy className="h-4 w-4" />
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
