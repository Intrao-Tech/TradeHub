/**
 * Shared chat domain types — kept narrow on purpose. The backend may include
 * extra fields; the UI only types what it reads.
 */

export type ConversationCollaboration = {
  id: string | number;
  status: string;
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

export type ChatMessageAttachment = {
  id: string | number;
  message_id: string | number | null;
  uploaded_by_id: string | number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  download_url?: string | null;
  file_url?: string | null;
};

export type ChatMessage = {
  id: string | number;
  conversation_id?: string | number;
  sender_id: string | number;
  content: string;
  message_type?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  attachments?: ChatMessageAttachment[];
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

export type ConversationDetail = {
  id: string | number;
  collaboration_id: string | number | null;
  collaboration: ConversationCollaboration | null;
  participants: Array<{
    account_id: string | number;
    last_read_at?: string | null;
    account: {
      client_profile?: {
        id?: string | number;
        display_name?: string | null;
        avatar_url?: string | null;
        verification_level?: string | null;
      } | null;
    };
  }>;
  last_message_at: string | null;
};

export type OptimisticMessage = ChatMessage & {
  client_id: string;
  status: 'sending' | 'sent' | 'failed';
  retry_count: number;
};

export type AttachmentDraft = {
  client_id: string;
  status: 'uploading' | 'ready' | 'failed';
  file: File;
  preview_url?: string;
  attachment_id?: string;
  mime_type: string;
  original_name: string;
  size_bytes: number;
  error?: string;
};
