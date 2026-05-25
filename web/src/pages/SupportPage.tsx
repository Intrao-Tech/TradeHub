import { useCallback, useEffect, useRef, useState } from 'react';
import { LifeBuoy, Send } from 'lucide-react';
import { api, parseApiError } from '../api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/EmptyState';

type Msg = {
  id: string;
  from: 'CLIENT' | 'STAFF';
  display_name: string | null;
  content: string | null;
  message_type: string;
  file_url: string | null;
  original_name: string | null;
  created_at: string;
};

type ThreadResponse = {
  thread: { id: string; last_message_at: string | null };
  data: Msg[];
};

export default function SupportPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const [sendErr, setSendErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await api<ThreadResponse>('/support/thread?limit=100');
      setMessages(data.data);
      // Mark as read on every view
      try {
        await api('/support/thread/read', { method: 'POST' });
      } catch {
        /* non-fatal */
      }
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Failed to load support thread');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    if (!draft.trim()) return;
    setSendErr('');
    setSending(true);
    try {
      const m = await api<Msg>('/support/messages', {
        method: 'POST',
        body: JSON.stringify({ content: draft.trim() }),
      });
      setMessages((arr) => [...arr, m]);
      setDraft('');
    } catch (e) {
      setSendErr(parseApiError(e)?.message ?? 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="text-sm text-fg-muted">
          One thread for everything. Our team usually replies within a few
          hours.
        </p>
      </div>

      <Card className="flex h-[calc(100vh-12rem)] min-h-[480px] flex-col sm:h-[70vh]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-fg-muted" />
            <CardTitle>TradeHub Support</CardTitle>
          </div>
          <CardDescription>
            Tell us what's going on — billing, account, payouts, anything. We
            keep the full conversation here so any agent can pick up from
            where we left off.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden">
          {err ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {err}
            </div>
          ) : null}

          <div className="flex-1 overflow-auto rounded border border-border-subtle bg-subtle/50 p-3">
            {messages.length === 0 ? (
              <EmptyState
                icon={LifeBuoy}
                title={loading ? 'Loading…' : 'No messages yet'}
                description="Send your first message below — support will reply here."
              />
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[90%] rounded px-3 py-2 text-sm break-words sm:max-w-[80%]',
                      m.from === 'CLIENT'
                        ? 'ml-auto bg-primary text-primary-fg'
                        : 'border border-border-subtle bg-raised',
                    )}
                  >
                    {m.from === 'STAFF' && m.display_name ? (
                      <div className="text-[10px] uppercase tracking-wide opacity-80 mb-1">
                        {m.display_name}
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
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {sendErr ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {sendErr}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message… (⌘/Ctrl + Enter to send)"
              className="min-h-[60px] flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              onClick={() => void send()}
              disabled={sending}
              className="sm:self-end"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
