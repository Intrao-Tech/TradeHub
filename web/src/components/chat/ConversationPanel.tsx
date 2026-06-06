import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, MessageSquare } from 'lucide-react';
import { ApiError, api, parseApiError } from '@/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AuthBanner } from '@/components/AuthBanner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { VerificationBadge, verificationFromLevel } from '@/components/VerificationBadge';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { TypingIndicator } from './TypingIndicator';
import { useChatSocket } from './useChatSocket';
import type {
  ChatMessage,
  ConversationDetail,
  InboxItem,
  MessagesResponse,
  OptimisticMessage,
} from './types';

const TYPING_RECEIVED_TIMEOUT_MS = 3000;
const MARK_READ_THROTTLE_MS = 2000;

type ConversationPanelProps = {
  conversationId: string;
  myAccountId: string | number | null;
  inboxRow: InboxItem | null;
  onBack?: () => void;
  onConversationGone?: () => void;
};

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}

export function ConversationPanel({
  conversationId,
  myAccountId,
  inboxRow,
  onBack,
  onConversationGone,
}: ConversationPanelProps) {
  const { t } = useTranslation('chat');
  const { on, emit, connected, socket } = useChatSocket();

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const [composerValue, setComposerValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const otherTypingTimer = useRef<number | null>(null);
  const lastMarkReadAt = useRef<number>(0);
  const markReadTimer = useRef<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // A conversation is a strict 1:1 with a collaboration — the two parties are
  // its worker + employer. Derive "the other party" from whichever side the
  // current account is on.
  const iAmWorker = useMemo(() => {
    if (!detail || myAccountId == null) return null;
    return String(detail.collaboration.worker_id) === String(myAccountId);
  }, [detail, myAccountId]);

  const otherParty = useMemo(() => {
    if (!detail || iAmWorker == null) return null;
    return iAmWorker
      ? detail.collaboration.employer.client_profile
      : detail.collaboration.worker.client_profile;
  }, [detail, iAmWorker]);

  const otherDisplayName =
    otherParty?.display_name ??
    inboxRow?.other_participant?.display_name ??
    t('panel.counterparty');
  const otherAvatar =
    otherParty?.avatar_url ?? inboxRow?.other_participant?.avatar_url ?? null;
  const otherVerification =
    otherParty?.verification_level ??
    inboxRow?.other_participant?.verification_level ??
    null;

  // The other party's read cursor — for the "Seen" marker.
  const otherLastReadAt = useMemo<string | null>(() => {
    if (!detail || iAmWorker == null) return null;
    return iAmWorker
      ? detail.employer_last_read_at
      : detail.worker_last_read_at;
  }, [detail, iAmWorker]);

  const collaboration = detail?.collaboration ?? inboxRow?.collaboration ?? null;

  // ── Load detail + messages ─────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setAccessError(null);
    setAuthError(null);
    try {
      const [d, m] = await Promise.all([
        api<ConversationDetail>(`/conversations/${conversationId}`),
        api<MessagesResponse>(
          `/conversations/${conversationId}/messages?page=1&limit=100`,
        ),
      ]);
      setDetail(d);
      // Server returns newest-first; we want oldest-first for the timeline.
      const ordered = [...m.items].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      });
      setMessages(ordered);
    } catch (err) {
      const parsed = parseApiError(err);
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.status === 404)
      ) {
        setAccessError(parsed?.message ?? t('panel.notFound'));
      } else if (parsed?.code === 'EMAIL_NOT_VERIFIED') {
        setAuthError({
          code: 'EMAIL_NOT_VERIFIED',
          message: parsed.message ?? t('panel.emailNotVerified'),
        });
      } else if (parsed?.code === 'ACCOUNT_DEACTIVATED') {
        setAuthError({
          code: 'ACCOUNT_NOT_ACTIVE',
          message: parsed.message ?? t('panel.accountDeactivated'),
        });
      } else {
        setAccessError(parsed?.message ?? t('panel.loadError'));
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── join_conversation on connect (defensive — handshake already joins) ──
  useEffect(() => {
    if (!connected) return;
    emit('join_conversation', { conversation_id: conversationId });
  }, [connected, emit, conversationId]);

  // ── live events ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const offNew = on<ChatMessage & { conversation_id: string | number }>(
      'new_message',
      (msg) => {
        if (String(msg.conversation_id) !== conversationId) return;
        setMessages((prev) => {
          if (prev.some((m) => String(m.id) === String(msg.id))) return prev;
          return [...prev, msg];
        });
        // Reconcile optimistic by client_id (echoed back through metadata).
        const clientId = (
          msg.metadata as { client_id?: string } | null | undefined
        )?.client_id;
        if (clientId) {
          setOptimistic((prev) => prev.filter((o) => o.client_id !== clientId));
        }
        // Mark-read on visibility (CHAT-032/033).
        scheduleMarkRead();
      },
    );
    const offRead = on<{
      conversation_id: string | number;
      account_id: string | number;
      last_read_at: string;
    }>('message_read', (evt) => {
      if (String(evt.conversation_id) !== conversationId) return;
      setDetail((prev) => {
        if (!prev) return prev;
        const readerIsWorker =
          String(evt.account_id) === String(prev.collaboration.worker_id);
        return {
          ...prev,
          worker_last_read_at: readerIsWorker
            ? evt.last_read_at
            : prev.worker_last_read_at,
          employer_last_read_at: readerIsWorker
            ? prev.employer_last_read_at
            : evt.last_read_at,
        };
      });
    });
    const offTypingStart = on<{
      conversation_id: string | number;
      account_id: string | number;
    }>('typing:start', (evt) => {
      if (String(evt.conversation_id) !== conversationId) return;
      if (myAccountId != null && String(evt.account_id) === String(myAccountId))
        return;
      setOtherTyping(true);
      if (otherTypingTimer.current != null) {
        window.clearTimeout(otherTypingTimer.current);
      }
      otherTypingTimer.current = window.setTimeout(() => {
        setOtherTyping(false);
      }, TYPING_RECEIVED_TIMEOUT_MS);
    });
    const offTypingStop = on<{
      conversation_id: string | number;
      account_id: string | number;
    }>('typing:stop', (evt) => {
      if (String(evt.conversation_id) !== conversationId) return;
      if (myAccountId != null && String(evt.account_id) === String(myAccountId))
        return;
      setOtherTyping(false);
      if (otherTypingTimer.current != null) {
        window.clearTimeout(otherTypingTimer.current);
        otherTypingTimer.current = null;
      }
    });
    const offError = on<{
      code?: string;
      message?: string;
      client_id?: string;
    }>('error', (evt) => {
      if (
        evt.code === 'EMAIL_NOT_VERIFIED' ||
        evt.code === 'ACCOUNT_NOT_ACTIVE'
      ) {
        setAuthError({
          code: evt.code,
          message: evt.message ?? t('panel.cannotSend'),
        });
      }
      if (evt.client_id) {
        setOptimistic((prev) =>
          prev.map((o) =>
            o.client_id === evt.client_id
              ? {
                  ...o,
                  status: 'failed' as const,
                  retry_count: o.retry_count + 1,
                }
              : o,
          ),
        );
      }
      if (evt.message) {
        toast.error(evt.message);
      }
    });
    return () => {
      offNew();
      offRead();
      offTypingStart();
      offTypingStop();
      offError();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId, myAccountId]);

  // ── Mark-read on visibility (CHAT-032/033) ─────────────────────────
  const fireMarkRead = useCallback(async () => {
    const now = Date.now();
    if (now - lastMarkReadAt.current < MARK_READ_THROTTLE_MS) return;
    if (
      typeof document !== 'undefined' &&
      document.visibilityState !== 'visible'
    ) {
      return;
    }
    lastMarkReadAt.current = now;
    try {
      await api(`/conversations/${conversationId}/read`, { method: 'PATCH' });
    } catch {
      // Soft-fail — the WS will replay reads on reconnect.
    }
  }, [conversationId]);

  function scheduleMarkRead() {
    if (markReadTimer.current != null) return;
    markReadTimer.current = window.setTimeout(() => {
      markReadTimer.current = null;
      void fireMarkRead();
    }, 100);
  }

  useEffect(() => {
    if (!loading) {
      scheduleMarkRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleMarkRead();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (markReadTimer.current != null) {
        window.clearTimeout(markReadTimer.current);
      }
    };
  }, []);

  // ── Compose final list (server messages + optimistic at the end) ───
  const merged: Array<ChatMessage | OptimisticMessage> = useMemo(
    () => [...messages, ...optimistic],
    [messages, optimistic],
  );

  // ── access / not-found state ───────────────────────────────────────
  if (accessError) {
    return (
      <div className="flex h-full flex-col">
        {onBack ? (
          <div className="flex items-center gap-2 border-b border-border-default px-3 py-2 lg:hidden">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('inbox.backToInbox')}
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={MessageSquare}
            title={t('panel.unavailableTitle')}
            description={accessError}
            action={
              onConversationGone ? (
                <Button variant="outline" onClick={onConversationGone}>
                  {t('inbox.backToInbox')}
                </Button>
              ) : null
            }
          />
        </div>
      </div>
    );
  }

  // ── Composer-side handlers ─────────────────────────────────────────
  function setOptimisticById(
    clientId: string,
    update: (prev: OptimisticMessage) => OptimisticMessage,
  ) {
    setOptimistic((prev) =>
      prev.map((o) => (o.client_id === clientId ? update(o) : o)),
    );
  }

  async function actuallySend(opt: OptimisticMessage) {
    try {
      const wsOk = emit('send_message', {
        conversation_id: conversationId,
        content: opt.content,
        client_id: opt.client_id,
      });
      if (wsOk) return; // server new_message event reconciles
      // REST fallback if WS is down.
      await api(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: opt.content,
          client_id: opt.client_id,
        }),
      });
    } catch (err) {
      const parsed = parseApiError(err);
      if (
        parsed?.code === 'EMAIL_NOT_VERIFIED' ||
        parsed?.code === 'ACCOUNT_DEACTIVATED'
      ) {
        setAuthError({
          code:
            parsed.code === 'ACCOUNT_DEACTIVATED'
              ? 'ACCOUNT_NOT_ACTIVE'
              : 'EMAIL_NOT_VERIFIED',
          message: parsed.message ?? t('panel.cannotSend'),
        });
      }
      setOptimisticById(opt.client_id, (prev) => ({
        ...prev,
        status: 'failed' as const,
        retry_count: prev.retry_count + 1,
      }));
      if (parsed?.message) toast.error(parsed.message);
    }
  }

  function handleSubmit() {
    const trimmed = composerValue.trim();
    if (!trimmed) return;

    const clientId = uuid();
    const opt: OptimisticMessage = {
      client_id: clientId,
      id: `opt:${clientId}`,
      sender_id: myAccountId ?? null,
      content: trimmed,
      created_at: new Date().toISOString(),
      message_type: 'TEXT',
      status: 'sending',
      retry_count: 0,
    };
    setOptimistic((prev) => [...prev, opt]);
    setComposerValue('');
    void actuallySend(opt);
  }

  function handleRetry(clientId: string) {
    const opt = optimistic.find((o) => o.client_id === clientId);
    if (!opt) return;
    setOptimisticById(clientId, (prev) => ({ ...prev, status: 'sending' }));
    void actuallySend(opt);
  }

  function handleDiscard(clientId: string) {
    setOptimistic((prev) => prev.filter((o) => o.client_id !== clientId));
  }

  function handleTypingStart() {
    emit('typing:start', { conversation_id: conversationId });
  }
  function handleTypingStop() {
    emit('typing:stop', { conversation_id: conversationId });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border-default px-3 py-2">
        {onBack ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="lg:hidden"
            aria-label={t('inbox.backToInbox')}
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <Avatar className="h-9 w-9 shrink-0">
          {otherAvatar ? (
            <AvatarImage src={otherAvatar} alt={otherDisplayName} />
          ) : null}
          <AvatarFallback>{initials(otherDisplayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">
              {otherDisplayName}
            </span>
            <VerificationBadge state={verificationFromLevel(otherVerification)} />
          </div>
          <p className="truncate text-xs text-fg-muted">
            {collaboration ? (
              <Link
                to={`/collaborations/${String(collaboration.id)}`}
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                {t('panel.viewCollaboration')}
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : (
              t('panel.conversation')
            )}
          </p>
        </div>
      </header>

      {authError ? (
        <div className="px-3 pt-3">
          <AuthBanner variant="warning" title={authError.code}>
            {authError.message}
          </AuthBanner>
        </div>
      ) : null}

      {loading ? (
        <div className="flex-1 space-y-3 p-4">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="ml-auto h-12 w-1/2" />
          <Skeleton className="h-12 w-3/5" />
        </div>
      ) : (
        <MessageList
          messages={merged}
          myAccountId={myAccountId}
          otherLastReadAt={otherLastReadAt}
          onRetry={handleRetry}
          onDiscard={handleDiscard}
        />
      )}

      <div className="px-3">
        {otherTyping ? <TypingIndicator name={otherDisplayName} /> : null}
      </div>

      <Composer
        value={composerValue}
        disabled={Boolean(authError)}
        disabledReason={authError ? authError.message : undefined}
        onChange={setComposerValue}
        onSubmit={handleSubmit}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
      />
    </div>
  );
}
ConversationPanel.displayName = 'ConversationPanel';
