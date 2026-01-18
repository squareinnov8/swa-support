/**
 * Send Draft API
 *
 * POST /api/admin/send-draft
 *
 * Sends an approved draft to the customer via Gmail.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendApprovedDraft, canSendViaGmail } from "@/lib/gmail/sendDraft";
import { supabase } from "@/lib/db";

export async function POST(request: NextRequest) {
  // Verify admin session
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { thread_id, draft_text, draft_generation_id, was_edited, edit_distance } = body;

    // Validate required fields
    if (!thread_id || !draft_text) {
      return NextResponse.json(
        { error: "Missing required fields: thread_id, draft_text" },
        { status: 400 }
      );
    }

    // Check if thread exists and can send via Gmail
    const canSend = await canSendViaGmail(thread_id);
    if (!canSend) {
      return NextResponse.json(
        { error: "This thread cannot send via Gmail (no Gmail thread ID)" },
        { status: 400 }
      );
    }

    // Check if draft was already sent (prevent duplicates)
    if (draft_generation_id) {
      const { data: draft } = await supabase
        .from("draft_generations")
        .select("was_sent")
        .eq("id", draft_generation_id)
        .single();

      if (draft?.was_sent) {
        return NextResponse.json(
          { error: "This draft has already been sent" },
          { status: 400 }
        );
      }
    }

    // Send the draft
    const result = await sendApprovedDraft({
      threadId: thread_id,
      draftText: draft_text,
      draftGenerationId: draft_generation_id,
      wasEdited: was_edited || false,
      editDistance: edit_distance,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send draft" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      gmail_message_id: result.gmailMessageId,
    });
  } catch (error) {
    console.error("[API] send-draft error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
