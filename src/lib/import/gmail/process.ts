/**
 * Gmail Import Processing
 *
 * Orchestrates the Gmail import workflow:
 * 1. List threads for selection
 * 2. Process selected threads
 * 3. Extract resolutions
 * 4. Create proposed docs
 */

import {
  listThreads,
  fetchThreads,
  type GmailThreadSummary,
  type GmailSearchOptions,
} from "./fetcher";
import { extractFromThreads, rankExtractions, deduplicateExtractions } from "./extract";
import { analyzeDocument } from "../analyze";
import {
  createImportJob,
  updateImportJob,
  startImportJob,
  completeImportJob,
  failImportJob,
  createProposedDoc,
  createGmailCandidates,
  getGmailCandidates,
  markGmailCandidateProcessed,
} from "../review";
import { getCategoryBySlug } from "@/lib/kb/categories";
import type { GmailTokens } from "./auth";
import type { ImportJob, GmailImportConfig, GmailThreadCandidate } from "../types";

/**
 * Import progress callback
 */
export type GmailImportProgress = {
  phase: "listing" | "fetching" | "extracting" | "analyzing" | "creating";
  current: number;
  total: number;
  currentItem?: string;
};

/**
 * Gmail import result
 */
export type GmailImportResult = {
  job: ImportJob;
  totalThreads: number;
  totalProcessed: number;
  totalCreated: number;
  errors: Array<{ threadId: string; error: string }>;
};

/**
 * Step 1: Create import job and list candidate threads
 */
export async function listGmailCandidates(
  tokens: GmailTokens,
  config: GmailImportConfig = {},
  onProgress?: (current: number, total: number) => void
): Promise<{ job: ImportJob; candidates: GmailThreadCandidate[] }> {
  // Create import job
  const job = await createImportJob({
    source: "gmail",
    config: {
      ...config,
      // Don't store tokens in database
    },
  });

  // Build search options
  const searchOptions: GmailSearchOptions = {
    query: config.query,
    labels: config.labels,
    maxResults: 100,
  };

  if (config.date_range?.after) {
    searchOptions.after = new Date(config.date_range.after);
  }
  if (config.date_range?.before) {
    searchOptions.before = new Date(config.date_range.before);
  }

  // List all threads (paginated)
  const allSummaries: GmailThreadSummary[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listThreads(tokens, {
      ...searchOptions,
      pageToken,
    });

    allSummaries.push(...result.threads);
    onProgress?.(allSummaries.length, allSummaries.length);

    pageToken = result.nextPageToken;
  } while (pageToken && allSummaries.length < 500); // Cap at 500 for manual selection

  // Create candidate records
  const candidates = await createGmailCandidates(
    job.id,
    allSummaries.map((t) => ({
      thread_id: t.threadId,
      subject: t.subject,
      snippet: t.snippet,
      message_count: t.messageCount,
      labels: t.labels,
      last_message_date: t.lastMessageDate.toISOString(),
      participants: t.participants,
    }))
  );

  await updateImportJob(job.id, { total_items: candidates.length });

  return { job, candidates };
}

/**
 * Step 2: Process selected threads
 */
