"use client";

import { useState } from "react";

type Props = {
  direction: "inbound" | "outbound";
  fromEmail: string | null;
  createdAt: string;
  bodyText: string | null;
  bodyHtml: string | null;
};

/**
 * Check if content looks like HTML
 */
function isHtmlContent(content: string | null): boolean {
  if (!content) return false;
  // Check for common HTML tags
  return /<\/?(?:div|p|span|br|table|tr|td|ul|ol|li|a|img|h[1-6]|blockquote)[^>]*>/i.test(content);
}

/**
 * Sanitize HTML for safe rendering (basic sanitization)
 * In production, you'd use a library like DOMPurify
 */
function sanitizeHtml(html: string): string {
  // Remove script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "");
}

export function MessageBubble({ direction, fromEmail, createdAt, bodyText, bodyHtml }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  const isInbound = direction === "inbound";

  // Determine what content to display
  const hasHtml = bodyHtml && isHtmlContent(bodyHtml);
  const displayContent = bodyText || bodyHtml || "(empty message)";
  const shouldRenderHtml = hasHtml && !showRaw;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isInbound ? "flex-start" : "flex-end",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          minWidth: 200,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: isInbound ? "flex-start" : "flex-end",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
            fontSize: 12,
            color: "#7c98b6",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              color: isInbound ? "#0091ae" : "#00a182",
              textTransform: "uppercase",
              fontSize: 10,
              letterSpacing: "0.5px",
            }}
          >
            {isInbound ? "Customer" : "Support"}
          </span>
          {fromEmail && (
            <span style={{ color: "#516f90" }}>{fromEmail}</span>
          )}
          <span>·</span>
          <span>{new Date(createdAt).toLocaleString()}</span>
        </div>

        {/* Message bubble */}
        <div
          style={{
            padding: 14,
            borderRadius: 4,
            backgroundColor: isInbound ? "#e5f5f8" : "#e5f8f4",
            border: `1px solid ${isInbound ? "#b0d6e0" : "#a8e4d0"}`,
          }}
        >
          {shouldRenderHtml ? (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.6,
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml!) }}
            />
          ) : (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
                fontFamily: "inherit",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {displayContent}
            </pre>
          )}

          {/* Toggle for HTML/Raw view */}
          {hasHtml && (
            <button
              onClick={() => setShowRaw(!showRaw)}
              style={{
                marginTop: 12,
                padding: "4px 8px",
                fontSize: 11,
                color: "#516f90",
                backgroundColor: "#ffffff",
                border: "1px solid #cbd6e2",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              {showRaw ? "Show Formatted" : "Show Raw"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
