import { supabase } from "@/lib/db";
import { type ThreadState } from "@/lib/threads/stateMachine";

export const dynamic = "force-dynamic";

// Inline color styles for state badges (avoiding Tailwind dynamic class issues)
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

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: threadId } = await params;

  const { data: thread } = await supabase.from("threads").select("*").eq("id", threadId).single();
  const state = (thread?.state as ThreadState) || "NEW";
  const stateColors = STATE_COLORS[state];
  const stateLabel = STATE_LABELS[state];
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(10);

  const latestDraft = events?.find((e) => e.type === "auto_triage")?.payload?.draft;

  // Extract state transition history from events
  const stateHistory = events
    ?.filter((e) => e.payload?.stateTransition)
    ?.map((e) => ({
      from: e.payload.stateTransition.from,
      to: e.payload.stateTransition.to,
      reason: e.payload.stateTransition.reason,
      timestamp: e.created_at,
    }));

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <a href="/admin">← Back</a>
      <h1>{thread?.subject || "(no subject)"}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <span
          style={{
            padding: "4px 12px",
            borderRadius: 9999,
            fontSize: 12,
            fontWeight: 600,
            backgroundColor: stateColors.bg,
            color: stateColors.text,
          }}
        >
          {stateLabel}
        </span>
        <span style={{ opacity: 0.7 }}>Intent: {thread?.last_intent || "—"}</span>
      </div>

      <h2 style={{ marginTop: 24 }}>Messages</h2>
      {messages?.map((m) => (
        <div key={m.id} style={{ border: "1px solid #ddd", padding: 12, margin: "12px 0" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {m.direction} • {m.from_email || ""} • {new Date(m.created_at).toLocaleString()}
          </div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{m.body_text}</pre>
        </div>
      ))}

      <h2 style={{ marginTop: 24 }}>Proposed Reply (copy/paste)</h2>
      <div style={{ border: "1px solid #ddd", padding: 12 }}>
        <pre style={{ whiteSpace: "pre-wrap" }}>{latestDraft || "(no draft generated)"}</pre>
      </div>

      {stateHistory && stateHistory.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>State History</h2>
          <div style={{ fontSize: 14 }}>
            {stateHistory.map((h, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span style={{ opacity: 0.5, fontSize: 12 }}>
                  {new Date(h.timestamp).toLocaleString()}
                </span>
                <span>
                  {h.from} → {h.to}
                </span>
                {h.reason && (
                  <span style={{ opacity: 0.7, fontSize: 12 }}>({h.reason})</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
