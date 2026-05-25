import { useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { Button } from '@/components/ui/button';

export type OnboardingStatus = {
  has_account: boolean;
  account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: { currently_due: string[]; past_due: string[] };
  onboarding_url: string | null;
};

type OnboardingBannerProps = {
  status: OnboardingStatus | null;
  onRefresh?: () => void;
};

/**
 * Renders the worker's Stripe Connect onboarding state at the top of /wallet.
 * Three states: no account → "Set up payouts"; partial onboarding → "Resume
 * onboarding"; complete → success badge.
 */
export function OnboardingBanner({ status, onRefresh }: OnboardingBannerProps) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  if (!status) {
    return (
      <div className="rounded-md border border-border-default bg-raised p-4 text-sm text-fg-muted">
        Loading payout status…
      </div>
    );
  }

  async function start() {
    setError('');
    setStarting(true);
    try {
      const res = await api<{ onboarding_url: string }>(
        '/escrow/onboarding/start',
        { method: 'POST' },
      );
      if (res.onboarding_url) {
        window.location.href = res.onboarding_url;
      }
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Failed to start onboarding.');
      setStarting(false);
    }
  }

  function resume() {
    if (status?.onboarding_url) {
      window.location.href = status.onboarding_url;
    }
  }

  if (status.payouts_enabled) {
    return (
      <div
        role="status"
        className="rounded-md border border-success/40 bg-success-subtle p-4 text-sm text-success"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span className="font-medium">Payouts enabled</span>
        </div>
        <p className="mt-1 text-success/80">
          You're set up to receive funds. When an employer approves a milestone,
          payment goes straight to your linked bank account on Stripe's standard
          schedule (usually within 2 working days for UK accounts).
        </p>
      </div>
    );
  }

  if (status.has_account) {
    const hasOpenRequirements =
      status.requirements.currently_due.length > 0 ||
      status.requirements.past_due.length > 0;
    return (
      <div className="rounded-md border border-warning/40 bg-warning-subtle p-4 text-sm text-warning space-y-3">
        <div className="flex items-center gap-2">
          <CircleAlert className="h-4 w-4" />
          <span className="font-medium">Onboarding incomplete</span>
        </div>
        <p>
          You've started Stripe Connect onboarding but haven't finished. Until
          it's complete, employers can't fund milestones for your work.
        </p>
        {hasOpenRequirements ? (
          <p className="text-xs text-warning/80">
            Stripe is waiting on:{' '}
            {[
              ...status.requirements.past_due,
              ...status.requirements.currently_due,
            ]
              .slice(0, 5)
              .map((r) => r.replace(/_/g, ' '))
              .join(', ')}
            {status.requirements.currently_due.length +
              status.requirements.past_due.length >
            5
              ? '…'
              : ''}
            .
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="text-xs text-danger">
            {error}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={resume}
            disabled={!status.onboarding_url}
          >
            Resume onboarding
          </Button>
          {onRefresh ? (
            <Button type="button" variant="ghost" onClick={onRefresh}>
              Refresh status
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-info/40 bg-info-subtle p-4 text-sm text-info space-y-3">
      <div className="flex items-center gap-2">
        <CircleAlert className="h-4 w-4" />
        <span className="font-medium">Set up payouts</span>
      </div>
      <p>
        To receive payments for collaborations, you need to set up your Stripe
        Connect account. Stripe handles the verification and pays funds straight
        to your bank.
      </p>
      {error ? (
        <div role="alert" className="text-xs text-danger">
          {error}
        </div>
      ) : null}
      <Button type="button" onClick={start} disabled={starting}>
        {starting ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Starting…
          </span>
        ) : (
          'Set up payouts'
        )}
      </Button>
    </div>
  );
}
