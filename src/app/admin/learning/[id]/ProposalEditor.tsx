"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ProposalEditorProps = {
  proposalId: string;
  proposalType: string;
  initialContent: string;
  isPending: boolean;
  status: string;
  reviewNotes: string | null;
};

export default function ProposalEditor({
  proposalId,
  proposalType,
  initialContent,
  isPending,
  status,
  reviewNotes,
}: ProposalEditorProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hasChanges = content !== initialContent;

  const handleAction = async (action: "approve" | "reject") => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const body: Record<string, unknown> = { action, notes };

      // Include edited content if changed and approving
      if (hasChanges && action === "approve") {
        body.editedContent = content;
      }

      const res = await fetch(`/api/admin/learning/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update proposal");
      }

      setSuccess(
        action === "approve"
          ? "Approved and published successfully!"
          : "Proposal rejected."
      );

      // Navigate back after short delay
      setTimeout(() => {
        router.push("/admin/learning");
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Content Editor */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}>
          <h3 style={{
            fontSize: 14,
            fontWeight: 500,
            color: "#516f90",
            margin: 0,
          }}>
            Proposed Content
            {proposalType === "kb_article" && " (Markdown supported)"}
          </h3>
          {hasChanges && isPending && (
            <span style={{ fontSize: 12, color: "#b36b00" }}>
              Modified
            </span>
          )}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={!isPending}
          style={{
            width: "100%",
            minHeight: 300,
            padding: "12px 16px",
            border: "1px solid #dfe3eb",
            borderRadius: 4,
            fontSize: 13,
            fontFamily: "monospace",
            lineHeight: 1.6,
            resize: "vertical",
            backgroundColor: isPending ? "#fff" : "#f8fafc",
            color: "#33475b",
          }}
        />
      </div>

      {/* Review Notes (for pending proposals) */}
      {isPending && (
        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="review-notes"
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 500,
              color: "#516f90",
              marginBottom: 8,
            }}
          >
            Review Notes (optional)
          </label>
          <textarea
            id="review-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about your decision..."
            style={{
              width: "100%",
              minHeight: 80,
              padding: "12px 16px",
              border: "1px solid #dfe3eb",
              borderRadius: 4,
              fontSize: 13,
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
        </div>
      )}

      {/* Previous Review Notes (for reviewed proposals) */}
      {!isPending && reviewNotes && (
        <div style={{
          marginBottom: 20,
          padding: "12px 16px",
          backgroundColor: "#f8fafc",
          borderRadius: 4,
          border: "1px solid #eaf0f6",
        }}>
          <div style={{
            fontSize: 12,
            fontWeight: 500,
            color: "#7c98b6",
            marginBottom: 4,
          }}>
            Review Notes
          </div>
          <div style={{ fontSize: 13, color: "#33475b" }}>
            {reviewNotes}
          </div>
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div style={{
          padding: "12px 16px",
          backgroundColor: "#fde8e9",
          border: "1px solid #f5c6cb",
          borderRadius: 4,
          marginBottom: 16,
          color: "#c93b41",
          fontSize: 13,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: "12px 16px",
          backgroundColor: "#e5f8f4",
          border: "1px solid #b8e6d4",
          borderRadius: 4,
          marginBottom: 16,
          color: "#00a182",
          fontSize: 13,
        }}>
          {success}
        </div>
      )}

      {/* Action Buttons */}
      {isPending && (
        <div style={{
          display: "flex",
          gap: 12,
          padding: "16px 0",
          borderTop: "1px solid #eaf0f6",
        }}>
          <button
            onClick={() => handleAction("approve")}
            disabled={isSubmitting}
            style={{
              padding: "10px 20px",
              backgroundColor: isSubmitting ? "#99acc2" : "#00a182",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Processing..." : hasChanges ? "Approve with Edits" : "Approve & Publish"}
          </button>
          <button
            onClick={() => handleAction("reject")}
            disabled={isSubmitting}
            style={{
              padding: "10px 20px",
              backgroundColor: "transparent",
              color: "#c93b41",
              border: "1px solid #c93b41",
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.5 : 1,
            }}
          >
            Reject
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setContent(initialContent)}
            disabled={!hasChanges || isSubmitting}
            style={{
              padding: "10px 20px",
              backgroundColor: "transparent",
              color: hasChanges ? "#516f90" : "#99acc2",
              border: "1px solid #dfe3eb",
              borderRadius: 4,
              fontSize: 14,
              cursor: hasChanges && !isSubmitting ? "pointer" : "not-allowed",
            }}
          >
            Reset Changes
          </button>
        </div>
      )}

      {/* Info for already reviewed */}
      {!isPending && (
        <div style={{
          padding: "16px 0",
          borderTop: "1px solid #eaf0f6",
          fontSize: 13,
          color: "#7c98b6",
        }}>
          This proposal has been {status}. {status === "approved" && "The content has been published to the knowledge base."}
        </div>
      )}
    </div>
  );
}
