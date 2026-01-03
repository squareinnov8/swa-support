/**
 * Ingest types and channel validation tests.
 *
 * Tests the channel-agnostic IngestRequest/IngestResult types
 * and validates that different channels produce consistent behavior.
 */

import { describe, it, expect } from "vitest";
import { CHANNELS, CHANNEL_COLORS, CHANNEL_LABELS, type Channel, type IngestRequest } from "../ingest/types";

describe("Channel types", () => {
  it("should have 4 channel types defined", () => {
    expect(CHANNELS).toHaveLength(4);
    expect(CHANNELS).toContain("email");
    expect(CHANNELS).toContain("web_form");
    expect(CHANNELS).toContain("chat");
    expect(CHANNELS).toContain("voice");
  });

  it("should have colors for all channels", () => {
    for (const channel of CHANNELS) {
      expect(CHANNEL_COLORS[channel]).toBeDefined();
      expect(CHANNEL_COLORS[channel].bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(CHANNEL_COLORS[channel].text).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("should have labels for all channels", () => {
    for (const channel of CHANNELS) {
      expect(CHANNEL_LABELS[channel]).toBeDefined();
      expect(CHANNEL_LABELS[channel].length).toBeGreaterThan(0);
    }
  });
});

describe("IngestRequest type validation", () => {
  it("should accept valid email request", () => {
    const request: IngestRequest = {
      channel: "email",
      external_id: "thread-123",
      subject: "Need help with firmware",
      body_text: "My Apex unit is not connecting",
      from_identifier: "customer@example.com",
      to_identifier: "support@squarewheels.com",
      metadata: { body_html: "<p>My Apex unit is not connecting</p>" },
    };

    expect(request.channel).toBe("email");
    expect(request.external_id).toBe("thread-123");
    expect(request.subject).toBe("Need help with firmware");
  });

  it("should accept valid web_form request", () => {
    const request: IngestRequest = {
      channel: "web_form",
      subject: "Firmware update issue",
      body_text: "Customer called about their Apex unit",
      from_identifier: "customer@example.com",
      metadata: { created_via: "admin_ui" },
    };

    expect(request.channel).toBe("web_form");
    expect(request.external_id).toBeUndefined();
  });

  it("should accept valid chat request", () => {
    const request: IngestRequest = {
      channel: "chat",
      external_id: "chat-session-456",
      subject: "Live chat: Firmware help",
      body_text: "I need help with my unit",
      from_identifier: "user-789",
      metadata: { session_start: "2025-01-03T10:00:00Z" },
    };

    expect(request.channel).toBe("chat");
    expect(request.metadata?.session_start).toBe("2025-01-03T10:00:00Z");
  });

  it("should accept valid voice request", () => {
    const request: IngestRequest = {
      channel: "voice",
      subject: "Phone call: Order status",
      body_text: "Transcript: Customer asked about order status for order 12345",
      from_identifier: "+1-555-123-4567",
      metadata: { call_duration: 180, call_id: "call-abc" },
    };

    expect(request.channel).toBe("voice");
    expect(request.from_identifier).toMatch(/^\+1/);
  });

  it("should allow minimal request with only required fields", () => {
    const request: IngestRequest = {
      channel: "email",
      subject: "Help needed",
      body_text: "I have a problem",
    };

    expect(request.channel).toBe("email");
    expect(request.external_id).toBeUndefined();
    expect(request.from_identifier).toBeUndefined();
    expect(request.to_identifier).toBeUndefined();
    expect(request.metadata).toBeUndefined();
  });
});

describe("Channel-specific behavior expectations", () => {
  it("email channel should track thread ID for threading", () => {
    const request: IngestRequest = {
      channel: "email",
      external_id: "gmail-thread-abc123",
      subject: "Re: Previous issue",
      body_text: "Following up on my previous email",
      from_identifier: "customer@example.com",
    };

    // Email should have external_id for threading
    expect(request.external_id).toBeDefined();
  });

  it("web_form channel typically has no external_id", () => {
    const request: IngestRequest = {
      channel: "web_form",
      subject: "New issue from admin",
      body_text: "Customer called with issue",
    };

    // Web forms are typically new threads
    expect(request.external_id).toBeUndefined();
  });

  it("chat channel should have session metadata", () => {
    const request: IngestRequest = {
      channel: "chat",
      external_id: "chat-session-xyz",
      subject: "Chat session",
      body_text: "Hello, I need help",
      metadata: {
        session_id: "xyz",
        platform: "website",
        page_url: "/help",
      },
    };

    // Chat should track session info
    expect(request.metadata?.session_id).toBeDefined();
  });

  it("voice channel should have call metadata", () => {
    const request: IngestRequest = {
      channel: "voice",
      subject: "Phone call transcript",
      body_text: "Transcript of the call...",
      from_identifier: "+1-555-123-4567",
      metadata: {
        call_duration: 300,
        call_id: "twilio-abc123",
        recording_url: "https://...",
      },
    };

    // Voice should track call info
    expect(request.metadata?.call_id).toBeDefined();
    expect(request.metadata?.call_duration).toBe(300);
  });
});
