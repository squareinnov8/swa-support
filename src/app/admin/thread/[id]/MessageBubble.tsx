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
            color: "#6b7280",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              color: isInbound ? "#1e40af" : "#166534",
              textTransform: "uppercase",
              fontSize: 10,
            }}
          >
            {isInbound ? "Customer" : "Support"}
          </span>
          {fromEmail && (
            <span>{fromEmail}</span>
          )}
          <span>•</span>
          <span>{new Date(createdAt).toLocaleString()}</span>
        </div>

        {/* Message bubble */}
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            backgroundColor: isInbound ? "#eff6ff" : "#f0fdf4",
            border: `1px solid ${isInbound ? "#bfdbfe" : "#bbf7d0"}`,
            borderTopLeftRadius: isInbound ? 4 : 12,
            borderTopRightRadius: isInbound ? 12 : 4,
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
                color: "#6b7280",
                backgroundColor: "transparent",
                border: "1px solid #d1d5db",
                borderRadius: 4,
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
