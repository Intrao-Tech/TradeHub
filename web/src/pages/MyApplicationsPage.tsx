import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Inbox, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/EmptyState';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import { ApplicationStatusBadge } from '@/components/jobs/ApplicationStatusBadge';
import { AttachmentList } from '@/components/jobs/AttachmentList';
import { EmployerChip } from '@/components/jobs/EmployerChip';
import { formatPay } from '@/components/jobs/PayLine';
import { ConfirmDialog } from '@/components/jobs/ConfirmDialog';
import { toast } from '@/components/ui/toast';
import { formatRelative } from '@/lib/relative-time';

type WorkerApplication = {
  id: string | number;
  status: string;
  initiated_by: string;
  proposed_rate?: string | number | null;
  cover_message?: string | null;
  created_at?: string;
  job_post?: {
    id?: string | number;
    title?: string;
    status?: string;
    pay_type?: string;
    day_rate_min?: string | number | null;
    day_rate_max?: string | number | null;
    fixed_price?: string | number | null;
    postcode_area?: string | null;
    is_urgent?: boolean;
    employer?: {
      id?: string | number;
      company_name?: string | null;
      client_profile?: {
        display_name?: string | null;
        verification_level?: string | null;
      } | null;
    } | null;
  } | null;
  attachments?: Array<{
    id: string | number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
};

type ApplicationsResponse = {
  items: WorkerApplication[];
  total: number;
};

type StatusTab =
  | 'ALL'
  | 'PENDING'
  | 'REVIEWED'
  | 'SHORTLISTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

const TAB_ORDER: StatusTab[] = [
  'ALL',
  'PENDING',
  'REVIEWED',
  'SHORTLISTED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
];

const WITHDRAWABLE = new Set(['PENDING', 'REVIEWED', 'SHORTLISTED']);

export default function MyApplicationsPage() {
  const { t } = useTranslation('jobs');
  const navigate = useNavigate();
  const { isWorker, loading: accountLoading } = useAccountMe();

  const [data, setData] = useState<WorkerApplication[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StatusTab>('ALL');
  const [withdrawTarget, setWithdrawTarget] = useState<WorkerApplication | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<ApplicationsResponse>(
        '/job-applications/me?page=1&limit=100',
      );
      setData(res.items ?? []);
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('myApplications.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountLoading) void load();
  }, [accountLoading, load]);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = {
      ALL: 0,
      PENDING: 0,
      REVIEWED: 0,
      SHORTLISTED: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
    };
    for (const row of data) {
      c.ALL += 1;
      const k = (row.status ?? '').toUpperCase() as StatusTab;
      if (k in c) c[k] += 1;
    }
    return c;
  }, [data]);

  const visible = useMemo(() => {
    if (tab === 'ALL') return data;
    return data.filter((d) => (d.status ?? '').toUpperCase() === tab);
  }, [data, tab]);

  const invitations = useMemo(
    () => data.filter((d) => d.initiated_by === 'EMPLOYER' && d.status === 'PENDING'),
    [data],
  );

  async function withdraw(application: WorkerApplication) {
    try {
      await api(`/job-applications/${application.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'WITHDRAWN' }),
      });
      toast.success(t('myApplications.withdrawnToast'));
      await load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? t('myApplications.withdrawError'));
    }
  }

  async function respondInvite(application: WorkerApplication, accept: boolean) {
    try {
      await api(`/job-applications/${application.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: accept ? 'ACCEPTED' : 'REJECTED' }),
      });
      toast.success(
        accept
          ? t('myApplications.inviteAcceptedToast')
          : t('myApplications.inviteDeclinedToast'),
      );
      await load();
    } catch (err) {
      toast.error(
        parseApiError(err)?.message ?? t('myApplications.inviteRespondError'),
      );
    }
  }

  if (!accountLoading && !isWorker) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{t('myApplications.title')}</h1>
        <EmptyState
          icon={Inbox}
          title={t('myApplications.notWorkerTitle')}
          description={t('myApplications.notWorkerDesc')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{t('myApplications.title')}</h1>
        <p className="text-sm text-fg-muted">{t('myApplications.subtitle')}</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      {invitations.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-fg">{t('myApplications.invitations')}</h2>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <ApplicationRow
                key={`inv-${String(inv.id)}`}
                application={inv}
                isInvitation
                onWithdraw={() => setWithdrawTarget(inv)}
                onAccept={() => respondInvite(inv, true)}
                onDecline={() => respondInvite(inv, false)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-subtle p-1 sm:w-auto">
          {TAB_ORDER.map((st) => (
            <TabsTrigger key={st} value={st} className="gap-2">
              {t(`myApplications.tab.${st}`)}
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {counts[st]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={t('myApplications.emptyTitle')}
          description={t('myApplications.emptyDesc')}
          action={
            <Button onClick={() => navigate('/jobs')}>{t('myApplications.browseJobs')}</Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <ApplicationRow
              key={String(row.id)}
              application={row}
              onWithdraw={() => setWithdrawTarget(row)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={withdrawTarget != null}
        onOpenChange={(o) => !o && setWithdrawTarget(null)}
        title={t('myApplications.withdrawConfirmTitle')}
        description={t('myApplications.withdrawConfirmDesc')}
        confirmLabel={t('myApplications.withdraw')}
        destructive
        onConfirm={async () => {
          if (withdrawTarget) await withdraw(withdrawTarget);
          setWithdrawTarget(null);
        }}
      />
    </div>
  );
}

function ApplicationRow({
  application,
  isInvitation = false,
  onWithdraw,
  onAccept,
  onDecline,
}: {
  application: WorkerApplication;
  isInvitation?: boolean;
  onWithdraw: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const { t } = useTranslation('jobs');
  const post = application.job_post ?? null;
  const status = (application.status ?? '').toUpperCase();
  // An invitation is responded to (accept/decline) by the worker; a regular
  // application is withdrawn. The worker never "withdraws" someone else's invite.
  const canRespondInvite = isInvitation && status === 'PENDING';
  const canWithdraw = !isInvitation && WITHDRAWABLE.has(status);

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border-default bg-raised p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {post?.id != null && post.title ? (
            <Link
              to={`/jobs/${post.id}`}
              className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {post.title}
            </Link>
          ) : (
            <span className="font-medium text-fg">{post?.title ?? t('myApplications.untitledJob')}</span>
          )}
          <ApplicationStatusBadge status={application.status} />
          <JobStatusBadge status={post?.status} />
          {isInvitation ? <Badge variant="info">{t('applicant.invitation')}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
          <EmployerChip employer={post?.employer ?? null} showBadge={false} />
          {post?.postcode_area ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {post.postcode_area}
            </span>
          ) : null}
          {post ? <span>{formatPay(post, t)}</span> : null}
          {application.created_at ? (
            <span>{t('applicant.applied', { time: formatRelative(application.created_at, t) })}</span>
          ) : null}
          {application.proposed_rate != null ? (
            <span>
              {t('myApplications.proposed', {
                rate: formatMoney(Number(application.proposed_rate), { decimals: 0 }),
              })}
            </span>
          ) : null}
        </div>
        {application.cover_message ? (
          <div className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg">
            <p className="mb-1 text-xs font-medium text-fg-muted">
              {isInvitation
                ? t('myApplications.messageFromEmployer')
                : t('myApplications.yourMessage')}
            </p>
            <p className="whitespace-pre-wrap break-words">{application.cover_message}</p>
          </div>
        ) : null}
        <AttachmentList
          heading={t('myApplications.yourAttachments')}
          attachments={application.attachments}
          previewImages
        />
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {canRespondInvite ? (
          <>
            <Button type="button" size="sm" onClick={onAccept}>
              {t('myApplications.acceptInvite')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDecline}
            >
              {t('myApplications.declineInvite')}
            </Button>
          </>
        ) : null}
        {isInvitation && post?.id != null ? (
          <Button asChild size="sm" variant="ghost">
            <Link to={`/jobs/${post.id}`}>{t('myApplications.viewJob')}</Link>
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button type="button" size="sm" variant="outline" onClick={onWithdraw}>
            {t('myApplications.withdraw')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
