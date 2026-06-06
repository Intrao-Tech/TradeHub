import { BadgeCheck, Circle, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Trust ladder rungs (per Verification spec §3.2).
 * One badge per profile — surfaces overall trust level.
 *
 * State machine: UNVERIFIED → BASIC → CERTIFIED → PREMIUM (monotonic).
 *
 * Backend persists the level as the uppercase enum on `client_profile.verification_level`;
 * this component accepts either case and is forgiving on unknowns (renders Unverified).
 */
export type VerificationState = 'unverified' | 'basic' | 'certified' | 'premium';

type VerificationBadgeProps = {
  state: VerificationState;
  className?: string;
};

const CONFIG: Record<
  VerificationState,
  {
    labelKey: ParseKeys<'common'>;
    variant: 'outline' | 'info' | 'warning' | 'success';
    icon: typeof BadgeCheck;
  }
> = {
  unverified: { labelKey: 'verification.unverified', variant: 'outline', icon: Circle },
  basic: { labelKey: 'verification.basic', variant: 'info', icon: ShieldCheck },
  certified: { labelKey: 'verification.certified', variant: 'success', icon: BadgeCheck },
  premium: { labelKey: 'verification.premium', variant: 'warning', icon: Sparkles },
};

export function VerificationBadge({ state, className }: VerificationBadgeProps) {
  const { t } = useTranslation('common');
  const cfg = CONFIG[state];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className={cn('max-w-full gap-1', className)}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{t(cfg.labelKey)}</span>
    </Badge>
  );
}
VerificationBadge.displayName = 'VerificationBadge';

/**
 * Maps a backend `verification_level` string to the badge state. Forgiving:
 * unknown / null inputs render as `unverified`.
 */
export function verificationFromLevel(
  level?: string | number | null,
): VerificationState {
  if (level == null) return 'unverified';
  const s = String(level).toUpperCase();
  if (s === 'PREMIUM') return 'premium';
  if (s === 'CERTIFIED') return 'certified';
  if (s === 'BASIC') return 'basic';
  return 'unverified';
}
