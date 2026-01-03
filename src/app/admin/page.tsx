import { supabase } from "@/lib/db";
import { type ThreadState } from "@/lib/threads/stateMachine";

export const dynamic = "force-dynamic";

// Inline color styles for state badges
const STATE_COLORS: Record<ThreadState, { bg: string; text: string }> = {
  NEW: { bg: "#dbeafe", text: "#1e40af" },
  AWAITING_INFO: { bg: "#fef3c7", text: "#92400e" },
  IN_PROGRESS: { bg: "#ede9fe", text: "#6b21a8" },
  ESCALATED: { bg: "#fee2e2", text: "#991b1b" },
  RESOLVED: { bg: "#dcfce7", text: "#166534" },
};

const STATE_LABELS: Record<ThreadState, string> = {
  NEW: "New",
  AWAITING_INFO: "Awaiting Info",
  IN_PROGRESS: "In Progress",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
};

// Sort priority (lower = show first)
const STATE_PRIORITY: Record<ThreadState, number> = {
  ESCALATED: 0,
  NEW: 1,
  AWAITING_INFO: 2,
  IN_PROGRESS: 3,
  RESOLVED: 4,
};

export default async function AdminPage() {
  const { data: threads } = await supabase
    .from("threads")
    .select("id,subject,state,last_intent,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  // Sort by state priority, then by updated_at
  const sortedThreads = threads?.sort((a, b) => {
    const aPriority = STATE_PRIORITY[(a.state as ThreadState) || "NEW"];
    const bPriority = STATE_PRIORITY[(b.state as ThreadState) || "NEW"];
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Support Inbox</h1>
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
      <p style={{ opacity: 0.6, marginBottom: 24 }}>
        {threads?.length || 0} threads (sorted by priority)
      </p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {sortedThreads?.map((t) => {
          const state = (t.state as ThreadState) || "NEW";
          const colors = STATE_COLORS[state];
          const label = STATE_LABELS[state];

          return (
            <li
              key={t.id}
              style={{
                margin: "12px 0",
                padding: 12,
                border: "1px solid #eee",
                borderRadius: 8,
                borderLeft: state === "ESCALATED" ? "4px solid #991b1b" : undefined,
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
                <a
                  href={`/admin/thread/${t.id}`}
                  style={{ fontWeight: 500, color: "#1e40af", textDecoration: "none" }}
                >
                  {t.subject || "(no subject)"}
                </a>
              </div>
              <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4, marginLeft: 70 }}>
                {t.last_intent || "—"} • {new Date(t.updated_at).toLocaleString()}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
