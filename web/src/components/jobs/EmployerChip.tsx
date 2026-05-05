import { Link } from 'react-router-dom';
import { VerificationBadge, verificationFromLevel } from '@/components/VerificationBadge';

type EmployerChipInput = {
  id?: string | number;
  company_name?: string | null;
  client_profile?: {
    display_name?: string | null;
    verification_level?: string | number | null;
    avatar_url?: string | null;
  } | null;
};

export function EmployerChip({ employer, showBadge = true }: { employer: EmployerChipInput | null | undefined; showBadge?: boolean }) {
  if (!employer) return null;
  const name =
    employer.client_profile?.display_name ||
    employer.company_name ||
    'Employer';
  const level = employer.client_profile?.verification_level ?? null;
  const id = employer.id != null ? String(employer.id) : null;

  const label = (
    <span className="text-sm font-medium text-fg">{name}</span>
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {id ? (
        <Link
          to={`/employers/${id}`}
          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
        </Link>
      ) : (
        label
      )}
      {showBadge ? <VerificationBadge state={verificationFromLevel(level)} /> : null}
    </span>
  );
}
EmployerChip.displayName = 'EmployerChip';
