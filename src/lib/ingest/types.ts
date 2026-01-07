/**
 * Channel-agnostic request ingestion types.
 *
 * These types define the interface for ingesting support requests
 * from any channel (email, web form, chat, voice, etc.)
 */

export const CHANNELS = ["email", "web_form", "chat", "voice"] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Normalized ingest request - all channels normalize to this format.
 */
export type IngestRequest = {
  /** The channel this request came from */
  channel: Channel;

  /** External ID for threading (email thread ID, chat session ID, etc.) */
  external_id?: string;

  /** Subject/title of the request */
  subject: string;

  /** The message body text */
  body_text: string;

  /** Who sent this (email address, user ID, phone number, etc.) */
  from_identifier?: string;

  /** Who received this (support email, agent ID, etc.) */
  to_identifier?: string;

  /** Channel-specific metadata (email headers, chat context, etc.) */
  metadata?: Record<string, unknown>;
};

/**
 * Result from processing an ingest request.
 */
export type IngestResult = {
  /** The thread ID (new or existing) */
  thread_id: string;

  /** The message ID that was created */
  message_id: string;

  /** Classified intent */
  intent: string;

  /** Classification confidence (0-1) */
  confidence: number;

  /** Action to take (ASK_CLARIFYING_QUESTIONS, ESCALATE_WITH_DRAFT, etc.) */
  action: string;

  /** Generated draft response (if any) */
  draft: string | null;

  /** New thread state */
  state: string;

  /** Previous thread state (for tracking transitions) */
  previous_state: string;

  /** Whether the thread is in human handling mode */
  humanHandling?: boolean;

  /** Whether this message triggered escalation */
  escalated?: boolean;
};

/**
 * Channel badge colors for UI display.
 */
export const CHANNEL_COLORS: Record<Channel, { bg: string; text: string }> = {
  email: { bg: "#e0e7ff", text: "#3730a3" },
  web_form: { bg: "#fef3c7", text: "#92400e" },
  chat: { bg: "#d1fae5", text: "#065f46" },
  voice: { bg: "#fce7f3", text: "#9d174d" },
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  web_form: "Web Form",
  chat: "Chat",
  voice: "Voice",
};
