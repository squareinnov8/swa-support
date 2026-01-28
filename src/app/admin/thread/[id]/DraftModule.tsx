"use client";

import { useState } from "react";
import { ThreadActions } from "./ThreadActions";

type Props = {
  threadId: string;
  latestDraft: string | null;
  latestDraftMessage: {
    id: string;
    channel_metadata?: { relay_response?: boolean };
  } | null;
  latestEventId: string | null;
  latestDraftGenerationId: string | null;
  intent: string | null;
  isHumanHandling: boolean;
  humanHandler: string | null;
  shouldBlockDraft: boolean;
  draftBlockReason: string | null;
  intentRequiresVerification: boolean;
  isVerificationComplete: boolean;
  verificationStatus: string | null;
  canSendViaGmail: boolean;
  isArchived: boolean;
  threadState: string;
};

export function DraftModule({
  threadId,
  latestDraft,
  latestDraftMessage,
  latestEventId,
  latestDraftGenerationId,
  intent,
  isHumanHandling,
  humanHandler,
  shouldBlockDraft,
  draftBlockReason,
  intentRequiresVerification,
  isVerificationComplete,
  verificationStatus,
  canSendViaGmail,
  isArchived,
  threadState,
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div
      style={{
        position: "sticky",
        top: 65,
        zIndex: 100,
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #cbd6e2",
        boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ padding: "0 24px" }}>
        <div
          style={{
            border: latestDraft ? "2px solid #0091ae" : "1px solid #cbd6e2",
            borderRadius: 4,
            marginTop: 16,
            marginBottom: 16,
            overflow: "hidden",
            backgroundColor: "#ffffff",
          }}
        >
          {/* Header - Always visible, clickable to collapse */}
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: latestDraft ? "#e5f5f8" : "#f5f8fa",
              borderBottom: isCollapsed ? "none" : "1px solid #cbd6e2",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "#7c98b6" }}>
                {isCollapsed ? "▶" : "▼"}
              </span>
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: latestDraft ? "#0091ae" : "#33475b",
                  margin: 0,
                }}
              >
                {latestDraft ? "📝 Draft Reply" : "No Draft"}
              </h2>
              {latestDraftMessage && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#7c98b6",
                    padding: "2px 6px",
                    backgroundColor: "#eaf0f6",
                    borderRadius: 3,
                  }}
                >
                  {latestDraftMessage.channel_metadata?.relay_response
                    ? "Relay Response"
                    : "Auto-generated"}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: "#7c98b6" }}>
              {isCollapsed ? "Click to expand" : "Click to collapse"}
            </span>
          </div>

          {/* Collapsible content */}
          {!isCollapsed && (
            <>
              {/* Draft Content */}
              <div style={{ padding: 16, maxHeight: 250, overflowY: "auto" }}>
                {shouldBlockDraft ? (
                  <div
                    style={{
                      border: "1px solid #f2545b",
                      backgroundColor: "#fde8e9",
                      padding: 14,
                      borderRadius: 4,
                    }}
                  >
                    <strong style={{ color: "#c93b41", fontSize: 13 }}>
                      Draft Blocked
                    </strong>
                    <p
                      style={{ color: "#c93b41", margin: "8px 0 0", fontSize: 13 }}
                    >
                      {draftBlockReason}
                    </p>
                    {intentRequiresVerification && !isVerificationComplete && (
                      <p style={{ color: "#516f90", marginTop: 8, fontSize: 12 }}>
                        Verify customer before sending.
                        {verificationStatus === "pending" && " Ask for order number."}
                      </p>
                    )}
                  </div>
                ) : latestDraft ? (
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      margin: 0,
                      fontFamily: "inherit",
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "#33475b",
                    }}
                  >
                    {latestDraft}
                  </pre>
                ) : (
                  <p style={{ color: "#7c98b6", fontSize: 13, margin: 0 }}>
                    No draft has been generated for this thread.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div
                style={{
                  borderTop: "1px solid #cbd6e2",
                  padding: "12px 16px",
                  backgroundColor: "#f5f8fa",
                }}
              >
                <ThreadActions
                  threadId={threadId}
                  latestDraft={latestDraft}
                  latestDraftMessageId={latestDraftMessage?.id || null}
                  latestEventId={latestEventId}
                  latestDraftGenerationId={latestDraftGenerationId}
                  intent={intent}
                  isHumanHandling={isHumanHandling}
                  humanHandler={humanHandler}
                  draftBlocked={shouldBlockDraft}
                  draftBlockReason={draftBlockReason}
                  canSendViaGmail={canSendViaGmail}
                  isArchived={isArchived}
                  threadState={threadState}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
