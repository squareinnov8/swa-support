import { supabase } from "@/lib/db";
import { type ThreadState } from "@/lib/threads/stateMachine";
import AgentSettingsPanel from "./AgentSettingsPanel";
import { GmailPollButton } from "./GmailPollButton";
import { Suspense } from "react";
import ThreadFilters from "./ThreadFilters";

export const dynamic = "force-dynamic";

// HubSpot-inspired color palette for state badges
const STATE_COLORS: Record<ThreadState, { bg: string; text: string }> = {
  NEW: { bg: "#e5f5f8", text: "#0091ae" },
  AWAITING_INFO: { bg: "#fef6e7", text: "#b36b00" },
  IN_PROGRESS: { bg: "#eaf0f6", text: "#516f90" },
  ESCALATED: { bg: "#fde8e9", text: "#c93b41" },
  HUMAN_HANDLING: { bg: "#fef6e7", text: "#b36b00" },
  RESOLVED: { bg: "#e5f8f4", text: "#00a182" },
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

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#33475b", margin: 0 }}>Support Inbox</h1>
          <p style={{ fontSize: 14, color: "#516f90", marginTop: 4, marginBottom: 0 }}>
            {threads?.length || 0} tickets
            {(stateFilter || escalatedFilter || intentFilter) && (
              <span style={{ color: "#0091ae" }}> (filtered)</span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <GmailPollButton />
          <a
            href="/admin/new"
            style={{
              padding: "9px 16px",
              backgroundColor: "#ff7a59",
              color: "white",
              borderRadius: 4,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            + New Ticket
          </a>
        </div>
      </div>

      <AgentSettingsPanel />

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {/* Active Observations */}
        <div
          style={{
            padding: 20,
            borderRadius: 4,
            backgroundColor: "#ffffff",
            border: (observationCount ?? 0) > 0 ? "1px solid #f5c26b" : "1px solid #cbd6e2",
            borderLeft: (observationCount ?? 0) > 0 ? "4px solid #f5c26b" : "4px solid #cbd6e2",
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 600, color: (observationCount ?? 0) > 0 ? "#b36b00" : "#516f90", lineHeight: 1.2 }}>
            {observationCount ?? 0}
          </div>
          <div style={{ fontSize: 14, color: "#516f90", marginTop: 4 }}>Active Observations</div>
          {(observationCount ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: "#b36b00", marginTop: 8 }}>
              Lina is watching
            </div>
          )}
        </div>

        {/* Recent Escalations */}
        <div
          style={{
            padding: 20,
            borderRadius: 4,
            backgroundColor: "#ffffff",
            border: (escalationCount ?? 0) > 0 ? "1px solid #f2545b" : "1px solid #cbd6e2",
            borderLeft: (escalationCount ?? 0) > 0 ? "4px solid #f2545b" : "4px solid #cbd6e2",
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 600, color: (escalationCount ?? 0) > 0 ? "#c93b41" : "#516f90", lineHeight: 1.2 }}>
            {escalationCount ?? 0}
          </div>
          <div style={{ fontSize: 14, color: "#516f90", marginTop: 4 }}>Escalations (24h)</div>
          {(escalationCount ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: "#c93b41", marginTop: 8 }}>
              Emails sent to Rob
            </div>
          )}
        </div>

        {/* Pending Learning */}
        <div
          style={{
            padding: 20,
            borderRadius: 4,
            backgroundColor: "#ffffff",
            border: (proposalCount ?? 0) > 0 ? "1px solid #0091ae" : "1px solid #cbd6e2",
            borderLeft: (proposalCount ?? 0) > 0 ? "4px solid #0091ae" : "4px solid #cbd6e2",
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 600, color: (proposalCount ?? 0) > 0 ? "#0091ae" : "#516f90", lineHeight: 1.2 }}>
            {proposalCount ?? 0}
          </div>
          <div style={{ fontSize: 14, color: "#516f90", marginTop: 4 }}>Learning Proposals</div>
          {(proposalCount ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: "#0091ae", marginTop: 8 }}>
              Pending review
            </div>
          )}
        </div>
      </div>

      {/* Thread Filters */}
      <Suspense fallback={<div style={{ padding: 16, backgroundColor: "#ffffff", borderRadius: 4, border: "1px solid #cbd6e2", marginBottom: 16 }}>Loading filters...</div>}>
        <ThreadFilters />
      </Suspense>

      {/* Thread Table */}
      <div style={{ backgroundColor: "#ffffff", border: "1px solid #cbd6e2", borderRadius: 4, overflow: "hidden" }}>
        {/* Table Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 140px 180px 160px",
            gap: 16,
            padding: "12px 16px",
            backgroundColor: "#f5f8fa",
            borderBottom: "1px solid #cbd6e2",
            fontSize: 12,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "#516f90",
          }}
        >
          <div>Subject</div>
          <div>Status</div>
          <div>Last Activity</div>
          <div>Customer</div>
        </div>

        {/* Thread Rows */}
        {threads?.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#516f90" }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No tickets found</div>
            <div style={{ fontSize: 14 }}>Try adjusting your filters or check back later.</div>
          </div>
        ) : (
          threads?.map((t) => {
            const state = (t.state as ThreadState) || "NEW";
            const colors = STATE_COLORS[state];
            const label = STATE_LABELS[state];
            const verification = verificationMap.get(t.id);
            const isVerifiedCustomer = verification?.status === "verified";
            const isEscalated = state === "ESCALATED" || t.human_handling_mode;

            return (
              <div
                key={t.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 180px 160px",
                  gap: 16,
                  padding: "14px 16px",
                  borderBottom: "1px solid #eaf0f6",
                  alignItems: "center",
                  backgroundColor: isEscalated ? "#fef6e7" : "#ffffff",
                  borderLeft: isEscalated ? "3px solid #f2545b" : "3px solid transparent",
                }}
              >
                {/* Subject */}
                <div>
                  <a
                    href={`/admin/thread/${t.id}`}
                    style={{
                      fontWeight: 500,
                      color: "#0091ae",
                      textDecoration: "none",
                      fontSize: 14,
                    }}
                  >
                    {t.subject || "(no subject)"}
                  </a>
                  {t.summary && (
                    <div style={{ fontSize: 13, color: "#516f90", marginTop: 4, lineHeight: 1.4 }}>
                      {t.summary.length > 80 ? t.summary.substring(0, 80) + "..." : t.summary}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 3,
                      fontSize: 12,
                      fontWeight: 500,
                      backgroundColor: colors.bg,
                      color: colors.text,
                      display: "inline-block",
                      width: "fit-content",
                    }}
                  >
                    {label}
                  </span>
                  {t.human_handling_mode && (
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 3,
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: "#fef6e7",
                        color: "#b36b00",
                        display: "inline-block",
                        width: "fit-content",
                      }}
                    >
                      Observing
                    </span>
                  )}
                </div>

                {/* Last Activity */}
                <div style={{ fontSize: 13, color: "#516f90" }}>
                  {new Date(t.updated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {" at "}
                  {new Date(t.updated_at).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                  {t.human_handler && (
                    <div style={{ fontSize: 12, color: "#7c98b6", marginTop: 2 }}>
                      Handler: {t.human_handler.split("@")[0]}
                    </div>
                  )}
                </div>

                {/* Customer */}
                <div style={{ fontSize: 13, color: "#516f90" }}>
                  {isVerifiedCustomer ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          backgroundColor: "#00a182",
                          display: "inline-block",
                        }}
                      />
                      <span style={{ color: "#33475b" }}>{verification?.customerName || "Verified"}</span>
                    </div>
                  ) : (
                    <span style={{ color: "#7c98b6" }}>--</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div style={{ marginTop: 16, fontSize: 13, color: "#7c98b6", textAlign: "center" }}>
        Showing {threads?.length || 0} tickets
        {" · "}
        Sorted by {sortField === "updated_at" ? "last activity" : "created date"}
        {sortDirection === "desc" ? " (newest first)" : " (oldest first)"}
      </div>
    </div>
  );
}
