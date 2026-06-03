/**
 * Pure formatting + grouping helpers for the chat surface. Exported so
 * tests can exercise them in isolation.
 */

import { activeLocale } from '@/lib/format';
import type { ChatMessage } from './types';

const SAME_SENDER_GROUP_MS = 60_000;

/** Minimal `t` shape these helpers need — keeps them decoupled from react-i18next. */
type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Backend SYSTEM messages are English strings persisted on the row. The
 * non-interpolated ones (no contract number / job title baked in) can be
 * mapped 1:1 to a translation key; everything dynamic falls through to the
 * raw content. Keep these in sync with the backend's static SYSTEM bodies
 * (conversation.service.ts, seed.ts).
 */
const STATIC_SYSTEM_MESSAGES: Record<string, string> = {
  'Job accepted. Welcome to TradeHub.': 'system.jobAcceptedWelcome',
  'Collaboration confirmed. You can now message each other about the project.':
    'system.collaborationConfirmed',
};

export function translateSystemMessage(content: string, t?: TFn): string {
  if (!t) return content;
  const key = STATIC_SYSTEM_MESSAGES[content.trim()];
  return key ? t(`chat:${key}`) : content;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatDayHeader(iso: string, now = new Date(), t?: TFn): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (isSameDay(d, now)) return t ? t('chat:day.today') : 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return t ? t('chat:day.yesterday') : 'Yesterday';

  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000,
  );
  if (diffDays > 0 && diffDays < 7) {
    return d.toLocaleDateString(activeLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }
  return d.toLocaleDateString(activeLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimeShort(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(activeLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Returns the inbox-row time blurb (today: time of day; this week: "Mon"; older: "5 May").
 */
export function formatInboxTime(iso?: string | null, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (isSameDay(d, now)) return formatTimeShort(iso);
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000,
  );
  if (diffDays >= 0 && diffDays < 7) {
    return d.toLocaleDateString(activeLocale(), { weekday: 'short' });
  }
  return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });
}

export type RenderedRow =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: ChatMessage;
      groupedWithPrev: boolean;
      mine: boolean;
    };

/**
 * Build the virtualised row sequence: day separators interleaved with
 * messages, and a `groupedWithPrev` flag that the bubble component reads
 * to suppress the avatar / timestamp on consecutive same-sender messages
 * within the 60-second grouping window.
 *
 * `messages` are expected in ASCENDING order (oldest first).
 */
export function buildRenderedRows(
  messages: ChatMessage[],
  myId: string | number | null,
  t?: TFn,
): RenderedRow[] {
  const rows: RenderedRow[] = [];
  let lastDay: string | null = null;
  let lastMsg: ChatMessage | null = null;

  for (const m of messages) {
    const created = m.created_at ?? null;
    const date = created ? new Date(created) : null;
    const dayKey = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : 'none';
    if (dayKey !== lastDay) {
      rows.push({
        kind: 'day',
        key: `day:${dayKey}`,
        label: created ? formatDayHeader(created, new Date(), t) : '',
      });
      lastDay = dayKey;
      lastMsg = null;
    }

    let grouped = false;
    if (
      lastMsg &&
      String(lastMsg.sender_id) === String(m.sender_id) &&
      lastMsg.message_type === m.message_type &&
      lastMsg.created_at &&
      m.created_at &&
      new Date(m.created_at).getTime() -
        new Date(lastMsg.created_at).getTime() <
        SAME_SENDER_GROUP_MS
    ) {
      grouped = true;
    }

    rows.push({
      kind: 'message',
      key: `msg:${String(m.id)}`,
      message: m,
      groupedWithPrev: grouped,
      mine: myId != null && String(m.sender_id) === String(myId),
    });
    lastMsg = m;
  }

  return rows;
}

export function fileBytesPretty(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageMime(mime: string): boolean {
  return /^image\/(png|jpeg|webp|gif)$/.test(mime);
}

export function isPdfMime(mime: string): boolean {
  return mime === 'application/pdf';
}

export const ATTACHMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_PDF_MAX_BYTES = 25 * 1024 * 1024;

export function validateAttachmentFile(file: File): string | null {
  if (isImageMime(file.type)) {
    if (file.size > ATTACHMENT_IMAGE_MAX_BYTES) {
      return 'Images must be 10 MB or smaller.';
    }
    return null;
  }
  if (isPdfMime(file.type)) {
    if (file.size > ATTACHMENT_PDF_MAX_BYTES) {
      return 'PDFs must be 25 MB or smaller.';
    }
    return null;
  }
  return 'Use a PNG, JPEG, WebP, GIF, or PDF file.';
}
