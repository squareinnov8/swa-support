"use client";

import { useState } from "react";

type AttachmentMeta = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

type Props = {
  direction: "inbound" | "outbound";
  fromEmail: string | null;
  createdAt: string;
  bodyText: string | null;
  bodyHtml: string | null;
  gmailMessageId?: string;
  attachments?: AttachmentMeta[];
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
 * Check if attachment is an image type
 */
function isImageAttachment(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attachment display component
 */
function AttachmentDisplay({
  attachment,
  gmailMessageId,
}: {
  attachment: AttachmentMeta;
  gmailMessageId: string;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const isImage = isImageAttachment(attachment.mimeType);
  const attachmentUrl = `/api/admin/attachments?messageId=${encodeURIComponent(gmailMessageId)}&attachmentId=${encodeURIComponent(attachment.id)}&mimeType=${encodeURIComponent(attachment.mimeType)}`;

  if (isImage) {
    return (
      <div style={{ marginTop: 8 }}>
        <div
          style={{
            position: "relative",
            display: "inline-block",
            borderRadius: 4,
            overflow: "hidden",
            border: "1px solid #cbd6e2",
            cursor: "pointer",
          }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f5f8fa",
              }}
            >
              <span style={{ color: "#7c98b6", fontSize: 12 }}>Loading...</span>
            </div>
          )}
          {hasError ? (
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: "#fde8e9",
                color: "#c93b41",
                fontSize: 12,
              }}
            >
              Failed to load image: {attachment.filename}
            </div>
          ) : (
            <img
              src={attachmentUrl}
              alt={attachment.filename}
              style={{
                maxWidth: isExpanded ? "100%" : 300,
                maxHeight: isExpanded ? "none" : 200,
                display: "block",
                transition: "max-width 0.2s, max-height 0.2s",
              }}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
            />
          )}
        </div>
        <div style={{ fontSize: 11, color: "#7c98b6", marginTop: 4 }}>
          {attachment.filename} ({formatFileSize(attachment.size)})
          {!hasError && (
            <span style={{ marginLeft: 8, color: "#0091ae" }}>
              {isExpanded ? "Click to shrink" : "Click to expand"}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Non-image attachment - show as downloadable link
  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 12px",
        backgroundColor: "#f5f8fa",
        borderRadius: 4,
        border: "1px solid #cbd6e2",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 16 }}>📎</span>
      <div>
        <a
          href={attachmentUrl}
          download={attachment.filename}
          style={{
            color: "#0091ae",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {attachment.filename}
        </a>
        <div style={{ fontSize: 11, color: "#7c98b6" }}>
          {formatFileSize(attachment.size)}
        </div>
      </div>
    </div>
  );
}

/**
 * Sanitize HTML for safe rendering
 * Handles email-specific concerns like external images, scripts, styles
 */
function sanitizeHtml(html: string): string {
  return html
    // Remove script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove event handlers
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "")
    // Remove javascript: URLs
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    // Remove meta refresh and other dangerous meta tags
    .replace(/<meta\s+[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
    // Remove link tags (external stylesheets) to prevent tracking
    .replace(/<link\b[^>]*>/gi, "")
    // Remove MS Office conditional comments
    .replace(/<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<!--\[if[^\]]*\]>[\s\S]*?(?=<!\[endif\]-->)/gi, "")
    // Remove xml/noscript blocks
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    // Neutralize external images (prevent tracking pixels) - keep src but add loading=lazy
    .replace(/<img\s+/gi, '<img loading="lazy" referrerpolicy="no-referrer" ');
}

export function MessageBubble({ direction, fromEmail, createdAt, bodyText, bodyHtml, gmailMessageId, attachments }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  const isInbound = direction === "inbound";
  const hasAttachments = attachments && attachments.length > 0 && gmailMessageId;

  // Determine what content to display
  // Check bodyHtml first, then fall back to bodyText if it contains HTML
  // (handles emails imported before bodyHtml was captured separately)
  const hasHtmlInBodyHtml = bodyHtml && isHtmlContent(bodyHtml);
  const hasHtmlInBodyText = !hasHtmlInBodyHtml && bodyText && isHtmlContent(bodyText);
  const hasHtml = hasHtmlInBodyHtml || hasHtmlInBodyText;
  const htmlContent = hasHtmlInBodyHtml ? bodyHtml : hasHtmlInBodyText ? bodyText : null;
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
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent!) }}
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

          {/* Attachments */}
          {hasAttachments && (
            <div style={{ marginTop: 12, borderTop: "1px solid #e5e5e5", paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#7c98b6", marginBottom: 4 }}>
                {attachments.length} attachment{attachments.length > 1 ? "s" : ""}
              </div>
              {attachments.map((att) => (
                <AttachmentDisplay
                  key={att.id}
                  attachment={att}
                  gmailMessageId={gmailMessageId!}
                />
              ))}
            </div>
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
