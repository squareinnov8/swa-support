/**
 * Observations API
 *
 * Manage observation mode for threads (human takeover)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import {
  enterObservationMode,
  exitObservationMode,
  getActiveObservation,
} from "@/lib/collaboration";
import type { InterventionSignal, ObservationResolution } from "@/lib/collaboration/types";

/**
 * GET /api/admin/observations
 * Get active observation for a thread or list all active observations
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");

  if (threadId) {
    // Get specific thread's observation
    const observation = await getActiveObservation(threadId);
    return NextResponse.json({ observation });
  }

  // List all active observations
  const { data: observations, error } = await supabase
    .from("intervention_observations")
    .select(`
      id,
      thread_id,
      human_handler,
      intervention_channel,
      intervention_start,
      observed_messages,
      threads!inner (
        subject,
        state,
        last_intent
      )
    `)
    .is("intervention_end", null)
    .order("intervention_start", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ observations });
}

/**
 * POST /api/admin/observations
 * Enter observation mode for a thread
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, handler = "admin" } = body;

    if (!threadId) {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }

    // Get thread info
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("id, gmail_thread_id, human_handling_mode")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    if (thread.human_handling_mode) {
      return NextResponse.json({ error: "Thread is already in observation mode" }, { status: 400 });
    }

    // Enter observation mode
    const signal: InterventionSignal = {
      type: "admin_takeover",
      threadId,
      gmailThreadId: thread.gmail_thread_id || undefined,
      timestamp: new Date(),
      handler,
      channel: "admin_ui",
    };

    const result = await enterObservationMode(signal);

    return NextResponse.json({
      success: true,
      observationId: result.observationId,
      message: `Observation mode started for thread ${threadId}`,
    });
  } catch (err) {
    console.error("Error entering observation mode:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to enter observation mode" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/observations
 * Exit observation mode for a thread
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      threadId,
      resolutionType = "resolved",
      resolutionSummary = "",
      questionsAsked = [],
      troubleshootingSteps = [],
      newInformation = [],
    } = body;

    if (!threadId) {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }

    // Check thread is in observation mode
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("human_handling_mode")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    if (!thread.human_handling_mode) {
      return NextResponse.json({ error: "Thread is not in observation mode" }, { status: 400 });
    }

    // Exit observation mode
    const resolution: ObservationResolution = {
      resolutionType,
      resolutionSummary,
      questionsAsked,
      troubleshootingSteps,
      newInformation,
    };

    const result = await exitObservationMode(threadId, resolution);

    return NextResponse.json({
      success: true,
      observationId: result.observationId,
      message: `Observation mode ended for thread ${threadId}`,
    });
  } catch (err) {
    console.error("Error exiting observation mode:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to exit observation mode" },
      { status: 500 }
    );
  }
}
