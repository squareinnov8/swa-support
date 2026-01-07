/**
 * Observation Mode
 *
 * Manages the observation state when a human takes over handling a thread.
 * Lina watches and learns from how the human resolves the issue.
 */

import { supabase } from "@/lib/db";
import type {
  InterventionSignal,
  InterventionChannel,
  ObservedMessage,
  ObservationResolution,
  ResolutionType,
} from "./types";

const SUPPORT_INTERVENTION_LABEL = "support-intervention";

/**
 * Enter observation mode for a thread
 *
 * 1. Update thread state to HUMAN_HANDLING
 * 2. Create intervention_observations record
 * 3. Apply Gmail label (if Gmail thread)
 * 4. Log event
 */
export async function enterObservationMode(
  signal: InterventionSignal
): Promise<{ observationId: string }> {
  const now = new Date().toISOString();

  // 1. Update thread to human handling mode
  await supabase
    .from("threads")
    .update({
      state: "HUMAN_HANDLING",
      human_handling_mode: true,
      human_handler: signal.handler,
      human_handling_started_at: now,
      updated_at: now,
    })
    .eq("id", signal.threadId);

  // 2. Add Gmail label if applicable (using RPC for array append)
  if (signal.gmailThreadId) {
    try {
      await supabase.rpc("append_gmail_label", {
        p_thread_id: signal.threadId,
        p_label: SUPPORT_INTERVENTION_LABEL,
      });
    } catch {
      // RPC may not exist yet, just log it
      console.log(`[Observation] Could not append Gmail label via RPC`);
    }
  }

  // 2. Create observation record
  const { data: observation, error } = await supabase
    .from("intervention_observations")
    .insert({
      thread_id: signal.threadId,
      intervention_start: signal.timestamp.toISOString(),
      human_handler: signal.handler,
      intervention_channel: signal.channel,
      observed_messages: signal.content
        ? [
            {
              direction: "outbound",
              from: signal.handler,
              content: signal.content,
              timestamp: signal.timestamp.toISOString(),
            },
          ]
        : [],
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create observation:", error);
    throw new Error(`Failed to create observation: ${error.message}`);
  }

  // 3. Log event
  await supabase.from("events").insert({
    thread_id: signal.threadId,
    type: "HUMAN_INTERVENTION_STARTED",
    payload: {
      handler: signal.handler,
      channel: signal.channel,
      observation_id: observation.id,
      signal_type: signal.type,
    },
  });

  console.log(
    `[Observation] Entered observation mode for thread ${signal.threadId}, handler: ${signal.handler}`
  );

  return { observationId: observation.id };
}

/**
 * Record a message during observation
 */
export async function recordObservation(
  threadId: string,
  message: ObservedMessage
): Promise<void> {
  // Find active observation
  const { data: observation } = await supabase
    .from("intervention_observations")
    .select("id, observed_messages")
    .eq("thread_id", threadId)
    .is("intervention_end", null)
    .order("intervention_start", { ascending: false })
    .limit(1)
    .single();

  if (!observation) {
    console.warn(`No active observation for thread ${threadId}`);
    return;
  }

  // Append message to observed_messages
  const messages = (observation.observed_messages as ObservedMessage[]) || [];
  messages.push({
    ...message,
    timestamp: message.timestamp,
  });

  await supabase
    .from("intervention_observations")
    .update({ observed_messages: messages })
    .eq("id", observation.id);

  console.log(
    `[Observation] Recorded ${message.direction} message for thread ${threadId}`
  );
}

/**
 * Exit observation mode and trigger learning
 */
export async function exitObservationMode(
  threadId: string,
  resolution: ObservationResolution
): Promise<{ observationId: string }> {
  const now = new Date().toISOString();

  // Find active observation
  const { data: observation, error: findError } = await supabase
    .from("intervention_observations")
    .select("*")
    .eq("thread_id", threadId)
    .is("intervention_end", null)
    .order("intervention_start", { ascending: false })
    .limit(1)
    .single();

  if (findError || !observation) {
    throw new Error(`No active observation found for thread ${threadId}`);
  }

  // Map resolution type to thread state
  const newState = mapResolutionToState(resolution.resolutionType);

  // Update observation with resolution
  await supabase
    .from("intervention_observations")
    .update({
      intervention_end: now,
      resolution_type: resolution.resolutionType,
      resolution_summary: resolution.resolutionSummary,
      questions_asked: resolution.questionsAsked,
      troubleshooting_steps: resolution.troubleshootingSteps,
      new_information_discovered: resolution.newInformation,
    })
    .eq("id", observation.id);

  // Update thread state
  await supabase
    .from("threads")
    .update({
      state: newState,
      human_handling_mode: false,
      updated_at: now,
    })
    .eq("id", threadId);

  // Log event
  await supabase.from("events").insert({
    thread_id: threadId,
    type: "HUMAN_INTERVENTION_ENDED",
    payload: {
      observation_id: observation.id,
      resolution_type: resolution.resolutionType,
      new_state: newState,
    },
  });

  console.log(
    `[Observation] Exited observation mode for thread ${threadId}, resolution: ${resolution.resolutionType}`
  );

  return { observationId: observation.id };
}

/**
 * Get active observation for a thread
 */
export async function getActiveObservation(
  threadId: string
): Promise<{
  id: string;
  handler: string;
  channel: InterventionChannel;
  startTime: Date;
  messageCount: number;
} | null> {
  const { data } = await supabase
    .from("intervention_observations")
    .select("id, human_handler, intervention_channel, intervention_start, observed_messages")
    .eq("thread_id", threadId)
    .is("intervention_end", null)
    .order("intervention_start", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    handler: data.human_handler,
    channel: data.intervention_channel as InterventionChannel,
    startTime: new Date(data.intervention_start),
    messageCount: (data.observed_messages as unknown[])?.length || 0,
  };
}

/**
 * Check if thread is in observation mode
 */
export async function isInObservationMode(threadId: string): Promise<boolean> {
  const { data } = await supabase
    .from("threads")
    .select("human_handling_mode")
    .eq("id", threadId)
    .single();

  return data?.human_handling_mode === true;
}

/**
 * Map resolution type to thread state
 */
function mapResolutionToState(resolutionType: ResolutionType): string {
  switch (resolutionType) {
    case "resolved":
      return "RESOLVED";
    case "escalated_further":
      return "ESCALATED";
    case "returned_to_agent":
      return "IN_PROGRESS";
    case "transferred":
      return "ESCALATED";
    default:
      return "RESOLVED";
  }
}
