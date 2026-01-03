/**
 * Notion Batch Import
 *
 * Orchestrates the full import process from Notion:
 * 1. Fetch pages from workspace
 * 2. Convert to markdown
 * 3. Analyze with LLM
 * 4. Create proposed docs for review
 */

import { fetchAllPages, fetchDatabasePages, type NotionPage } from "./fetcher";
import { notionPageToMarkdown, type MarkdownDocument } from "./markdown";
import { analyzeDocument, batchAnalyze } from "../analyze";
import {
  createImportJob,
  updateImportJob,
  startImportJob,
  completeImportJob,
  failImportJob,
  createProposedDoc,
} from "../review";
import { getCategoryBySlug } from "@/lib/kb/categories";
import type { ImportJob, NotionImportConfig } from "../types";

/**
 * Import progress callback
 */
export type ImportProgress = {
  phase: "fetching" | "converting" | "analyzing" | "creating";
  current: number;
  total: number;
  currentItem?: string;
};

/**
 * Import result
 */
export type BatchImportResult = {
  job: ImportJob;
  totalFetched: number;
  totalProcessed: number;
  totalCreated: number;
  errors: Array<{ pageId: string; error: string }>;
};

/**
 * Run a full Notion import
 */
export async function runNotionImport(
  accessToken: string,
  config: NotionImportConfig = {},
  onProgress?: (progress: ImportProgress) => void
): Promise<BatchImportResult> {
  // Create import job
  const job = await createImportJob({
    source: "notion",
    config: {
      ...config,
      // Don't store the access token in the database
      access_token: undefined,
    },
  });

  const errors: Array<{ pageId: string; error: string }> = [];

  try {
    // Start the job
    await startImportJob(job.id);

    // Phase 1: Fetch pages
    onProgress?.({ phase: "fetching", current: 0, total: 0 });

    let pages: NotionPage[];
    if (config.database_ids && config.database_ids.length > 0) {
      // Fetch from specific databases
      pages = [];
      for (const dbId of config.database_ids) {
        const dbPages = await fetchDatabasePages(accessToken, dbId, {
          includeContent: true,
        });
        pages.push(...dbPages);
      }
    } else if (config.page_ids && config.page_ids.length > 0) {
      // Fetch specific pages
      pages = [];
      const { fetchPage } = await import("./fetcher");
      for (const pageId of config.page_ids) {
        const page = await fetchPage(accessToken, pageId);
        if (page) pages.push(page);
      }
    } else {
      // Fetch all accessible pages
      pages = await fetchAllPages(accessToken, {
        includeContent: true,
      });
    }

    await updateImportJob(job.id, { total_items: pages.length });

    // Phase 2: Convert to markdown
    onProgress?.({ phase: "converting", current: 0, total: pages.length });

    const documents: MarkdownDocument[] = [];
    for (let i = 0; i < pages.length; i++) {
      try {
        const doc = notionPageToMarkdown(pages[i]);
        documents.push(doc);
        onProgress?.({
          phase: "converting",
          current: i + 1,
          total: pages.length,
          currentItem: doc.title,
        });
      } catch (err) {
        errors.push({
          pageId: pages[i].id,
          error: err instanceof Error ? err.message : "Conversion failed",
        });
      }
    }

    // Filter out empty documents
    const validDocuments = documents.filter(
      (doc) => doc.markdown.trim().length > 50 // Minimum content threshold
    );

    // Phase 3: Analyze with LLM
    onProgress?.({ phase: "analyzing", current: 0, total: validDocuments.length });

    const analysisResults = await batchAnalyze(
      validDocuments.map((doc) => ({
        title: doc.title,
        content: doc.markdown,
      })),
      {
        concurrency: 2,
        delayMs: 500,
      }
    );

    // Phase 4: Create proposed docs
    onProgress?.({ phase: "creating", current: 0, total: validDocuments.length });

    let created = 0;
    for (let i = 0; i < validDocuments.length; i++) {
      const doc = validDocuments[i];
      const analysis = analysisResults[i];

      onProgress?.({
        phase: "creating",
        current: i + 1,
        total: validDocuments.length,
        currentItem: doc.title,
      });

      try {
        // Resolve category ID from slug
        let categoryId: string | undefined;
        if (analysis.analysis.suggested_category) {
          const category = await getCategoryBySlug(analysis.analysis.suggested_category);
          categoryId = category?.id;
        }

        await createProposedDoc({
          import_job_id: job.id,
          source: "notion",
          source_id: doc.pageId,
          source_url: doc.sourceUrl,
          title: doc.title,
          body: doc.markdown,
          suggested_category_id: categoryId,
          suggested_intent_tags: analysis.analysis.intent_tags,
          suggested_vehicle_tags: analysis.analysis.vehicle_tags,
          suggested_product_tags: analysis.analysis.product_tags,
          categorization_confidence: analysis.confidence,
          content_quality_score: analysis.analysis.content_quality,
          llm_analysis: analysis.analysis,
        });

        created++;
        await updateImportJob(job.id, { processed_items: created });
      } catch (err) {
        errors.push({
          pageId: doc.pageId,
          error: err instanceof Error ? err.message : "Failed to create proposed doc",
        });
      }
    }

    // Complete the job
    const completedJob = await completeImportJob(job.id);

    return {
      job: completedJob,
      totalFetched: pages.length,
      totalProcessed: validDocuments.length,
      totalCreated: created,
      errors,
    };
  } catch (err) {
    // Fail the job
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const failedJob = await failImportJob(job.id, errorMessage);

    return {
      job: failedJob,
      totalFetched: 0,
      totalProcessed: 0,
      totalCreated: 0,
      errors: [{ pageId: "job", error: errorMessage }],
    };
  }
}

