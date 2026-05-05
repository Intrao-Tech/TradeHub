import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { ArrowLeft, Check, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { api } from '../api';
import { ConversationListItem, type ConversationListItemData } from '@/components/ConversationListItem';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type LastMessage = {
  id?: string | number;
  sender_id?: string | number;
  content?: string;
  message_type?: string;
  created_at?: string;
} | null;

type InboxItem = {
  conversation: { id: string | number; last_message_at?: string | null; created_at?: string };
  other_participant: {
    account_id?: string | number;
    client_profile_id?: string | number | null;
    display_name?: string | null;
    verification_level?: string | null;
  } | null;
  last_message: LastMessage;
  unread_count: number;
};

type InboxResponse = {
  items: InboxItem[];
  total: number;
  page: number;
  limit: number;
};

type MessageRow = {
  id: string | number;
  sender_id: string | number;
  content: string;
  message_type?: string;
  created_at?: string;
};

type MessagesResponse = {
  items: MessageRow[];
  total: number;
  page: number;
  limit: number;
};

function toConversationData(row: InboxItem): ConversationListItemData {
  const name =
    row.other_participant?.display_name ??
    (row.other_participant?.account_id != null
      ? `Account ${String(row.other_participant.account_id)}`
      : 'Conversation');
  return {
    id: row.conversation.id,
    other_party_name: name,
    other_party_verification_level: row.other_participant?.verification_level ?? null,
    last_message_preview: row.last_message?.content ?? null,
    last_message_at: row.conversation.last_message_at ?? row.last_message?.created_at ?? null,
    unread_count: row.unread_count,
  };
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function InboxPage() {
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [inboxError, setInboxError] = useState('');
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null);
  const [unreadError, setUnreadError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessagesResponse | null>(null);
  const [messagesError, setMessagesError] = useState('');

  const [composeContent, setComposeContent] = useState('');
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [actionError, setActionError] = useState('');
  const [lastActionJson, setLastActionJson] = useState<unknown>(null);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const wsUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8081/api').replace('/api', '');
    const socket = io(`${wsUrl}/chat`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => console.log('[ws] connected'));
    socket.on('disconnect', () => console.log('[ws] disconnected'));

    socket.on('new_message', (data: { conversation_id: string | number }) => {
      void loadUnreadCount();
      void loadInbox();
      if (selectedId && String(data.conversation_id) === selectedId) {
        void openConversation(selectedId);
      }
    });

    socket.on('message_read', () => {
      void loadInbox();
    });

    socketRef.current = socket;
    return () => { socket.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function loadInbox() {
    setInboxError('');
    try {
      const data = await api<InboxResponse>('/conversations?page=1&limit=50');
      setInbox(data);
    } catch (e) {
      setInboxError(e instanceof Error ? e.message : String(e));
      setInbox(null);
    }
  }

  async function loadUnreadCount() {
    setUnreadError('');
    try {
      const data = await api<{ total: number }>('/conversations/unread-count');
      setUnreadTotal(data.total);
    } catch (e) {
      setUnreadError(e instanceof Error ? e.message : String(e));
      setUnreadTotal(null);
    }
  }

  async function openConversation(id: string | number) {
    const sid = String(id);
    setSelectedId(sid);
    setMessages(null);
    setMessagesError('');
    setComposeContent('');
    try {
      const data = await api<MessagesResponse>(`/conversations/${sid}/messages?page=1&limit=100`);
      setMessages(data);
      void loadInbox();
      void loadUnreadCount();
    } catch (e) {
      setMessagesError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void loadInbox();
    void loadUnreadCount();
  }, []);

  async function sendMessage() {
    if (!selectedId || !composeContent.trim()) return;
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: composeContent.trim() }),
      });
      setLastActionJson(out);
      setComposeContent('');
      void openConversation(selectedId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function markRead() {
    if (!selectedId) return;
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/conversations/${selectedId}/read`, { method: 'PATCH' });
      setLastActionJson(out);
      void loadInbox();
      void loadUnreadCount();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function startConversation(e: React.FormEvent) {
    e.preventDefault();
    setActionError('');
    setLastActionJson(null);
    if (!newRecipientId.trim() || !newMessageText.trim()) {
      setActionError('recipient_id and message required');
      return;
    }
    try {
      const out = await api('/conversations', {
        method: 'POST',
        body: JSON.stringify({
          recipient_id: Number(newRecipientId),
          message: newMessageText.trim(),
        }),
      });
      setLastActionJson(out);
      setNewRecipientId('');
      setNewMessageText('');
      void loadInbox();
      void loadUnreadCount();
      const cid = (out as { id?: string | number })?.id;
      if (cid != null) void openConversation(cid);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  // Derive who I am from the selected conversation's sender context.
  // Simplistic heuristic: the "other participant" in the inbox row is the other person,
  // so a message with sender_id matching inbox row's other_participant.account_id is theirs.
  const activeInboxRow = inbox?.items.find(
    (row) => String(row.conversation.id) === selectedId,
  );
  const otherPartyId = activeInboxRow?.other_participant?.account_id;

  const sortedMessages = messages?.items
    ? [...messages.items].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-fg-muted">
            Total unread:{' '}
            <span className="font-semibold text-fg">
              {unreadTotal != null ? unreadTotal : '—'}
            </span>
            {unreadError ? (
              <span className="ml-2 text-danger">{unreadError}</span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void loadInbox();
            void loadUnreadCount();
          }}
        >
          <RefreshCw />
          Refresh
        </Button>
      </div>

      {actionError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionError}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>New conversation</CardTitle>
          <CardDescription>Start or continue a chat with another account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={startConversation}
            className="grid gap-4 sm:grid-cols-[200px_1fr_auto] sm:items-end"
          >
            <div className="space-y-2">
              <Label htmlFor="new-recipient">Recipient account ID</Label>
              <Input
                id="new-recipient"
                type="number"
                value={newRecipientId}
                onChange={(e) => setNewRecipientId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-message">Message</Label>
              <Textarea
                id="new-message"
                rows={2}
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                required
              />
            </div>
            <Button type="submit">Start</Button>
          </form>
        </CardContent>
      </Card>

      <div
        className={cn(
          'grid gap-4 lg:grid-cols-[320px_1fr]',
          selectedId ? 'lg:grid-cols-[320px_1fr]' : '',
        )}
      >
        <aside
          className={cn(
            'space-y-2',
            selectedId ? 'hidden lg:block' : 'block',
          )}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversations</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {inboxError ? (
                <div
                  role="alert"
                  className="m-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
                >
                  {inboxError}
                </div>
              ) : null}
              {inbox?.items?.length ? (
                <ul className="flex flex-col gap-1">
                  {inbox.items.map((row) => {
                    const cid = String(row.conversation.id);
                    return (
                      <li key={cid}>
                        <ConversationListItem
                          conversation={toConversationData(row)}
                          active={selectedId === cid}
                          onSelect={(c) => void openConversation(c.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : inbox ? (
                <div className="p-2">
                  <EmptyState
                    icon={MessageSquare}
                    title="No conversations"
                    description="Start one above."
                  />
                </div>
              ) : (
                <p className="p-3 text-sm text-fg-muted">Loading…</p>
              )}
            </CardContent>
          </Card>
        </aside>

        <section
          className={cn(
            'flex min-h-[60vh] flex-col',
            selectedId ? 'block' : 'hidden lg:block',
          )}
        >
          <Card className="flex h-full min-h-[60vh] flex-col">
            <CardHeader className="flex flex-row items-center gap-2 border-b border-border-default">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Back to inbox"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft />
              </Button>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">
                  {selectedId
                    ? activeInboxRow?.other_participant?.display_name ??
                      `Conversation ${selectedId}`
                    : 'Messages'}
                </CardTitle>
                {selectedId ? (
                  <CardDescription>ID: {selectedId}</CardDescription>
                ) : (
                  <CardDescription>Select a conversation.</CardDescription>
                )}
              </div>
              {selectedId ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void markRead()}>
                  <Check />
                  Mark read
                </Button>
              ) : null}
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              {messagesError ? (
                <div
                  role="alert"
                  className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
                >
                  {messagesError}
                </div>
              ) : null}

              {selectedId ? (
                sortedMessages.length > 0 ? (
                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                    {sortedMessages.map((m) => {
                      const theirs =
                        otherPartyId != null &&
                        String(m.sender_id) === String(otherPartyId);
                      return (
                        <div key={String(m.id)} className="flex flex-col">
                          <div
                            className={
                              theirs
                                ? 'mr-auto max-w-[75%] rounded-lg bg-subtle text-fg px-3 py-2 text-sm whitespace-pre-wrap'
                                : 'ml-auto max-w-[75%] rounded-lg bg-primary text-primary-fg px-3 py-2 text-sm whitespace-pre-wrap'
                            }
                          >
                            {m.content}
                          </div>
                          <span
                            className={cn(
                              'mt-1 text-xs text-fg-subtle',
                              theirs ? 'mr-auto' : 'ml-auto',
                            )}
                          >
                            {m.message_type && m.message_type !== 'TEXT'
                              ? `${m.message_type} · `
                              : ''}
                            {formatTime(m.created_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : messages && !messagesError ? (
                  <div className="flex flex-1 items-center justify-center">
                    <EmptyState
                      icon={MessageSquare}
                      title="No messages yet"
                      description="Send the first message below."
                    />
                  </div>
                ) : (
                  <p className="text-sm text-fg-muted">Loading…</p>
                )
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <EmptyState
                    icon={MessageSquare}
                    title="Select a conversation"
                    description="Pick one from the list to view messages."
                  />
                </div>
              )}

              {selectedId ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMessage();
                  }}
                  className="flex items-end gap-2 border-t border-border-default pt-3"
                >
                  <Input
                    value={composeContent}
                    onChange={(e) => setComposeContent(e.target.value)}
                    placeholder="Write a message…"
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" aria-label="Send">
                    <Send />
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>

      {lastActionJson ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-fg-muted">Last action response</h3>
          <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
            {JSON.stringify(lastActionJson, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
