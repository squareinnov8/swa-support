/**
 * Single Proposed Doc API
 *
 * GET: Get doc with full details
 * PUT: Update doc before approval
 * POST: Approve or reject
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getProposedDocWithCategory,
  updateProposedDoc,
  approveProposedDoc,
  rejectProposedDoc,
} from "@/lib/import/review";
import { getConfidenceBreakdown } from "@/lib/import/confidence";
import type { LLMAnalysisResult } from "@/lib/import/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const doc = await getProposedDocWithCategory(id);

    if (!doc) {
      return NextResponse.json({ error: "Proposed doc not found" }, { status: 404 });
    }

    // Get confidence breakdown if analysis exists
    let confidenceBreakdown = null;
    if (doc.llm_analysis) {
      confidenceBreakdown = getConfidenceBreakdown(doc.llm_analysis as LLMAnalysisResult);
    }

    return NextResponse.json({
      doc,
      confidenceBreakdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch proposed doc";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const doc = await getProposedDocWithCategory(id);
    if (!doc) {
      return NextResponse.json({ error: "Proposed doc not found" }, { status: 404 });
    }

    // Only allow editing pending docs
    if (doc.status !== "pending") {
      return NextResponse.json(
        { error: "Can only edit pending documents" },
        { status: 400 }
      );
    }

    const updatedDoc = await updateProposedDoc(id, {
      title: body.title,
      body: body.body,
      suggested_category_id: body.suggested_category_id,
      suggested_intent_tags: body.suggested_intent_tags,
      suggested_vehicle_tags: body.suggested_vehicle_tags,
      suggested_product_tags: body.suggested_product_tags,
    });

    return NextResponse.json({ doc: updatedDoc });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update proposed doc";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const doc = await getProposedDocWithCategory(id);
    if (!doc) {
      return NextResponse.json({ error: "Proposed doc not found" }, { status: 404 });
    }

    if (doc.status !== "pending") {
      return NextResponse.json(
        { error: "Document has already been reviewed" },
        { status: 400 }
      );
    }

    if (body.action === "approve") {
      const result = await approveProposedDoc({
        id,
        title: body.title,
        body: body.body,
        category_id: body.category_id,
        intent_tags: body.intent_tags,
        vehicle_tags: body.vehicle_tags,
        product_tags: body.product_tags,
        reviewed_by: body.reviewed_by ?? "admin",
      });

      return NextResponse.json({
        action: "approved",
        proposedDoc: result.proposedDoc,
        publishedDocId: result.publishedDocId,
      });
    } else if (body.action === "reject") {
      const result = await rejectProposedDoc({
        id,
        review_notes: body.review_notes,
        reviewed_by: body.reviewed_by ?? "admin",
      });

      return NextResponse.json({
        action: "rejected",
        proposedDoc: result,
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to review proposed doc";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
