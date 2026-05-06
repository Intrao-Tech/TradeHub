import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, MessageSquare } from 'lucide-react';
import { ApiError, api, parseApiError } from '@/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AuthBanner } from '@/components/AuthBanner';
import { Button } from '@/components/ui/button';
import { CollaborationStatusBadge } from '@/components/collaborations/CollaborationStatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { VerificationBadge, verificationFromLevel } from '@/components/VerificationBadge';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { TypingIndicator } from './TypingIndicator';
import { useChatSocket } from './useChatSocket';
import { validateAttachmentFile } from './helpers';
import type {
  AttachmentDraft,
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

function fileTypeId(mime: string): string {
  return mime;
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
  const { on, emit, connected, socket } = useChatSocket();

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const [composerValue, setComposerValue] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
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

  const otherParticipant = useMemo(() => {
    if (!detail || myAccountId == null) return null;
    return (
      detail.participants.find((p) => String(p.account_id) !== String(myAccountId)) ??
      null
    );
  }, [detail, myAccountId]);

  const otherDisplayName =
    otherParticipant?.account.client_profile?.display_name ??
    inboxRow?.other_participant?.display_name ??
    'Counterparty';
  const otherAvatar =
    otherParticipant?.account.client_profile?.avatar_url ??
    inboxRow?.other_participant?.avatar_url ??
    null;
  const otherVerification =
    otherParticipant?.account.client_profile?.verification_level ??
    inboxRow?.other_participant?.verification_level ??
    null;
  const otherLastReadAt =
    (otherParticipant?.last_read_at ?? null) as string | null;

  const collaboration = detail?.collaboration ?? inboxRow?.collaboration ?? null;
  const collabStatus = (collaboration?.status ?? '').toUpperCase();
  const isReadOnly = collabStatus === 'REJECTED';

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
        setAccessError(
          parsed?.message ??
            'Conversation not found or you don’t have access.',
        );
      } else if (parsed?.code === 'EMAIL_NOT_VERIFIED') {
        setAuthError({
          code: 'EMAIL_NOT_VERIFIED',
          message:
            parsed.message ?? 'Verify your email to participate in this conversation.',
        });
      } else if (parsed?.code === 'ACCOUNT_DEACTIVATED') {
        setAuthError({
          code: 'ACCOUNT_NOT_ACTIVE',
          message: parsed.message ?? 'This account has been deactivated.',
        });
      } else {
        setAccessError(parsed?.message ?? 'Could not load conversation.');
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

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
        const clientId =
          (msg.metadata as { client_id?: string } | null | undefined)?.client_id;
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
        return {
          ...prev,
          participants: prev.participants.map((p) =>
            String(p.account_id) === String(evt.account_id)
              ? { ...p, last_read_at: evt.last_read_at }
              : p,
          ),
        };
      });
    });
    const offTypingStart = on<{
      conversation_id: string | number;
      account_id: string | number;
    }>('typing:start', (evt) => {
      if (String(evt.conversation_id) !== conversationId) return;
      if (myAccountId != null && String(evt.account_id) === String(myAccountId)) return;
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
      if (myAccountId != null && String(evt.account_id) === String(myAccountId)) return;
      setOtherTyping(false);
      if (otherTypingTimer.current != null) {
        window.clearTimeout(otherTypingTimer.current);
        otherTypingTimer.current = null;
      }
    });
    const offError = on<{ code?: string; message?: string; client_id?: string }>(
      'error',
      (evt) => {
        if (evt.code === 'EMAIL_NOT_VERIFIED' || evt.code === 'ACCOUNT_NOT_ACTIVE') {
          setAuthError({
            code: evt.code,
            message:
              evt.message ??
              'You can’t send messages in your current account state.',
          });
        }
        if (evt.client_id) {
          setOptimistic((prev) =>
            prev.map((o) =>
              o.client_id === evt.client_id
                ? { ...o, status: 'failed' as const, retry_count: o.retry_count + 1 }
                : o,
            ),
          );
        }
        if (evt.message) {
          toast.error(evt.message);
        }
      },
    );
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
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
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
              aria-label="Back to inbox"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={MessageSquare}
            title="Conversation unavailable"
            description={accessError}
            action={
              onConversationGone ? (
                <Button variant="outline" onClick={onConversationGone}>
                  Back to inbox
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

  async function uploadAttachment(draft: AttachmentDraft) {
    try {
      const fd = new FormData();
      fd.append('file', draft.file);
      const res = await api<{ id: string }>(
        `/conversations/${conversationId}/attachments`,
        { method: 'POST', body: fd },
      );
      setAttachments((prev) =>
        prev.map((a) =>
          a.client_id === draft.client_id
            ? { ...a, status: 'ready' as const, attachment_id: res.id }
            : a,
        ),
      );
    } catch (err) {
      const parsed = parseApiError(err);
      setAttachments((prev) =>
        prev.map((a) =>
          a.client_id === draft.client_id
            ? {
                ...a,
                status: 'failed' as const,
                error: parsed?.message ?? 'Upload failed.',
              }
            : a,
        ),
      );
      if (parsed?.message) toast.error(parsed.message);
    }
  }

  function handleAddFiles(files: File[]) {
    const drafts: AttachmentDraft[] = [];
    for (const file of files) {
      const error = validateAttachmentFile(file);
      if (error) {
        toast.error(`${file.name}: ${error}`);
        continue;
      }
      drafts.push({
        client_id: uuid(),
        status: 'uploading',
        file,
        mime_type: fileTypeId(file.type),
        original_name: file.name,
        size_bytes: file.size,
      });
    }
    if (drafts.length === 0) return;
    setAttachments((prev) => [...prev, ...drafts]);
    drafts.forEach((d) => void uploadAttachment(d));
  }

  function handleRemoveAttachment(clientId: string) {
    setAttachments((prev) => prev.filter((a) => a.client_id !== clientId));
  }

  async function actuallySend(opt: OptimisticMessage, attachmentIds: number[]) {
    try {
      const wsOk = emit('send_message', {
        conversation_id: conversationId,
        content: opt.content,
        client_id: opt.client_id,
        attachment_ids: attachmentIds,
      });
      if (wsOk) return; // server new_message event reconciles
      // REST fallback if WS is down.
      await api(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: opt.content,
          client_id: opt.client_id,
          attachment_ids: attachmentIds,
        }),
      });
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed?.code === 'EMAIL_NOT_VERIFIED' || parsed?.code === 'ACCOUNT_DEACTIVATED') {
        setAuthError({
          code: parsed.code === 'ACCOUNT_DEACTIVATED' ? 'ACCOUNT_NOT_ACTIVE' : 'EMAIL_NOT_VERIFIED',
          message: parsed.message ?? 'You can’t send messages in your current account state.',
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
    const ready = attachments.filter((a) => a.status === 'ready');
    if (!trimmed && ready.length === 0) return;

    const clientId = uuid();
    const opt: OptimisticMessage = {
      client_id: clientId,
      id: `opt:${clientId}`,
      sender_id: myAccountId ?? '',
      content: trimmed,
      created_at: new Date().toISOString(),
      message_type: 'TEXT',
      status: 'sending',
      retry_count: 0,
      attachments: ready.map((a) => ({
        id: a.attachment_id ?? `optatt:${a.client_id}`,
        message_id: null,
        uploaded_by_id: myAccountId ?? '',
        original_name: a.original_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
      })),
    };
    setOptimistic((prev) => [...prev, opt]);
    setComposerValue('');
    setAttachments([]);

    void actuallySend(
      opt,
      ready
        .map((a) => (a.attachment_id ? Number(a.attachment_id) : null))
        .filter((id): id is number => id != null),
    );
  }

  function handleRetry(clientId: string) {
    const opt = optimistic.find((o) => o.client_id === clientId);
    if (!opt) return;
    setOptimisticById(clientId, (prev) => ({ ...prev, status: 'sending' }));
    void actuallySend(
      opt,
      (opt.attachments ?? [])
        .map((a) => (typeof a.id === 'string' && a.id.startsWith('optatt:') ? null : Number(a.id)))
        .filter((id): id is number => id != null && Number.isFinite(id)),
    );
  }

  function handleDiscard(clientId: string) {
    setOptimistic((prev) => prev.filter((o) => o.client_id !== clientId));
  }

  function handleTypingStart() {
    if (isReadOnly) return;
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
            aria-label="Back to inbox"
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
            {collaboration ? (
              <CollaborationStatusBadge status={collaboration.status} />
            ) : null}
          </div>
          <p className="truncate text-xs text-fg-muted">
            {collaboration ? (
              <Link
                to={`/collaborations/${String(collaboration.id)}`}
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                View collaboration
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : (
              'Direct message'
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
        {otherTyping ? (
          <TypingIndicator name={otherDisplayName} />
        ) : null}
      </div>

      <Composer
        value={composerValue}
        attachments={attachments}
        disabled={Boolean(authError) || isReadOnly}
        disabledReason={
          authError
            ? authError.message
            : isReadOnly
              ? 'This collaboration was rejected. Messages here are read-only.'
              : undefined
        }
        onChange={setComposerValue}
        onSubmit={handleSubmit}
        onAddFiles={handleAddFiles}
        onRemoveAttachment={handleRemoveAttachment}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
      />
    </div>
  );
}
ConversationPanel.displayName = 'ConversationPanel';
