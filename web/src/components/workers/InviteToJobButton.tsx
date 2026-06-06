import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

type EmployerJob = {
  id: string | number;
  title: string;
  status: string;
};

type EmployerJobsResponse = {
  items: EmployerJob[];
  total: number;
  page: number;
  limit: number;
};

type InviteToJobButtonProps = {
  workerId: string | number;
  workerName?: string | null;
};

export function InviteToJobButton({
  workerId,
  workerName,
}: InviteToJobButtonProps) {
  const { t } = useTranslation('workers');
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<EmployerJob[] | null>(null);
  const [jobsError, setJobsError] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [message, setMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setJobs(null);
    setJobsError('');
    void (async () => {
      try {
        const data = await api<EmployerJobsResponse>(
          '/job-posts/me?status=OPEN&page=1&limit=50',
        );
        if (cancelled) return;
        setJobs(data.items);
        if (data.items.length > 0 && !selectedJobId) {
          setSelectedJobId(String(data.items[0].id));
        }
      } catch (e) {
        if (cancelled) return;
        setJobsError(
          parseApiError(e)?.message ?? t('inviteToJob.loadJobsError'),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedJobId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    if (!selectedJobId) {
      setSubmitError(t('inviteToJob.pickJob'));
      return;
    }
    const wn = Number(workerId);
    if (!Number.isInteger(wn) || wn <= 0) {
      setSubmitError(t('inviteToJob.invalidWorker'));
      return;
    }
    setSubmitting(true);
    try {
      await api(`/job-applications/jobs/${selectedJobId}/invite`, {
        method: 'POST',
        body: JSON.stringify({
          worker_id: wn,
          message: message.trim() || undefined,
        }),
      });
      toast.success(
        workerName
          ? t('inviteToJob.invitedNamed', { name: workerName })
          : t('inviteToJob.invitedGeneric'),
      );
      setMessage('');
      setOpen(false);
    } catch (err) {
      setSubmitError(
        parseApiError(err)?.message ?? t('inviteToJob.sendError'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const hasNoOpenJobs = jobs != null && jobs.length === 0;

  return (
    <>
      <Button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Mail />
        {t('inviteToJob.button')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <SheetHeader>
            <SheetTitle>
              {workerName
                ? t('inviteToJob.titleNamed', { name: workerName })
                : t('inviteToJob.titleGeneric')}
            </SheetTitle>
            <SheetDescription>{t('inviteToJob.description')}</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="invite-job-select">{t('inviteToJob.jobLabel')}</Label>
              {jobsError ? (
                <div
                  role="alert"
                  className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
                >
                  {jobsError}
                </div>
              ) : jobs == null ? (
                <p className="text-sm text-fg-muted">{t('inviteToJob.loadingJobs')}</p>
              ) : hasNoOpenJobs ? (
                <p className="text-sm text-fg-muted">{t('inviteToJob.noOpenJobs')}</p>
              ) : (
                <Select
                  value={selectedJobId}
                  onValueChange={(v) => setSelectedJobId(v)}
                >
                  <SelectTrigger id="invite-job-select">
                    <SelectValue placeholder={t('inviteToJob.jobPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => (
                      <SelectItem key={String(j.id)} value={String(j.id)}>
                        {j.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="invite-message">{t('inviteToJob.messageLabel')}</Label>
              <Textarea
                id="invite-message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                placeholder={t('inviteToJob.messagePlaceholder')}
              />
            </div>
            {submitError ? (
              <div
                role="alert"
                className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {submitError}
              </div>
            ) : null}
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t('inviteToJob.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={submitting || hasNoOpenJobs || !selectedJobId}
              >
                {submitting ? t('inviteToJob.sending') : t('inviteToJob.send')}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
