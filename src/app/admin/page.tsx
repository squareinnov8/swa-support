import { supabase } from "@/lib/db";
import { type ThreadState } from "@/lib/threads/stateMachine";
import AgentSettingsPanel from "./AgentSettingsPanel";
import { GmailPollButton } from "./GmailPollButton";
import { Suspense } from "react";
import ThreadFilters from "./ThreadFilters";

export const dynamic = "force-dynamic";

// Inline color styles for state badges
const STATE_COLORS: Record<ThreadState, { bg: string; text: string }> = {
  NEW: { bg: "#dbeafe", text: "#1e40af" },
  AWAITING_INFO: { bg: "#fef3c7", text: "#92400e" },
  IN_PROGRESS: { bg: "#ede9fe", text: "#6b21a8" },
  ESCALATED: { bg: "#fee2e2", text: "#991b1b" },
  HUMAN_HANDLING: { bg: "#ffedd5", text: "#9a3412" },
  RESOLVED: { bg: "#dcfce7", text: "#166534" },
};

const STATE_LABELS: Record<ThreadState, string> = {
  NEW: "New",
  AWAITING_INFO: "Awaiting Info",
  IN_PROGRESS: "In Progress",
  ESCALATED: "Escalated",
  HUMAN_HANDLING: "Human Handling",
  RESOLVED: "Resolved",
};