export async function processSelectedThreads(
  tokens: GmailTokens,
  jobId: string,
  onProgress?: (progress: GmailImportProgress) => void
): Promise<GmailImportResult> {
  const errors: Array<{ threadId: string; error: string }> = [];

  try {
    // Start the job
    await startImportJob(jobId);

    // Get selected candidates
    const candidates = await getGmailCandidates(jobId, { selected: true, processed: false });

    if (candidates.length === 0) {
      const completedJob = await completeImportJob(jobId);
      return {
        job: completedJob,
        totalThreads: 0,
        totalProcessed: 0,
        totalCreated: 0,
        errors: [],
      };
    }

    const threadIds = candidates.map((c) => c.thread_id);

    // Phase 1: Fetch full threads
    onProgress?.({ phase: "fetching", current: 0, total: threadIds.length });

    const threads = await fetchThreads(tokens, threadIds, {
      delayMs: 100,
      onProgress: (current, total) => {
        onProgress?.({ phase: "fetching", current, total });
      },
    });

    // Phase 2: Extract resolutions
    onProgress?.({ phase: "extracting", current: 0, total: threads.length });

    const extractions = await extractFromThreads(threads, {
      delayMs: 500,
      onProgress: (current, total) => {
        onProgress?.({ phase: "extracting", current, total });
      },
    });

    // Filter and rank extractions
    const usableExtractions = deduplicateExtractions(rankExtractions(extractions));

    // Phase 3: Analyze and create proposed docs
    onProgress?.({ phase: "creating", current: 0, total: usableExtractions.length });

    let created = 0;
    for (let i = 0; i < usableExtractions.length; i++) {
      const extraction = usableExtractions[i];

      onProgress?.({
        phase: "creating",
        current: i + 1,
        total: usableExtractions.length,
        currentItem: extraction.extraction.kb_title,
      });

      try {
        // Analyze the extracted content
        const { analysis, confidence } = await analyzeDocument(
          extraction.extraction.kb_title,
          extraction.extraction.kb_body
        );

        // Resolve category ID
        let categoryId: string | undefined;
        if (analysis.suggested_category) {
          const category = await getCategoryBySlug(analysis.suggested_category);
          categoryId = category?.id;
        }

        // Create proposed doc
        await createProposedDoc({
          import_job_id: jobId,
          source: "gmail",
          source_id: extraction.threadId,
          title: extraction.extraction.kb_title,
          body: extraction.extraction.kb_body,
          suggested_category_id: categoryId,
          suggested_intent_tags: analysis.intent_tags,
          suggested_vehicle_tags: analysis.vehicle_tags,
          suggested_product_tags: analysis.product_tags,
          categorization_confidence: confidence,
          content_quality_score: analysis.content_quality,
          llm_analysis: analysis,
        });

        // Mark candidate as processed
        const candidate = candidates.find((c) => c.thread_id === extraction.threadId);
        if (candidate) {
          await markGmailCandidateProcessed(candidate.id);
        }

        created++;
        await updateImportJob(jobId, { processed_items: created });
      } catch (err) {
        errors.push({
          threadId: extraction.threadId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Mark unprocessed candidates
    for (const candidate of candidates) {
      const wasProcessed = usableExtractions.some((e) => e.threadId === candidate.thread_id);
      if (!wasProcessed) {
        await markGmailCandidateProcessed(candidate.id);
      }
    }

    const completedJob = await completeImportJob(jobId);

    return {
      job: completedJob,
      totalThreads: threadIds.length,
      totalProcessed: usableExtractions.length,
      totalCreated: created,
      errors,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const failedJob = await failImportJob(jobId, errorMessage);

    return {
      job: failedJob,
      totalThreads: 0,
      totalProcessed: 0,
      totalCreated: 0,
      errors: [{ threadId: "job", error: errorMessage }],
    };
  }
}

/**
 * Run full Gmail import (list + process all)
 * For automated imports without manual selection
 */
export async function runGmailImport(
  tokens: GmailTokens,
  config: GmailImportConfig & { autoSelectAll?: boolean } = {},
  onProgress?: (progress: GmailImportProgress) => void
): Promise<GmailImportResult> {
  // List candidates
  onProgress?.({ phase: "listing", current: 0, total: 0 });

  const { job, candidates } = await listGmailCandidates(tokens, config);

  if (config.autoSelectAll) {
    // Auto-select all candidates
    const { bulkSelectGmailCandidates } = await import("../review");
    await bulkSelectGmailCandidates(
      candidates.map((c) => c.id),
      true
    );
  }

  // Process selected
  return processSelectedThreads(tokens, job.id, onProgress);
}

/**
 * Preview Gmail import (extract without creating proposed docs)
 */
export async function previewGmailImport(
  tokens: GmailTokens,
  config: GmailImportConfig = {},
  limit: number = 5
): Promise<{
  threads: Array<{
    threadId: string;
    subject: string;
    messageCount: number;
    extractedTitle: string;
    extractedBody: string;
    confidence: number;
    isUsable: boolean;
  }>;
  totalAvailable: number;
}> {
  // List threads
  const { threads: summaries } = await listThreads(tokens, {
    query: config.query,
    labels: config.labels,
    maxResults: limit,
    after: config.date_range?.after ? new Date(config.date_range.after) : undefined,
    before: config.date_range?.before ? new Date(config.date_range.before) : undefined,
  });

  // Fetch full threads
  const threads = await fetchThreads(
    tokens,
    summaries.slice(0, limit).map((s) => s.threadId)
  );

  // Extract resolutions
  const extractions = await extractFromThreads(threads);

  return {
    threads: extractions.map((e) => ({
      threadId: e.threadId,
      subject: e.subject,
      messageCount: e.messageCount,
      extractedTitle: e.extraction.kb_title,
      extractedBody: e.extraction.kb_body.slice(0, 200) + "...",
      confidence: e.extraction.confidence,
      isUsable: e.isUsable,
    })),
    totalAvailable: summaries.length,
  };
}
