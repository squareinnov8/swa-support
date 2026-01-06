/**
 * Single Import Job API
 *
 * GET: Get job status and details
 * DELETE: Cancel/delete a job
 */

import { NextRequest, NextResponse } from "next/server";
import { getImportJob, updateImportJob, getProposedDocs } from "@/lib/import/review";
import { getReviewStats } from "@/lib/import/confidence";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const job = await getImportJob(id);

    if (!job) {
      return NextResponse.json({ error: "Import job not found" }, { status: 404 });
    }

    // Get proposed docs for this job
    const docs = await getProposedDocs({ import_job_id: id });
    const stats = getReviewStats(docs);

    return NextResponse.json({
      job,
      docs,
      stats: {
        ...stats,
        pending: docs.filter((d) => d.status === "pending").length,
        approved: docs.filter((d) => d.status === "approved").length,
        rejected: docs.filter((d) => d.status === "rejected").length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch import job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const job = await getImportJob(id);

    if (!job) {
      return NextResponse.json({ error: "Import job not found" }, { status: 404 });
    }

    // Only allow canceling pending or running jobs
    if (job.status === "completed" || job.status === "failed") {
      return NextResponse.json(
        { error: "Cannot cancel completed or failed job" },
        { status: 400 }
      );
    }

    const updatedJob = await updateImportJob(id, {
      status: "failed",
      error_message: "Cancelled by user",
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ job: updatedJob });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to cancel import job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
