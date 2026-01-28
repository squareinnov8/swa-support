/**
 * HubSpot Ticket Sync
 *
 * Syncs support threads to HubSpot tickets with full activity history.
 * Each thread maps to one HubSpot ticket, and activities are logged as notes.
 */

import {
  createTicket,
  updateTicket,
  getContactByEmail,
  createContact,
  isHubSpotConfigured,
} from "./client";
import { supabase } from "@/lib/db";

// Map thread states to HubSpot pipeline stages
const STATE_TO_STAGE: Record<string, string> = {
  NEW: "1",
  AWAITING_INFO: "2",
  IN_PROGRESS: "3",
  HUMAN_HANDLING: "3",
  ESCALATED: "3",
  RESOLVED: "4",
};

// Activity types that can be synced to HubSpot
export type TicketActivity =
  | { type: "message"; direction: "inbound" | "outbound"; from: string; body: string; timestamp?: Date }
  | { type: "state_change"; from: string; to: string; reason?: string; timestamp?: Date }
  | { type: "admin_decision"; tool: string; summary: string; admin: string; timestamp?: Date }
  | { type: "escalation"; reason: string; timestamp?: Date }
  | { type: "promised_action"; promises: string[]; timestamp?: Date };

export interface SyncResult {
  success: boolean;
  ticketId?: string;
  contactId?: string;
  error?: string;
}

/**
 * Create a HubSpot ticket for a thread
 */
export async function createTicketForThread(params: {
  threadId: string;
  subject: string;
  customerEmail: string;
  state: string;
  initialMessage?: string;
}): Promise<SyncResult> {
  if (!isHubSpotConfigured()) {
    return { success: false, error: "HubSpot not configured" };
  }

  const { threadId, subject, customerEmail, state, initialMessage } = params;

  try {
    // Check if ticket already exists
    const { data: thread } = await supabase
      .from("threads")
      .select("hubspot_ticket_id, hubspot_contact_id")
      .eq("id", threadId)
      .single();

    if (thread?.hubspot_ticket_id) {
      return {
        success: true,
        ticketId: thread.hubspot_ticket_id,
        contactId: thread.hubspot_contact_id || undefined,
      };
    }

    // Find or create HubSpot contact
    let contact = await getContactByEmail(customerEmail);
    if (!contact) {
      console.log(`[HubSpot] Creating contact for ${customerEmail}`);
      contact = await createContact({ email: customerEmail });
    }

    const contactId = contact.id;

    // Create the ticket
    const stageId = STATE_TO_STAGE[state] || "1";
    const priority = state === "ESCALATED" ? "HIGH" : "MEDIUM";

    const ticket = await createTicket(
      {
        subject: subject || "(no subject)",
        content: initialMessage?.slice(0, 500) || "",
        hs_pipeline: "0", // Support Pipeline
        hs_pipeline_stage: stageId,
        hs_ticket_priority: priority,
        source_type: "EMAIL",
      },
      contactId
    );

    // Save IDs to thread
    await supabase
      .from("threads")
      .update({
        hubspot_ticket_id: ticket.id,
        hubspot_contact_id: contactId,
      })
      .eq("id", threadId);

    console.log(`[HubSpot] Created ticket ${ticket.id} for thread ${threadId}`);

    return {
      success: true,
      ticketId: ticket.id,
      contactId,
    };
  } catch (error) {
    console.error("[HubSpot] Failed to create ticket:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update HubSpot ticket stage when thread state changes
 */
export async function updateTicketStage(
  threadId: string,
  newState: string,
  reason?: string
): Promise<void> {
  if (!isHubSpotConfigured()) return;

  try {
    const { data: thread } = await supabase
      .from("threads")
      .select("hubspot_ticket_id, state")
      .eq("id", threadId)
      .single();

    if (!thread?.hubspot_ticket_id) {
      console.log(`[HubSpot] No ticket found for thread ${threadId}, skipping stage update`);
      return;
    }

    const stageId = STATE_TO_STAGE[newState] || "1";
    const priority = newState === "ESCALATED" ? "HIGH" : undefined;

    const updateProps: Record<string, string> = {
      hs_pipeline_stage: stageId,
    };
    if (priority) {
      updateProps.hs_ticket_priority = priority;
    }

    await updateTicket(thread.hubspot_ticket_id, updateProps);

    // Also add a note about the state change
    if (thread.state && thread.state !== newState) {
      await addActivityNote(threadId, {
        type: "state_change",
        from: thread.state,
        to: newState,
        reason,
      });
    }

    console.log(`[HubSpot] Updated ticket ${thread.hubspot_ticket_id} to stage ${stageId}`);
  } catch (error) {
    console.error("[HubSpot] Failed to update ticket stage:", error);
  }
}

/**
 * Add an activity note to the HubSpot ticket
 */
export async function addActivityNote(
  threadId: string,
  activity: TicketActivity
): Promise<void> {
  if (!isHubSpotConfigured()) return;

  try {
    const { data: thread } = await supabase
      .from("threads")
      .select("hubspot_ticket_id, hubspot_contact_id")
      .eq("id", threadId)
      .single();

    if (!thread?.hubspot_ticket_id || !thread?.hubspot_contact_id) {
      console.log(`[HubSpot] No ticket/contact for thread ${threadId}, skipping note`);
      return;
    }

    const noteBody = formatActivityNote(activity);

    // Use the engagements API to add a note associated with the ticket
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) return;

    const timestamp = activity.timestamp ? activity.timestamp.getTime() : Date.now();

    await fetch("https://api.hubapi.com/engagements/v1/engagements", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        engagement: {
          active: true,
          type: "NOTE",
          timestamp,
        },
        associations: {
          contactIds: [parseInt(thread.hubspot_contact_id, 10)],
          companyIds: [],
          dealIds: [],
          ticketIds: [parseInt(thread.hubspot_ticket_id, 10)],
        },
        metadata: {
          body: noteBody,
        },
      }),
    });

    console.log(`[HubSpot] Added ${activity.type} note to ticket ${thread.hubspot_ticket_id}`);
  } catch (error) {
    console.error("[HubSpot] Failed to add activity note:", error);
  }
}

