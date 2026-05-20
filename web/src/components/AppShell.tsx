import { type ReactNode, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ArrowLeft, Menu, Moon, Sun, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTheme } from '@/lib/theme';
import { useUnreadCount } from '@/components/chat/useUnreadCount';
import { Footer } from '@/components/Footer';

export type NavItem = { to: string; label: string };

type AppShellProps = {
  loggedIn: boolean;
  publicNav: NavItem[];
  privateNav: NavItem[];
  onLogout: () => void;
  children: ReactNode;
};

export function AppShell({ loggedIn, publicNav, privateNav, onLogout, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const items = [...publicNav, ...(loggedIn ? privateNav : [])];
  // Surface the chat unread badge in the nav whenever the user is logged in.
  // Hook is no-op'd internally when there's no token.
  const { total: unreadTotal } = useUnreadCount();

  return (
    <div className="min-h-screen bg-page text-fg">
      <header className="sticky top-0 z-40 border-b border-border-default bg-raised/95 backdrop-blur supports-[backdrop-filter]:bg-raised/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6">
          <NavLink to={loggedIn ? '/dashboard' : '/jobs'} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-fg text-sm font-bold">T</span>
            <span>TradeHub</span>
          </NavLink>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {items.map((n) => (
              <NavItemLink
                key={n.to}
                item={n}
                badge={loggedIn && n.to === '/inbox' && unreadTotal > 0 ? unreadTotal : null}
              />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* <ThemeToggle /> */}
            {loggedIn ? (
              <Button size="sm" variant="outline" onClick={onLogout}>Logout</Button>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button size="sm" variant="ghost" asChild>
                  <NavLink to="/login">Login</NavLink>
                </Button>
                <Button size="sm" asChild>
                  <NavLink to="/register">Sign up</NavLink>
                </Button>
              </div>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="md:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-border-default px-4 py-3">
            <SheetTitle className="flex items-center justify-between">
              <span>Menu</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 p-3">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 items-center justify-between rounded-md px-3 text-sm font-medium',
                    isActive
                      ? 'bg-primary text-primary-fg'
                      : 'text-fg-muted hover:bg-subtle hover:text-fg',
                  )
                }
              >
                <span>{n.label}</span>
                {loggedIn && n.to === '/inbox' && unreadTotal > 0 ? (
                  <Badge variant="default" className="ml-2 h-5 min-w-5 justify-center px-1.5 text-xs">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </Badge>
                ) : null}
              </NavLink>
            ))}
            {!loggedIn && (
              <>
                <NavLink
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 flex min-h-12 items-center rounded-md px-3 text-sm font-medium text-fg-muted hover:bg-subtle hover:text-fg"
                >
                  Login
                </NavLink>
                <NavLink
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-12 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                >
                  Sign up
                </NavLink>
              </>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      <main key={location.pathname} className="mx-auto w-full max-w-7xl px-4 py-6 sm:py-8">
        {children}
      </main>
      {!loggedIn ? <Footer /> : null}
    </div>
  );
}
AppShell.displayName = 'AppShell';

function NavItemLink({ item, badge }: { item: NavItem; badge?: number | null }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-subtle text-fg'
            : 'text-fg-muted hover:bg-subtle hover:text-fg',
        )
      }
    >
      <span>{item.label}</span>
      {badge != null && badge > 0 ? (
        <Badge variant="default" className="h-5 min-w-5 justify-center px-1.5 text-xs">
          {badge > 99 ? '99+' : badge}
        </Badge>
      ) : null}
    </NavLink>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

type AuthShellProps = {
  children: ReactNode;
  /** Optional back link target (rendered as a small arrow icon top-left). `null` hides it. */
  backTo?: string | null;
  /** Aria label for the back link (default: "Back"). */
  backLabel?: string;
};

export function AuthShell({
  children,
  backTo = '/jobs',
  backLabel = 'Back',
}: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-page px-4 py-10">
      {backTo ? (
        <NavLink
          to={backTo}
          aria-label={backLabel}
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-fg-muted hover:bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-6 sm:top-6"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </NavLink>
      ) : null}
      <div className="w-full max-w-md">
        <NavLink to="/" className="mb-6 flex items-center justify-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-fg text-base font-bold">T</span>
          <span className="text-lg">TradeHub</span>
        </NavLink>
        {children}
      </div>
    </div>
  );
}
AuthShell.displayName = 'AuthShell';
