/**
 * KB Documents Module
 *
 * CRUD operations for knowledge base documents.
 * Handles document management, chunking, and embedding coordination.
 */

import { supabase } from "@/lib/db";
import type {
  KBDoc,
  KBDocWithCategory,
  KBChunk,
  KBDocIntent,
  CreateKBDocInput,
  UpdateKBDocInput,
} from "./types";
import type { Intent } from "@/lib/intents/taxonomy";

/**
 * Get all published documents
 */
export async function getAllDocs(): Promise<KBDoc[]> {
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .eq("evolution_status", "published")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch docs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get a document by ID
 */
export async function getDocById(id: string): Promise<KBDoc | null> {
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch doc: ${error.message}`);
  }

  return data;
}

/**
 * Get a document with its category info
 */
export async function getDocWithCategory(id: string): Promise<KBDocWithCategory | null> {
  const { data, error } = await supabase
    .from("kb_docs")
    .select(
      `
      *,
      category:kb_categories(*)
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch doc: ${error.message}`);
  }

  if (!data) return null;

  // Build category path if category exists
  let categoryPath: string[] | undefined;
  if (data.category) {
    categoryPath = await getCategoryPathForDoc(data.category.id);
  }

  return {
    ...data,
    category_path: categoryPath,
  };
}

/**
 * Helper to get category path for a doc
 */
async function getCategoryPathForDoc(categoryId: string): Promise<string[]> {
  const { data: allCategories } = await supabase.from("kb_categories").select("*");

  if (!allCategories) return [];

  const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
  const path: string[] = [];
  let current = categoryMap.get(categoryId);

  while (current) {
    path.unshift(current.name);
    current = current.parent_id ? categoryMap.get(current.parent_id) : undefined;
  }

  return path;
}

/**
 * Get documents by category
 */
export async function getDocsByCategory(categoryId: string): Promise<KBDoc[]> {
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .eq("category_id", categoryId)
    .eq("evolution_status", "published")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch docs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get documents by vehicle tag
 */
export async function getDocsByVehicleTag(vehicleTag: string): Promise<KBDoc[]> {
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .contains("vehicle_tags", [vehicleTag])
    .eq("evolution_status", "published");

  if (error) {
    throw new Error(`Failed to fetch docs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get documents by product tag
 */
export async function getDocsByProductTag(productTag: string): Promise<KBDoc[]> {
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .contains("product_tags", [productTag])
    .eq("evolution_status", "published");

  if (error) {
    throw new Error(`Failed to fetch docs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get documents by intent tag (deterministic retrieval)
 */
export async function getDocsByIntentTag(intentTag: string): Promise<KBDoc[]> {
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .contains("intent_tags", [intentTag])
    .eq("evolution_status", "published");

  if (error) {
    throw new Error(`Failed to fetch docs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get documents mapped to an intent with confidence
 */
export async function getDocsByIntent(intent: Intent): Promise<(KBDoc & { confidence: number })[]> {
  const { data, error } = await supabase
    .from("kb_doc_intents")
    .select(
      `
      confidence,
      doc:kb_docs(*)
    `
    )
    .eq("intent", intent)
    .order("confidence", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch docs by intent: ${error.message}`);
  }

  if (!data) return [];

  return data
    .filter((row) => row.doc !== null)
    .map((row) => {
      // Supabase returns the nested select as an array, take first item
      const doc = Array.isArray(row.doc) ? row.doc[0] : row.doc;
      return {
        ...(doc as KBDoc),
        confidence: row.confidence,
      };
    });
}

/**
 * Search documents by text (full-text search)
 */
export async function searchDocs(query: string): Promise<KBDoc[]> {
  // Use PostgreSQL full-text search on title and body
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .eq("evolution_status", "published")
    .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
    .limit(20);

  if (error) {
    throw new Error(`Failed to search docs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Create a new document
 */
export async function createDoc(input: CreateKBDocInput): Promise<KBDoc> {
  const { data, error } = await supabase
    .from("kb_docs")
    .insert({
      title: input.title,
      body: input.body,
      source: input.source ?? "manual",
      source_id: input.source_id ?? null,
      category_id: input.category_id ?? null,
      vehicle_tags: input.vehicle_tags ?? [],
      product_tags: input.product_tags ?? [],
      intent_tags: input.intent_tags ?? [],
      source_thread_id: input.source_thread_id ?? null,
      metadata: input.metadata ?? {},
      evolution_status: "published",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create doc: ${error.message}`);
  }

  return data;
}

/**
 * Update a document
 */
export async function updateDoc(id: string, updates: UpdateKBDocInput): Promise<KBDoc> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.body !== undefined) updateData.body = updates.body;
  if (updates.source !== undefined) updateData.source = updates.source;
  if (updates.source_id !== undefined) updateData.source_id = updates.source_id;
  if (updates.category_id !== undefined) updateData.category_id = updates.category_id;
  if (updates.vehicle_tags !== undefined) updateData.vehicle_tags = updates.vehicle_tags;
  if (updates.product_tags !== undefined) updateData.product_tags = updates.product_tags;
  if (updates.intent_tags !== undefined) updateData.intent_tags = updates.intent_tags;
  if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

  const { data, error } = await supabase
    .from("kb_docs")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update doc: ${error.message}`);
  }

  return data;
}

/**
 * Delete a document (and chunks via CASCADE)
 */
export async function deleteDoc(id: string): Promise<void> {
  const { error } = await supabase.from("kb_docs").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete doc: ${error.message}`);
  }
}

/**
 * Get chunks for a document
 */
export async function getDocChunks(docId: string): Promise<KBChunk[]> {
  const { data, error } = await supabase
    .from("kb_chunks")
    .select("*")
    .eq("doc_id", docId)
    .order("chunk_index", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch chunks: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Create a chunk for a document
 */
export async function createChunk(
  docId: string,
  chunkIndex: number,
  content: string,
  embedding?: number[]
): Promise<KBChunk> {
  const { data, error } = await supabase
    .from("kb_chunks")
    .insert({
      doc_id: docId,
      chunk_index: chunkIndex,
      content,
      embedding: embedding ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create chunk: ${error.message}`);
  }

  return data;
}

/**
 * Delete all chunks for a document (for re-chunking)
 */
export async function deleteDocChunks(docId: string): Promise<void> {
  const { error } = await supabase.from("kb_chunks").delete().eq("doc_id", docId);

  if (error) {
    throw new Error(`Failed to delete chunks: ${error.message}`);
  }
}

/**
 * Add intent mapping for a document
 */
export async function addDocIntent(
  docId: string,
  intent: Intent,
  confidence: number = 1.0
): Promise<KBDocIntent> {
  const { data, error } = await supabase
    .from("kb_doc_intents")
    .upsert({
      doc_id: docId,
      intent,
      confidence,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add doc intent: ${error.message}`);
  }

  return data;
}

/**
 * Remove intent mapping for a document
 */
export async function removeDocIntent(docId: string, intent: Intent): Promise<void> {
  const { error } = await supabase
    .from("kb_doc_intents")
    .delete()
    .eq("doc_id", docId)
    .eq("intent", intent);

  if (error) {
    throw new Error(`Failed to remove doc intent: ${error.message}`);
  }
}

/**
 * Get all intent mappings for a document
 */
export async function getDocIntents(docId: string): Promise<KBDocIntent[]> {
  const { data, error } = await supabase
    .from("kb_doc_intents")
    .select("*")
    .eq("doc_id", docId)
    .order("confidence", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch doc intents: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get recent documents (for admin dashboard)
 */
export async function getRecentDocs(limit: number = 10): Promise<KBDoc[]> {
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch recent docs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get document statistics
 */
export async function getDocStats(): Promise<{
  total: number;
  published: number;
  proposed: number;
  bySource: Record<string, number>;
}> {
  const { data: allDocs, error } = await supabase.from("kb_docs").select("source, evolution_status");

  if (error) {
    throw new Error(`Failed to fetch doc stats: ${error.message}`);
  }

  const docs = allDocs ?? [];

  const bySource: Record<string, number> = {};
  let published = 0;
  let proposed = 0;

  for (const doc of docs) {
    bySource[doc.source] = (bySource[doc.source] ?? 0) + 1;
    if (doc.evolution_status === "published") published++;
    if (doc.evolution_status === "proposed") proposed++;
  }

  return {
    total: docs.length,
    published,
    proposed,
    bySource,
  };
}

/**
 * Filter parameters for document queries
 */
export type DocFilterParams = {
  categoryId?: string;
  vehicleTags?: string[];
  productTags?: string[];
  intentTags?: string[];
  source?: "manual" | "notion" | "thread_evolution";
  evolutionStatus?: "published" | "proposed" | "approved" | "rejected";
  search?: string;
  limit?: number;
  offset?: number;
};

/**
 * Get documents with filters
 */
export async function getDocsWithFilters(params: DocFilterParams): Promise<KBDoc[]> {
  let query = supabase.from("kb_docs").select("*");

  if (params.categoryId) {
    query = query.eq("category_id", params.categoryId);
  }

  if (params.vehicleTags && params.vehicleTags.length > 0) {
    query = query.overlaps("vehicle_tags", params.vehicleTags);
  }

  if (params.productTags && params.productTags.length > 0) {
    query = query.overlaps("product_tags", params.productTags);
  }

  if (params.intentTags && params.intentTags.length > 0) {
    query = query.overlaps("intent_tags", params.intentTags);
  }

  if (params.source) {
    query = query.eq("source", params.source);
  }

  if (params.evolutionStatus) {
    query = query.eq("evolution_status", params.evolutionStatus);
  } else {
    // Default to published
    query = query.eq("evolution_status", "published");
  }

  if (params.search) {
    query = query.or(`title.ilike.%${params.search}%,body.ilike.%${params.search}%`);
  }

  query = query.order("updated_at", { ascending: false });

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.offset) {
    query = query.range(params.offset, params.offset + (params.limit ?? 20) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch docs: ${error.message}`);
  }

  return data ?? [];
}
