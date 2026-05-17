import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api, parseApiError } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { createContract } from '@/components/escrow';

type JobPostRow = {
  id: string | number;
  title: string;
  postcode_area?: string | null;
  fixed_price?: string | number | null;
  status?: string;
};

const fmtGbp = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(n);

/**
 * Employer-only sheet to create a new Contract under a Collaboration.
 * Picks one of the employer's existing JobPosts → auto-fills project_type,
 * site_postcode, agreed_amount; all editable before submit.
 */
export function NewContractSheet({
  collabId,
  initiator,
  onCreated,
}: {
  collabId: string | number;
  initiator: 'WORKER' | 'EMPLOYER';
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<JobPostRow[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [pickedJobId, setPickedJobId] = useState<string>('');
  const [projectType, setProjectType] = useState('');
  const [sitePostcode, setSitePostcode] = useState('');
  const [agreedAmount, setAgreedAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || jobs) return;
    void (async () => {
      try {
        const res = await api<{ items: JobPostRow[] }>('/job-posts/me');
        setJobs(res.items ?? []);
      } catch (err) {
        setLoadErr(parseApiError(err)?.message ?? 'Could not load your jobs');
      }
    })();
  }, [open, jobs]);

  function pickJob(id: string) {
    setPickedJobId(id);
    const j = jobs?.find((x) => String(x.id) === id);
    if (!j) return;
    setProjectType(j.title);
    setSitePostcode(j.postcode_area ?? '');
    if (j.fixed_price != null && j.fixed_price !== '') {
      setAgreedAmount(String(j.fixed_price));
    } else {
      setAgreedAmount('');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!pickedJobId) {
      toast.error('Pick a job post first');
      return;
    }
    if (!projectType.trim()) {
      toast.error('Project type required');
      return;
    }
    setSubmitting(true);
    try {
      const c = await createContract(collabId, {
        project_type: projectType.trim(),
        site_postcode: sitePostcode.trim() || undefined,
        agreed_amount:
          agreedAmount.trim() === '' ? undefined : Number(agreedAmount),
        initiated_by: initiator,
        job_post_id: Number(pickedJobId),
      });
      toast.success(
        `Contract #${c.position} sent — waiting for the other side to accept.`,
      );
      setOpen(false);
      setPickedJobId('');
      setProjectType('');
      setSitePostcode('');
      setAgreedAmount('');
      onCreated?.();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not create contract');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus />
          New contract
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New contract</DialogTitle>
            <DialogDescription>
              Pick one of your existing job posts to base this contract on —
              the project type, postcode, and agreed amount auto-fill from
              the job. You can edit them before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            {loadErr ? (
              <div
                role="alert"
                className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {loadErr}
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="picked-job">Job post *</Label>
              {jobs && jobs.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  You have no job posts. Create one on the Posted jobs page first.
                </p>
              ) : (
                <Select value={pickedJobId} onValueChange={pickJob}>
                  <SelectTrigger id="picked-job">
                    <SelectValue placeholder="Pick one of your jobs…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(jobs ?? []).map((j) => (
                      <SelectItem key={String(j.id)} value={String(j.id)}>
                        {j.title}
                        {j.fixed_price != null && j.fixed_price !== ''
                          ? ` · ${fmtGbp(Number(j.fixed_price))}`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ct-project">Project type *</Label>
              <Input
                id="ct-project"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                placeholder="e.g. Bathroom refit"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ct-postcode">Site postcode</Label>
                <Input
                  id="ct-postcode"
                  value={sitePostcode}
                  onChange={(e) => setSitePostcode(e.target.value)}
                  placeholder="SW1"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ct-amount">Agreed amount (£)</Label>
                <Input
                  id="ct-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={agreedAmount}
                  onChange={(e) => setAgreedAmount(e.target.value)}
                  placeholder="2500"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Propose contract'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
