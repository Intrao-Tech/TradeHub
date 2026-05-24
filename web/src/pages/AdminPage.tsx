import { lazy, Suspense, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccountMe } from '@/hooks/useAccountMe';
import {
  Bell,
  ClipboardCheck,
  CreditCard,
  Gauge,
  Hammer,
  LifeBuoy,
  ListChecks,
  ScaleIcon,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StaffManagementCard } from '@/components/StaffManagementCard';
import { VerificationQueueTab } from '@/components/admin/VerificationQueueTab';
import { EscrowDisputesTab } from '@/components/admin/EscrowDisputesTab';
import { PlatformSettingsTab } from '@/components/admin/PlatformSettingsTab';
import { AdminDashboardTab } from '@/components/admin/AdminDashboardTab';
import { AdminUsersTab } from '@/components/admin/AdminUsersTab';
import { AdminApprovalsTab } from '@/components/admin/AdminApprovalsTab';
import { AdminApprovalRulesTab } from '@/components/admin/AdminApprovalRulesTab';
import { AdminSupportTab } from '@/components/admin/AdminSupportTab';
import { AdminSlaTab } from '@/components/admin/AdminSlaTab';
import { AdminSpecialisationsTab } from '@/components/admin/AdminSpecialisationsTab';
import { AdminTagsTab } from '@/components/admin/AdminTagsTab';
import { AdminPlansTab } from '@/components/admin/AdminPlansTab';
import { AdminAuditTab } from '@/components/admin/AdminAuditTab';
import { AdminRolesTab } from '@/components/admin/AdminRolesTab';

// Lazy — same chunk used by the standalone /notifications route, so this
// doesn't ship a second copy.
const NotificationsPage = lazy(() => import('./NotificationsPage'));

type TabDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  render: () => React.ReactNode;
  /**
   * Permission required to even *see* this tab in the nav.
   * Tabs whose body gates management inside (e.g. Approval rules, where
   * everyone can view the list but only roles.manage can create) leave
   * this unset.
   */
  requiredPermission?: string;
};

type Section = {
  id: string;
  label: string;
  tabs: TabDef[];
};

const SECTIONS: Section[] = [
  {
    id: 'personal',
    label: 'Personal',
    tabs: [
      {
        id: 'notifications',
        label: 'Notifications',
        icon: Bell,
        // Open to every staff member — no permission gate.
        render: () => (
          <Suspense fallback={<p className="text-sm text-fg-muted">Loading…</p>}>
            <NotificationsPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    id: 'overview',
    label: 'Overview',
    tabs: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: Gauge,
        requiredPermission: 'dashboard.read',
        render: () => <AdminDashboardTab />,
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    tabs: [
      {
        id: 'users',
        label: 'Users',
        icon: Users,
        requiredPermission: 'users.read',
        render: () => <AdminUsersTab />,
      },
      {
        id: 'staff',
        label: 'Staff members',
        icon: ShieldCheck,
        requiredPermission: 'staff.read',
        render: () => <StaffManagementCard />,
      },
      {
        id: 'roles',
        label: 'Roles & permissions',
        icon: ShieldCheck,
        requiredPermission: 'staff.read',
        render: () => <AdminRolesTab />,
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    tabs: [
      {
        id: 'approvals',
        label: 'Approvals',
        icon: ShieldAlert,
        requiredPermission: 'approvals.read',
        render: () => <AdminApprovalsTab />,
      },
      {
        id: 'approval-rules',
        label: 'Approval rules',
        icon: ListChecks,
        requiredPermission: 'approvals.read',
        render: () => <AdminApprovalRulesTab />,
      },
      {
        id: 'sla',
        label: 'SLA',
        icon: ShieldAlert,
        // SLA list view is staff-readable; manage is gated inside the tab.
        requiredPermission: 'dashboard.read',
        render: () => <AdminSlaTab />,
      },
      {
        id: 'documents',
        label: 'Verification',
        icon: ClipboardCheck,
        requiredPermission: 'verification.read',
        render: () => <VerificationQueueTab />,
      },
      {
        id: 'escrow-disputes',
        label: 'Escrow disputes',
        icon: ScaleIcon,
        requiredPermission: 'escrow_disputes.read',
        render: () => <EscrowDisputesTab />,
      },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    tabs: [
      {
        id: 'support',
        label: 'Support threads',
        icon: LifeBuoy,
        requiredPermission: 'support.read',
        render: () => <AdminSupportTab />,
      },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    tabs: [
      {
        id: 'specialisations',
        label: 'Specialisations',
        icon: Hammer,
        // Catalog list views are public on the marketplace; gate by staff.read
        // so non-staff don't see admin chrome but any staff can browse.
        requiredPermission: 'staff.read',
        render: () => <AdminSpecialisationsTab />,
      },
      {
        id: 'tags',
        label: 'Tags',
        icon: Tag,
        requiredPermission: 'staff.read',
        render: () => <AdminTagsTab />,
      },
      {
        id: 'plans',
        label: 'Subscription plans',
        icon: CreditCard,
        requiredPermission: 'staff.read',
        render: () => <AdminPlansTab />,
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    tabs: [
      {
        id: 'platform-settings',
        label: 'Platform settings',
        icon: Settings,
        // Settings page reads platform_setting (public) but is admin-only to
        // write. We gate visibility on the write perm to avoid teasing it.
        requiredPermission: 'platform.settings.write',
        render: () => <PlatformSettingsTab />,
      },
      {
        id: 'audit',
        label: 'Audit log',
        icon: ScrollText,
        requiredPermission: 'audit.read',
        render: () => <AdminAuditTab />,
      },
    ],
  },
];

function visibleSections(canSee: (perm?: string) => boolean): Section[] {
  return SECTIONS.map((s) => ({
    ...s,
    tabs: s.tabs.filter((t) => canSee(t.requiredPermission)),
  })).filter((s) => s.tabs.length > 0);
}

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, loading } = useAccountMe();
  const tabParam = searchParams.get('tab');

  const canSee = (perm?: string) => !perm || hasPermission(perm);
  const sections = useMemo(
    () => visibleSections(canSee),
    // hasPermission identity changes when account loads — recompute then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPermission],
  );
  const allowedTabs = sections.flatMap((s) => s.tabs);
  const active =
    allowedTabs.find((t) => t.id === tabParam) ?? allowedTabs[0] ?? null;

  function setTab(tabId: string) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    // Drop any per-tab params when switching so we don't carry over stale state
    for (const key of Array.from(next.keys())) {
      if (key !== 'tab') next.delete(key);
    }
    setSearchParams(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-fg-muted">
          Operate the platform — review queues, approve actions, manage users,
          and configure the catalog.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav
            aria-label="Admin sections"
            className="space-y-4 lg:sticky lg:top-4 lg:self-start"
          >
            {sections.map((section) => (
              <div key={section.id} className="space-y-1">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = active && tab.id === active.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTab(tab.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-fg hover:bg-subtle',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="min-w-0 space-y-4">{active?.render()}</div>
        </div>
      )}
    </div>
  );
}
