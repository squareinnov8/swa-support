import { supabase } from "@/lib/db";
import { type ThreadState } from "@/lib/threads/stateMachine";
import { ThreadActions } from "./ThreadActions";
import { AgentReasoning } from "./AgentReasoning";

export const dynamic = "force-dynamic";

// Inline color styles for state badges (avoiding Tailwind dynamic class issues)
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

  const latestTriageEvent = events?.find((e) => e.type === "auto_triage");
  const latestDraft = latestTriageEvent?.payload?.draft;
  const latestEventId = latestTriageEvent?.id;

  // Fetch draft generation details for agent reasoning
  const { data: draftGenerations } = await supabase
    .from("draft_generations")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestDraftGen = draftGenerations?.[0];

  // Fetch KB docs used in the draft
  let kbDocsUsed: { id: string; title: string }[] = [];
  if (latestDraftGen?.kb_docs_used?.length) {
    const { data: kbDocs } = await supabase
      .from("kb_docs")
      .select("id, title")
      .in("id", latestDraftGen.kb_docs_used);
    kbDocsUsed = kbDocs || [];
  }

  // Fetch customer verification
  const { data: verification } = await supabase
    .from("customer_verifications")
    .select("status, order_number, flags")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

      {/* Agent Reasoning Section */}
      <AgentReasoning
        threadId={threadId}
        intent={thread?.last_intent || null}
        confidence={latestTriageEvent?.payload?.confidence ?? null}
        kbDocs={kbDocsUsed}
        verification={
          verification
            ? {
                status: verification.status,
                orderNumber: verification.order_number,
                flags: verification.flags || [],
              }
            : null
        }
        draftInfo={
          latestDraftGen
            ? {
                policyGatePassed: latestDraftGen.policy_gate_passed ?? true,
                policyViolations: latestDraftGen.policy_violations || [],
                promptTokens: latestDraftGen.prompt_tokens || 0,
                completionTokens: latestDraftGen.completion_tokens || 0,
                citations: latestDraftGen.citations || [],
              }
            : null
        }
      />

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

      {/* Testing & Feedback Actions */}
      <ThreadActions
        threadId={threadId}
        latestDraft={latestDraft || null}
        latestEventId={latestEventId || null}
        intent={thread?.last_intent || null}
        isHumanHandling={thread?.human_handling_mode === true}
        humanHandler={thread?.human_handler || null}
      />
    </div>
  );
}
