import { supabase } from "@/lib/db";
import { Suspense } from "react";
import ProposalList from "./ProposalList";
import LearningFilters from "./LearningFilters";

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  type?: string;
};

// Confidence badge colors
const getConfidenceBadge = (score: number | null) => {
  if (score === null) return { bg: "#f5f5f5", text: "#666", label: "Unknown" };
  if (score >= 0.85) return { bg: "#e5f8f4", text: "#00a182", label: "High" };
  if (score >= 0.70) return { bg: "#fef6e7", text: "#b36b00", label: "Medium" };
  return { bg: "#fde8e9", text: "#c93b41", label: "Low" };
};

export default async function LearningPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const statusFilter = params.status || "pending";
  const typeFilter = params.type || "";

  // Build query
  let query = supabase
    .from("learning_proposals")
    .select(`
      id,
      thread_id,
      proposal_type,
      title,
      summary,
      confidence_score,
      auto_approved,
      source_type,
      similarity_to_existing,
      similar_doc_id,
      status,
      reviewed_by,
      reviewed_at,
      created_at
    `)
    .order("created_at", { ascending: false });

  // Apply status filter
  if (statusFilter === "pending") {
    query = query.eq("status", "pending");
  } else if (statusFilter === "approved") {
    query = query.eq("status", "approved");
  } else if (statusFilter === "rejected") {
    query = query.eq("status", "rejected");
  } else if (statusFilter === "auto_approved") {
    query = query.eq("auto_approved", true);
  }
  // "all" shows everything except deleted

  if (statusFilter !== "all") {
    query = query.neq("status", "deleted");
  }

  // Apply type filter
  if (typeFilter) {
    query = query.eq("proposal_type", typeFilter);
  }

  const { data: proposals } = await query.limit(50);

  // Get thread subjects for display
  const threadIds = [...new Set(proposals?.map(p => p.thread_id).filter(Boolean) || [])];
  const { data: threads } = await supabase
    .from("threads")
    .select("id, subject, last_intent")
    .in("id", threadIds);

  const threadMap = new Map(threads?.map(t => [t.id, t]) || []);

  // Enrich proposals with thread data
  const enrichedProposals = proposals?.map(p => ({
    ...p,
    thread: threadMap.get(p.thread_id) || null,
    confidenceBadge: getConfidenceBadge(p.confidence_score),
  })) || [];

  // Get counts for stats
  const { count: pendingCount } = await supabase
    .from("learning_proposals")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: autoApprovedCount } = await supabase
    .from("learning_proposals")
    .select("*", { count: "exact", head: true })
    .eq("auto_approved", true)
    .eq("status", "approved");

  const { count: totalCount } = await supabase
    .from("learning_proposals")
    .select("*", { count: "exact", head: true })
    .neq("status", "deleted");

  return (
    <div style={{ padding: "0 0 24px 0", maxWidth: 1200, margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 20px",
        borderBottom: "1px solid #dfe3eb",
        backgroundColor: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "#33475b", margin: 0 }}>
            Learning Proposals
          </h1>
          <span style={{ fontSize: 13, color: "#7c98b6" }}>
            {enrichedProposals.length} shown
          </span>
        </div>
        <a
          href="/admin"
          style={{
            padding: "7px 12px",
            backgroundColor: "#eaf0f6",
            color: "#33475b",
            borderRadius: 3,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          ← Back to Inbox
        </a>
      </div>

      <div style={{ padding: "16px 20px" }}>
        {/* Stats Row */}
        <div style={{
          display: "flex",
          gap: 24,
          marginBottom: 16,
          paddingBottom: 16,
          borderBottom: "1px solid #eaf0f6",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 18,
              fontWeight: 600,
              color: (pendingCount ?? 0) > 0 ? "#0073aa" : "#99acc2",
            }}>
              {pendingCount ?? 0}
            </span>
            <span style={{ fontSize: 13, color: "#516f90" }}>Pending Review</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 18,
              fontWeight: 600,
              color: (autoApprovedCount ?? 0) > 0 ? "#00a182" : "#99acc2",
            }}>
              {autoApprovedCount ?? 0}
            </span>
            <span style={{ fontSize: 13, color: "#516f90" }}>Auto-Approved</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: "#99acc2" }}>
              {totalCount ?? 0}
            </span>
            <span style={{ fontSize: 13, color: "#516f90" }}>Total</span>
          </div>
        </div>

        {/* Filters */}
        <Suspense fallback={<div style={{ marginBottom: 12, color: "#7c98b6", fontSize: 13 }}>Loading...</div>}>
          <LearningFilters />
        </Suspense>

        {/* Proposals List */}
        <ProposalList proposals={enrichedProposals} />

        {/* Empty State */}
        {enrichedProposals.length === 0 && (
          <div style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "#7c98b6",
            fontSize: 14,
            backgroundColor: "#fff",
            borderRadius: 4,
            border: "1px solid #eaf0f6",
          }}>
            No learning proposals match your filters.
            {statusFilter === "pending" && (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                Resolve some threads to generate new proposals.
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: "12px",
          fontSize: 12,
          color: "#99acc2",
          borderTop: "1px solid #eaf0f6",
          marginTop: 16,
        }}>
          Learning proposals are generated when threads are resolved. High-confidence proposals
          (≥0.85) are auto-approved. Lower confidence proposals require manual review.
        </div>
      </div>
    </div>
  );
}
