/**
 * Import Jobs API
 *
 * GET: List all import jobs
 * POST: Create a new import job
 */

import { NextRequest, NextResponse } from "next/server";
import { createImportJob, getImportJobs } from "@/lib/import/review";
import type { ImportSource, ImportJobStatus, CreateImportJobInput } from "@/lib/import/types";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const source = searchParams.get("source") as ImportSource | null;
    const status = searchParams.get("status") as ImportJobStatus | null;

    const jobs = await getImportJobs({
      source: source ?? undefined,
      status: status ?? undefined,
    });

    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch import jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.source || !["notion", "gmail"].includes(body.source)) {
      return NextResponse.json(
        { error: "Invalid source. Must be 'notion' or 'gmail'" },
        { status: 400 }
      );
    }

    const input: CreateImportJobInput = {
      source: body.source,
      config: body.config ?? {},
    };

    const job = await createImportJob(input);

    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create import job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
