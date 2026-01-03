/**
 * KB Document Chunking and Embedding Script
 *
 * Processes published KB documents:
 * 1. Chunks markdown content using section-aware splitting
 * 2. Generates embeddings using OpenAI text-embedding-3-small
 * 3. Stores chunks with embeddings in kb_chunks table
 *
 * Run with: npm run embed:kb
 */

import "dotenv/config";
import { supabase } from "@/lib/db";
import { chunkMarkdown, CHUNK_CONFIG } from "@/lib/retrieval/chunk";
import { embedTexts, isEmbeddingConfigured, formatEmbeddingForPg } from "@/lib/retrieval/embed";
import type { KBDoc } from "./types";

/**
 * Configuration for chunking/embedding process
 */
const EMBED_CONFIG = {
  /** Batch size for embedding API calls */
  embeddingBatchSize: 20,
  /** Delay between batches to avoid rate limits (ms) */
  batchDelayMs: 500,
  /** Only process docs without existing chunks */
  skipExisting: true,
};

/**
 * Get all published docs that need chunking
 */
async function getDocsToProcess(skipExisting: boolean): Promise<KBDoc[]> {
  if (skipExisting) {
    // Get docs that don't have any chunks yet
    const { data: docsWithChunks } = await supabase
      .from("kb_chunks")
      .select("doc_id")
      .not("doc_id", "is", null);

    const docIdsWithChunks = new Set((docsWithChunks ?? []).map((c) => c.doc_id));

    const { data: allDocs, error } = await supabase
      .from("kb_docs")
      .select("*")
      .eq("evolution_status", "published");

    if (error) throw new Error(`Failed to fetch docs: ${error.message}`);

    return (allDocs ?? []).filter((doc) => !docIdsWithChunks.has(doc.id));
  }

  // Get all published docs
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .eq("evolution_status", "published");

  if (error) throw new Error(`Failed to fetch docs: ${error.message}`);

  return data ?? [];
}

/**
 * Delete existing chunks for a document
 */
async function deleteExistingChunks(docId: string): Promise<void> {
  const { error } = await supabase.from("kb_chunks").delete().eq("doc_id", docId);

  if (error) throw new Error(`Failed to delete chunks for ${docId}: ${error.message}`);
}

/**
 * Process a single document: chunk and embed
 * Memory-efficient: processes one chunk at a time
 */
async function processDoc(
  doc: KBDoc
): Promise<{ chunkCount: number; error?: string }> {
  try {
    // Chunk the document
    const chunks = chunkMarkdown(doc.body, {
      maxChunkSize: CHUNK_CONFIG.maxChunkSize,
      overlap: CHUNK_CONFIG.overlap,
      minChunkSize: CHUNK_CONFIG.minChunkSize,
    });

    if (chunks.length === 0) {
      return { chunkCount: 0, error: "No chunks generated" };
    }

    // Process chunks one at a time to save memory
    let insertedCount = 0;

    for (const chunk of chunks) {
      // Generate embedding for this chunk
      const embeddings = await embedTexts([chunk.content]);
      const embedding = embeddings[0];

      // Insert immediately and let GC clean up
      const { error } = await supabase.from("kb_chunks").insert({
        doc_id: doc.id,
        chunk_index: chunk.index,
        content: chunk.content,
        embedding: embedding?.length > 0 ? formatEmbeddingForPg(embedding) : null,
      });

      if (error) {
        return { chunkCount: insertedCount, error: `Insert failed: ${error.message}` };
      }

      insertedCount++;
    }

    return { chunkCount: insertedCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { chunkCount: 0, error: message };
  }
}

/**
 * Main embedding function
 */
export async function embedAllDocs(options: {
  skipExisting?: boolean;
  forceReprocess?: boolean;
} = {}): Promise<{
  processed: number;
  chunksCreated: number;
  errors: Array<{ docId: string; title: string; error: string }>;
}> {
  const { skipExisting = true, forceReprocess = false } = options;

  console.log("🔍 Checking embedding configuration...");

  if (!isEmbeddingConfigured()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  console.log("✅ OpenAI API key found\n");

  // Get docs to process
  console.log(`📚 Fetching documents to process (skipExisting: ${skipExisting})...`);
  const docs = await getDocsToProcess(skipExisting && !forceReprocess);

  if (docs.length === 0) {
    console.log("✨ No documents need processing!");
    return { processed: 0, chunksCreated: 0, errors: [] };
  }

  console.log(`📄 Found ${docs.length} documents to process\n`);

  const errors: Array<{ docId: string; title: string; error: string }> = [];
  let totalChunks = 0;
  let processed = 0;

  // Process documents
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const progress = `[${i + 1}/${docs.length}]`;

    process.stdout.write(`${progress} Processing: ${doc.title.slice(0, 50)}...`);

    // If force reprocess, delete existing chunks first
    if (forceReprocess) {
      await deleteExistingChunks(doc.id);
    }

    const result = await processDoc(doc);

    if (result.error) {
      console.log(` ❌ ${result.error}`);
      errors.push({ docId: doc.id, title: doc.title, error: result.error });
    } else {
      console.log(` ✅ ${result.chunkCount} chunks`);
      totalChunks += result.chunkCount;
      processed++;
    }

    // Rate limiting delay between docs
    if (i < docs.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, EMBED_CONFIG.batchDelayMs));
    }
  }

  return { processed, chunksCreated: totalChunks, errors };
}