type SearchParams = {
  state?: string;
  escalated?: string;
  intent?: string;
  sort?: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const stateFilter = params.state || "";
  const escalatedFilter = params.escalated || "";
  const intentFilter = params.intent || "";
  const sortParam = params.sort || "updated_at:desc";

  // Parse sort parameter
  const [sortField, sortDirection] = sortParam.split(":") as [string, "asc" | "desc"];

  // Build query with filters
  let query = supabase
    .from("threads")
    .select("id,subject,state,last_intent,updated_at,created_at,human_handling_mode,human_handler,summary,verification_status");

  // Apply state filter
  if (stateFilter) {
    query = query.eq("state", stateFilter);
  }

  // Apply escalated filter
  if (escalatedFilter === "yes") {
    query = query.or("state.eq.ESCALATED,human_handling_mode.eq.true");
  } else if (escalatedFilter === "no") {
    query = query.neq("state", "ESCALATED").neq("human_handling_mode", true);
  }

  // Apply intent filter (partial match)
  if (intentFilter) {
    query = query.ilike("last_intent", `%${intentFilter}%`);
  }

  // Apply sorting
  query = query.order(sortField as "updated_at" | "created_at", { ascending: sortDirection === "asc" });

  // Execute query
  const { data: threads } = await query.limit(50);

  // Fetch verification data for threads that have it
  const threadIds = threads?.map(t => t.id) || [];
  const { data: verifications } = await supabase
    .from("customer_verifications")
    .select("thread_id, status, customer_name")
    .in("thread_id", threadIds)
    .eq("status", "verified");

  // Create a map of thread_id -> verification data
  const verificationMap = new Map(
    verifications?.map(v => [v.thread_id, { status: v.status, customerName: v.customer_name }]) || []
  );

  // Get active observations count
  const { count: observationCount } = await supabase
    .from("intervention_observations")
    .select("*", { count: "exact", head: true })
    .is("intervention_end", null);

  // Get recent escalation emails count (last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: escalationCount } = await supabase
    .from("escalation_emails")
    .select("*", { count: "exact", head: true })
    .gte("sent_at", oneDayAgo);

  // Get pending learning proposals count
  const { count: proposalCount } = await supabase
    .from("learning_proposals")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  // Threads already sorted by updated_at from the query

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Support Inbox</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <a
            href="/admin/intents"
            style={{
              padding: "8px 16px",
              backgroundColor: "#f3f4f6",
              color: "#374151",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid #d1d5db",
            }}
          >
            Intents
          </a>
          <a
            href="/admin/kb"
            style={{
              padding: "8px 16px",
              backgroundColor: "#f3f4f6",
              color: "#374151",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid #d1d5db",
            }}
          >
            Knowledge Base
          </a>
          <a
            href="/admin/instructions"
            style={{
              padding: "8px 16px",
              backgroundColor: "#f3f4f6",
              color: "#374151",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid #d1d5db",
            }}
          >
            Agent Instructions
          </a>
          <a
            href="/admin/new"
            style={{
              padding: "8px 16px",
              backgroundColor: "#1e40af",
              color: "white",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            + New Thread
          </a>
        </div>
      </div>
      <AgentSettingsPanel />

      {/* Thread Filters */}
      <Suspense fallback={<div style={{ padding: 16, backgroundColor: "#f9fafb", borderRadius: 8, marginBottom: 16 }}>Loading filters...</div>}>
        <ThreadFilters />
      </Suspense>

      {/* Dashboard Widgets */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {/* Active Observations */}
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            backgroundColor: (observationCount ?? 0) > 0 ? "#fff7ed" : "#f9fafb",
            border: (observationCount ?? 0) > 0 ? "2px solid #fb923c" : "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 700, color: (observationCount ?? 0) > 0 ? "#ea580c" : "#6b7280" }}>
            {observationCount ?? 0}
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>Active Observations</div>
          {(observationCount ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: "#9a3412", marginTop: 4 }}>
              Lina is watching
            </div>
          )}
        </div>

        {/* Recent Escalations */}
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            backgroundColor: (escalationCount ?? 0) > 0 ? "#fef2f2" : "#f9fafb",
            border: (escalationCount ?? 0) > 0 ? "2px solid #f87171" : "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 700, color: (escalationCount ?? 0) > 0 ? "#dc2626" : "#6b7280" }}>
            {escalationCount ?? 0}
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>Escalations (24h)</div>
          {(escalationCount ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: "#991b1b", marginTop: 4 }}>
              Emails sent to Rob
            </div>
          )}
        </div>

        {/* Pending Learning */}
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            backgroundColor: (proposalCount ?? 0) > 0 ? "#eff6ff" : "#f9fafb",
            border: (proposalCount ?? 0) > 0 ? "2px solid #3b82f6" : "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 700, color: (proposalCount ?? 0) > 0 ? "#2563eb" : "#6b7280" }}>
            {proposalCount ?? 0}
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>Learning Proposals</div>
          {(proposalCount ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: "#1d4ed8", marginTop: 4 }}>
              Pending review
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <p style={{ opacity: 0.6, margin: 0 }}>
          {threads?.length || 0} threads
          {(stateFilter || escalatedFilter || intentFilter) && (
            <span style={{ color: "#3b82f6" }}> (filtered)</span>
          )}
          {" · "}
          sorted by {sortField === "updated_at" ? "update time" : "creation time"}
          {sortDirection === "desc" ? " (newest first)" : " (oldest first)"}
        </p>
        <GmailPollButton />
      </div>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {threads?.map((t) => {
          const state = (t.state as ThreadState) || "NEW";
          const colors = STATE_COLORS[state];
          const label = STATE_LABELS[state];
          const verification = verificationMap.get(t.id);
          const isVerifiedCustomer = verification?.status === "verified";

          return (
            <li
              key={t.id}
              style={{
                margin: "12px 0",
                padding: 12,
                border: isVerifiedCustomer ? "1px solid #86efac" : "1px solid #eee",
                borderRadius: 8,
                backgroundColor: isVerifiedCustomer ? "#f0fdf4" : "transparent",
                borderLeft: state === "ESCALATED"
                  ? "4px solid #991b1b"
                  : t.human_handling_mode
                  ? "4px solid #fb923c"
                  : isVerifiedCustomer
                  ? "4px solid #22c55e"
                  : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: colors.bg,
                    color: colors.text,
                  }}
                >
                  {label}
                </span>
                {isVerifiedCustomer && (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 600,
                      backgroundColor: "#dcfce7",
                      color: "#166534",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    title={verification?.customerName || "Verified Customer"}
                  >
                    ✓ Verified
                  </span>
                )}
                {t.human_handling_mode && (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 600,
                      backgroundColor: "#fff7ed",
                      color: "#9a3412",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    👁 Observing
                  </span>
                )}
                <a
                  href={`/admin/thread/${t.id}`}
                  style={{ fontWeight: 500, color: "#1e40af", textDecoration: "none" }}
                >
                  {t.subject || "(no subject)"}
                </a>
              </div>
              {t.summary && (
                <div style={{ fontSize: 13, marginTop: 4, marginLeft: isVerifiedCustomer ? 150 : t.human_handling_mode ? 140 : 70, color: "#4b5563" }}>
                  {t.summary}
                </div>
              )}
              <div style={{ opacity: 0.5, fontSize: 12, marginTop: 4, marginLeft: isVerifiedCustomer ? 150 : t.human_handling_mode ? 140 : 70 }}>
                {new Date(t.updated_at).toLocaleString()}
                {t.human_handler && <span> • Handler: {t.human_handler}</span>}
                {verification?.customerName && <span> • {verification.customerName}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
