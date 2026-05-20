import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link } from 'react-router-dom';
import { MapPin, Star, X } from 'lucide-react';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export type SignupGateStat = { label: string; value: string };

type SignupGatePopupProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Action verb for the heading. Default: "view this profile". */
  action?: string;
  name: string;
  /** URL to return to after sign-up / login (e.g. /workers/123). */
  nextPath: string;
  avatarUrl?: string | null;
  avatarShape?: 'circle' | 'square';
  subtitle?: string | null;
  location?: string | null;
  stats?: SignupGateStat[];
  rating?: number | null;
};

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}

export function SignupGatePopup({
  open,
  onOpenChange,
  action = 'view this profile',
  name,
  nextPath,
  avatarUrl,
  avatarShape = 'circle',
  subtitle,
  location,
  stats,
  rating,
}: SignupGatePopupProps) {
  const signupHref = `/register?next=${encodeURIComponent(nextPath)}`;
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
  const avatarRounded = avatarShape === 'square' ? 'rounded-md' : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-label={`Sign up to ${action}`}
          className={cn(
            'fixed inset-0 z-50 grid h-screen w-screen grid-cols-1 bg-raised md:grid-cols-[3fr_2fr]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        >
          <div className="relative flex flex-col px-6 py-10 sm:px-12">
            <Link
              to="/"
              aria-label="TradeHub home"
              className="inline-flex items-center gap-2 self-start font-semibold tracking-tight text-fg hover:opacity-90"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-fg text-base font-bold">
                T
              </span>
              <span className="text-lg">TradeHub</span>
            </Link>

            <div className="m-auto w-full max-w-md space-y-6">
              <DialogPrimitive.Title className="text-center text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                Sign up to {action}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Sign up or log in to view the full {name} profile.
              </DialogPrimitive.Description>

              <div className="space-y-3">
                <Button asChild size="lg" className="w-full">
                  <Link to={signupHref}>Sign up</Link>
                </Button>
                <p className="text-center text-sm text-fg-muted">
                  Already have an account?{' '}
                  <Link
                    to={loginHref}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Log in
                  </Link>
                </p>
              </div>
            </div>
          </div>

          <div className="relative hidden bg-footer text-footer-fg md:flex md:items-center md:justify-center">
            <div className="signup-gate-spotlight pointer-events-none absolute inset-0" aria-hidden />
            <div className="signup-gate-stripes pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative w-72 rounded-2xl border border-footer-border bg-footer p-6 text-center shadow-2xl">
              <Avatar className={cn('mx-auto h-20 w-20', avatarRounded)}>
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
                <AvatarFallback className={avatarRounded}>{initials(name)}</AvatarFallback>
              </Avatar>
              <p className="mt-4 text-lg font-semibold">{name}</p>
              {subtitle ? (
                <p className="mt-1 text-sm text-footer-fg-muted">{subtitle}</p>
              ) : null}
              {location ? (
                <p className="mt-2 inline-flex items-center justify-center gap-1 text-sm text-footer-fg-muted">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {location}
                </p>
              ) : null}

              {stats && stats.length > 0 ? (
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {stats.map((s) => (
                    <div key={s.label}>
                      <p className="text-base font-semibold">{s.value}</p>
                      <p className="text-xs text-footer-fg-muted">{s.label}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {rating != null ? (
                <div className="mt-4 inline-flex items-center justify-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        'h-5 w-5',
                        i < Math.round(rating)
                          ? 'fill-primary text-primary'
                          : 'text-footer-fg-muted',
                      )}
                      aria-hidden
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <DialogPrimitive.Close
            aria-label="Close"
            className={cn(
              'absolute right-4 top-4 rounded-sm text-fg-muted transition-opacity',
              'opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring',
              'md:text-footer-fg',
            )}
          >
            <X className="h-6 w-6" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
SignupGatePopup.displayName = 'SignupGatePopup';
