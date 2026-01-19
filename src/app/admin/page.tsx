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
  q?: string;
  state?: string;
  escalated?: string;
  intent?: string;
  sort?: string;
  archived?: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const searchQuery = params.q || "";
  const stateFilter = params.state || "";
  const escalatedFilter = params.escalated || "";
  const intentFilter = params.intent || "";
  const sortParam = params.sort || "last_message_at:desc";
  const archivedFilter = params.archived || "hide";

  // Parse sort parameter
  const [sortField, sortDirection] = sortParam.split(":") as [string, "asc" | "desc"];

  // Build query with filters
  let query = supabase
    .from("threads")
    .select("id,subject,state,last_intent,updated_at,created_at,last_message_at,human_handling_mode,human_handler,summary,verification_status,is_archived");

  // Apply archived filter (default: hide archived)
  if (archivedFilter === "hide") {
    query = query.or("is_archived.is.null,is_archived.eq.false");
  } else if (archivedFilter === "only") {
    query = query.eq("is_archived", true);
  }
  // "show" means include all, no filter needed

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

  // Apply search filter (searches subject and summary)
  if (searchQuery) {
    query = query.or(`subject.ilike.%${searchQuery}%,summary.ilike.%${searchQuery}%`);
  }

  // Apply sorting
  query = query.order(sortField as "last_message_at" | "updated_at" | "created_at", { ascending: sortDirection === "asc" });

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
    <div style={{ padding: "0 0 24px 0", maxWidth: 1200, margin: "0 auto" }}>
      {/* Page Header - more compact */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 20px",
        borderBottom: "1px solid #dfe3eb",
        backgroundColor: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "#33475b", margin: 0 }}>Tickets</h1>
          <span style={{ fontSize: 13, color: "#7c98b6" }}>
            {threads?.length || 0} total
            {(searchQuery || stateFilter || escalatedFilter || intentFilter || archivedFilter !== "hide") && (
              <span style={{ color: "#0091ae", marginLeft: 4 }}>• filtered</span>
            )}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <GmailPollButton />
          <a
            href="/admin/new"
            style={{
              padding: "7px 12px",
              backgroundColor: "#ff5c35",
              color: "white",
              borderRadius: 3,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Create ticket
          </a>
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>
        <AgentSettingsPanel />

        {/* Stats Row - inline compact version */}
        <div style={{ display: "flex", gap: 24, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #eaf0f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 18,
              fontWeight: 600,
              color: (observationCount ?? 0) > 0 ? "#bf5600" : "#99acc2",
            }}>
              {observationCount ?? 0}
            </span>
            <span style={{ fontSize: 13, color: "#516f90" }}>Watching</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 18,
              fontWeight: 600,
              color: (escalationCount ?? 0) > 0 ? "#d63638" : "#99acc2",
            }}>
              {escalationCount ?? 0}
            </span>
            <span style={{ fontSize: 13, color: "#516f90" }}>Escalated (24h)</span>
          </div>
          <a
            href="/admin/learning"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            <span style={{
              fontSize: 18,
              fontWeight: 600,
              color: (proposalCount ?? 0) > 0 ? "#0073aa" : "#99acc2",
            }}>
              {proposalCount ?? 0}
            </span>
            <span style={{ fontSize: 13, color: "#0073aa" }}>To review →</span>
          </a>
        </div>

        {/* Thread Filters */}
        <Suspense fallback={<div style={{ marginBottom: 12, color: "#7c98b6", fontSize: 13 }}>Loading...</div>}>
          <ThreadFilters />
        </Suspense>

        {/* Thread Table - clean HubSpot style */}
        <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "#fff" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #dfe3eb" }}>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Ticket
              </th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px", width: 110 }}>
                Status
              </th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px", width: 150 }}>
                Last activity
              </th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px", width: 140 }}>
                Contact
              </th>
            </tr>
          </thead>
          <tbody>
            {threads?.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "40px 12px", textAlign: "center", color: "#7c98b6", fontSize: 14 }}>
                  No tickets match your filters
                </td>
              </tr>
            ) : (
              threads?.map((t) => {
                const state = (t.state as ThreadState) || "NEW";
                const colors = STATE_COLORS[state];
                const label = STATE_LABELS[state];
                const verification = verificationMap.get(t.id);
                const isVerifiedCustomer = verification?.status === "verified";
                const isEscalated = state === "ESCALATED" || t.human_handling_mode;
                const isArchived = t.is_archived === true;

                return (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: "1px solid #eaf0f6",
                      backgroundColor: isArchived ? "#f8f9fa" : isEscalated ? "#fff8f6" : "transparent",
                      opacity: isArchived ? 0.7 : 1,
                    }}
                  >
                    {/* Ticket */}
                    <td style={{ padding: "12px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        {isEscalated && (
                          <span style={{
                            width: 3,
                            height: 40,
                            backgroundColor: "#d63638",
                            borderRadius: 2,
                            flexShrink: 0,
                            marginTop: 2,
                          }} />
                        )}
                        <div>
                          <a
                            href={`/admin/thread/${t.id}`}
                            style={{
                              fontWeight: 500,
                              color: "#0073aa",
                              textDecoration: "none",
                              fontSize: 14,
                              lineHeight: 1.3,
                            }}
                          >
                            {t.subject || "(no subject)"}
                          </a>
                          {t.summary && (
                            <div style={{ fontSize: 13, color: "#7c98b6", marginTop: 3, lineHeight: 1.4 }}>
                              {t.summary.length > 100 ? t.summary.substring(0, 100) + "…" : t.summary}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "12px", verticalAlign: "top" }}>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 2,
                          fontSize: 11,
                          fontWeight: 500,
                          backgroundColor: colors.bg,
                          color: colors.text,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </span>
                      {t.human_handling_mode && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{
                            padding: "2px 6px",
                            borderRadius: 2,
                            fontSize: 10,
                            fontWeight: 500,
                            backgroundColor: "#fff3cd",
                            color: "#856404",
                          }}>
                            Watching
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Last Activity - uses last_message_at (excludes drafts) */}
                    <td style={{ padding: "12px", fontSize: 13, color: "#516f90", verticalAlign: "top" }}>
                      <div>
                        {new Date(t.last_message_at || t.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        <span style={{ color: "#99acc2", margin: "0 4px" }}>·</span>
                        {new Date(t.last_message_at || t.created_at).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                      {t.human_handler && (
                        <div style={{ fontSize: 12, color: "#99acc2", marginTop: 2 }}>
                          {t.human_handler.split("@")[0]}
                        </div>
                      )}
                    </td>

                    {/* Contact */}
                    <td style={{ padding: "12px", fontSize: 13, verticalAlign: "top" }}>
                      {isVerifiedCustomer ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            backgroundColor: "#00a854",
                            flexShrink: 0,
                          }} />
                          <span style={{ color: "#33475b", fontWeight: 500 }}>
                            {verification?.customerName || "Verified"}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "#99acc2" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ padding: "12px", fontSize: 12, color: "#99acc2", borderTop: "1px solid #eaf0f6" }}>
          {threads?.length || 0} tickets · {sortField === "last_message_at" ? "Last message" : sortField === "updated_at" ? "Last updated" : "Created"} {sortDirection === "desc" ? "↓" : "↑"}
        </div>
      </div>
    </div>
  );
}
