import { supabase } from "@/lib/db";
import { notFound } from "next/navigation";
import ProposalEditor from "./ProposalEditor";

export const dynamic = "force-dynamic";

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch proposal with related data
  const { data: proposal, error } = await supabase
    .from("learning_proposals")
    .select(`
      id,
      thread_id,
      proposal_type,
      title,
      summary,
      proposed_content,
      confidence_score,
      auto_approved,
      source_type,
      similarity_to_existing,
      similar_doc_id,
      source_context,
      status,
      reviewed_by,
      reviewed_at,
      review_notes,
      published_kb_doc_id,
      published_instruction_id,
      created_at
    `)
    .eq("id", id)
    .single();

  if (error || !proposal) {
    notFound();
  }

  // Get thread context
  let thread = null;
  if (proposal.thread_id) {
    const { data: threadData } = await supabase
      .from("threads")
      .select("id, subject, last_intent, summary")
      .eq("id", proposal.thread_id)
      .single();
    thread = threadData;
  }

  // Get similar doc if referenced
  let similarDoc = null;
  if (proposal.similar_doc_id) {
    const { data: doc } = await supabase
      .from("kb_docs")
      .select("id, title, body")
      .eq("id", proposal.similar_doc_id)
      .single();
    similarDoc = doc;
  }

  const getConfidenceBadge = (score: number | null) => {
    if (score === null) return { bg: "#f5f5f5", text: "#666", label: "Unknown" };
    if (score >= 0.85) return { bg: "#e5f8f4", text: "#00a182", label: "High" };
    if (score >= 0.70) return { bg: "#fef6e7", text: "#b36b00", label: "Medium" };
    return { bg: "#fde8e9", text: "#c93b41", label: "Low" };
  };

  const confidenceBadge = getConfidenceBadge(proposal.confidence_score);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "kb_article": return "KB Article";
      case "instruction_update": return "Instruction";
      case "kb_update": return "KB Update";
      default: return type;
    }
  };

  const isPending = proposal.status === "pending";

  return (
    <div style={{ padding: "0 0 24px 0", maxWidth: 900, margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 20px",
        borderBottom: "1px solid #dfe3eb",
        backgroundColor: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href="/admin/learning"
            style={{
              color: "#7c98b6",
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            ← Back
          </a>
          <span style={{ color: "#dfe3eb" }}>|</span>
          <span style={{
            padding: "2px 6px",
            borderRadius: 2,
            fontSize: 11,
            fontWeight: 500,
            backgroundColor: proposal.proposal_type === "kb_article" ? "#e5f5f8" : "#f0e6f6",
            color: proposal.proposal_type === "kb_article" ? "#0091ae" : "#7c3aed",
          }}>
            {getTypeLabel(proposal.proposal_type)}
          </span>
          <span style={{
            padding: "2px 6px",
            borderRadius: 2,
            fontSize: 11,
            fontWeight: 500,
            backgroundColor: confidenceBadge.bg,
            color: confidenceBadge.text,
          }}>
            {proposal.confidence_score !== null
              ? `${Math.round(proposal.confidence_score * 100)}% confidence`
              : "Unknown confidence"}
          </span>
        </div>
        {!isPending && (
          <span style={{
            padding: "4px 8px",
            borderRadius: 3,
            fontSize: 12,
            fontWeight: 500,
            backgroundColor: proposal.status === "approved" ? "#e5f8f4" : "#fde8e9",
            color: proposal.status === "approved" ? "#00a182" : "#c93b41",
          }}>
            {proposal.status === "approved" ? "Approved" : "Rejected"}
          </span>
        )}
      </div>

      <div style={{ padding: "20px" }}>
        {/* Title */}
        <h1 style={{
          fontSize: 22,
          fontWeight: 500,
          color: "#33475b",
          margin: "0 0 16px 0",
        }}>
          {proposal.title}
        </h1>

        {/* Summary */}
        {proposal.summary && (
          <div style={{
            fontSize: 14,
            color: "#516f90",
            lineHeight: 1.6,
            marginBottom: 20,
            padding: "12px 16px",
            backgroundColor: "#f8fafc",
            borderRadius: 4,
          }}>
            {proposal.summary}
          </div>
        )}

        {/* Metadata Card */}
        <div style={{
          backgroundColor: "#fff",
          border: "1px solid #eaf0f6",
          borderRadius: 4,
          padding: "16px",
          marginBottom: 20,
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            fontSize: 13,
          }}>
            <div>
              <div style={{ color: "#7c98b6", marginBottom: 4 }}>Source</div>
              <div style={{ color: "#33475b" }}>
                {proposal.source_type === "resolution" ? "Resolution Analysis" : "Human Observation"}
              </div>
            </div>
            {thread && (
              <div>
                <div style={{ color: "#7c98b6", marginBottom: 4 }}>Source Thread</div>
                <a
                  href={`/admin/thread/${thread.id}`}
                  style={{ color: "#0073aa", textDecoration: "none" }}
                >
                  {thread.subject || "(no subject)"}
                </a>
              </div>
            )}
            <div>
              <div style={{ color: "#7c98b6", marginBottom: 4 }}>Created</div>
              <div style={{ color: "#33475b" }}>
                {new Date(proposal.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>
            {proposal.similarity_to_existing && (
              <div>
                <div style={{ color: "#7c98b6", marginBottom: 4 }}>Similarity to Existing</div>
                <div style={{ color: proposal.similarity_to_existing > 0.7 ? "#b36b00" : "#33475b" }}>
                  {Math.round(proposal.similarity_to_existing * 100)}%
                </div>
              </div>
            )}
            {proposal.reviewed_by && (
              <div>
                <div style={{ color: "#7c98b6", marginBottom: 4 }}>Reviewed By</div>
                <div style={{ color: "#33475b" }}>
                  {proposal.reviewed_by.split("@")[0]}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Similar Document Warning */}
        {similarDoc && (
          <div style={{
            backgroundColor: "#fef6e7",
            border: "1px solid #f5d69c",
            borderRadius: 4,
            padding: "12px 16px",
            marginBottom: 20,
          }}>
            <div style={{ fontWeight: 500, color: "#b36b00", marginBottom: 8 }}>
              ⚠️ Similar document exists
            </div>
            <div style={{ fontSize: 13, color: "#33475b" }}>
              <strong>{similarDoc.title}</strong>
              <div style={{ marginTop: 8, color: "#516f90", whiteSpace: "pre-wrap" }}>
                {similarDoc.body.length > 300
                  ? similarDoc.body.substring(0, 300) + "..."
                  : similarDoc.body}
              </div>
            </div>
          </div>
        )}

        {/* Editor / Content */}
        <ProposalEditor
          proposalId={proposal.id}
          proposalType={proposal.proposal_type}
          initialContent={proposal.proposed_content || ""}
          isPending={isPending}
          status={proposal.status}
          reviewNotes={proposal.review_notes}
        />

        {/* Source Context */}
        {proposal.source_context && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#516f90",
              marginBottom: 12,
            }}>
              Source Context
            </h3>
            <div style={{
              backgroundColor: "#f8fafc",
              border: "1px solid #eaf0f6",
              borderRadius: 4,
              padding: "12px 16px",
              fontSize: 13,
              color: "#516f90",
              whiteSpace: "pre-wrap",
              maxHeight: 300,
              overflow: "auto",
            }}>
              {typeof proposal.source_context === "string"
                ? proposal.source_context
                : JSON.stringify(proposal.source_context, null, 2)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
