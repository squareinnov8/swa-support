/**
 * Review Queue Operations
 *
 * Handles the review workflow for proposed KB documents:
 * - Create/fetch proposed docs
 * - Approve (publish to kb_docs)
 * - Reject
 * - Bulk operations
 */

import { supabase } from "@/lib/db";
import { createDoc } from "@/lib/kb/documents";
import { getCategoryBySlug } from "@/lib/kb/categories";
import type {
  ImportJob,
  ImportJobStatus,
  ImportSource,
  ProposedDoc,
  ProposedDocWithCategory,
  ProposedDocStatus,
  CreateImportJobInput,
  CreateProposedDocInput,
  ApproveProposedDocInput,
  RejectProposedDocInput,
  BulkReviewAction,
  GmailThreadCandidate,
} from "./types";
import { shouldAutoApprove, shouldAutoReject } from "./confidence";

// ============================================================
// Import Jobs
// ============================================================

/**
 * Create a new import job
 */
export async function createImportJob(input: CreateImportJobInput): Promise<ImportJob> {
  const { data, error } = await supabase
    .from("kb_import_jobs")
    .insert({
      source: input.source,
      config: input.config ?? {},
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create import job: ${error.message}`);
  }

  return data;
}

/**
 * Get an import job by ID
 */
export async function getImportJob(id: string): Promise<ImportJob | null> {
  const { data, error } = await supabase
    .from("kb_import_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch import job: ${error.message}`);
  }

  return data;
}

/**
 * Get all import jobs
 */
