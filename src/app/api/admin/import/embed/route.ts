/**
 * KB Embedding API
 *
 * POST: Chunk and embed a batch of documents
 * GET: Get embedding status
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { chunkMarkdown, CHUNK_CONFIG } from "@/lib/retrieval/chunk";
import { isEmbeddingConfigured } from "@/lib/retrieval/embed";
import type { KBDoc } from "@/lib/kb/types";

const OPENAI_API_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Simple fetch-based embedding to avoid SDK memory issues
 */
async function getEmbedding(text: string): Promise<number[]> {
  // Ensure text is not empty and within reasonable limits
  const cleanedText = text.trim();
  if (!cleanedText || cleanedText.length === 0) {
    throw new Error("Empty text provided for embedding");
  }

  // OpenAI has an 8191 token limit for text-embedding-3-small (~32k chars)
  const truncatedText = cleanedText.slice(0, 30000);

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncatedText,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${error}`);
  }

  const data = await response.json();

  if (!data.data?.[0]?.embedding || !Array.isArray(data.data[0].embedding)) {
    throw new Error(`Invalid embedding response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return data.data[0].embedding;
}

/**
 * Format embedding for PostgreSQL
 */
function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * GET: Get embedding status
 */
export async function GET() {
  try {
    const { data: docs } = await supabase
      .from("kb_docs")
      .select("id")
      .eq("evolution_status", "published");

    const { data: chunks } = await supabase
      .from("kb_chunks")
      .select("doc_id")
      .not("embedding", "is", null);

    const docIds = new Set((docs ?? []).map((d) => d.id));
    const docsWithEmbeddings = new Set((chunks ?? []).map((c) => c.doc_id));

    return NextResponse.json({
      totalDocs: docIds.size,
      docsWithEmbeddings: docsWithEmbeddings.size,
      docsWithoutEmbeddings: docIds.size - docsWithEmbeddings.size,
      configured: isEmbeddingConfigured(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: Process a batch of documents
 */
export async function POST(request: NextRequest) {
  try {
    if (!isEmbeddingConfigured()) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const batchSize = body.batch_size ?? 5;

    // Get docs that need embedding
    const { data: docsWithChunks } = await supabase
      .from("kb_chunks")
      .select("doc_id")
      .not("embedding", "is", null);

    const docIdsWithEmbeddings = new Set((docsWithChunks ?? []).map((c) => c.doc_id));

    const { data: allDocs, error: docsError } = await supabase
      .from("kb_docs")
      .select("*")
      .eq("evolution_status", "published");

    if (docsError) {
      return NextResponse.json({ error: docsError.message }, { status: 500 });
    }

    const docsToProcess = (allDocs ?? [])
      .filter((doc) => !docIdsWithEmbeddings.has(doc.id))
      .slice(0, batchSize);

    if (docsToProcess.length === 0) {
      return NextResponse.json({
        message: "All documents already have embeddings",
        processed: 0,
        remaining: 0,
      });
    }

    const results: Array<{ id: string; title: string; chunks: number; error?: string }> = [];

    for (const doc of docsToProcess) {
      try {
        // Skip docs with no body
        if (!doc.body || doc.body.trim().length === 0) {
          results.push({ id: doc.id, title: doc.title, chunks: 0, error: "Empty body" });
          continue;
        }

        // Delete any existing chunks for this doc (partial runs)
        await supabase.from("kb_chunks").delete().eq("doc_id", doc.id);

        // Chunk the document
        const chunks = chunkMarkdown(doc.body, {
          maxChunkSize: CHUNK_CONFIG.maxChunkSize,
          overlap: CHUNK_CONFIG.overlap,
          minChunkSize: CHUNK_CONFIG.minChunkSize,
        });

        if (chunks.length === 0) {
          results.push({ id: doc.id, title: doc.title, chunks: 0, error: "No chunks generated" });
          continue;
        }

        // Process each chunk
        let successfulChunks = 0;
        for (const chunk of chunks) {
          try {
            const embedding = await getEmbedding(chunk.content);

            const { error: insertError } = await supabase.from("kb_chunks").insert({
              doc_id: doc.id,
              chunk_index: chunk.index,
              content: chunk.content,
              embedding: formatEmbeddingForPg(embedding),
            });

            if (insertError) {
              console.error(`Insert error for chunk ${chunk.index}: ${insertError.message}`);
              continue;
            }

            successfulChunks++;
          } catch (chunkErr) {
            console.error(`Chunk ${chunk.index} error: ${chunkErr}`);
            // Continue to next chunk even if one fails
          }
        }

        results.push({ id: doc.id, title: doc.title, chunks: successfulChunks });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        results.push({ id: doc.id, title: doc.title, chunks: 0, error });
      }
    }

    // Count remaining
    const remaining = (allDocs ?? []).length - docIdsWithEmbeddings.size - docsToProcess.length;

    return NextResponse.json({
      processed: results.filter((r) => !r.error).length,
      failed: results.filter((r) => r.error).length,
      remaining: Math.max(0, remaining),
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
