import { type ReactNode, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Check, LogOut, Menu, Monitor, Moon, Settings, Sun, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTheme, useThemePreference, type ThemePreference } from "@/lib/theme";
import { useUnreadCount } from "@/components/chat/useUnreadCount";
import { useAccountMe } from "@/hooks/useAccountMe";
import { publicFileUrl } from "@/lib/files";
import { Footer } from "@/components/Footer";

export type NavItem = { to: string; label: string };

type AppShellProps = {
  loggedIn: boolean;
  publicNav: NavItem[];
  privateNav: NavItem[];
  onLogout: () => void;
  children: ReactNode;
};

export function AppShell({
  loggedIn,
  publicNav,
  privateNav,
  onLogout,
  children,
}: AppShellProps) {
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
          <NavLink
            to={loggedIn ? "/profile" : "/jobs"}
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-fg text-sm font-bold">
              T
            </span>
            <span>TradeHub</span>
          </NavLink>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {items.map((n) => (
              <NavItemLink
                key={n.to}
                item={n}
                badge={
                  loggedIn && n.to === "/inbox" && unreadTotal > 0
                    ? unreadTotal
                    : null
                }
              />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* <ThemeToggle /> */}
            {loggedIn ? (
              <UserMenu onLogout={onLogout} />
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
                    "flex min-h-12 items-center justify-between rounded-md px-3 text-sm font-medium",
                    isActive
                      ? "bg-primary text-primary-fg"
                      : "text-fg-muted hover:bg-subtle hover:text-fg",
                  )
                }
              >
                <span>{n.label}</span>
                {loggedIn && n.to === "/inbox" && unreadTotal > 0 ? (
                  <Badge
                    variant="default"
                    className="ml-2 h-5 min-w-5 justify-center px-1.5 text-xs"
                  >
                    {unreadTotal > 99 ? "99+" : unreadTotal}
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

      <main
        key={location.pathname}
        className="mx-auto w-full max-w-7xl px-4 py-6 sm:py-8"
      >
        {children}
      </main>
      {!loggedIn ? <Footer /> : null}
    </div>
  );
}
AppShell.displayName = "AppShell";

function NavItemLink({
  item,
  badge,
}: {
  item: NavItem;
  badge?: number | null;
}) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-subtle text-fg"
            : "text-fg-muted hover:bg-subtle hover:text-fg",
        )
      }
    >
      <span>{item.label}</span>
      {badge != null && badge > 0 ? (
        <Badge
          variant="default"
          className="h-5 min-w-5 justify-center px-1.5 text-xs"
        >
          {badge > 99 ? "99+" : badge}
        </Badge>
      ) : null}
    </NavLink>
  );
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { account, clientProfile } = useAccountMe();
  const displayName =
    clientProfile?.display_name?.trim() ||
    account?.email?.split("@")[0] ||
    "Account";
  const email = account?.email ?? "";
  const avatarSrc = publicFileUrl(clientProfile?.avatar_url ?? undefined);
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-default bg-raised transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="h-9 w-9">
            {avatarSrc ? <AvatarImage src={avatarSrc} alt={displayName} /> : null}
            <AvatarFallback className="text-xs">
              {initials || <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-2">
          <div className="truncate text-sm font-semibold text-fg">
            {displayName}
          </div>
          {email ? (
            <div className="truncate text-xs text-fg-muted">{email}</div>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <NavLink to="/profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>Profile</span>
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/settings/security" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </NavLink>
        </DropdownMenuItem>
        <ThemeSubmenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onLogout();
          }}
          className="text-fg"
        >
          <LogOut className="h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  Icon: typeof Sun;
}[] = [
  {
    value: "system",
    label: "Auto",
    description: "Use the same theme as your device",
    Icon: Monitor,
  },
  {
    value: "light",
    label: "Light",
    description: "Light background with dark text",
    Icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Dark background with light text",
    Icon: Moon,
  },
];

function ThemeSubmenu() {
  const { preference, effective, setPreference } = useThemePreference();
  const ActiveIcon =
    preference === "system" ? Monitor : effective === "dark" ? Moon : Sun;
  const activeLabel =
    preference === "system"
      ? "Auto"
      : preference === "dark"
      ? "Dark"
      : "Light";

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <ActiveIcon className="h-4 w-4" />
        <span>Theme: {activeLabel}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        {THEME_OPTIONS.map(({ value, label, description, Icon }) => {
          const active = preference === value;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={(e) => {
                e.preventDefault();
                setPreference(value);
              }}
              className="items-start gap-3 py-2"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-fg">{label}</span>
                <span className="text-xs text-fg-muted">{description}</span>
              </div>
              {active ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      onClick={toggle}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

type AuthShellProps = {
  children: ReactNode;
  /** Override the centered max-width on the children container. Defaults to `max-w-md`. */
  contentClassName?: string;
  /** Rendered at the bottom of the viewport (e.g. "Already have an account? Sign in"). */
  footer?: ReactNode;
  /** Adds a faint brand-tinted gradient at the top of the page. */
  headerGradient?: boolean;
  /** Optional element rendered top-right in the header (e.g. a "Change role" link). */
  headerAction?: ReactNode;
};

export function AuthShell({
  children,
  contentClassName,
  footer,
  headerGradient = false,
  headerAction,
}: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-page">
      {headerGradient ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] auth-header-gradient"
        />
      ) : null}
      <header className="relative z-10 flex items-center justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-6">
        <NavLink
          to="/"
          aria-label="TradeHub home"
          className="inline-flex items-center gap-2 font-semibold tracking-tight text-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-fg text-base font-bold">
            T
          </span>
          <span className="text-lg">TradeHub</span>
        </NavLink>
        {headerAction ? (
          <div className="flex items-center">{headerAction}</div>
        ) : null}
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <div className={cn("w-full max-w-md", contentClassName)}>
          {children}
        </div>
      </main>
      {footer ? (
        <footer className="relative z-10 px-4 pb-10 text-center text-sm text-fg-muted">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
AuthShell.displayName = "AuthShell";
