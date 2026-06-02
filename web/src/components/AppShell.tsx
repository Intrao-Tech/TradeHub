import { type ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Check,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Power,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { api, parseApiError } from "@/api";
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
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { useAccountMe } from "@/hooks/useAccountMe";
import { publicFileUrl } from "@/lib/files";
import { Footer } from "@/components/Footer";
import { AuthFooter } from "@/components/AuthFooter";
import { LanguageSubmenu, LanguageSwitcher } from "@/components/LanguageSwitcher";

export type NavItem = {
  to: string;
  label: string;
  /**
   * Role gate. When set, the nav item is hidden unless the current account
   * has the matching profile (worker_profile / employer_profile). Dual-role
   * accounts see both. Unset items are shown to anyone logged in.
   */
  requires?: 'worker' | 'employer';
  /**
   * Inverse of `requires`. When set, hides the item from accounts that
   * have the matching role — e.g. a logged-in worker doesn't need to see
   * /workers in their nav. Logged-out viewers always see these items.
   */
  hideForRole?: 'worker' | 'employer';
};

// Route → common-namespace key for nav labels. The English `label` in App.tsx
// stays as the fallback; adding a route here translates its nav chip.
const NAV_LABEL_KEY: Record<string, string> = {
  "/jobs": "nav.jobs",
  "/workers": "nav.workers",
  "/employers": "nav.employers",
  "/my-applications": "nav.applications",
  "/my-jobs": "nav.postedJobs",
  "/collaborations": "nav.collaborations",
  "/payments": "nav.payments",
  "/referrals": "nav.referrals",
  "/inbox": "nav.inbox",
  "/support": "nav.support",
};

type AppShellProps = {
  loggedIn: boolean;
  publicNav: NavItem[];
  privateNav: NavItem[];
  onLogout: () => void;
  /**
   * Hide the marketing footer. Used by the staff app where the footer is
   * irrelevant (no public CTAs, mobile-app links etc.).
   */
  hideFooter?: boolean;
  children: ReactNode;
};

export function AppShell({
  loggedIn,
  publicNav,
  privateNav,
  onLogout,
  hideFooter = false,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useTranslation("common");
  const location = useLocation();
  // Reset scroll on route change — without this the browser keeps the
  // previous page's scroll Y, dropping users into the middle of the next page.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);
  // Role-based filter for private nav items. Public items are always shown.
  // We read account roles here (hook is no-op'd when there's no token).
  const { isWorker, isEmployer } = useAccountMe();
  const items = [...publicNav, ...(loggedIn ? privateNav : [])].filter((n) => {
    if (n.requires === 'worker' && !isWorker) return false;
    if (n.requires === 'employer' && !isEmployer) return false;
    if (n.hideForRole === 'worker' && isWorker) return false;
    if (n.hideForRole === 'employer' && isEmployer) return false;
    return true;
  });
  // Surface the chat unread badge in the nav whenever the user is logged in.
  // Hook is no-op'd internally when there's no token.
  const { total: unreadTotal } = useUnreadCount();
  // Staff role chip (e.g. ADMIN / STAFF / FINANCE_REVIEWER) next to the logo
  // — only shown for staff accounts.
  const { account } = useAccountMe();
  const staffMember = account?.staff_member as
    | { staff_role?: string; is_on_duty?: boolean }
    | null
    | undefined;
  const staffRole = staffMember?.staff_role ?? null;
  const isOnDuty = staffMember?.is_on_duty === true;

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

          {staffRole ? (
            <Badge
              variant={staffRole === 'ADMIN' ? 'default' : 'secondary'}
              className="gap-1.5 text-[10px] uppercase tracking-wide"
              aria-label={t('menu.staffBadgeAria', {
                role: staffRole,
                duty: isOnDuty ? t('menu.dutyOn') : t('menu.dutyOff'),
              })}
            >
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  isOnDuty ? 'bg-success' : 'bg-fg-muted/50',
                )}
                aria-hidden
              />
              {staffRole}
            </Badge>
          ) : null}

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
            {loggedIn ? <NotificationsBell /> : null}
            {loggedIn ? (
              <UserMenu onLogout={onLogout} isStaff={!!staffMember} isOnDuty={isOnDuty} />
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button size="sm" variant="ghost" asChild>
                  <NavLink to="/login">{t("header.login")}</NavLink>
                </Button>
                <Button size="sm" asChild>
                  <NavLink to="/register">{t("header.signUp")}</NavLink>
                </Button>
              </div>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="md:hidden"
              aria-label={t("menu.open")}
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
            <SheetTitle>{t("menu.title")}</SheetTitle>
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
                <span>{t(NAV_LABEL_KEY[n.to] ?? "", { defaultValue: n.label })}</span>
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
                  {t("header.login")}
                </NavLink>
                <NavLink
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-12 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                >
                  {t("header.signUp")}
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
      {hideFooter ? null : loggedIn ? <AuthFooter /> : <Footer />}
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
  const { t } = useTranslation("common");
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
      <span>{t(NAV_LABEL_KEY[item.to] ?? "", { defaultValue: item.label })}</span>
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

function UserMenu({
  onLogout,
  isStaff,
  isOnDuty,
}: {
  onLogout: () => void;
  isStaff: boolean;
  isOnDuty: boolean;
}) {
  const { t } = useTranslation("common");
  const { account, clientProfile, refetch } = useAccountMe();
  const [dutyBusy, setDutyBusy] = useState(false);
  const [dutyErr, setDutyErr] = useState('');
  async function toggleDuty() {
    if (!isStaff || dutyBusy) return;
    setDutyBusy(true);
    setDutyErr('');
    try {
      await api('/staff/me/duty', {
        method: 'POST',
        body: JSON.stringify({ on_duty: !isOnDuty }),
      });
      await refetch();
    } catch (e) {
      setDutyErr(parseApiError(e)?.message ?? t('menu.dutyError'));
    } finally {
      setDutyBusy(false);
    }
  }
  const displayName =
    clientProfile?.display_name?.trim() ||
    account?.email?.split("@")[0] ||
    t("menu.account");
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
          aria-label={t("menu.openAccount")}
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
        {isStaff ? (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void toggleDuty();
            }}
            disabled={dutyBusy}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <Power
                className={cn(
                  'h-4 w-4',
                  isOnDuty ? 'text-success' : 'text-fg-muted',
                )}
              />
              <span>{isOnDuty ? t('menu.onDuty') : t('menu.offDuty')}</span>
            </span>
            <span className="text-xs text-fg-muted">
              {dutyBusy
                ? '…'
                : isOnDuty
                  ? t('menu.clickToGoOff')
                  : t('menu.clickToGoOn')}
            </span>
          </DropdownMenuItem>
        ) : null}
        {isStaff && dutyErr ? (
          <div className="px-2 py-1 text-[11px] text-danger">{dutyErr}</div>
        ) : null}
        {clientProfile ? (
          <DropdownMenuItem asChild>
            <NavLink to="/profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{t("menu.profile")}</span>
            </NavLink>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <NavLink to="/settings/security" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>{t("menu.settings")}</span>
          </NavLink>
        </DropdownMenuItem>
        <ThemeSubmenu />
        <LanguageSubmenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onLogout();
          }}
          className="text-fg"
        >
          <LogOut className="h-4 w-4" />
          <span>{t("menu.logOut")}</span>
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
  const { t } = useTranslation("common");
  const { preference, effective, setPreference } = useThemePreference();
  const ActiveIcon =
    preference === "system" ? Monitor : effective === "dark" ? Moon : Sun;
  const activeKey =
    preference === "system" ? "auto" : preference === "dark" ? "dark" : "light";

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <ActiveIcon className="h-4 w-4" />
        <span>
          {t("theme.label")}: {t(`theme.${activeKey}`)}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        {THEME_OPTIONS.map(({ value, Icon }) => {
          const active = preference === value;
          const key = value === "system" ? "auto" : value;
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
                <span className="text-sm font-medium text-fg">{t(`theme.${key}`)}</span>
                <span className="text-xs text-fg-muted">{t(`theme.${key}Desc`)}</span>
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
        <div className="flex items-center gap-2">
          {headerAction ? (
            <div className="flex items-center">{headerAction}</div>
          ) : null}
          <LanguageSwitcher />
        </div>
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
