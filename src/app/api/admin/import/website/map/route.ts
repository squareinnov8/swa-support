/**
 * Website Map API
 *
 * POST: Discover URLs from sitemap or manual list
 * Returns list of URLs with new/existing counts
 */

import { NextRequest, NextResponse } from "next/server";
import { previewWebsiteImport } from "@/lib/import/website/batch";
import type { WebsiteImportConfig } from "@/lib/import/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Build config from request
    const config: WebsiteImportConfig = {
      sitemap_url: body.sitemap_url,
      base_url: body.base_url,
      urls: body.urls,
      exclude_patterns: body.exclude_patterns,
      max_pages: body.max_pages,
    };

    // Validate - must have either sitemap_url or urls
    if (!config.sitemap_url && (!config.urls || config.urls.length === 0)) {
      return NextResponse.json(
        { error: "Must provide sitemap_url or urls" },
        { status: 400 }
      );
    }

    // Discover and filter URLs
    const result = await previewWebsiteImport(config);

    return NextResponse.json({
      total: result.allUrls.length,
      new_count: result.newUrls.length,
      existing_count: result.existingUrls.length,
      urls: result.allUrls,
      new_urls: result.newUrls,
      existing_urls: result.existingUrls,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to map website";
    console.error("Website map error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
