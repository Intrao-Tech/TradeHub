import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../api';

type LastMessage = {
  id?: string | number;
  sender_id?: string | number;
  content?: string;
  message_type?: string;
  created_at?: string;
} | null;

type InboxItem = {
  conversation: { id: string | number; last_message_at?: string | null; created_at?: string };
  other_participant: { account_id?: string | number; display_name?: string | null } | null;
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

function jsonPre(data: unknown) {
  return (
    <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', fontSize: 12 }}>
      {data == null ? '' : JSON.stringify(data, null, 2)}
    </pre>
  );
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

  return (
    <div>
      <h1>Inbox</h1>
      {actionError ? <div style={{ color: 'red', marginBottom: 8 }}>{actionError}</div> : null}

      <p>
        Total unread:{' '}
        <strong>
          {unreadTotal != null ? unreadTotal : '—'}
        </strong>
        {unreadError ? <span style={{ color: 'red', marginLeft: 8 }}>{unreadError}</span> : null}
      </p>

      <button type="button" onClick={() => { void loadInbox(); void loadUnreadCount(); }} style={{ marginBottom: 12 }}>
        Refresh inbox + unread
      </button>

      <h2>New conversation</h2>
      <form onSubmit={startConversation} style={{ display: 'grid', gap: 8, maxWidth: 400, marginBottom: 24 }}>
        <label>
          recipient_id (account){' '}
          <input type="number" value={newRecipientId} onChange={(e) => setNewRecipientId(e.target.value)} />
        </label>
        <label>
          message{' '}
          <textarea value={newMessageText} onChange={(e) => setNewMessageText(e.target.value)} rows={3} style={{ width: '100%' }} required />
        </label>
        <button type="submit">Start / continue conversation</button>
      </form>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 280 }}>
          <h2>Conversations</h2>
          {inboxError ? <div style={{ color: 'red' }}>{inboxError}</div> : null}
          {inbox?.items?.length ? (
            <ul style={{ listStyle: 'none', padding: 0, fontSize: 13 }}>
              {inbox.items.map((row) => {
                const cid = String(row.conversation.id);
                const name = row.other_participant?.display_name ?? `account ${String(row.other_participant?.account_id ?? '?')}`;
                const preview = row.last_message?.content ?? '—';
                const unread = row.unread_count;
                return (
                  <li key={cid} style={{ border: '1px solid #ccc', padding: 8, marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => void openConversation(row.conversation.id)}
                      style={{ background: 'none', border: 'none', color: '#06c', cursor: 'pointer', fontWeight: 600, padding: 0, textAlign: 'left' }}
                    >
                      {name}
                    </button>
                    <div style={{ fontSize: 12, color: '#444', marginTop: 4 }}>{preview.slice(0, 120)}{preview.length > 120 ? '…' : ''}</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>unread: {unread}</div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>{inbox ? 'No conversations.' : 'Loading…'}</p>
          )}
          <h3>Raw inbox</h3>
          {jsonPre(inbox)}
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          <h2>Messages</h2>
          {selectedId ? <p>conversation id: {selectedId}</p> : <p>Select a conversation.</p>}
          {messagesError ? <div style={{ color: 'red' }}>{messagesError}</div> : null}
          {messages?.items?.length ? (
            <ul style={{ fontSize: 13, paddingLeft: 16 }}>
              {[...messages.items]
                .sort((a, b) => {
                  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                  return ta - tb;
                })
                .map((m) => (
                  <li key={String(m.id)} style={{ marginBottom: 8 }}>
                    <div>
                      <strong>sender_id {String(m.sender_id)}</strong> · {m.message_type ?? 'TEXT'} · {m.created_at ?? '—'}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  </li>
                ))}
            </ul>
          ) : selectedId && !messagesError ? (
            <p>{messages ? 'No messages.' : 'Loading…'}</p>
          ) : null}

          {selectedId ? (
            <div style={{ marginTop: 12 }}>
              <textarea
                value={composeContent}
                onChange={(e) => setComposeContent(e.target.value)}
                placeholder="message"
                rows={3}
                style={{ width: '100%', maxWidth: 480 }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void sendMessage()}>
                  Send
                </button>
                <button type="button" onClick={() => void markRead()}>
                  Mark Read
                </button>
              </div>
            </div>
          ) : null}

          <h3>Raw messages</h3>
          {jsonPre(messages)}
        </div>
      </div>

      <h2>Last action response</h2>
      {jsonPre(lastActionJson)}
    </div>
  );
}
