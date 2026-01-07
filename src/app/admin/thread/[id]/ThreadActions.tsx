"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ThreadActionsProps = {
  threadId: string;
  latestDraft: string | null;
  latestEventId: string | null;
  intent: string | null;
  isHumanHandling: boolean;
  humanHandler: string | null;
};

type ReplyResult = {
  intent: string;
  action: string;
  draft: string | null;
  state: string;
};

export function ThreadActions({
  threadId,
  latestDraft,
  latestEventId,
  intent,
  isHumanHandling,
  humanHandler,
}: ThreadActionsProps) {
  const router = useRouter();
  const [replyText, setReplyText] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<{
    updatedSections?: string[];
    error?: string;
  } | null>(null);
  const [lastReplyResult, setLastReplyResult] = useState<ReplyResult | null>(null);
  const [observationAction, setObservationAction] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [showEndObservation, setShowEndObservation] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [resolutionType, setResolutionType] = useState<"resolved" | "escalated_further" | "returned_to_agent">("resolved");

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/simulate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          body_text: replyText,
          from_email: replyEmail || "customer@test.com",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setReplyText("");
        setLastReplyResult({
          intent: data.intent,
          action: data.action,
          draft: data.draft,
          state: data.state,
        });
        setFeedbackSubmitted(false); // Reset feedback for new draft
        router.refresh(); // Also refresh page data
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to send reply"}`);
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTakeOver() {
    setObservationAction("loading");
    try {
      const res = await fetch("/api/admin/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          handler: "admin", // Could be dynamic if we have user auth
        }),
      });

      if (res.ok) {
        setObservationAction("success");
        router.refresh();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to take over thread"}`);
        setObservationAction("error");
      }
    } catch {
      alert("Network error");
      setObservationAction("error");
    }
  }

  async function handleEndObservation() {
    setObservationAction("loading");
    try {
      const res = await fetch("/api/admin/observations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          resolutionType,
          resolutionSummary,
        }),
      });

      if (res.ok) {
        setObservationAction("success");
        setShowEndObservation(false);
        setResolutionSummary("");
        router.refresh();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to end observation"}`);
        setObservationAction("error");
      }
    } catch {
      alert("Network error");
      setObservationAction("error");
    }
  }

  async function handleFeedback(rating: "approved" | "rejected" | "needs_edit") {
    if (!latestDraft) return;

    try {
      const res = await fetch("/api/admin/draft-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          event_id: latestEventId,
          draft_text: latestDraft,
          intent,
          rating,
          feedback_notes: feedbackNotes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setFeedbackSubmitted(true);
        setShowFeedbackForm(false);
        setFeedbackNotes("");
        // Capture instruction integration result
        if (data.integration) {
          setFeedbackResult({
            updatedSections: data.integration.updated_sections,
            error: data.integration.error,
          });
        } else {
          setFeedbackResult(null);
        }
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to submit feedback"}`);
      }
    } catch (err) {
      alert("Network error");
    }
  }

  return (
    <div style={{ marginTop: 32 }}>
      {/* Observation Mode Controls */}
      <div
        style={{
          padding: 16,
          marginBottom: 24,
          borderRadius: 8,
          backgroundColor: isHumanHandling ? "#fff7ed" : "#f0f9ff",
          border: `2px solid ${isHumanHandling ? "#fb923c" : "#3b82f6"}`,
        }}
      >
        {isHumanHandling ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  backgroundColor: "#fb923c",
                  color: "white",
                  borderRadius: 9999,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <span style={{ fontSize: 18 }}>👁</span> Observation Mode
              </span>
              <span style={{ color: "#9a3412", fontSize: 14 }}>
                Lina is watching and learning from {humanHandler || "you"}
              </span>
            </div>

            {!showEndObservation ? (
              <button
                onClick={() => setShowEndObservation(true)}
                disabled={observationAction === "loading"}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#22c55e",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                End Observation
              </button>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                    Resolution Type
                  </label>
                  <select
                    value={resolutionType}
                    onChange={(e) => setResolutionType(e.target.value as typeof resolutionType)}
                    style={{
                      padding: 10,
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      fontFamily: "inherit",
                      width: "100%",
                      maxWidth: 300,
                    }}
                  >
                    <option value="resolved">Resolved</option>
                    <option value="escalated_further">Escalated Further</option>
                    <option value="returned_to_agent">Return to Lina</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                    Resolution Summary (what Lina should learn)
                  </label>
                  <textarea
                    value={resolutionSummary}
                    onChange={(e) => setResolutionSummary(e.target.value)}
                    placeholder="Describe how you resolved this issue..."
                    style={{
                      width: "100%",
                      minHeight: 80,
                      padding: 12,
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      fontFamily: "inherit",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleEndObservation}
                    disabled={observationAction === "loading"}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#22c55e",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {observationAction === "loading" ? "Saving..." : "Confirm End"}
                  </button>
                  <button
                    onClick={() => setShowEndObservation(false)}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#e5e7eb",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 600, color: "#1d4ed8" }}>
                Take Over This Thread
              </span>
              <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                Enter observation mode so Lina can learn from how you handle this case.
              </p>
            </div>
            <button
              onClick={handleTakeOver}
              disabled={observationAction === "loading"}
              style={{
                padding: "10px 20px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {observationAction === "loading" ? "Taking Over..." : "Take Over Thread"}
            </button>
          </>
        )}
      </div>

      {/* Feedback Section */}
      {latestDraft && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ marginBottom: 12 }}>Rate This Draft</h3>
          {feedbackSubmitted ? (
            <div
              style={{
                padding: 12,
                backgroundColor: "#dcfce7",
                borderRadius: 8,
                color: "#166534",
              }}
            >
              <strong>Feedback submitted!</strong>
              {feedbackResult?.updatedSections && feedbackResult.updatedSections.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  🔄 Agent instructions updated:{" "}
                  <strong>{feedbackResult.updatedSections.join(", ")}</strong>
                  <br />
                  <a href="/admin/instructions" style={{ color: "#166534" }}>
                    View updated instructions →
                  </a>
                </div>
              )}
              {feedbackResult?.error && (
                <div style={{ marginTop: 8, color: "#991b1b" }}>
                  ⚠️ Integration error: {feedbackResult.error}
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => handleFeedback("approved")}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#22c55e",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => setShowFeedbackForm(true)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#f59e0b",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  ✎ Needs Edit
                </button>
                <button
                  onClick={() => setShowFeedbackForm(true)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  ✗ Reject
                </button>
              </div>

              {showFeedbackForm && (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    placeholder="What's wrong with this draft? How should it be improved?"
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 80,
                      padding: 12,
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      fontFamily: "inherit",
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleFeedback("needs_edit")}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#f59e0b",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Submit as "Needs Edit"
                    </button>
                    <button
                      onClick={() => handleFeedback("rejected")}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Submit as "Rejected"
                    </button>
                    <button
                      onClick={() => {
                        setShowFeedbackForm(false);
                        setFeedbackNotes("");
                      }}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#e5e7eb",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Reply Simulation */}
      <div
        style={{
          border: "2px dashed #3b82f6",
          borderRadius: 8,
          padding: 16,
          backgroundColor: "#eff6ff",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12, color: "#1d4ed8" }}>
          🧪 Simulate Customer Reply
        </h3>
        <form onSubmit={handleReply}>
          <input
            type="email"
            placeholder="Customer email (optional)"
            value={replyEmail}
            onChange={(e) => setReplyEmail(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 6,
              marginBottom: 8,
              fontFamily: "inherit",
            }}
          />
          <textarea
            placeholder="Type a follow-up message from the customer..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            required
            style={{
              width: "100%",
              minHeight: 100,
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 6,
              fontFamily: "inherit",
              marginBottom: 8,
            }}
          />
          <button
            type="submit"
            disabled={isSubmitting || !replyText.trim()}
            style={{
              padding: "10px 20px",
              backgroundColor: isSubmitting ? "#9ca3af" : "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {isSubmitting ? "Sending..." : "Send as Customer"}
          </button>
        </form>

        {/* Show immediate result after reply */}
        {lastReplyResult && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              backgroundColor: "#f0fdf4",
              borderRadius: 8,
              border: "1px solid #86efac",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: 8, color: "#166534" }}>
              New Agent Response
            </h4>
            <div style={{ fontSize: 13, marginBottom: 8, color: "#666" }}>
              Intent: <strong>{lastReplyResult.intent}</strong> |
              Action: <strong>{lastReplyResult.action}</strong> |
              State: <strong>{lastReplyResult.state}</strong>
            </div>
            {lastReplyResult.draft ? (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  backgroundColor: "white",
                  padding: 12,
                  borderRadius: 6,
                  border: "1px solid #ddd",
                  margin: 0,
                }}
              >
                {lastReplyResult.draft}
              </pre>
            ) : (
              <em style={{ color: "#666" }}>(No draft generated)</em>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
