import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox, LifeBuoy, MessageCircle, Send } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '../EmptyState';
import { publicFileUrl } from '../../lib/files';

function initials(name?: string | null): string {
  if (!name) return 'TH';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || 'TH'
  );
}

type Thread = {
  id: string;
  client: {
    id: string;
    display_name: string;
    slug: string;
    email: string;
    avatar_url: string | null;
    status: string;
  };
  assignee: { id: string; display_name: string } | null;
  last_message_at: string | null;
  unread_from_client: number;
};

type Msg = {
  id: string;
  from: 'CLIENT' | 'STAFF' | 'SYSTEM';
  sender_display_name: string | null;
  sender_email: string | null;
  content: string | null;
  message_type: string;
  file_url: string | null;
  original_name: string | null;
  created_at: string;
};

type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  staff_role: 'ADMIN' | 'STAFF';
  status: string;
};

export function AdminSupportTab() {
  const { account, isAdmin } = useAccountMe();
  const [searchParams] = useSearchParams();
  const deeplinkClientId = searchParams.get('clientId');
  const deeplinkHandledRef = useRef(false);
  const myStaffId = account?.staff_member?.id ? String(account.staff_member.id) : null;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [filter, setFilter] = useState<'all' | 'mine' | 'unassigned' | 'unread'>(
    'all',
  );
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [active, setActive] = useState<{ clientId: string; thread: Thread } | null>(
    null,
  );
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sendErr, setSendErr] = useState('');
  const [staffRoster, setStaffRoster] = useState<StaffRow[]>([]);

  const loadThreads = useCallback(async () => {
    setErr('');
    try {
      const usp = new URLSearchParams();
      if (q.trim()) usp.set('q', q.trim());
      if (filter === 'mine') usp.set('assigned_to_me', 'true');
      if (filter === 'unassigned') usp.set('unassigned_only', 'true');
      if (filter === 'unread') usp.set('has_unread', 'true');
      const data = await api<{ data: Thread[] }>(
        `/admin/support/threads?${usp.toString()}`,
      );
      setThreads(data.data);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Failed to load threads');
    }
  }, [q, filter]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    // Roster fetch is best-effort; permission is STAFF-readable so it works
    // for any logged-in staff member.
    void api<StaffRow[]>('/staff')
      .then(setStaffRoster)
      .catch(() => setStaffRoster([]));
  }, []);

  // Deeplink: /admin?tab=support&clientId=N — auto-open that client's thread
  // (creating it lazily on the backend if they've never written to support).
  useEffect(() => {
    if (!deeplinkClientId || deeplinkHandledRef.current) return;
    deeplinkHandledRef.current = true;
    (async () => {
      try {
        const data = await api<
          | { exists: false; client_profile_id: string }
          | {
              exists: true;
              id: string;
              client: Thread['client'];
              assignee: Thread['assignee'];
              last_message_at: string | null;
            }
        >(`/admin/support/threads/${deeplinkClientId}`);
        const thread: Thread = data.exists
          ? {
              id: data.id,
              client: data.client,
              assignee: data.assignee,
              last_message_at: data.last_message_at,
              unread_from_client: 0,
            }
          : {
              id: 'new',
              client: {
                id: data.client_profile_id,
                display_name: '',
                slug: '',
                email: '',
                avatar_url: null,
                status: 'ACTIVE',
              },
              assignee: null,
              last_message_at: null,
              unread_from_client: 0,
            };
        await openThread(thread);
      } catch (e) {
        setSendErr(
          parseApiError(e)?.message ?? 'Failed to open thread for this user',
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deeplinkClientId]);

  async function openThread(t: Thread) {
    setActive({ clientId: t.client.id, thread: t });
    setMessages([]);
    setSendErr('');
    try {
      const data = await api<{ data: Msg[] }>(
        `/admin/support/threads/${t.client.id}/messages?limit=50`,
      );
      setMessages(data.data);
      await api(`/admin/support/threads/${t.client.id}/read`, {
        method: 'POST',
      });
      void loadThreads();
    } catch (e) {
      setSendErr(parseApiError(e)?.message ?? 'Failed to load messages');
    }
  }

  async function send() {
    if (!active) return;
    if (!draft.trim()) return;
    setSendErr('');
    try {
      const m = await api<Msg>(
        `/admin/support/threads/${active.clientId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content: draft.trim() }),
        },
      );
      setMessages((arr) => [...arr, m]);
      setDraft('');
    } catch (e) {
      setSendErr(parseApiError(e)?.message ?? 'Send failed');
    }
  }

  async function assignTo(assigneeStaffId: string | null) {
    if (!active) return;
    setSendErr('');
    try {
      await api(`/admin/support/threads/${active.clientId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignee_staff_id: assigneeStaffId }),
      });
      // Reflect the change in the active thread immediately
      const newAssignee = assigneeStaffId
        ? staffRoster.find((s) => s.id === assigneeStaffId)
        : null;
      setActive((prev) =>
        prev
          ? {
              ...prev,
              thread: {
                ...prev.thread,
                assignee: newAssignee
                  ? { id: newAssignee.id, display_name: newAssignee.display_name }
                  : null,
              },
            }
          : prev,
      );
      // And refresh the list (badges / order may shift)
      void loadThreads();
    } catch (e) {
      setSendErr(parseApiError(e)?.message ?? 'Assign failed');
    }
  }

  function assignMe() {
    if (!myStaffId) return;
    void assignTo(myStaffId);
  }
  function unassign() {
    void assignTo(null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] h-[calc(100vh-280px)]">
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-fg-muted" />
            <CardTitle>Support threads</CardTitle>
          </div>
          <CardDescription>
            One thread per client. Any staff member can reply as "TradeHub
            Support".
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto space-y-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search by name, email, slug"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(['all', 'mine', 'unassigned', 'unread'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? 'primary' : 'outline'}
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
          {err ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {err}
            </div>
          ) : null}
          {threads.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No threads match"
              description="Try a different filter or search term."
            />
          ) : (
            <div className="space-y-1">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => void openThread(t)}
                  className={`w-full text-left rounded border px-3 py-2 transition-colors ${
                    active?.clientId === t.client.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border-subtle hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 shrink-0">
                      {t.client.avatar_url ? (
                        <AvatarImage
                          src={publicFileUrl(t.client.avatar_url)}
                          alt={t.client.display_name}
                        />
                      ) : null}
                      <AvatarFallback>
                        {initials(t.client.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">
                          {t.client.display_name}
                        </span>
                        {t.unread_from_client > 0 ? (
                          <Badge variant="warning">
                            {t.unread_from_client}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-fg-muted truncate">
                        {t.client.email}
                      </div>
                      <div className="text-xs text-fg-muted">
                        {t.last_message_at
                          ? `Last: ${new Date(t.last_message_at).toLocaleString()}`
                          : 'No messages yet'}
                      </div>
                      {t.assignee ? (
                        <div className="text-[10px] text-fg-muted mt-1">
                          Assignee: {t.assignee.display_name}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-fg-muted" />
            <CardTitle>
              {active
                ? `${active.thread.client.display_name} (${active.thread.client.email})`
                : 'Pick a thread'}
            </CardTitle>
          </div>
          {active ? (
            <CardDescription>
              The client sees you as "TradeHub Support".
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden flex flex-col gap-3">
          {!active ? (
            <EmptyState
              icon={MessageCircle}
              title="No thread selected"
              description="Select a support thread on the left to read and reply."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge
                  variant={
                    active.thread.client.status === 'ACTIVE'
                      ? 'success'
                      : 'warning'
                  }
                >
                  {active.thread.client.status}
                </Badge>
                <div className="flex flex-wrap items-center gap-2">
                  {isAdmin && staffRoster.length > 0 ? (
                    <Select
                      value={active.thread.assignee?.id ?? '__UNASSIGNED__'}
                      onValueChange={(v) =>
                        void assignTo(v === '__UNASSIGNED__' ? null : v)
                      }
                    >
                      <SelectTrigger className="h-8 w-56 text-xs">
                        <SelectValue placeholder="Assign to…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__UNASSIGNED__">
                          — Unassigned —
                        </SelectItem>
                        {staffRoster
                          .filter((s) => s.status === 'ACTIVE')
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.display_name} ({s.staff_role})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : active.thread.assignee ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unassign()}
                    >
                      Unassign ({active.thread.assignee.display_name})
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => assignMe()}
                      disabled={!myStaffId}
                    >
                      Take ownership
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-auto rounded border border-border-subtle p-3 space-y-2 bg-subtle/50">
                {messages.length === 0 ? (
                  <p className="text-sm text-fg-muted text-center py-6">
                    No messages yet.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[90%] rounded px-3 py-2 text-sm break-words sm:max-w-[80%] ${
                        m.from === 'STAFF'
                          ? 'bg-primary text-primary-fg ml-auto'
                          : m.from === 'CLIENT'
                            ? 'bg-raised border border-border-subtle'
                            : 'bg-warning-subtle text-warning text-xs italic mx-auto text-center'
                      }`}
                    >
                      {m.from !== 'SYSTEM' && m.sender_display_name ? (
                        <div className="text-[10px] opacity-80 mb-1">
                          {m.from === 'STAFF'
                            ? `${m.sender_display_name} → client`
                            : m.sender_display_name}
                        </div>
                      ) : null}
                      {m.content ? <div>{m.content}</div> : null}
                      {m.file_url ? (
                        <a
                          className="underline text-xs"
                          href={m.file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📎 {m.original_name ?? 'attachment'}
                        </a>
                      ) : null}
                      <div className="text-[10px] opacity-70 mt-1">
                        {new Date(m.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {sendErr ? (
                <div className="text-sm text-danger">{sendErr}</div>
              ) : null}
              <div className="flex gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Reply as TradeHub Support… (⌘/Ctrl + Enter to send)"
                  className="min-h-[60px] text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button onClick={() => void send()}>
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
