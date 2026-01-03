/**
 * Notion Fetch API
 *
 * POST: Start fetching pages from Notion
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runNotionImport,
  previewNotionImport,
  isInternalIntegration,
  getInternalToken,
} from "@/lib/import/notion";
import type { NotionImportConfig } from "@/lib/import/types";

export async function POST(request: NextRequest) {
  try {
    // Get token - either from internal integration or cookie (OAuth)
    let token: string | null = null;

    if (isInternalIntegration()) {
      token = getInternalToken();
    } else {
      token = request.cookies.get("notion_token")?.value ?? null;
    }

    if (!token) {
      return NextResponse.json(
        { error: "Not connected to Notion. Please connect first." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const mode = body.mode ?? "import"; // 'preview' or 'import'

    const config: NotionImportConfig = {
      database_ids: body.database_ids,
      page_ids: body.page_ids,
      include_children: body.include_children ?? true,
    };

    if (mode === "preview") {
      // Skip LLM analysis if OPENAI_API_KEY is not configured
      const skipAnalysis = !process.env.OPENAI_API_KEY;
      const preview = await previewNotionImport(token, config, body.limit ?? 10, skipAnalysis);

      // Add a note if analysis was skipped
      if (skipAnalysis) {
        return NextResponse.json({
          ...preview,
          note: "LLM analysis skipped - add OPENAI_API_KEY to enable categorization",
        });
      }

      return NextResponse.json(preview);
    }

    // Full import requires LLM
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "LLM not configured - OPENAI_API_KEY required for import" },
        { status: 500 }
      );
    }

    // Run full import
    const result = await runNotionImport(token, config);

    return NextResponse.json({
      jobId: result.job.id,
      status: result.job.status,
      totalFetched: result.totalFetched,
      totalProcessed: result.totalProcessed,
      totalCreated: result.totalCreated,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch from Notion";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