export async function getImportJobs(
  filters?: { source?: ImportSource; status?: ImportJobStatus }
): Promise<ImportJob[]> {
  let query = supabase
    .from("kb_import_jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.source) {
    query = query.eq("source", filters.source);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch import jobs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Update import job status and counts
 */
export async function updateImportJob(
  id: string,
  updates: Partial<{
    status: ImportJobStatus;
    total_items: number;
    processed_items: number;
    approved_items: number;
    rejected_items: number;
    error_message: string;
    started_at: string;
    completed_at: string;
  }>
): Promise<ImportJob> {
  const { data, error } = await supabase
    .from("kb_import_jobs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update import job: ${error.message}`);
  }

  return data;
}

/**
 * Start an import job
 */
export async function startImportJob(id: string): Promise<ImportJob> {
  return updateImportJob(id, {
    status: "running",
    started_at: new Date().toISOString(),
  });
}

/**
 * Complete an import job
 */
export async function completeImportJob(id: string): Promise<ImportJob> {
  return updateImportJob(id, {
    status: "completed",
    completed_at: new Date().toISOString(),
  });
}

/**
 * Fail an import job
 */
export async function failImportJob(id: string, errorMessage: string): Promise<ImportJob> {
  return updateImportJob(id, {
    status: "failed",
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  });
}

// ============================================================
// Proposed Documents
// ============================================================

/**
 * Create a proposed document
 */
export async function createProposedDoc(input: CreateProposedDocInput): Promise<ProposedDoc> {
  const { data, error } = await supabase
    .from("kb_proposed_docs")
    .insert({
      import_job_id: input.import_job_id ?? null,
      source: input.source,
      source_id: input.source_id ?? null,
      source_url: input.source_url ?? null,
      title: input.title,
      body: input.body,
      suggested_category_id: input.suggested_category_id ?? null,
      suggested_intent_tags: input.suggested_intent_tags ?? [],
      suggested_vehicle_tags: input.suggested_vehicle_tags ?? [],
      suggested_product_tags: input.suggested_product_tags ?? [],
      categorization_confidence: input.categorization_confidence ?? 0,
      content_quality_score: input.content_quality_score ?? 0,
      llm_analysis: input.llm_analysis ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create proposed doc: ${error.message}`);
  }

  return data;
}

/**
 * Get a proposed document by ID
 */
export async function getProposedDoc(id: string): Promise<ProposedDoc | null> {
  const { data, error } = await supabase
    .from("kb_proposed_docs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch proposed doc: ${error.message}`);
  }

  return data;
}

/**
 * Get proposed doc with category name
 */
export async function getProposedDocWithCategory(id: string): Promise<ProposedDocWithCategory | null> {
  const { data, error } = await supabase
    .from("kb_proposed_docs")
    .select(`
      *,
      suggested_category:kb_categories(name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch proposed doc: ${error.message}`);
  }

  if (!data) return null;

  return {
    ...data,
    suggested_category_name: data.suggested_category?.name,
  };
}

/**
 * Get proposed documents with filters
 */
export async function getProposedDocs(
  filters?: {
    status?: ProposedDocStatus;
    import_job_id?: string;
    source?: ImportSource;
  },
  options?: { limit?: number; offset?: number }
): Promise<ProposedDoc[]> {
  let query = supabase
    .from("kb_proposed_docs")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.import_job_id) {
    query = query.eq("import_job_id", filters.import_job_id);
  }
  if (filters?.source) {
    query = query.eq("source", filters.source);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 10) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch proposed docs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get pending docs count
 */
export async function getPendingDocsCount(): Promise<number> {
  const { count, error } = await supabase
    .from("kb_proposed_docs")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to count pending docs: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Update a proposed document
 */
export async function updateProposedDoc(
  id: string,
  updates: Partial<{
    title: string;
    body: string;
    suggested_category_id: string | null;
    suggested_intent_tags: string[];
    suggested_vehicle_tags: string[];
    suggested_product_tags: string[];
    status: ProposedDocStatus;
    review_notes: string;
    reviewed_by: string;
    reviewed_at: string;
    published_doc_id: string;
  }>
): Promise<ProposedDoc> {
  const { data, error } = await supabase
    .from("kb_proposed_docs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update proposed doc: ${error.message}`);
  }

  return data;
}

/**
 * Approve a proposed document and publish it
 */
export async function approveProposedDoc(input: ApproveProposedDocInput): Promise<{
  proposedDoc: ProposedDoc;
  publishedDocId: string;
}> {
  // Get the proposed doc
  const proposedDoc = await getProposedDoc(input.id);
  if (!proposedDoc) {
    throw new Error("Proposed doc not found");
  }

  // Resolve category ID
  let categoryId = input.category_id ?? proposedDoc.suggested_category_id;

  // Create the KB doc
  const publishedDoc = await createDoc({
    title: input.title ?? proposedDoc.title,
    body: input.body ?? proposedDoc.body,
    source: proposedDoc.source as "notion" | "manual" | "thread_evolution",
    source_id: proposedDoc.source_id ?? undefined,
    category_id: categoryId ?? undefined,
    vehicle_tags: input.vehicle_tags ?? proposedDoc.suggested_vehicle_tags,
    product_tags: input.product_tags ?? proposedDoc.suggested_product_tags,
    intent_tags: input.intent_tags ?? proposedDoc.suggested_intent_tags,
    metadata: {
      imported_from: proposedDoc.source,
      source_url: proposedDoc.source_url,
      import_job_id: proposedDoc.import_job_id,
    },
  });

  // Update proposed doc status
  const updatedProposedDoc = await updateProposedDoc(input.id, {
    status: "approved",
    reviewed_by: input.reviewed_by ?? "system",
    reviewed_at: new Date().toISOString(),
    published_doc_id: publishedDoc.id,
  });

  // Update import job counts
  if (proposedDoc.import_job_id) {
    const job = await getImportJob(proposedDoc.import_job_id);
    if (job) {
      await updateImportJob(proposedDoc.import_job_id, {
        approved_items: job.approved_items + 1,
      });
    }
  }

  return {
    proposedDoc: updatedProposedDoc,
    publishedDocId: publishedDoc.id,
  };
}

/**
 * Reject a proposed document
 */
export async function rejectProposedDoc(input: RejectProposedDocInput): Promise<ProposedDoc> {
  const proposedDoc = await getProposedDoc(input.id);
  if (!proposedDoc) {
    throw new Error("Proposed doc not found");
  }

  const updated = await updateProposedDoc(input.id, {
    status: "rejected",
    review_notes: input.review_notes ?? undefined,
    reviewed_by: input.reviewed_by ?? "system",
    reviewed_at: new Date().toISOString(),
  });

  // Update import job counts
  if (proposedDoc.import_job_id) {
    const job = await getImportJob(proposedDoc.import_job_id);
    if (job) {
      await updateImportJob(proposedDoc.import_job_id, {
        rejected_items: job.rejected_items + 1,
      });
    }
  }

  return updated;
}

/**
 * Bulk approve/reject proposed documents
 */
export async function bulkReviewDocs(action: BulkReviewAction): Promise<{
  successful: string[];
  failed: Array<{ id: string; error: string }>;
}> {
  const successful: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const id of action.doc_ids) {
    try {
      if (action.action === "approve") {
        await approveProposedDoc({
          id,
          reviewed_by: action.reviewed_by,
        });
      } else {
        await rejectProposedDoc({
          id,
          review_notes: action.review_notes,
          reviewed_by: action.reviewed_by,
        });
      }
      successful.push(id);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      failed.push({ id, error });
    }
  }

  return { successful, failed };
}

/**
 * Auto-approve/reject based on confidence scores
 * Returns count of auto-approved and auto-rejected
 */
export async function autoReviewDocs(
  options?: { import_job_id?: string }
): Promise<{ autoApproved: number; autoRejected: number }> {
  // Get all pending docs
  const pendingDocs = await getProposedDocs({
    status: "pending",
    import_job_id: options?.import_job_id,
  });

  let autoApproved = 0;
  let autoRejected = 0;

  for (const doc of pendingDocs) {
    if (shouldAutoReject(doc)) {
      await rejectProposedDoc({
        id: doc.id,
        review_notes: "Auto-rejected: Content quality below threshold",
        reviewed_by: "system",
      });
      autoRejected++;
    } else if (shouldAutoApprove(doc)) {
      await approveProposedDoc({
        id: doc.id,
        reviewed_by: "system",
      });
      autoApproved++;
    }
  }

  return { autoApproved, autoRejected };
}

// ============================================================
// Gmail Thread Candidates
// ============================================================

/**
 * Create Gmail thread candidates
 */
export async function createGmailCandidates(
  importJobId: string,
  candidates: Array<{
    thread_id: string;
    subject?: string;
    snippet?: string;
    message_count?: number;
    labels?: string[];
    last_message_date?: string;
    participants?: string[];
  }>
): Promise<GmailThreadCandidate[]> {
  if (candidates.length === 0) return [];

  const { data, error } = await supabase
    .from("gmail_thread_candidates")
    .insert(
      candidates.map((c) => ({
        import_job_id: importJobId,
        thread_id: c.thread_id,
        subject: c.subject ?? null,
        snippet: c.snippet ?? null,
        message_count: c.message_count ?? 0,
        labels: c.labels ?? [],
        last_message_date: c.last_message_date ?? null,
        participants: c.participants ?? [],
      }))
    )
    .select();

  if (error) {
    throw new Error(`Failed to create Gmail candidates: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get Gmail thread candidates for a job
 */
export async function getGmailCandidates(
  importJobId: string,
  filters?: { selected?: boolean; processed?: boolean }
): Promise<GmailThreadCandidate[]> {
  let query = supabase
    .from("gmail_thread_candidates")
    .select("*")
    .eq("import_job_id", importJobId)
    .order("last_message_date", { ascending: false });

  if (filters?.selected !== undefined) {
    query = query.eq("selected", filters.selected);
  }
  if (filters?.processed !== undefined) {
    query = query.eq("processed", filters.processed);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch Gmail candidates: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Toggle selection for a Gmail candidate
 */
export async function toggleGmailCandidateSelection(
  id: string,
  selected: boolean
): Promise<GmailThreadCandidate> {
  const { data, error } = await supabase
    .from("gmail_thread_candidates")
    .update({ selected })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update Gmail candidate: ${error.message}`);
  }

  return data;
}

/**
 * Bulk select/deselect Gmail candidates
 */
export async function bulkSelectGmailCandidates(
  ids: string[],
  selected: boolean
): Promise<void> {
  const { error } = await supabase
    .from("gmail_thread_candidates")
    .update({ selected })
    .in("id", ids);

  if (error) {
    throw new Error(`Failed to update Gmail candidates: ${error.message}`);
  }
}

/**
 * Mark Gmail candidate as processed
 */
export async function markGmailCandidateProcessed(id: string): Promise<GmailThreadCandidate> {
  const { data, error } = await supabase
    .from("gmail_thread_candidates")
    .update({ processed: true })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update Gmail candidate: ${error.message}`);
  }

  return data;
}
