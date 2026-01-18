"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ThreadActionsProps = {
  threadId: string;
  latestDraft: string | null;
  latestEventId: string | null;
  latestDraftGenerationId: string | null;
  intent: string | null;
  isHumanHandling: boolean;
  humanHandler: string | null;
  draftBlocked?: boolean;
  draftBlockReason?: string | null;
  canSendViaGmail?: boolean;
  isArchived?: boolean;
  threadState?: string;
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
  latestDraftGenerationId,
  intent,
  isHumanHandling,
  humanHandler,
  draftBlocked = false,
  draftBlockReason = null,
  canSendViaGmail = false,
  isArchived = false,
  threadState = "NEW",
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
  const [sendAction, setSendAction] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [archiveAction, setArchiveAction] = useState<"idle" | "archiving" | "archived" | "error">("idle");
  const [archiveResult, setArchiveResult] = useState<{
    proposalsGenerated?: number;
    proposalsAutoApproved?: number;
    learningStatus?: string;
  } | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

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

  async function handleApproveAndSend() {
    if (!latestDraft || !canSendViaGmail) return;

    setSendAction("sending");
    setSendError(null);

    try {
      // First submit approval feedback
      const feedbackRes = await fetch("/api/admin/draft-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          event_id: latestEventId,
          draft_text: latestDraft,
          intent,
          rating: "approved",
          feedback_notes: "",
        }),
      });

      if (!feedbackRes.ok) {
        const data = await feedbackRes.json();
        throw new Error(data.error || "Failed to submit approval");
      }

      // Then send via Gmail
      const sendRes = await fetch("/api/admin/send-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          draft_text: latestDraft,
          draft_generation_id: latestDraftGenerationId,
          was_edited: false,
        }),
      });

      if (sendRes.ok) {
        setSendAction("sent");
        setFeedbackSubmitted(true);
        router.refresh();
      } else {
        const data = await sendRes.json();
        throw new Error(data.error || "Failed to send draft");
      }
    } catch (err) {
      setSendAction("error");
      setSendError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function handleResolveAndArchive() {
    setArchiveAction("archiving");
    setArchiveError(null);

    try {
      const res = await fetch(`/api/admin/threads/${threadId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerLearning: true }),
      });

      if (res.ok) {
        const data = await res.json();
        setArchiveAction("archived");
        setArchiveResult({
          proposalsGenerated: data.proposalsGenerated,
          proposalsAutoApproved: data.proposalsAutoApproved,
          learningStatus: data.learningStatus,
        });
        router.refresh();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to archive thread");
      }
    } catch (err) {
      setArchiveAction("error");
      setArchiveError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function handleUnarchive() {
    setArchiveAction("archiving");
    setArchiveError(null);

    try {
      const res = await fetch(`/api/admin/threads/${threadId}/archive`, {
        method: "DELETE",
      });

      if (res.ok) {
        setArchiveAction("idle");
        setArchiveResult(null);
        router.refresh();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to unarchive thread");
      }
    } catch (err) {
      setArchiveAction("error");
      setArchiveError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Archive Controls */}
      <div
        style={{
          padding: 16,
          marginBottom: 24,
          borderRadius: 4,
          backgroundColor: isArchived || archiveAction === "archived" ? "#f0fdf4" : "#ffffff",
          border: `1px solid ${isArchived || archiveAction === "archived" ? "#86efac" : "#cbd6e2"}`,
          borderLeft: `4px solid ${isArchived || archiveAction === "archived" ? "#22c55e" : "#6b7280"}`,
        }}
      >
        {isArchived || archiveAction === "archived" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  backgroundColor: "#22c55e",
                  color: "white",
                  borderRadius: 3,
                  fontWeight: 500,
                  fontSize: 13,
                }}
              >
                Archived
              </span>
              <span style={{ color: "#166534", fontSize: 13 }}>
                This thread has been resolved and archived
              </span>
            </div>

            {archiveResult && (
              <div style={{ marginBottom: 12, fontSize: 13, color: "#166534" }}>
                {archiveResult.learningStatus === "completed" && (
                  <>
                    {archiveResult.proposalsGenerated} learning proposal(s) generated
                    {archiveResult.proposalsAutoApproved ? ` (${archiveResult.proposalsAutoApproved} auto-approved)` : ""}
                    {archiveResult.proposalsGenerated && archiveResult.proposalsGenerated > (archiveResult.proposalsAutoApproved || 0) && (
                      <a href="/admin/learning" style={{ marginLeft: 8, color: "#0091ae" }}>
                        Review proposals →
                      </a>
                    )}
                  </>
                )}
                {archiveResult.learningStatus === "skipped" && (
                  <span style={{ color: "#6b7280" }}>Learning extraction skipped (low quality)</span>
                )}
              </div>
            )}

            <button
              onClick={handleUnarchive}
              disabled={archiveAction === "archiving"}
              style={{
                padding: "9px 16px",
                backgroundColor: "#ffffff",
                color: "#516f90",
                border: "1px solid #cbd6e2",
                borderRadius: 4,
                cursor: archiveAction === "archiving" ? "not-allowed" : "pointer",
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              {archiveAction === "archiving" ? "Processing..." : "Unarchive Thread"}
            </button>
          </>
        ) : archiveAction === "error" ? (
          <>
            <div
              style={{
                padding: 12,
                backgroundColor: "#fef0f0",
                borderRadius: 4,
                color: "#c93b41",
                border: "1px solid #f5c6c6",
                marginBottom: 12,
              }}
            >
              <strong>Archive failed:</strong> {archiveError}
            </div>
            <button
              onClick={() => {
                setArchiveAction("idle");
                setArchiveError(null);
              }}
              style={{
                padding: "9px 16px",
                backgroundColor: "#ffffff",
                color: "#516f90",
                border: "1px solid #cbd6e2",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 500, color: "#33475b", fontSize: 14 }}>
                Resolve & Archive
              </span>
              <p style={{ margin: "6px 0 0", color: "#516f90", fontSize: 13 }}>
                Mark as resolved and extract learnings from the conversation to improve Lina.
              </p>
            </div>
            <button
              onClick={handleResolveAndArchive}
              disabled={archiveAction === "archiving" || threadState === "RESOLVED"}
              style={{
                padding: "9px 16px",
                backgroundColor: archiveAction === "archiving" ? "#9ca3af" : "#22c55e",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: archiveAction === "archiving" || threadState === "RESOLVED" ? "not-allowed" : "pointer",
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              {archiveAction === "archiving" ? "Archiving..." : "Resolve & Archive"}
            </button>
            {threadState === "RESOLVED" && (
              <span style={{ marginLeft: 12, fontSize: 12, color: "#6b7280" }}>
                Thread is already resolved
              </span>
            )}
          </>
        )}
      </div>

      {/* Observation Mode Controls */}
      <div
        style={{
          padding: 16,
          marginBottom: 24,
          borderRadius: 4,
          backgroundColor: isHumanHandling ? "#fef6e7" : "#ffffff",
          border: `1px solid ${isHumanHandling ? "#f5c26b" : "#cbd6e2"}`,
          borderLeft: `4px solid ${isHumanHandling ? "#f5c26b" : "#0091ae"}`,
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
                  padding: "4px 10px",
                  backgroundColor: "#f5c26b",
                  color: "#6d4c00",
                  borderRadius: 3,
                  fontWeight: 500,
                  fontSize: 13,
                }}
              >
                Observation Mode
              </span>
              <span style={{ color: "#b36b00", fontSize: 13 }}>
                Lina is watching and learning from {humanHandler || "you"}
              </span>
            </div>

            {!showEndObservation ? (
              <button
                onClick={() => setShowEndObservation(true)}
                disabled={observationAction === "loading"}
                style={{
                  padding: "9px 16px",
                  backgroundColor: "#00a182",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                End Observation
              </button>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 13, color: "#33475b" }}>
                    Resolution Type
                  </label>
                  <select
                    value={resolutionType}
                    onChange={(e) => setResolutionType(e.target.value as typeof resolutionType)}
                    style={{
                      padding: 10,
                      border: "1px solid #cbd6e2",
                      borderRadius: 4,
                      fontFamily: "inherit",
                      fontSize: 14,
                      width: "100%",
                      maxWidth: 300,
                      color: "#33475b",
                    }}
                  >
                    <option value="resolved">Resolved</option>
                    <option value="escalated_further">Escalated Further</option>
                    <option value="returned_to_agent">Return to Lina</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 13, color: "#33475b" }}>
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
                      border: "1px solid #cbd6e2",
                      borderRadius: 4,
                      fontFamily: "inherit",
                      fontSize: 14,
                      color: "#33475b",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleEndObservation}
                    disabled={observationAction === "loading"}
                    style={{
                      padding: "9px 16px",
                      backgroundColor: "#00a182",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    {observationAction === "loading" ? "Saving..." : "Confirm End"}
                  </button>
                  <button
                    onClick={() => setShowEndObservation(false)}
                    style={{
                      padding: "9px 16px",
                      backgroundColor: "#ffffff",
                      color: "#516f90",
                      border: "1px solid #cbd6e2",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontWeight: 500,
                      fontSize: 14,
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
              <span style={{ fontWeight: 500, color: "#0091ae", fontSize: 14 }}>
                Take Over This Thread
              </span>
              <p style={{ margin: "6px 0 0", color: "#516f90", fontSize: 13 }}>
                Enter observation mode so Lina can learn from how you handle this case.
              </p>
            </div>
            <button
              onClick={handleTakeOver}
              disabled={observationAction === "loading"}
              style={{
                padding: "9px 16px",
                backgroundColor: "#0091ae",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              {observationAction === "loading" ? "Taking Over..." : "Take Over Thread"}
            </button>
          </>
        )}
      </div>

      {/* Feedback Section */}
      {latestDraft && !draftBlocked && (
        <div style={{
          backgroundColor: "#ffffff",
          border: "1px solid #cbd6e2",
          borderRadius: 4,
          marginBottom: 24,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 16px",
            backgroundColor: "#f5f8fa",
            borderBottom: "1px solid #cbd6e2",
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#33475b", margin: 0 }}>Rate This Draft</h3>
          </div>
          <div style={{ padding: 16 }}>
            {feedbackSubmitted ? (
              <div
                style={{
                  padding: 12,
                  backgroundColor: sendAction === "sent" ? "#e5f8f4" : "#e5f8f4",
                  borderRadius: 4,
                  color: "#00a182",
                  border: "1px solid #a8e4d0",
                }}
              >
                <strong>{sendAction === "sent" ? "Draft sent via Gmail!" : "Feedback submitted!"}</strong>
                {feedbackResult?.updatedSections && feedbackResult.updatedSections.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    Agent instructions updated:{" "}
                    <strong>{feedbackResult.updatedSections.join(", ")}</strong>
                    <br />
                    <a href="/admin/instructions" style={{ color: "#0091ae" }}>
                      View updated instructions →
                    </a>
                  </div>
                )}
                {feedbackResult?.error && (
                  <div style={{ marginTop: 8, color: "#c93b41" }}>
                    Integration error: {feedbackResult.error}
                  </div>
                )}
              </div>
            ) : sendAction === "error" ? (
              <div
                style={{
                  padding: 12,
                  backgroundColor: "#fef0f0",
                  borderRadius: 4,
                  color: "#c93b41",
                  border: "1px solid #f5c6c6",
                  marginBottom: 12,
                }}
              >
                <strong>Failed to send:</strong> {sendError}
                <button
                  onClick={() => {
                    setSendAction("idle");
                    setSendError(null);
                  }}
                  style={{
                    marginLeft: 12,
                    padding: "4px 8px",
                    backgroundColor: "#ffffff",
                    color: "#c93b41",
                    border: "1px solid #c93b41",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  {canSendViaGmail && (
                    <button
                      onClick={handleApproveAndSend}
                      disabled={sendAction === "sending"}
                      style={{
                        padding: "9px 16px",
                        backgroundColor: sendAction === "sending" ? "#7ed4c3" : "#00a182",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: sendAction === "sending" ? "not-allowed" : "pointer",
                        fontWeight: 500,
                        fontSize: 14,
                      }}
                    >
                      {sendAction === "sending" ? "Sending..." : "Approve & Send"}
                    </button>
                  )}
                  <button
                    onClick={() => handleFeedback("approved")}
                    disabled={sendAction === "sending"}
                    style={{
                      padding: "9px 16px",
                      backgroundColor: canSendViaGmail ? "#ffffff" : "#00a182",
                      color: canSendViaGmail ? "#00a182" : "white",
                      border: canSendViaGmail ? "1px solid #00a182" : "none",
                      borderRadius: 4,
                      cursor: sendAction === "sending" ? "not-allowed" : "pointer",
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    {canSendViaGmail ? "Approve Only" : "Approve"}
                  </button>
                  <button
                    onClick={() => setShowFeedbackForm(true)}
                    disabled={sendAction === "sending"}
                    style={{
                      padding: "9px 16px",
                      backgroundColor: "#f5c26b",
                      color: "#6d4c00",
                      border: "none",
                      borderRadius: 4,
                      cursor: sendAction === "sending" ? "not-allowed" : "pointer",
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    Needs Edit
                  </button>
                  <button
                    onClick={() => setShowFeedbackForm(true)}
                    disabled={sendAction === "sending"}
                    style={{
                      padding: "9px 16px",
                      backgroundColor: "#f2545b",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: sendAction === "sending" ? "not-allowed" : "pointer",
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    Reject
                  </button>
                </div>
                {!canSendViaGmail && (
                  <div style={{ fontSize: 12, color: "#7c98b6", marginBottom: 8 }}>
                    This thread cannot send via Gmail (no Gmail thread ID)
                  </div>
                )}

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
                        border: "1px solid #cbd6e2",
                        borderRadius: 4,
                        fontFamily: "inherit",
                        fontSize: 14,
                        marginBottom: 12,
                        color: "#33475b",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleFeedback("needs_edit")}
                        style={{
                          padding: "9px 16px",
                          backgroundColor: "#f5c26b",
                          color: "#6d4c00",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontWeight: 500,
                          fontSize: 14,
                        }}
                      >
                        Submit as Needs Edit
                      </button>
                      <button
                        onClick={() => handleFeedback("rejected")}
                        style={{
                          padding: "9px 16px",
                          backgroundColor: "#f2545b",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontWeight: 500,
                          fontSize: 14,
                        }}
                      >
                        Submit as Rejected
                      </button>
                      <button
                        onClick={() => {
                          setShowFeedbackForm(false);
                          setFeedbackNotes("");
                        }}
                        style={{
                          padding: "9px 16px",
                          backgroundColor: "#ffffff",
                          color: "#516f90",
                          border: "1px solid #cbd6e2",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontWeight: 500,
                          fontSize: 14,
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
        </div>
      )}

      {/* Reply Simulation */}
      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px dashed #0091ae",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div style={{
          padding: "12px 16px",
          backgroundColor: "#e5f5f8",
          borderBottom: "1px dashed #0091ae",
        }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0091ae" }}>
            Simulate Customer Reply
          </h3>
        </div>
        <div style={{ padding: 16 }}>
          <form onSubmit={handleReply}>
            <input
              type="email"
              placeholder="Customer email (optional)"
              value={replyEmail}
              onChange={(e) => setReplyEmail(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #cbd6e2",
                borderRadius: 4,
                marginBottom: 10,
                fontFamily: "inherit",
                fontSize: 14,
                color: "#33475b",
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
                border: "1px solid #cbd6e2",
                borderRadius: 4,
                fontFamily: "inherit",
                fontSize: 14,
                marginBottom: 12,
                color: "#33475b",
              }}
            />
            <button
              type="submit"
              disabled={isSubmitting || !replyText.trim()}
              style={{
                padding: "9px 16px",
                backgroundColor: isSubmitting ? "#cbd6e2" : "#0091ae",
                color: isSubmitting ? "#7c98b6" : "white",
                border: "none",
                borderRadius: 4,
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontWeight: 500,
                fontSize: 14,
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
                backgroundColor: "#e5f8f4",
                borderRadius: 4,
                border: "1px solid #a8e4d0",
              }}
            >
              <h4 style={{ marginTop: 0, marginBottom: 8, color: "#00a182", fontSize: 14, fontWeight: 600 }}>
                New Agent Response
              </h4>
              <div style={{ fontSize: 12, marginBottom: 10, color: "#516f90" }}>
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
                    borderRadius: 4,
                    border: "1px solid #cbd6e2",
                    margin: 0,
                    fontFamily: "inherit",
                    fontSize: 14,
                    color: "#33475b",
                  }}
                >
                  {lastReplyResult.draft}
                </pre>
              ) : (
                <em style={{ color: "#7c98b6", fontSize: 13 }}>(No draft generated)</em>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
