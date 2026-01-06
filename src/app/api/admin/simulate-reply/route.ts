/**
 * Simulate Customer Reply API
 *
 * Adds a follow-up message to an existing thread and re-runs the triage pipeline.
 * Used for testing conversation flows without real email.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { processIngestRequest } from "@/lib/ingest/processRequest";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, body_text, from_email } = body;

    if (!thread_id || !body_text) {
      return NextResponse.json(
        { error: "thread_id and body_text are required" },
        { status: 400 }
      );
    }

    // Get the existing thread
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("id, external_thread_id, subject, channel")
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Process the reply through the ingest pipeline
    // This will add the message and re-run classification/draft generation
    const result = await processIngestRequest({
      external_id: thread.external_thread_id || thread.id, // Use existing thread ID for matching
      subject: thread.subject || "(no subject)",
      body_text,
      from_identifier: from_email || "customer@test.com",
      channel: "web_form", // Mark as web form for testing
      metadata: {
        simulated: true,
        original_channel: thread.channel,
      },
    });

    return NextResponse.json({
      success: true,
      thread_id: result.thread_id,
      intent: result.intent,
      confidence: result.confidence,
      action: result.action,
      draft: result.draft,
      state: result.state,
      previous_state: result.previous_state,
    });
  } catch (error) {
    console.error("Simulate reply error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
