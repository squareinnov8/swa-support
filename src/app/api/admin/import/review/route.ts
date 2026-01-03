/**
 * Review Queue API
 *
 * GET: List pending docs for review
 * POST: Bulk approve/reject
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getProposedDocs,
  bulkReviewDocs,
  autoReviewDocs,
  getPendingDocsCount,
} from "@/lib/import/review";
import { sortForReview, getReviewStats } from "@/lib/import/confidence";
import type { ProposedDocStatus, ImportSource, BulkReviewAction } from "@/lib/import/types";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") as ProposedDocStatus | null;
    const jobId = searchParams.get("job_id");
    const source = searchParams.get("source") as ImportSource | null;
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const docs = await getProposedDocs(
      {
        status: status ?? undefined,
        import_job_id: jobId ?? undefined,
        source: source ?? undefined,
      },
      { limit, offset }
    );

    // Sort for review (attention-needed first)
    const sortedDocs = sortForReview(docs);

    // Get stats
    const allDocs = await getProposedDocs({ status: "pending" });
    const stats = getReviewStats(allDocs);
    const pendingCount = await getPendingDocsCount();

    return NextResponse.json({
      docs: sortedDocs,
      stats: {
        ...stats,
        pendingCount,
      },
      pagination: {
        limit,
        offset,
        total: docs.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch review queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle auto-review
    if (body.action === "auto_review") {
      const result = await autoReviewDocs({
        import_job_id: body.import_job_id,
      });
      return NextResponse.json(result);
    }

    // Handle bulk approve/reject
    if (!body.action || !["approve", "reject"].includes(body.action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve', 'reject', or 'auto_review'" },
        { status: 400 }
      );
    }

    if (!body.doc_ids || !Array.isArray(body.doc_ids) || body.doc_ids.length === 0) {
      return NextResponse.json(
        { error: "doc_ids must be a non-empty array" },
        { status: 400 }
      );
    }

    const bulkAction: BulkReviewAction = {
      action: body.action,
      doc_ids: body.doc_ids,
      reviewed_by: body.reviewed_by ?? "admin",
      review_notes: body.review_notes,
    };

    const result = await bulkReviewDocs(bulkAction);

    return NextResponse.json({
      successful: result.successful.length,
      failed: result.failed.length,
      details: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process bulk review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
