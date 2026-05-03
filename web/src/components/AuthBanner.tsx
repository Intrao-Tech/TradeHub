import type { ReactNode } from 'react';

export type AuthBannerVariant = 'info' | 'success' | 'warning' | 'danger';

type AuthBannerProps = {
  variant?: AuthBannerVariant;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
};

const VARIANT_CLASSES: Record<AuthBannerVariant, string> = {
  info: 'border-info/40 bg-info-subtle text-info',
  success: 'border-success/40 bg-success-subtle text-success',
  warning: 'border-warning/40 bg-warning-subtle text-warning',
  danger: 'border-danger/40 bg-danger-subtle text-danger',
};

export function AuthBanner({
  variant = 'info',
  title,
  children,
  action,
}: AuthBannerProps) {
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 text-sm ${VARIANT_CLASSES[variant]}`}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <div className="text-sm">{children}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Maps backend error codes / `?reason=` query params to a banner config.
 * Returns `null` when no banner should show.
 */
export function bannerFromReason(reason: string | null): {
  variant: AuthBannerVariant;
  title: string;
  message: string;
} | null {
  switch (reason) {
    case 'expired':
      return {
        variant: 'warning',
        title: 'Session expired',
        message: 'Please sign in again to continue.',
      };
    case 'deactivated':
      return {
        variant: 'danger',
        title: 'Account deactivated',
        message:
          'This account has been deactivated. Contact support if you believe this is a mistake.',
      };
    case 'password_changed':
      return {
        variant: 'success',
        title: 'Password updated',
        message: 'You can now sign in with your new password.',
      };
    case 'verified':
      return {
        variant: 'success',
        title: 'Email verified',
        message: 'Welcome to TradeHub.',
      };
    case 'logged_out':
      return {
        variant: 'info',
        title: 'Signed out',
        message: 'You have been signed out.',
      };
    default:
      return null;
  }
}
