/**
 * Intent-based Lookup
 *
 * Deterministic retrieval based on intent tags.
 * This is the first phase of hybrid retrieval.
 */

import { supabase } from "@/lib/db";
import type { Intent } from "@/lib/intents/taxonomy";
import type { KBDoc } from "@/lib/kb/types";

/**
 * Search result with score
 */
export type IntentSearchResult = {
  doc: KBDoc;
  score: number;
  matchType: "intent_tag" | "intent_mapping";
};

/**
 * Look up documents by intent tag (stored in kb_docs.intent_tags array)
 */
export async function lookupByIntentTag(intent: Intent): Promise<IntentSearchResult[]> {
  const { data, error } = await supabase
    .from("kb_docs")
    .select("*")
    .contains("intent_tags", [intent])
    .eq("evolution_status", "published");

  if (error) {
    throw new Error(`Intent tag lookup failed: ${error.message}`);
  }

  return (data ?? []).map((doc) => ({
    doc,
    score: 1.0, // Perfect match for intent tag
    matchType: "intent_tag" as const,
  }));
}

/**
 * Look up documents by intent mapping (kb_doc_intents table with confidence)
 */
export async function lookupByIntentMapping(intent: Intent): Promise<IntentSearchResult[]> {
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
    throw new Error(`Intent mapping lookup failed: ${error.message}`);
  }

  if (!data) return [];

  return data
    .filter((row) => row.doc !== null)
    .map((row) => {
      // Supabase returns the nested select as an array, take first item
      const doc = Array.isArray(row.doc) ? row.doc[0] : row.doc;
      return {
        doc: doc as KBDoc,
        score: row.confidence,
        matchType: "intent_mapping" as const,
      };
    });
}

/**
 * Combined intent lookup - tries both tag and mapping
 */
export async function lookupByIntent(intent: Intent): Promise<IntentSearchResult[]> {
  // Get results from both sources
  const [tagResults, mappingResults] = await Promise.all([
    lookupByIntentTag(intent),
    lookupByIntentMapping(intent),
  ]);

  // Merge and deduplicate by doc ID, keeping highest score
  const docMap = new Map<string, IntentSearchResult>();

  for (const result of tagResults) {
    const existing = docMap.get(result.doc.id);
    if (!existing || result.score > existing.score) {
      docMap.set(result.doc.id, result);
    }
  }

  for (const result of mappingResults) {
    const existing = docMap.get(result.doc.id);
    if (!existing || result.score > existing.score) {
      docMap.set(result.doc.id, result);
    }
  }

  // Sort by score descending
  return Array.from(docMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Filter results by vehicle tag
 */
export function filterByVehicle(
  results: IntentSearchResult[],
  vehicleTag: string
): IntentSearchResult[] {
  return results.filter(
    (r) => r.doc.vehicle_tags.includes(vehicleTag) || r.doc.vehicle_tags.includes("All")
  );
}

/**
 * Filter results by product tag
 */
export function filterByProduct(
  results: IntentSearchResult[],
  productTag: string
): IntentSearchResult[] {
  return results.filter(
    (r) => r.doc.product_tags.includes(productTag) || r.doc.product_tags.includes("All Products")
  );
}
