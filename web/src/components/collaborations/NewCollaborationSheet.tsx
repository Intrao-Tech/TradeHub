import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, parseApiError } from '@/api';
import { POSTCODE_OUTWARD_REGEX } from '@/lib/london-boroughs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

/**
 * COLLAB-030 / COLLAB-031 / COLLAB-032 / COLLAB-033 — role-aware
 * create-collaboration sheet. The user's *acting role* selects which
 * counterparty field is shown; the backend rejects passing both
 * (`collaboration.controller.ts:51-55`).
 */

export type NewCollaborationRole = 'WORKER' | 'EMPLOYER';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Whether the user is acting as a worker or employer for this submission.
   * Determines which counterparty id field is rendered.
   */
  role: NewCollaborationRole;
  onCreated: (created: { id: string | number }) => void;
};

const PROJECT_TYPE_MAX = 100;
const POSTCODE_MAX = 10;
const AGREED_AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

export function NewCollaborationSheet({
  open,
  onOpenChange,
  role,
  onCreated,
}: Props) {
  const [counterpartyId, setCounterpartyId] = useState('');
  const [projectType, setProjectType] = useState('');
  const [postcode, setPostcode] = useState('');
  const [agreedAmount, setAgreedAmount] = useState('');
  const [referralId, setReferralId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setCounterpartyId('');
      setProjectType('');
      setPostcode('');
      setAgreedAmount('');
      setReferralId('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const counterpartyIdNum = Number(counterpartyId.trim());
  const counterpartyValid =
    counterpartyId.trim() !== '' &&
    Number.isInteger(counterpartyIdNum) &&
    counterpartyIdNum > 0;

  const normalisedPostcode = postcode.trim().toUpperCase();
  const postcodeValid =
    normalisedPostcode === '' ||
    (normalisedPostcode.length <= POSTCODE_MAX &&
      POSTCODE_OUTWARD_REGEX.test(normalisedPostcode));

  const amountTrimmed = agreedAmount.trim();
  const amountValid =
    amountTrimmed === '' ||
    (AGREED_AMOUNT_REGEX.test(amountTrimmed) && Number(amountTrimmed) >= 0);

  const referralIdNum = Number(referralId.trim());
  const referralValid =
    referralId.trim() === '' ||
    (Number.isInteger(referralIdNum) && referralIdNum > 0);

  const projectTypeValid = projectType.length <= PROJECT_TYPE_MAX;

  const canSubmit =
    counterpartyValid &&
    postcodeValid &&
    amountValid &&
    referralValid &&
    projectTypeValid &&
    !submitting;

  const counterpartyLabel = role === 'WORKER' ? 'Employer ID' : 'Worker ID';
  const counterpartyHelper =
    role === 'WORKER'
      ? "Employer's client profile ID — find it on their public profile."
      : "Worker's client profile ID — find it on the worker's profile page.";
  const browseHref = role === 'WORKER' ? '/employers' : '/workers';
  const browseLabel =
    role === 'WORKER' ? 'Browse employers' : 'Browse workers';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      if (role === 'WORKER') {
        body.employer_id = counterpartyIdNum;
      } else {
        body.worker_id = counterpartyIdNum;
      }
      if (projectType.trim()) body.project_type = projectType.trim();
      if (normalisedPostcode) body.site_postcode = normalisedPostcode;
      if (amountTrimmed !== '') body.agreed_amount = Number(amountTrimmed);
      if (referralId.trim() !== '') body.referral_id = referralIdNum;

      const created = await api<{ id: string | number }>('/collaborations', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success('Collaboration created');
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Could not create collaboration.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>New collaboration</SheetTitle>
          <SheetDescription>
            {role === 'WORKER'
              ? 'Invite an employer to start a tracked engagement on TradeHub.'
              : 'Invite a worker to start a tracked engagement on TradeHub.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="newcoll-counterparty">{counterpartyLabel}</Label>
            <Input
              id="newcoll-counterparty"
              type="number"
              inputMode="numeric"
              min="1"
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(e.target.value)}
              required
            />
            <p className="text-xs text-fg-muted">
              {counterpartyHelper}{' '}
              <Link
                to={browseHref}
                className="text-primary underline-offset-4 hover:underline"
              >
                Counterparty unknown? {browseLabel}.
              </Link>
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="newcoll-project-type">Project type (optional)</Label>
            <Input
              id="newcoll-project-type"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              maxLength={PROJECT_TYPE_MAX}
              placeholder="e.g. Kitchen refit"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="newcoll-postcode">Site postcode (optional)</Label>
              <Input
                id="newcoll-postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                maxLength={POSTCODE_MAX}
                placeholder="e.g. NW1"
                aria-invalid={!postcodeValid}
              />
              {!postcodeValid ? (
                <p className="text-xs text-danger">
                  Use a UK postcode area like NW1 or SW1A.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2.5">
              <Label htmlFor="newcoll-amount">Agreed amount (£, optional)</Label>
              <Input
                id="newcoll-amount"
                type="text"
                inputMode="decimal"
                value={agreedAmount}
                onChange={(e) => setAgreedAmount(e.target.value)}
                placeholder="e.g. 1500"
                aria-invalid={!amountValid}
              />
              {!amountValid ? (
                <p className="text-xs text-danger">
                  Use a non-negative number with up to 2 decimal places.
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="newcoll-referral">Referral ID (optional)</Label>
            <Input
              id="newcoll-referral"
              type="number"
              inputMode="numeric"
              min="1"
              value={referralId}
              onChange={(e) => setReferralId(e.target.value)}
              aria-invalid={!referralValid}
            />
            {!referralValid ? (
              <p className="text-xs text-danger">
                Referral ID must be a positive whole number.
              </p>
            ) : null}
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
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Creating…' : 'Create collaboration'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
NewCollaborationSheet.displayName = 'NewCollaborationSheet';
