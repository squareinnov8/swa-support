/**
 * Website Import Batch Orchestration
 *
 * Coordinates the full website import flow:
 * 1. Discover URLs (from sitemap or manual list)
 * 2. Filter out already-imported URLs
 * 3. Fetch and extract content from each page
 * 4. Run LLM analysis for categorization
 * 5. Create proposed docs for review
 */

import { supabase } from "@/lib/db";
import { parseSitemap, filterUrls, DEFAULT_EXCLUDE_PATTERNS } from "./sitemap";
import { fetchPage, type PageContent } from "./fetcher";
import { analyzeDocument } from "../analyze";
import {
  createImportJob,
  startImportJob,
  updateImportJob,
  completeImportJob,
  failImportJob,
  createProposedDoc,
} from "../review";
import { getCategoryBySlug } from "@/lib/kb/categories";
import type { WebsiteImportConfig, ImportJob } from "../types";

const DEFAULT_MAX_PAGES = 100;
const RATE_LIMIT_MS = 500;

/**
 * Discover URLs from sitemap or manual list
 */
export async function discoverUrls(config: WebsiteImportConfig): Promise<string[]> {
  let urls: string[] = [];

  // Get URLs from sitemap
  if (config.sitemap_url) {
    const sitemapUrls = await parseSitemap(config.sitemap_url);
    urls.push(...sitemapUrls);
  }

  // Add manual URLs
  if (config.urls && config.urls.length > 0) {
    urls.push(...config.urls);
  }

  // Deduplicate
  urls = [...new Set(urls)];

  // Apply exclude patterns
  const excludePatterns = config.exclude_patterns ?? DEFAULT_EXCLUDE_PATTERNS;
  urls = filterUrls(urls, excludePatterns);

  // Apply max pages limit
  const maxPages = config.max_pages ?? DEFAULT_MAX_PAGES;
  if (urls.length > maxPages) {
    urls = urls.slice(0, maxPages);
  }

  return urls;
}

/**
 * Filter out URLs that have already been imported
 */
export async function filterNewUrls(urls: string[]): Promise<{
  newUrls: string[];
  existingUrls: string[];
}> {
  if (urls.length === 0) {
    return { newUrls: [], existingUrls: [] };
  }

  // Query existing proposed docs by source_url
  const { data: existing } = await supabase
    .from("kb_proposed_docs")
    .select("source_url")
    .eq("source", "website")
    .in("source_url", urls);

  const existingSet = new Set(existing?.map((d) => d.source_url) ?? []);

  const newUrls = urls.filter((url) => !existingSet.has(url));
  const existingUrls = urls.filter((url) => existingSet.has(url));

  return { newUrls, existingUrls };
}

/**
 * Preview website import (discover and filter URLs without processing)
 */
export async function previewWebsiteImport(config: WebsiteImportConfig): Promise<{
  allUrls: string[];
  newUrls: string[];
  existingUrls: string[];
}> {
  const allUrls = await discoverUrls(config);
  const { newUrls, existingUrls } = await filterNewUrls(allUrls);

  return {
    allUrls,
    newUrls,
    existingUrls,
  };
}

/**
 * Progress callback type
 */
export type ImportProgressCallback = (progress: {
  phase: "fetching" | "analyzing" | "creating";
  current: number;
  total: number;
  currentUrl?: string;
}) => void;

/**
 * Run the full website import
 */
