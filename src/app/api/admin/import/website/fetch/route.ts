/**
 * Website Fetch API
 *
 * POST: Start website import - fetch, analyze, and create proposed docs
 */

import { NextRequest, NextResponse } from "next/server";
import { runWebsiteImport } from "@/lib/import/website/batch";
import type { WebsiteImportConfig } from "@/lib/import/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Build config from request
    const config: WebsiteImportConfig = {
      sitemap_url: body.sitemap_url,
      base_url: body.base_url,
      urls: body.urls,
      content_selector: body.content_selector,
      exclude_patterns: body.exclude_patterns,
      max_pages: body.max_pages,
    };

    // URLs to process - either from request or will be discovered from sitemap
    const urls: string[] | undefined = body.selected_urls;

    // Validate - must have either sitemap_url, urls in config, or selected_urls
    if (!config.sitemap_url && (!config.urls || config.urls.length === 0) && (!urls || urls.length === 0)) {
      return NextResponse.json(
        { error: "Must provide sitemap_url, urls, or selected_urls" },
        { status: 400 }
      );
    }

    // Run the import
    const result = await runWebsiteImport(config, urls);

    return NextResponse.json({
      job_id: result.job.id,
      status: result.job.status,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import website";
    console.error("Website import error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