/**
 * Get stats on current chunking/embedding status
 */
export async function getEmbeddingStats(): Promise<{
  totalDocs: number;
  docsWithChunks: number;
  docsWithoutChunks: number;
  totalChunks: number;
  chunksWithEmbeddings: number;
}> {
  const { data: docs } = await supabase
    .from("kb_docs")
    .select("id")
    .eq("evolution_status", "published");

  const { data: chunks } = await supabase.from("kb_chunks").select("id, doc_id, embedding");

  const docIds = new Set((docs ?? []).map((d) => d.id));
  const docsWithChunks = new Set((chunks ?? []).map((c) => c.doc_id));

  return {
    totalDocs: docIds.size,
    docsWithChunks: docsWithChunks.size,
    docsWithoutChunks: docIds.size - docsWithChunks.size,
    totalChunks: chunks?.length ?? 0,
    chunksWithEmbeddings: (chunks ?? []).filter((c) => c.embedding !== null).length,
  };
}

/**
 * CLI entry point
 */
async function main() {
  console.log("🚀 KB Document Chunking & Embedding\n");
  console.log("=".repeat(50));

  // Show current stats
  console.log("\n📊 Current Status:");
  const statsBefore = await getEmbeddingStats();
  console.log(`   Total published docs: ${statsBefore.totalDocs}`);
  console.log(`   Docs with chunks: ${statsBefore.docsWithChunks}`);
  console.log(`   Docs without chunks: ${statsBefore.docsWithoutChunks}`);
  console.log(`   Total chunks: ${statsBefore.totalChunks}`);
  console.log(`   Chunks with embeddings: ${statsBefore.chunksWithEmbeddings}`);
  console.log();

  if (statsBefore.docsWithoutChunks === 0) {
    console.log("✨ All documents already have chunks!");
    console.log("   Use --force to reprocess all documents.");
    return;
  }

  // Process documents
  const forceReprocess = process.argv.includes("--force");
  const result = await embedAllDocs({ skipExisting: true, forceReprocess });

  console.log("\n" + "=".repeat(50));
  console.log("\n📊 Results:");
  console.log(`   Documents processed: ${result.processed}`);
  console.log(`   Chunks created: ${result.chunksCreated}`);
  console.log(`   Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log("\n⚠️  Errors:");
    for (const err of result.errors.slice(0, 10)) {
      console.log(`   - ${err.title.slice(0, 40)}: ${err.error}`);
    }
    if (result.errors.length > 10) {
      console.log(`   ... and ${result.errors.length - 10} more`);
    }
  }

  // Show final stats
  console.log("\n📊 Final Status:");
  const statsAfter = await getEmbeddingStats();
  console.log(`   Total published docs: ${statsAfter.totalDocs}`);
  console.log(`   Docs with chunks: ${statsAfter.docsWithChunks}`);
  console.log(`   Docs without chunks: ${statsAfter.docsWithoutChunks}`);
  console.log(`   Total chunks: ${statsAfter.totalChunks}`);
  console.log(`   Chunks with embeddings: ${statsAfter.chunksWithEmbeddings}`);

  console.log("\n🎉 Done!\n");
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Failed:", err.message);
      process.exit(1);
    });
}