export async function runWebsiteImport(
  config: WebsiteImportConfig,
  urls?: string[],
  onProgress?: ImportProgressCallback
): Promise<{
  job: ImportJob;
  created: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  // Create import job
  const job = await createImportJob({
    source: "website",
    config,
  });

  try {
    // Start the job
    await startImportJob(job.id);

    // Get URLs to process
    const urlsToProcess = urls ?? (await discoverUrls(config));

    // Filter out already-imported URLs
    const { newUrls } = await filterNewUrls(urlsToProcess);

    // Update total items
    await updateImportJob(job.id, {
      total_items: newUrls.length,
    });

    if (newUrls.length === 0) {
      await completeImportJob(job.id);
      return { job, created: 0, skipped: urlsToProcess.length - newUrls.length, errors };
    }

    // Phase 1: Fetch pages
    const pages: PageContent[] = [];
    for (let i = 0; i < newUrls.length; i++) {
      const url = newUrls[i];

      if (onProgress) {
        onProgress({
          phase: "fetching",
          current: i + 1,
          total: newUrls.length,
          currentUrl: url,
        });
      }

      const page = await fetchPage(url, config.content_selector);

      if (page.error) {
        errors.push(`Failed to fetch ${url}: ${page.error}`);
        skipped++;
      } else if (page.wordCount < 50) {
        skipped++;
      } else {
        pages.push(page);
      }

      // Rate limiting
      if (i < newUrls.length - 1) {
        await sleep(RATE_LIMIT_MS);
      }
    }

    // Phase 2 & 3: Analyze and create proposed docs
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];

      if (onProgress) {
        onProgress({
          phase: "analyzing",
          current: i + 1,
          total: pages.length,
          currentUrl: page.url,
        });
      }

      try {
        // Run LLM analysis
        const { analysis, confidence } = await analyzeDocument(page.title, page.body);

        // Resolve category ID from slug
        let categoryId: string | undefined;
        if (analysis.suggested_category) {
          const category = await getCategoryBySlug(analysis.suggested_category);
          categoryId = category?.id;
        }

        if (onProgress) {
          onProgress({
            phase: "creating",
            current: i + 1,
            total: pages.length,
            currentUrl: page.url,
          });
        }

        // Create proposed doc
        await createProposedDoc({
          import_job_id: job.id,
          source: "website",
          source_url: page.url,
          title: page.title,
          body: page.body,
          suggested_category_id: categoryId,
          suggested_intent_tags: analysis.intent_tags,
          suggested_vehicle_tags: analysis.vehicle_tags,
          suggested_product_tags: analysis.product_tags,
          categorization_confidence: confidence,
          content_quality_score: analysis.content_quality,
          llm_analysis: analysis,
        });

        created++;

        // Update job progress
        await updateImportJob(job.id, {
          processed_items: i + 1,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Failed to process ${page.url}: ${message}`);
        skipped++;
      }
    }

    // Complete the job
    await completeImportJob(job.id);

    // Get updated job
    const updatedJob = await getUpdatedJob(job.id);

    return {
      job: updatedJob ?? job,
      created,
      skipped,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await failImportJob(job.id, message);
    throw err;
  }
}

/**
 * Import a single page (for testing or manual import)
 */
export async function importSinglePage(
  url: string,
  config?: Partial<WebsiteImportConfig>
): Promise<{
  success: boolean;
  proposedDocId?: string;
  error?: string;
}> {
  try {
    // Check if already imported
    const { newUrls } = await filterNewUrls([url]);
    if (newUrls.length === 0) {
      return { success: false, error: "URL already imported" };
    }

    // Fetch page
    const page = await fetchPage(url, config?.content_selector);
    if (page.error) {
      return { success: false, error: page.error };
    }
    if (page.wordCount < 50) {
      return { success: false, error: "Page has insufficient content" };
    }

    // Analyze
    const { analysis, confidence } = await analyzeDocument(page.title, page.body);

    // Resolve category ID from slug
    let categoryId: string | undefined;
    if (analysis.suggested_category) {
      const category = await getCategoryBySlug(analysis.suggested_category);
      categoryId = category?.id;
    }

    // Create proposed doc (without job)
    const doc = await createProposedDoc({
      source: "website",
      source_url: url,
      title: page.title,
      body: page.body,
      suggested_category_id: categoryId,
      suggested_intent_tags: analysis.intent_tags,
      suggested_vehicle_tags: analysis.vehicle_tags,
      suggested_product_tags: analysis.product_tags,
      categorization_confidence: confidence,
      content_quality_score: analysis.content_quality,
      llm_analysis: analysis,
    });

    return { success: true, proposedDocId: doc.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Helper to get updated job
 */
async function getUpdatedJob(jobId: string): Promise<ImportJob | null> {
  const { data } = await supabase
    .from("kb_import_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  return data;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
