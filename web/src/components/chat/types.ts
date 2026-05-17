/**
 * Shared chat domain types — kept narrow on purpose. The backend may include
 * extra fields; the UI only types what it reads.
 *
 * Post-2026-05 schema: a conversation is a strict 1:1 with a collaboration
 * (shared PK), there is no participant table, and a file message carries its
 * file columns inline (the message_attachment table was dropped).
 */

export type ConversationCollaboration = {
  id: string | number;
  worker_id: string | number;
  employer_id: string | number;
};

export type OtherParticipant = {
  account_id: string | number;
  client_profile_id: string | number | null;
  display_name: string | null;
  avatar_url: string | null;
  verification_level: string | null;
};

export type ChatMessage = {
  id: string | number;
  conversation_id?: string | number;
  /** NULL for SYSTEM messages (escrow events, etc.). */
  sender_id: string | number | null;
  content: string | null;
  message_type?: string | null;
  /** A file message carries its file inline — no separate attachment table. */
  file_url?: string | null;
  original_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

export type InboxItem = {
  conversation: {
    id: string | number;
    collaboration_id: string | number | null;
    last_message_at: string | null;
    created_at: string;
  };
  collaboration: ConversationCollaboration | null;
  other_participant: OtherParticipant | null;
  last_message: ChatMessage | null;
  unread_count: number;
};

export type InboxResponse = {
  items: InboxItem[];
  total: number;
  page: number;
  limit: number;
};

export type MessagesResponse = {
  items: ChatMessage[];
  total: number;
  page: number;
  limit: number;
};

/** Worker / employer profile shape inside the conversation payload. */
type PartyProfile = {
  client_profile: {
    id: string | number;
    display_name: string | null;
    avatar_url: string | null;
    verification_level: string | null;
  };
};

export type ConversationDetail = {
  id: string | number;
  last_message_at: string | null;
  worker_last_read_at: string | null;
  employer_last_read_at: string | null;
  created_at: string;
  collaboration: {
    id: string | number;
    worker_id: string | number;
    employer_id: string | number;
    worker: PartyProfile;
    employer: PartyProfile;
  };
  /** The conversation payload includes only the latest message. */
  messages?: ChatMessage[];
};

export type OptimisticMessage = ChatMessage & {
  client_id: string;
  status: 'sending' | 'sent' | 'failed';
  retry_count: number;
};
