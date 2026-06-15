import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, parseApiError } from '@/api';
import { formatMoney } from '@/lib/format';
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

const fmtGbp = (n: number) => formatMoney(n);

/**
 * Employer-only sheet to create a new Contract under a Collaboration.
 * Picks one of the employer's existing JobPosts → auto-fills project_type,
 * site_postcode, agreed_amount; all editable before submit.
 */
export function NewContractSheet({
  collabId,
  initiator,
  takenJobPostIds,
  onCreated,
}: {
  collabId: string | number;
  initiator: 'WORKER' | 'EMPLOYER';
  /** Job-post ids that already have an in-flight contract with this worker —
   *  excluded from the picker (one in-flight contract per job post). */
  takenJobPostIds?: Set<string>;
  onCreated?: () => void;
}) {
  const { t } = useTranslation('collaborations');
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
        setLoadErr(parseApiError(err)?.message ?? t('newContract.loadJobsError'));
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
      toast.error(t('newContract.pickJobFirst'));
      return;
    }
    if (!projectType.trim()) {
      toast.error(t('newContract.projectTypeRequired'));
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
      toast.success(t('newContract.sentToast', { position: c.position }));
      setOpen(false);
      setPickedJobId('');
      setProjectType('');
      setSitePostcode('');
      setAgreedAmount('');
      onCreated?.();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? t('newContract.createError'));
    } finally {
      setSubmitting(false);
    }
  }

  // Exclude job posts that already have an in-flight contract with this worker.
  const eligibleJobs = (jobs ?? []).filter(
    (j) => !takenJobPostIds?.has(String(j.id)),
  );
  const allJobsTaken = jobs != null && jobs.length > 0 && eligibleJobs.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus />
          {t('newContract.title')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('newContract.title')}</DialogTitle>
            <DialogDescription>{t('newContract.description')}</DialogDescription>
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
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="picked-job">{t('newContract.jobPostLabel')} *</Label>
              {jobs && jobs.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('newContract.noJobs')}</p>
              ) : allJobsTaken ? (
                <p className="text-sm text-fg-muted">
                  {t('newContract.allJobsTaken')}
                </p>
              ) : (
                <Select value={pickedJobId} onValueChange={pickJob}>
                  <SelectTrigger id="picked-job">
                    <SelectValue placeholder={t('newContract.pickJobPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleJobs.map((j) => (
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
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="ct-project">{t('newContract.projectTypeLabel')} *</Label>
              <Input
                id="ct-project"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                placeholder={t('newContract.projectTypePlaceholder')}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2.5">
                <Label htmlFor="ct-postcode">{t('newContract.postcodeLabel')}</Label>
                <Input
                  id="ct-postcode"
                  value={sitePostcode}
                  onChange={(e) => setSitePostcode(e.target.value)}
                  placeholder={t('newContract.postcodePlaceholder')}
                />
              </div>
              <div className="flex flex-col gap-2.5">
                <Label htmlFor="ct-amount">{t('newContract.amountLabel')}</Label>
                <Input
                  id="ct-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={agreedAmount}
                  onChange={(e) => setAgreedAmount(e.target.value)}
                  placeholder={t('newContract.amountPlaceholder')}
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
              {t('newContract.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('newContract.sending') : t('newContract.propose')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
