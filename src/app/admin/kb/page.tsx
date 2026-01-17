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
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 1200 }}>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "#33475b" }}>
          Knowledge Base
        </h1>
        <a
          href="/admin"
          style={{
            color: "#0091ae",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ← Back to Inbox
        </a>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            flex: 1,
            padding: 16,
            backgroundColor: "#ffffff",
            borderRadius: 4,
            border: "1px solid #cbd6e2",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 600, color: "#33475b" }}>{totalDocs || 0}</div>
          <div style={{ fontSize: 13, color: "#7c98b6", marginTop: 4 }}>Total Documents</div>
        </div>
        <div
          style={{
            flex: 1,
            padding: 16,
            backgroundColor: "#ffffff",
            borderRadius: 4,
            border: "1px solid #cbd6e2",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 600, color: "#00a182" }}>{uniqueEmbeddedDocs}</div>
          <div style={{ fontSize: 13, color: "#7c98b6", marginTop: 4 }}>With Embeddings</div>
        </div>
        <div
          style={{
            flex: 1,
            padding: 16,
            backgroundColor: "#ffffff",
            borderRadius: 4,
            border: "1px solid #cbd6e2",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 600, color: "#0091ae" }}>{categories?.length || 0}</div>
          <div style={{ fontSize: 13, color: "#7c98b6", marginTop: 4 }}>Categories</div>
        </div>
      </div>

      <KBBrowser
        initialDocs={(docs || []).map((doc) => ({
          ...doc,
          kb_categories: Array.isArray(doc.kb_categories)
            ? doc.kb_categories[0] || null
            : doc.kb_categories,
        }))}
        initialTotal={count || 0}
        categories={categories || []}
      />
    </div>
  );
}
