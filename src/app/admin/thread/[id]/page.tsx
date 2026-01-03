import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: { id: string } }) {
  const threadId = params.id;

  const { data: thread } = await supabase.from("threads").select("*").eq("id", threadId).single();
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

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <a href="/admin">← Back</a>
      <h1>{thread?.subject || "(no subject)"}</h1>
      <div style={{ opacity: 0.7 }}>
        State: {thread?.state} • Intent: {thread?.last_intent || "—"}
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
    </div>
  );
}
