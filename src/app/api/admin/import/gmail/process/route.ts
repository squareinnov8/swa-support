/**
 * Gmail Process API
 *
 * POST: Process selected threads
 */

import { NextRequest, NextResponse } from "next/server";
import {
  processSelectedThreads,
  previewGmailImport,
  type GmailTokens,
} from "@/lib/import/gmail";
import type { GmailImportConfig } from "@/lib/import/types";

export async function POST(request: NextRequest) {
  try {
    const tokensJson = request.cookies.get("gmail_tokens")?.value;
    if (!tokensJson) {
      return NextResponse.json(
        { error: "Not connected to Gmail. Please connect first." },
        { status: 401 }
      );
    }

    const tokens: GmailTokens = JSON.parse(tokensJson);
    const body = await request.json();

    const mode = body.mode ?? "process"; // 'preview' or 'process'

    if (mode === "preview") {
      const config: GmailImportConfig = {
        query: body.query,
        labels: body.labels,
        date_range: body.date_range,
      };

      const preview = await previewGmailImport(tokens, config, body.limit ?? 5);
      return NextResponse.json(preview);
    }

    // Process selected threads for a job
    if (!body.job_id) {
      return NextResponse.json(
        { error: "job_id required for processing" },
        { status: 400 }
      );
    }

    const result = await processSelectedThreads(tokens, body.job_id);

    return NextResponse.json({
      jobId: result.job.id,
      status: result.job.status,
      totalThreads: result.totalThreads,
      totalProcessed: result.totalProcessed,
      totalCreated: result.totalCreated,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process Gmail threads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
