/**
 * KB Debug API
 *
 * GET /api/admin/kb/debug?id=xxx - Check if KB doc has embeddings
 * GET /api/admin/kb/debug?search=xxx - Test semantic search
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { hybridSearch } from "@/lib/retrieval/search";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("id");
  const searchQuery = searchParams.get("search");

  // Check specific doc
  if (docId) {
    const { data: doc, error: docError } = await supabase
      .from("kb_docs")
      .select("id, title, source, created_at")
      .eq("id", docId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: "Doc not found", docId }, { status: 404 });
    }

    const { data: chunks, error: chunkError } = await supabase
      .from("kb_chunks")
      .select("id, chunk_index, content")
      .eq("doc_id", docId);

    // Check if embeddings exist by checking if the embedding column is not null
    const { count: embeddingCount } = await supabase
      .from("kb_chunks")
      .select("id", { count: "exact" })
      .eq("doc_id", docId)
      .not("embedding", "is", null);

    return NextResponse.json({
      doc,
      chunks: chunks?.map(c => ({
        id: c.id,
        index: c.chunk_index,
        contentPreview: c.content?.slice(0, 100) + "...",
      })),
      chunkCount: chunks?.length || 0,
      embeddingsCount: embeddingCount || 0,
      hasEmbeddings: (embeddingCount || 0) > 0,
    });
  }

  // Test semantic search
  if (searchQuery) {
    const results = await hybridSearch(
      { query: searchQuery },
      { limit: 5, minScore: 0.1 } // Lower threshold for debugging
    );

    return NextResponse.json({
      query: searchQuery,
      resultCount: results.length,
      results: results.map(r => ({
        docId: r.doc.id,
        title: r.doc.title,
        score: r.score,
        sources: r.sources,
        chunkPreview: r.chunk?.content?.slice(0, 100),
      })),
    });
  }

  return NextResponse.json({
    usage: {
      checkDoc: "/api/admin/kb/debug?id=<doc-id>",
      testSearch: "/api/admin/kb/debug?search=<query>",
    },
  });
}
