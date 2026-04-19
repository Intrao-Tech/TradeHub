import { BadgeCheck, Circle, ShieldCheck, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type VerificationState = 'unverified' | 'kyc' | 'reviewed' | 'hmrc';

type VerificationBadgeProps = {
  state: VerificationState;
  className?: string;
};

const CONFIG: Record<VerificationState, { label: string; variant: 'outline' | 'info' | 'warning' | 'success'; icon: typeof BadgeCheck }> = {
  unverified: { label: 'Unverified', variant: 'outline', icon: Circle },
  kyc: { label: 'KYC verified', variant: 'info', icon: ShieldCheck },
  reviewed: { label: 'Reviewed', variant: 'warning', icon: Star },
  hmrc: { label: 'HMRC confirmed', variant: 'success', icon: BadgeCheck },
};

export function VerificationBadge({ state, className }: VerificationBadgeProps) {
  const cfg = CONFIG[state];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className={cn('gap-1', className)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
VerificationBadge.displayName = 'VerificationBadge';

export function verificationFromLevel(level?: string | number | null): VerificationState {
  if (level == null) return 'unverified';
  const s = String(level).toUpperCase();
  if (s === 'HMRC' || s === '3') return 'hmrc';
  if (s === 'REVIEWED' || s === '2') return 'reviewed';
  if (s === 'KYC' || s === '1') return 'kyc';
  return 'unverified';
}
