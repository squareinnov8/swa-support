/**
 * Knowledge Base Types
 *
 * Types for the hierarchical, topic-centric knowledge base system.
 */

import type { Intent } from "@/lib/intents/taxonomy";

/**
 * KB Category - hierarchical organization (topic-centric)
 */
export type KBCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  created_at: string;
};

/**
 * Category with computed path for display
 */
export type KBCategoryWithPath = KBCategory & {
  path: string[]; // ["Firmware Updates", "APEX"]
  depth: number;
};

/**
 * KB Document - main content unit
 */
export type KBDoc = {
  id: string;
  source: "manual" | "notion" | "thread_evolution";
  source_id: string | null;
  title: string;
  body: string;
  category_id: string | null;
  vehicle_tags: string[];
  product_tags: string[];
  intent_tags: string[];
  source_thread_id: string | null;
  evolution_status: "published" | "proposed" | "approved" | "rejected";
  metadata: Record<string, unknown>;
  updated_at: string;
};

/**
 * KB Document with category info
 */
export type KBDocWithCategory = KBDoc & {
  category?: KBCategory | null;
  category_path?: string[];
};

/**
 * KB Chunk - embedded segment of a document
 */
export type KBChunk = {
  id: string;
  doc_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  created_at: string;
};

/**
 * Doc-Intent mapping with confidence
 */
export type KBDocIntent = {
  doc_id: string;
  intent: Intent;
  confidence: number;
  created_at: string;
};

/**
 * Resolution log - tracks KB usage per thread
 */
export type KBResolutionLog = {
  id: string;
  thread_id: string;
  doc_ids: string[];
  chunk_ids: string[] | null;
  retrieval_method: "intent_tag" | "semantic" | "hybrid";
  was_helpful: boolean | null;
  created_at: string;
};

/**
 * Content gap - missing KB content detection
 */
export type KBContentGap = {
  id: string;
  intent: Intent;
  thread_id: string | null;
  query_text: string;
  gap_type: "no_match" | "low_confidence" | "incomplete";
  status: "open" | "addressed" | "ignored";
  addressed_by_doc_id: string | null;
  created_at: string;
};

/**
 * Draft generation record - audit trail
 */
export type DraftGeneration = {
  id: string;
  thread_id: string;
  message_id: string | null;
  intent: Intent;
  kb_docs_used: string[];
  kb_chunks_used: string[] | null;
  llm_provider: string;
  llm_model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  raw_draft: string;
  final_draft: string | null;
  citations: Citation[] | null;
  policy_gate_passed: boolean | null;
  policy_violations: string[] | null;
  was_sent: boolean;
  was_edited: boolean;
  edit_distance: number | null;
  created_at: string;
};

/**
 * Citation from KB doc
 */
export type Citation = {
  doc_id: string;
  chunk_id?: string;
  title: string;
  quote?: string;
};

/**
 * Create document input
 */
export type CreateKBDocInput = {
  title: string;
  body: string;
  source?: "manual" | "notion" | "thread_evolution";
  source_id?: string;
  category_id?: string;
  vehicle_tags?: string[];
  product_tags?: string[];
  intent_tags?: string[];
  source_thread_id?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Update document input
 */
export type UpdateKBDocInput = Partial<CreateKBDocInput>;

/**
 * Create category input
 */
export type CreateKBCategoryInput = {
  name: string;
  slug: string;
  parent_id?: string;
  description?: string;
  sort_order?: number;
};

/**
 * Initial category seed structure
 */
export const INITIAL_CATEGORIES: CreateKBCategoryInput[] = [
  // Top-level topics
  { name: "Firmware Updates", slug: "firmware-updates", description: "Firmware update procedures and troubleshooting" },
  { name: "Installation", slug: "installation", description: "Product installation guides" },
  { name: "Troubleshooting", slug: "troubleshooting", description: "Common issues and solutions" },
  { name: "Policies", slug: "policies", description: "Company policies and procedures" },
  { name: "FAQs", slug: "faqs", description: "Frequently asked questions" },
];

/**
 * Common vehicle tags (can be extended)
 */
export const COMMON_VEHICLE_TAGS = [
  "All",
  "Infiniti Q50",
  "Infiniti Q60",
  "Nissan 370Z",
  "Nissan GTR",
] as const;

/**
 * Common product tags (can be extended)
 */
export const COMMON_PRODUCT_TAGS = [
  "APEX",
  "All Products",
] as const;
