import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, HandHelping } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { getToken, parseApiError } from '@/api';
import {
  claimHandoff,
  declineHandoff,
  getHandoffByToken,
  type HandoffStatus,
  type HandoffWithViewer,
} from '@/components/handoff/api';

const TERMINAL: Partial<Record<HandoffStatus, string>> = {
  APPLIED: 'This handoff has already been taken.',
  DECLINED: 'This handoff was declined.',
  REVOKED: 'The sender cancelled this handoff.',
  EXPIRED: 'This handoff link has expired.',
};

const PAY_TYPE_LABEL: Record<string, string> = {
  DAY_RATE: 'Day rate',
  FIXED_PRICE: 'Fixed price',
  HOURLY: 'Hourly',
};

export default function HandoffLandingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const loggedIn = !!getToken();
  const [loading, setLoading] = useState(true);
  const [handoff, setHandoff] = useState<HandoffWithViewer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setHandoff(await getHandoffByToken(token));
      setError(null);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Handoff link not found.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function take() {
    if (!token || !handoff?.job_post) return;
    setBusy(true);
    try {
      await claimHandoff(token);
      toast.success('Job claimed — submit your application to take it.');
      // The apply flow consumes the claimed handoff (stamps provenance +
      // commission). `?apply=1` opens the apply sheet on arrival so this is
      // one tap, not two.
      navigate(`/jobs/${handoff.job_post.id}?apply=1`);
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not take this job');
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function pass() {
    if (!token) return;
    setBusy(true);
    try {
      await declineHandoff(token);
      toast.success('Handoff passed.');
      navigate('/jobs');
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not pass this job');
      void load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <p className="text-sm text-fg-muted">Loading handoff…</p>
      </div>
    );
  }

  if (error || !handoff) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm text-fg">{error ?? 'Handoff not found.'}</p>
            <Button asChild variant="outline">
              <Link to="/jobs">Browse jobs</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const job = handoff.job_post;
  const handerName = handoff.from_worker.display_name ?? 'A tradesperson';
  const terminalMsg = TERMINAL[handoff.status];

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <HandHelping className="h-5 w-5" />
            <span className="text-sm font-medium">A job was handed to you</span>
          </div>
          <CardTitle className="text-xl">
            {job ? job.title : 'This job'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-fg">
            <strong>{handerName}</strong> handed you this job
            {job?.employer_name ? (
              <>
                {' '}
                from <strong>{job.employer_name}</strong>
              </>
            ) : null}
            .
          </p>

          {job ? (
            <div className="flex flex-wrap gap-2 text-xs text-fg-muted">
              {job.postcode_area ? (
                <Badge variant="outline">{job.postcode_area}</Badge>
              ) : null}
              <Badge variant="outline">
                {PAY_TYPE_LABEL[job.pay_type] ?? job.pay_type}
              </Badge>
            </div>
          ) : null}

          {handoff.message ? (
            <blockquote className="rounded-md border-l-2 border-border-default bg-subtle px-3 py-2 text-sm italic text-fg">
              “{handoff.message}”
            </blockquote>
          ) : null}

          {terminalMsg ? (
            <p className="rounded-md bg-subtle px-3 py-2 text-sm text-fg-muted">
              {terminalMsg}
            </p>
          ) : !loggedIn ? (
            <div className="space-y-2">
              <p className="text-sm text-fg-muted">
                Log in or sign up as a tradesperson to take this job.
              </p>
              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <Link to={`/login?next=/handoff/${token}`}>Log in</Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link to={`/register?next=/handoff/${token}`}>Sign up</Link>
                </Button>
              </div>
            </div>
          ) : handoff.viewer.is_hander ? (
            <p className="rounded-md bg-subtle px-3 py-2 text-sm text-fg-muted">
              This is the handoff you created. Send the link to a mate.
            </p>
          ) : handoff.viewer.target_mismatch ? (
            <p className="rounded-md bg-subtle px-3 py-2 text-sm text-fg-muted">
              This handoff was sent to someone else.
            </p>
          ) : !handoff.viewer.is_worker ? (
            <p className="rounded-md bg-subtle px-3 py-2 text-sm text-fg-muted">
              Only tradespeople can take a job handoff. Switch to a worker
              account to continue.
            </p>
          ) : handoff.viewer.can_claim ? (
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() => void take()}
              >
                Take this job
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void pass()}
              >
                Pass
              </Button>
            </div>
          ) : (
            <p className="rounded-md bg-subtle px-3 py-2 text-sm text-fg-muted">
              This job is no longer available to take.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
