"use client";

import { useState } from "react";

type Proposal = {
  id: string;
  thread_id: string | null;
  proposal_type: string;
  title: string;
  summary: string | null;
  confidence_score: number | null;
  auto_approved: boolean;
  source_type: string | null;
  similarity_to_existing: number | null;
  similar_doc_id: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  thread: { id: string; subject: string; last_intent: string } | null;
  confidenceBadge: { bg: string; text: string; label: string };
};

type ProposalListProps = {
  proposals: Proposal[];
};

export default function ProposalList({ proposals }: ProposalListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, {
    loading: boolean;
    result?: string;
    error?: string;
  }>>({});

  const handleAction = async (proposalId: string, action: "approve" | "reject") => {
    setActionStates(prev => ({
      ...prev,
      [proposalId]: { loading: true },
    }));

    try {
      const res = await fetch(`/api/admin/learning/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update proposal");
      }

      setActionStates(prev => ({
        ...prev,
        [proposalId]: {
          loading: false,
          result: action === "approve" ? "Approved and published!" : "Rejected",
        },
      }));

      // Refresh page after short delay to show updated state
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setActionStates(prev => ({
        ...prev,
        [proposalId]: {
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        },
      }));
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "kb_article": return "KB Article";
      case "instruction_update": return "Instruction";
      case "kb_update": return "KB Update";
      default: return type;
    }
  };

  const getSourceLabel = (source: string | null) => {
    switch (source) {
      case "resolution": return "Resolution Analysis";
      case "observation": return "Human Observation";
      default: return source || "Unknown";
    }
  };

  if (proposals.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {proposals.map((proposal) => {
        const isExpanded = expandedId === proposal.id;
        const actionState = actionStates[proposal.id];
        const isPending = proposal.status === "pending";
        const hasSimilar = proposal.similarity_to_existing && proposal.similarity_to_existing > 0.7;

        return (
          <div
            key={proposal.id}
            style={{
              backgroundColor: "#fff",
              border: "1px solid #eaf0f6",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            {/* Header Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                cursor: "pointer",
                backgroundColor: isExpanded ? "#f8fafc" : "transparent",
              }}
              onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
            >
              {/* Expand Indicator */}
              <span style={{ color: "#99acc2", fontSize: 12 }}>
                {isExpanded ? "▼" : "▶"}
              </span>

              {/* Type Badge */}
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: 2,
                  fontSize: 11,
                  fontWeight: 500,
                  backgroundColor: proposal.proposal_type === "kb_article" ? "#e5f5f8" : "#f0e6f6",
                  color: proposal.proposal_type === "kb_article" ? "#0091ae" : "#7c3aed",
                  whiteSpace: "nowrap",
                }}
              >
                {getTypeLabel(proposal.proposal_type)}
              </span>

              {/* Confidence Badge */}
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: 2,
                  fontSize: 11,
                  fontWeight: 500,
                  backgroundColor: proposal.confidenceBadge.bg,
                  color: proposal.confidenceBadge.text,
                  whiteSpace: "nowrap",
                }}
              >
                {proposal.confidence_score !== null
                  ? `${Math.round(proposal.confidence_score * 100)}%`
                  : "?"}
              </span>

              {/* Title */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 500,
                  color: "#33475b",
                  fontSize: 14,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {proposal.title}
                </div>
              </div>

              {/* Status Indicators */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {proposal.auto_approved && (
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: 2,
                      fontSize: 10,
                      fontWeight: 500,
                      backgroundColor: "#e5f8f4",
                      color: "#00a182",
                    }}
                  >
                    Auto
                  </span>
                )}
                {hasSimilar && (
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: 2,
                      fontSize: 10,
                      fontWeight: 500,
                      backgroundColor: "#fef6e7",
                      color: "#b36b00",
                    }}
                    title={`${Math.round((proposal.similarity_to_existing || 0) * 100)}% similar to existing`}
                  >
                    Similar
                  </span>
                )}
                {!isPending && (
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: 2,
                      fontSize: 10,
                      fontWeight: 500,
                      backgroundColor: proposal.status === "approved" ? "#e5f8f4" : "#fde8e9",
                      color: proposal.status === "approved" ? "#00a182" : "#c93b41",
                    }}
                  >
                    {proposal.status === "approved" ? "Approved" : "Rejected"}
                  </span>
                )}
              </div>

              {/* Date */}
              <span style={{ fontSize: 12, color: "#99acc2", whiteSpace: "nowrap" }}>
                {new Date(proposal.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: "0 16px 16px 40px" }}>
                {/* Summary */}
                {proposal.summary && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#516f90", marginBottom: 4 }}>
                      Summary
                    </div>
                    <div style={{ fontSize: 13, color: "#33475b", lineHeight: 1.5 }}>
                      {proposal.summary}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  marginBottom: 12,
                  fontSize: 12,
                  color: "#7c98b6",
                }}>
                  <div>
                    <span style={{ color: "#516f90" }}>Source:</span>{" "}
                    {getSourceLabel(proposal.source_type)}
                  </div>
                  {proposal.thread && (
                    <div>
                      <span style={{ color: "#516f90" }}>Thread:</span>{" "}
                      <a
                        href={`/admin/thread/${proposal.thread.id}`}
                        style={{ color: "#0073aa", textDecoration: "none" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {proposal.thread.subject || "(no subject)"}
                      </a>
                    </div>
                  )}
                  {proposal.similarity_to_existing && (
                    <div>
                      <span style={{ color: "#516f90" }}>Similarity:</span>{" "}
                      {Math.round(proposal.similarity_to_existing * 100)}%
                    </div>
                  )}
                  {proposal.reviewed_by && (
                    <div>
                      <span style={{ color: "#516f90" }}>Reviewed by:</span>{" "}
                      {proposal.reviewed_by.split("@")[0]}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {isPending && (
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    {actionState?.loading ? (
                      <span style={{ fontSize: 13, color: "#7c98b6" }}>Processing...</span>
                    ) : actionState?.result ? (
                      <span style={{
                        fontSize: 13,
                        color: actionState.result.includes("Approved") ? "#00a182" : "#c93b41",
                      }}>
                        {actionState.result}
                      </span>
                    ) : actionState?.error ? (
                      <span style={{ fontSize: 13, color: "#c93b41" }}>
                        Error: {actionState.error}
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(proposal.id, "approve");
                          }}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#00a182",
                            color: "#fff",
                            border: "none",
                            borderRadius: 3,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Approve & Publish
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(proposal.id, "reject");
                          }}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "transparent",
                            color: "#c93b41",
                            border: "1px solid #c93b41",
                            borderRadius: 3,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Reject
                        </button>
                        <a
                          href={`/admin/learning/${proposal.id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#eaf0f6",
                            color: "#33475b",
                            borderRadius: 3,
                            fontSize: 13,
                            fontWeight: 500,
                            textDecoration: "none",
                          }}
                        >
                          View & Edit
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
