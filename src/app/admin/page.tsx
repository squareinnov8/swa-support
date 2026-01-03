import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { data: threads } = await supabase
    .from("threads")
    .select("id,subject,state,last_intent,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Support Inbox</h1>
      <ul>
        {threads?.map((t) => (
          <li key={t.id} style={{ margin: "12px 0" }}>
            <a href={`/admin/thread/${t.id}`}>{t.subject || "(no subject)"}</a>
            <div style={{ opacity: 0.7 }}>
              {t.state} • {t.last_intent || "—"} • {new Date(t.updated_at).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
