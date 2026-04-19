import { useState, useEffect } from 'react';
import { Briefcase, Inbox } from 'lucide-react';
import { api } from '../api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';

type ApplicationRow = {
  id: string | number;
  status: string;
  initiated_by: string;
  proposed_rate?: string | number | null;
  job_post?: { title?: string; id?: string | number } | null;
};

type AppListResponse = {
  items: ApplicationRow[];
  total: number;
  page: number;
  limit: number;
};

type JobPostRow = {
  id: string | number;
  title: string;
  status?: string;
};

type JobListResponse = {
  items: JobPostRow[];
  total: number;
  page: number;
  limit: number;
};

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger' | 'info';

function statusBadgeVariant(status: string): BadgeVariant {
  const s = status.toUpperCase();
  if (s === 'ACCEPTED') return 'success';
  if (s === 'PENDING' || s === 'INVITED' || s === 'REVIEWED' || s === 'SHORTLISTED') return 'warning';
  if (s === 'REJECTED' || s === 'WITHDRAWN') return 'danger';
  return 'outline';
}

export default function MyApplicationsPage() {
  const [workerList, setWorkerList] = useState<AppListResponse | null>(null);
  const [workerError, setWorkerError] = useState('');
  const [employerPosts, setEmployerPosts] = useState<JobListResponse | null>(null);
  const [employerError, setEmployerError] = useState('');
  const [actionError, setActionError] = useState('');
  const [lastActionJson, setLastActionJson] = useState<unknown>(null);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobApps, setJobApps] = useState<AppListResponse | null>(null);
  const [jobAppsError, setJobAppsError] = useState('');

  const [inviteWorkerId, setInviteWorkerId] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');

  async function loadWorkerApps() {
    setWorkerError('');
    try {
      const data = await api<AppListResponse>('/job-applications/me?page=1&limit=50');
      setWorkerList(data);
    } catch (e) {
      setWorkerError(e instanceof Error ? e.message : String(e));
      setWorkerList(null);
    }
  }

  async function loadEmployerPosts() {
    setEmployerError('');
    try {
      const data = await api<JobListResponse>('/job-posts/me?page=1&limit=50');
      setEmployerPosts(data);
    } catch (e) {
      setEmployerError(e instanceof Error ? e.message : String(e));
      setEmployerPosts(null);
    }
  }

  useEffect(() => {
    void loadWorkerApps();
    void loadEmployerPosts();
  }, []);

  async function loadApplicationsForJob(jobId: string | number) {
    const sid = String(jobId);
    setSelectedJobId(sid);
    setJobApps(null);
    setJobAppsError('');
    try {
      const data = await api<AppListResponse>(`/job-applications/jobs/${sid}?page=1&limit=50`);
      setJobApps(data);
    } catch (e) {
      setJobAppsError(e instanceof Error ? e.message : String(e));
    }
  }

  async function patchAppStatus(id: string | number, status: string) {
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/job-applications/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setLastActionJson(out);
      await loadWorkerApps();
      if (selectedJobId) void loadApplicationsForJob(selectedJobId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toCollaboration(id: string | number) {
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/job-applications/${id}/to-collaboration`, { method: 'POST' });
      setLastActionJson(out);
      if (selectedJobId) void loadApplicationsForJob(selectedJobId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function inviteWorker(jobPostId: string) {
    setActionError('');
    setLastActionJson(null);
    if (!inviteWorkerId.trim()) {
      setActionError('worker_id required');
      return;
    }
    try {
      const out = await api(`/job-applications/jobs/${jobPostId}/invite`, {
        method: 'POST',
        body: JSON.stringify({
          worker_id: Number(inviteWorkerId),
          message: inviteMessage.trim() || undefined,
        }),
      });
      setLastActionJson(out);
      setInviteWorkerId('');
      setInviteMessage('');
      void loadApplicationsForJob(jobPostId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">My applications</h1>
        <p className="text-sm text-fg-muted">Track your applications and manage invitations.</p>
      </div>

      {actionError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionError}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Worker: my applications</CardTitle>
              <CardDescription>Applications you've submitted or been invited to.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadWorkerApps()}>
              Refresh worker list
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {workerError ? (
            <div
              role="alert"
              className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning"
            >
              {workerError}
            </div>
          ) : null}

          {workerList?.items?.length ? (
            <ul className="space-y-2">
              {workerList.items.map((a) => {
                const id = String(a.id);
                return (
                  <li
                    key={id}
                    className="flex flex-col gap-3 rounded-md border border-border-default bg-raised p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">
                          {a.job_post?.title ?? String(a.job_post?.id ?? '—')}
                        </span>
                        <Badge variant={statusBadgeVariant(a.status)}>{a.status}</Badge>
                        <Badge variant="outline">{a.initiated_by}</Badge>
                      </div>
                      <p className="text-xs text-fg-muted">
                        Proposed rate:{' '}
                        {a.proposed_rate != null ? String(a.proposed_rate) : '—'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchAppStatus(a.id, 'WITHDRAWN')}
                      >
                        Withdraw
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : workerList ? (
            <EmptyState
              icon={Inbox}
              title="No applications"
              description="No applications (or not a worker)."
            />
          ) : (
            <p className="text-sm text-fg-muted">…</p>
          )}

          <details className="text-xs text-fg-muted">
            <summary className="cursor-pointer">Raw JSON</summary>
            <pre className="mt-2 rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
              {workerList == null ? '' : JSON.stringify(workerList, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Employer: my job posts</CardTitle>
              <CardDescription>Select a post to view applicants.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadEmployerPosts()}>
              Refresh employer posts
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {employerError ? (
            <div
              role="alert"
              className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning"
            >
              {employerError}
            </div>
          ) : null}

          {employerPosts?.items?.length ? (
            <ul className="space-y-2">
              {employerPosts.items.map((p) => {
                const isSelected = selectedJobId === String(p.id);
                return (
                  <li key={String(p.id)}>
                    <button
                      type="button"
                      onClick={() => void loadApplicationsForJob(p.id)}
                      className={
                        'flex w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                        (isSelected
                          ? 'border-border-strong bg-subtle'
                          : 'border-border-default bg-raised hover:bg-subtle')
                      }
                    >
                      <span className="font-medium text-fg">{p.title}</span>
                      {p.status ? <Badge variant="outline">{p.status}</Badge> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : employerPosts ? (
            <EmptyState
              icon={Briefcase}
              title="No job posts"
              description="No job posts (or not an employer)."
            />
          ) : (
            <p className="text-sm text-fg-muted">…</p>
          )}

          <details className="text-xs text-fg-muted">
            <summary className="cursor-pointer">Raw JSON</summary>
            <pre className="mt-2 rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
              {employerPosts == null ? '' : JSON.stringify(employerPosts, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Applications for selected job</CardTitle>
          <CardDescription>
            {selectedJobId ? `job_post_id: ${selectedJobId}` : 'Select a job post above.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobAppsError ? (
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {jobAppsError}
            </div>
          ) : null}

          {jobApps?.items?.length ? (
            <ul className="space-y-2">
              {jobApps.items.map((a) => {
                const id = String(a.id);
                return (
                  <li
                    key={id}
                    className="space-y-3 rounded-md border border-border-default bg-raised p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">application id {id}</span>
                      <Badge variant={statusBadgeVariant(a.status)}>{a.status}</Badge>
                      <Badge variant="outline">{a.initiated_by}</Badge>
                      {a.proposed_rate != null ? (
                        <span className="text-xs text-fg-muted">
                          rate: {String(a.proposed_rate)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchAppStatus(a.id, 'REVIEWED')}
                      >
                        Review
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchAppStatus(a.id, 'SHORTLISTED')}
                      >
                        Shortlist
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void patchAppStatus(a.id, 'ACCEPTED')}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchAppStatus(a.id, 'REJECTED')}
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void toCollaboration(a.id)}
                      >
                        Convert to Collaboration
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : selectedJobId && !jobAppsError ? (
            jobApps ? (
              <EmptyState
                icon={Inbox}
                title="No applications"
                description="This job post has no applications yet."
              />
            ) : (
              <p className="text-sm text-fg-muted">Loading…</p>
            )
          ) : null}

          <details className="text-xs text-fg-muted">
            <summary className="cursor-pointer">Raw JSON</summary>
            <pre className="mt-2 rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
              {jobApps == null ? '' : JSON.stringify(jobApps, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>

      {selectedJobId ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite worker to this job</CardTitle>
            <CardDescription>Send an invitation to a specific worker.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-worker-id">worker_id</Label>
              <Input
                id="invite-worker-id"
                type="number"
                value={inviteWorkerId}
                onChange={(e) => setInviteWorkerId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-message">Message (optional)</Label>
              <Textarea
                id="invite-message"
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                rows={2}
              />
            </div>
            <Button type="button" onClick={() => void inviteWorker(selectedJobId)}>
              Invite Worker
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Last mutation response</CardTitle>
          <CardDescription>Debug view of the most recent API response.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
            {lastActionJson == null ? '' : JSON.stringify(lastActionJson, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