/**
 * Format an activity into a readable note
 */
function formatActivityNote(activity: TicketActivity): string {
  switch (activity.type) {
    case "message":
      if (activity.direction === "inbound") {
        return `📥 Customer Message\n\nFrom: ${activity.from}\n---\n${activity.body}`;
      } else {
        return `📤 Lina Response\n\nTo: ${activity.from}\n---\n${activity.body}`;
      }

    case "state_change":
      return `🔄 Status Changed\n\n${activity.from} → ${activity.to}${activity.reason ? `\nReason: ${activity.reason}` : ""}`;

    case "admin_decision":
      return `👤 Admin Action (${activity.admin})\n\nTool: ${activity.tool}\nAction: ${activity.summary}`;

    case "escalation":
      return `⚠️ Escalated to Human\n\nReason: ${activity.reason}`;

    case "promised_action":
      return `📋 Commitments Detected\n\n${activity.promises.map((p) => `• ${p}`).join("\n")}`;

    default:
      return "Activity logged";
  }
}

/**
 * Sync an existing thread to HubSpot (for backfill)
 * Creates ticket and adds all historical activities
 */
export async function syncExistingThread(threadId: string): Promise<SyncResult> {
  if (!isHubSpotConfigured()) {
    return { success: false, error: "HubSpot not configured" };
  }

  try {
    // Get thread details
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return { success: false, error: "Thread not found" };
    }

    // Get customer email from messages
    const { data: firstMessage } = await supabase
      .from("messages")
      .select("from_email")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!firstMessage?.from_email) {
      return { success: false, error: "No customer email found" };
    }

    // Create ticket if needed
    const ticketResult = await createTicketForThread({
      threadId,
      subject: thread.subject || "(no subject)",
      customerEmail: firstMessage.from_email,
      state: thread.state,
    });

    if (!ticketResult.success) {
      return ticketResult;
    }

    // Get all messages
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    // Get all events
    const { data: events } = await supabase
      .from("events")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    // Get all admin decisions
    const { data: decisions } = await supabase
      .from("lina_tool_actions")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    // Combine and sort all activities by timestamp
    const activities: Array<{ timestamp: Date; activity: TicketActivity }> = [];

    // Add messages
    for (const msg of messages || []) {
      if (msg.role === "draft") continue; // Skip drafts
      activities.push({
        timestamp: new Date(msg.created_at),
        activity: {
          type: "message",
          direction: msg.direction as "inbound" | "outbound",
          from: msg.direction === "inbound" ? msg.from_email : "lina@squarewheelsauto.com",
          body: (msg.body_text || "").slice(0, 1000),
          timestamp: new Date(msg.created_at),
        },
      });
    }

    // Add events (state changes, promised actions)
    for (const event of events || []) {
      const payload = event.payload as Record<string, unknown>;

      if (event.type === "auto_triage" && payload?.stateTransition) {
        const transition = payload.stateTransition as { from: string; to: string; reason?: string };
        if (transition.from !== transition.to) {
          activities.push({
            timestamp: new Date(event.created_at),
            activity: {
              type: "state_change",
              from: transition.from,
              to: transition.to,
              reason: transition.reason,
              timestamp: new Date(event.created_at),
            },
          });
        }
      }

      if (event.type === "promised_action" && payload?.promises) {
        const promises = payload.promises as Array<{ description: string }>;
        activities.push({
          timestamp: new Date(event.created_at),
          activity: {
            type: "promised_action",
            promises: promises.map((p) => p.description),
            timestamp: new Date(event.created_at),
          },
        });
      }
    }

    // Add admin decisions
    for (const decision of decisions || []) {
      const result = decision.result as { success?: boolean };
      if (!result?.success) continue;

      activities.push({
        timestamp: new Date(decision.created_at),
        activity: {
          type: "admin_decision",
          tool: decision.tool_name,
          summary: summarizeToolAction(decision.tool_name, decision.tool_input),
          admin: decision.admin_email,
          timestamp: new Date(decision.created_at),
        },
      });
    }

    // Sort by timestamp
    activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Add notes with small delays to maintain order
    for (const { activity } of activities) {
      await addActivityNote(threadId, activity);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay for rate limiting
    }

    console.log(`[HubSpot] Synced thread ${threadId} with ${activities.length} activities`);

    return {
      success: true,
      ticketId: ticketResult.ticketId,
      contactId: ticketResult.contactId,
    };
  } catch (error) {
    console.error("[HubSpot] Failed to sync existing thread:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Summarize a tool action for display
 */
function summarizeToolAction(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  switch (toolName) {
    case "draft_relay_response":
      return `Drafted response to customer`;
    case "create_kb_article":
      return `Created KB article: ${toolInput.title || "Untitled"}`;
    case "update_instruction":
      return `Updated ${toolInput.section || "agent"} instructions`;
    case "lookup_order":
      return `Looked up order #${toolInput.order_number}`;
    case "associate_thread_customer":
      return `Associated thread with customer ${toolInput.customer_email}`;
    case "return_thread_to_agent":
      return `Returned thread to agent: ${toolInput.reason || ""}`;
    case "note_feedback":
      return `Noted feedback: ${(toolInput.summary as string)?.slice(0, 100) || ""}`;
    default:
      return `Executed ${toolName}`;
  }
}
