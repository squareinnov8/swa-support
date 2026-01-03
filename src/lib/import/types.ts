/**
 * KB Import Pipeline Types
 *
 * Types for importing content from Notion and Gmail
 * with LLM-assisted categorization and human review.
 */

import type { Intent } from "@/lib/intents/taxonomy";

/**
 * Import sources
 */
export type ImportSource = "notion" | "gmail";

/**
 * Import job status
 */
export type ImportJobStatus = "pending" | "running" | "completed" | "failed";

/**
 * Proposed doc status
 */
export type ProposedDocStatus = "pending" | "approved" | "rejected" | "needs_edit";

/**
 * Import job - tracks a batch import operation
 */
export type ImportJob = {
  id: string;
  source: ImportSource;
  status: ImportJobStatus;
  total_items: number;
  processed_items: number;
  approved_items: number;
  rejected_items: number;
  error_message: string | null;
  config: ImportJobConfig;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

/**
 * Import job configuration (source-specific)
 */
export type ImportJobConfig = NotionImportConfig | GmailImportConfig | Record<string, unknown>;

/**
 * Notion-specific import config
 */
export type NotionImportConfig = {
  workspace_id?: string;
  workspace_name?: string;
  access_token?: string; // Encrypted or use secure storage
  database_ids?: string[];
  page_ids?: string[];
  include_children?: boolean;
};

/**
 * Gmail-specific import config
 */
export type GmailImportConfig = {
  email?: string;
  labels?: string[];
  date_range?: {
    after?: string;
    before?: string;
  };
  query?: string; // Gmail search query
};

/**
 * Proposed KB document - staging before publish
 */
export type ProposedDoc = {
  id: string;
  import_job_id: string | null;
  source: ImportSource;
  source_id: string | null;
  source_url: string | null;

  // Content
  title: string;
  body: string;

  // LLM suggestions
  suggested_category_id: string | null;
  suggested_intent_tags: string[];
  suggested_vehicle_tags: string[];
  suggested_product_tags: string[];

  // Confidence
  categorization_confidence: number;
  content_quality_score: number;

  // LLM analysis
  llm_analysis: LLMAnalysisResult | null;

  // Review
  status: ProposedDocStatus;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;

  // Published link
  published_doc_id: string | null;

  created_at: string;
};

/**
 * Proposed doc with category info for display
 */
export type ProposedDocWithCategory = ProposedDoc & {
  suggested_category_name?: string;
  suggested_category_path?: string[];
};

/**
 * Gmail thread candidate for selection
 */
export type GmailThreadCandidate = {
  id: string;
  import_job_id: string;
  thread_id: string;
  subject: string | null;
  snippet: string | null;
  message_count: number;
  labels: string[];
  last_message_date: string | null;
  participants: string[];
  selected: boolean;
  processed: boolean;
  created_at: string;
};

/**
 * LLM analysis result for document categorization
 */
export type LLMAnalysisResult = {
  suggested_category: string | null; // category slug
  category_confidence: number;
  intent_tags: Intent[];
  vehicle_tags: string[];
  product_tags: string[];
  content_quality: number;
  quality_issues: string[];
  summary: string;
};

/**
 * Gmail resolution extraction result
 */
export type GmailExtractionResult = {
  customer_issue: string;
  resolution: string;
  is_resolved: boolean;
  kb_title: string;
  kb_body: string;
  confidence: number;
};

/**
 * Create import job input
 */
export type CreateImportJobInput = {
  source: ImportSource;
  config?: ImportJobConfig;
};

/**
 * Create proposed doc input
 */
export type CreateProposedDocInput = {
  import_job_id?: string;
  source: ImportSource;
  source_id?: string;
  source_url?: string;
  title: string;
  body: string;
  suggested_category_id?: string;
  suggested_intent_tags?: string[];
  suggested_vehicle_tags?: string[];
  suggested_product_tags?: string[];
  categorization_confidence?: number;
  content_quality_score?: number;
  llm_analysis?: LLMAnalysisResult;
};

/**
 * Approve proposed doc input
 */
export type ApproveProposedDocInput = {
  id: string;
  // Allow overrides during approval
  title?: string;
  body?: string;
  category_id?: string;
  intent_tags?: string[];
  vehicle_tags?: string[];
  product_tags?: string[];
  reviewed_by?: string;
};

/**
 * Reject proposed doc input
 */
export type RejectProposedDocInput = {
  id: string;
  review_notes?: string;
  reviewed_by?: string;
};

/**
 * Bulk action on proposed docs
 */
export type BulkReviewAction = {
  action: "approve" | "reject";
  doc_ids: string[];
  reviewed_by?: string;
  review_notes?: string; // For rejections
};

/**
 * Import progress event
 */
export type ImportProgressEvent = {
  job_id: string;
  total: number;
  processed: number;
  current_item?: string;
  status: ImportJobStatus;
  error?: string;
};

/**
 * Confidence thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  AUTO_APPROVE: 0.85, // >= this auto-approves
  FLAG_ATTENTION: 0.5, // < this flags for attention
} as const;

/**
 * Quality thresholds
 */
export const QUALITY_THRESHOLDS = {
  MIN_ACCEPTABLE: 0.4, // Below this, auto-reject
} as const;
