/**
 * KB Browser Admin Page
 *
 * Browse, search, and manage knowledge base documents.
 */

import { supabase } from "@/lib/db";
import { KBBrowser } from "./KBBrowser";

export const dynamic = "force-dynamic";

export default async function KBPage() {
  // Get initial data
  const { data: docs, count } = await supabase
    .from("kb_docs")
    .select(
      `
      id,
      source,
      title,
      body,
      category_id,
      vehicle_tags,
      product_tags,
      intent_tags,
      evolution_status,
      updated_at,
      kb_categories (
        id,
        name,
        slug
      )
    `,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .limit(50);

  const { data: categories } = await supabase
    .from("kb_categories")
    .select("id, name, slug, parent_id")
    .order("sort_order");

  // Get stats
  const { count: totalDocs } = await supabase
    .from("kb_docs")
    .select("*", { count: "exact", head: true });

  const { data: chunkStats } = await supabase
    .from("kb_chunks")
    .select("doc_id")
    .limit(10000);

  const uniqueEmbeddedDocs = new Set(chunkStats?.map((c) => c.doc_id) || []).size;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1200 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>Knowledge Base</h1>
        <a href="/admin" style={{ color: "#3b82f6" }}>
          ← Back to Inbox
        </a>
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          marginTop: 16,
          marginBottom: 24,
          padding: 16,
          backgroundColor: "#f9fafb",
          borderRadius: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{totalDocs || 0}</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Total Documents</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{uniqueEmbeddedDocs}</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>With Embeddings</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{categories?.length || 0}</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Categories</div>
        </div>
      </div>

      <KBBrowser
        initialDocs={docs || []}
        initialTotal={count || 0}
        categories={categories || []}
      />
    </div>
  );
}