/**
 * Import a single Notion page (for testing or manual import)
 */
export async function importSinglePage(
  accessToken: string,
  pageId: string
): Promise<{ success: boolean; proposedDocId?: string; error?: string }> {
  try {
    const { fetchPage } = await import("./fetcher");
    const page = await fetchPage(accessToken, pageId);

    if (!page) {
      return { success: false, error: "Page not found" };
    }

    const doc = notionPageToMarkdown(page);

    if (doc.markdown.trim().length < 50) {
      return { success: false, error: "Page content too short" };
    }

    const { analysis, confidence } = await analyzeDocument(doc.title, doc.markdown);

    // Resolve category ID
    let categoryId: string | undefined;
    if (analysis.suggested_category) {
      const category = await getCategoryBySlug(analysis.suggested_category);
      categoryId = category?.id;
    }

    const proposedDoc = await createProposedDoc({
      source: "notion",
      source_id: doc.pageId,
      source_url: doc.sourceUrl,
      title: doc.title,
      body: doc.markdown,
      suggested_category_id: categoryId,
      suggested_intent_tags: analysis.intent_tags,
      suggested_vehicle_tags: analysis.vehicle_tags,
      suggested_product_tags: analysis.product_tags,
      categorization_confidence: confidence,
      content_quality_score: analysis.content_quality,
      llm_analysis: analysis,
    });

    return { success: true, proposedDocId: proposedDoc.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Preview import (fetch and optionally analyze without creating proposed docs)
 */
export async function previewNotionImport(
  accessToken: string,
  config: NotionImportConfig = {},
  limit: number = 10,
  skipAnalysis: boolean = false
): Promise<{
  pages: Array<{
    id: string;
    title: string;
    url: string;
    wordCount: number;
    suggestedCategory: string | null;
    confidence: number;
    qualityScore: number;
  }>;
  totalAvailable: number;
}> {
  // Fetch pages
  let pages: NotionPage[];
  if (config.database_ids && config.database_ids.length > 0) {
    pages = [];
    for (const dbId of config.database_ids) {
      const dbPages = await fetchDatabasePages(accessToken, dbId, {
        maxPages: limit,
        includeContent: true,
      });
      pages.push(...dbPages);
    }
  } else {
    pages = await fetchAllPages(accessToken, {
      maxPages: limit,
      includeContent: true,
    });
  }

  // Convert and optionally analyze
  const results = [];
  for (const page of pages.slice(0, limit)) {
    const doc = notionPageToMarkdown(page);

    if (doc.markdown.trim().length < 50) continue;

    if (skipAnalysis) {
      // Skip LLM analysis - just return basic info
      results.push({
        id: page.id,
        title: doc.title,
        url: doc.sourceUrl,
        wordCount: doc.metadata.wordCount,
        suggestedCategory: null,
        confidence: 0,
        qualityScore: 0,
      });
    } else {
      const { analysis, confidence } = await analyzeDocument(doc.title, doc.markdown);

      results.push({
        id: page.id,
        title: doc.title,
        url: doc.sourceUrl,
        wordCount: doc.metadata.wordCount,
        suggestedCategory: analysis.suggested_category,
        confidence,
        qualityScore: analysis.content_quality,
      });
    }
  }

  return {
    pages: results,
    totalAvailable: pages.length,
  };
}
