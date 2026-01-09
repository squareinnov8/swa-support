/**
 * Draft Feedback API
 *
 * Records human feedback on AI-generated drafts for training and evaluation.
 * Automatically integrates feedback into agent instructions.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { integrateFeedback } from "@/lib/instructions";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // Get current admin session
    const session = await getSession();
    const createdBy = session?.email || "admin";

    const body = await request.json();
    const {
      thread_id,
      event_id,
      draft_text,
      intent,
      rating,
      feedback_notes,
      edited_draft,
    } = body;

    if (!thread_id || !draft_text || !rating) {
      return NextResponse.json(
        { error: "thread_id, draft_text, and rating are required" },
        { status: 400 }
      );
    }

    if (!["approved", "rejected", "needs_edit"].includes(rating)) {
      return NextResponse.json(
        { error: "rating must be 'approved', 'rejected', or 'needs_edit'" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("draft_feedback")
      .insert({
        thread_id,
        event_id: event_id || null,
        draft_text,
        intent: intent || null,
        rating,
        feedback_notes: feedback_notes || null,
        edited_draft: edited_draft || null,
        created_by: createdBy,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Feedback insert error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Integrate feedback into instructions (for rejected/needs_edit with notes)
    let integrationResult = null;
    if (
      (rating === "rejected" || rating === "needs_edit") &&
      feedback_notes &&
      feedback_notes.trim()
    ) {
      integrationResult = await integrateFeedback({
        feedbackId: data.id,
        rating,
        feedbackNotes: feedback_notes,
        draftText: draft_text,
        intent,
      });

      if (integrationResult.success && integrationResult.updatedSections.length > 0) {
        console.log(
          `Feedback integrated into sections: ${integrationResult.updatedSections.join(", ")}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      feedback_id: data.id,
      integration: integrationResult
        ? {
            updated_sections: integrationResult.updatedSections,
            error: integrationResult.error,
          }
        : null,
    });
  } catch (error) {
    console.error("Draft feedback error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve feedback stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const intent = searchParams.get("intent");

    let query = supabase
      .from("draft_feedback")
      .select("rating, intent, created_at")
      .order("created_at", { ascending: false });

    if (intent) {
      query = query.eq("intent", intent);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate stats
    const stats = {
      total: data?.length || 0,
      approved: data?.filter((d) => d.rating === "approved").length || 0,
      rejected: data?.filter((d) => d.rating === "rejected").length || 0,
      needs_edit: data?.filter((d) => d.rating === "needs_edit").length || 0,
      by_intent: {} as Record<string, { approved: number; rejected: number; needs_edit: number }>,
    };

    // Group by intent
    data?.forEach((d) => {
      const i = d.intent || "unknown";
      if (!stats.by_intent[i]) {
        stats.by_intent[i] = { approved: 0, rejected: 0, needs_edit: 0 };
      }
      stats.by_intent[i][d.rating as keyof typeof stats.by_intent[string]]++;
    });

    return NextResponse.json({ stats, recent: data?.slice(0, 20) });
  } catch (error) {
    console.error("Feedback stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
