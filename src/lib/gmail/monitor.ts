/**
 * Gmail Monitoring Service
 *
 * Polls Gmail for new messages and processes them through the ingest pipeline.
 * Uses historyId for efficient incremental sync.
 */

import { supabase } from "@/lib/db";
import { createGmailClient, refreshTokenIfNeeded, type GmailTokens } from "@/lib/import/gmail/auth";
import { fetchThread, type GmailThread, type GmailMessage } from "@/lib/import/gmail/fetcher";
import { processIngestRequest } from "@/lib/ingest/processRequest";
import type { IngestRequest } from "@/lib/ingest/types";
import {
  createTicket,
  updateTicket,
  getContactByEmail,
  upsertContact,
  getRobOwnerId,
  addNoteToTicket,
  isHubSpotConfigured,
} from "@/lib/hubspot";
import {
  generateEscalationNotes,
  saveEscalationNotes,
  type EscalationContext,
} from "@/lib/escalation";

export type MonitorResult = {
  success: boolean;
  runId?: string;
  threadsChecked: number;
  newMessagesFound: number;
  draftsGenerated: number;
  ticketsCreated: number;
  ticketsUpdated: number;
  escalations: number;
  errors: string[];
};

type SyncState = {
  id: string;
  email_address: string;
  last_history_id: string | null;
  last_sync_at: string | null;
  sync_enabled: boolean;
  refresh_token: string | null;
  error_count: number;
};

/**
 * Run Gmail monitoring poll
 *
 * 1. Get sync state from database
 * 2. Fetch new messages using historyId
 * 3. Process each through ingest pipeline
 * 4. Create/update HubSpot tickets
 * 5. Handle escalations with rich notes
 *
 * @param options.fetchRecent - If true, fetch emails from last 2 days (for testing/initial setup)
 */
export async function runGmailMonitor(options?: { fetchRecent?: boolean }): Promise<MonitorResult> {
  const { fetchRecent = false } = options || {};
  const result: MonitorResult = {
    success: false,
    threadsChecked: 0,
    newMessagesFound: 0,
    draftsGenerated: 0,
    ticketsCreated: 0,
    ticketsUpdated: 0,
    escalations: 0,
    errors: [],
  };

  // Create poll run record
  const { data: pollRun, error: pollError } = await supabase
    .from("agent_poll_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (pollError) {
    result.errors.push(`Failed to create poll run: ${pollError.message}`);
    return result;
  }

  result.runId = pollRun.id;

  try {
    // Get sync state for support email
    const { data: syncState, error: stateError } = await supabase
      .from("gmail_sync_state")
      .select("*")
      .eq("email_address", "support@squarewheelsauto.com")
      .single();

    if (stateError || !syncState) {
      throw new Error("Gmail sync state not found. Run initial setup first.");
    }

    if (!syncState.sync_enabled) {
      throw new Error("Gmail sync is disabled");
    }

    if (!syncState.refresh_token) {
      throw new Error(
        "No refresh token stored. Re-authenticate Gmail at /admin/gmail-setup"
      );
    }

    // Get fresh tokens
    const tokens = await getValidTokens(syncState);

    // Fetch new messages
    const gmail = createGmailClient(tokens);
    const updates = await getNewMessages(gmail, syncState.last_history_id, fetchRecent);

    result.threadsChecked = updates.threadIds.size;

    // Process each updated thread
    for (const threadId of updates.threadIds) {
      try {
        const threadResult = await processGmailThread(tokens, threadId);

        if (threadResult.newMessage) {
          result.newMessagesFound++;
        }
        if (threadResult.draftGenerated) {
          result.draftsGenerated++;
        }
        if (threadResult.ticketCreated) {
          result.ticketsCreated++;
        }
        if (threadResult.ticketUpdated) {
          result.ticketsUpdated++;
        }
        if (threadResult.escalated) {
          result.escalations++;
        }
        if (threadResult.error) {
          result.errors.push(`Thread ${threadId}: ${threadResult.error}`);
        }
      } catch (err) {
        result.errors.push(
          `Thread ${threadId}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    // Update sync state
    await supabase
      .from("gmail_sync_state")
      .update({
        last_history_id: updates.newHistoryId,
        last_sync_at: new Date().toISOString(),
        error_count: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("email_address", "support@squarewheelsauto.com");

    // Update poll run
    await supabase
      .from("agent_poll_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        threads_checked: result.threadsChecked,
        new_messages_found: result.newMessagesFound,
        drafts_generated: result.draftsGenerated,
        tickets_created: result.ticketsCreated,
        tickets_updated: result.ticketsUpdated,
        escalations: result.escalations,
        history_id_start: syncState.last_history_id,
        history_id_end: updates.newHistoryId,
        error_message: result.errors.length > 0 ? result.errors.join("; ") : null,
      })
      .eq("id", pollRun.id);

    result.success = true;
    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(errorMessage);

    // Update poll run with error
    await supabase
      .from("agent_poll_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
      })
      .eq("id", pollRun.id);

    // Increment error count
    await supabase.rpc("increment_gmail_error_count", {
      p_email: "support@squarewheelsauto.com",
      p_error: errorMessage,
    });

    return result;
  }
}

/**
 * Get valid access tokens, refreshing if needed
 */
async function getValidTokens(syncState: SyncState): Promise<GmailTokens> {
  if (!syncState.refresh_token) {
    throw new Error("No refresh token available");
  }

  const tokens: GmailTokens = {
    access_token: "", // Will be refreshed
    refresh_token: syncState.refresh_token,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    token_type: "Bearer",
    expiry_date: 0, // Force refresh
  };

  return refreshTokenIfNeeded(tokens);
}

/**
 * Get new messages using Gmail History API
 *
 * @param fetchRecent - If true, fetch emails from last 2 days (bypasses historyId check)
 */
async function getNewMessages(
  gmail: ReturnType<typeof createGmailClient>,
  lastHistoryId: string | null,
  fetchRecent: boolean = false
): Promise<{ threadIds: Set<string>; newHistoryId: string }> {
  const threadIds = new Set<string>();

  // Get current profile for historyId
  const profile = await gmail.users.getProfile({ userId: "me" });
  const newHistoryId = profile.data.historyId || "0";

  // If fetchRecent is true, fetch emails from the last 2 days
  if (fetchRecent) {
    console.log("Fetching recent emails from last 2 days...");

    const response = await gmail.users.messages.list({
      userId: "me",
      q: "newer_than:2d",
      maxResults: 50,
    });

    for (const msg of response.data.messages || []) {
      if (msg.threadId) {
        threadIds.add(msg.threadId);
      }
    }

    console.log(`Found ${threadIds.size} threads from last 2 days`);
    return { threadIds, newHistoryId };
  }

  if (!lastHistoryId) {
    // First run - just capture current historyId, don't process old emails
    // This ensures we only track NEW messages going forward
    console.log(`Gmail monitor initialized. Starting from historyId: ${newHistoryId}`);
    console.log("No existing emails will be processed - only new messages from now on.");
    console.log("Use 'Fetch Recent' to pull the last 2 days of emails for testing.");

    // Return empty set - no threads to process on first run
    return { threadIds, newHistoryId };
  }

  // Use History API for incremental updates
  try {
    const response = await gmail.users.history.list({
      userId: "me",
      startHistoryId: lastHistoryId,
      historyTypes: ["messageAdded"],
    });

    for (const history of response.data.history || []) {
      for (const msg of history.messagesAdded || []) {
        if (msg.message?.threadId) {
          threadIds.add(msg.message.threadId);
        }
      }
    }

    const newHistoryId = response.data.historyId || lastHistoryId;
    return { threadIds, newHistoryId };
  } catch (err) {
    // History might be expired - full resync needed
    if ((err as { code?: number }).code === 404) {
      console.warn("Gmail history expired, doing full resync");
      return getNewMessages(gmail, null);
    }
    throw err;
  }
}

type ThreadProcessResult = {
  newMessage: boolean;
  draftGenerated: boolean;
  ticketCreated: boolean;
  ticketUpdated: boolean;
  escalated: boolean;
  error?: string;
};

/**
 * Process a single Gmail thread
 */
async function processGmailThread(
  tokens: GmailTokens,
  gmailThreadId: string
): Promise<ThreadProcessResult> {
  const result: ThreadProcessResult = {
    newMessage: false,
    draftGenerated: false,
    ticketCreated: false,
    ticketUpdated: false,
    escalated: false,
  };

  // Fetch full thread
  const thread = await fetchThread(tokens, gmailThreadId);
  if (!thread || thread.messages.length === 0) {
    return result;
  }

  // Find the latest customer message
  const latestIncoming = [...thread.messages]
    .reverse()
    .find((m) => m.isIncoming);

  if (!latestIncoming) {
    // No customer messages, skip
    return result;
  }

  // Check if we've already processed this message
  const { data: existingMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("channel_metadata->>gmail_message_id", latestIncoming.id)
    .maybeSingle();

  if (existingMessage) {
    // Already processed
    return result;
  }

  result.newMessage = true;

  // Check if thread exists in our system
  const { data: existingThread } = await supabase
    .from("threads")
    .select("id, hubspot_ticket_id, hubspot_contact_id, state")
    .eq("gmail_thread_id", gmailThreadId)
    .maybeSingle();

  // Build ingest request
  const ingestRequest: IngestRequest = {
    channel: "email",
    external_id: gmailThreadId,
    from_identifier: latestIncoming.from,
    to_identifier: latestIncoming.to[0],
    subject: thread.subject,
    body_text: latestIncoming.body,
    metadata: {
      gmail_thread_id: gmailThreadId,
      gmail_message_id: latestIncoming.id,
      gmail_date: latestIncoming.date.toISOString(),
    },
  };

  // Process through ingest pipeline
  const ingestResult = await processIngestRequest(ingestRequest);

  if (ingestResult.draft) {
    result.draftGenerated = true;
  }

  // Update thread with Gmail ID
  await supabase
    .from("threads")
    .update({
      gmail_thread_id: gmailThreadId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingestResult.thread_id);

  // Handle HubSpot integration
  if (isHubSpotConfigured()) {
    await handleHubSpotSync(
      ingestResult,
      thread,
      latestIncoming,
      existingThread,
      result
    );
  }

  return result;
}

/**
 * Handle HubSpot ticket creation/update and escalation
 */
async function handleHubSpotSync(
  ingestResult: Awaited<ReturnType<typeof processIngestRequest>>,
  thread: GmailThread,
  latestMessage: GmailMessage,
  existingThread: { id: string; hubspot_ticket_id: string | null; hubspot_contact_id: string | null; state: string } | null,
  result: ThreadProcessResult
): Promise<void> {
  // Get or create contact
  let contactId = existingThread?.hubspot_contact_id;
  if (!contactId) {
    const contact = await getContactByEmail(latestMessage.from);
    if (contact) {
      contactId = contact.id;
    } else {
      const newContact = await upsertContact(latestMessage.from, {
        email: latestMessage.from,
      });
      contactId = newContact.id;
    }

    // Store contact ID
    await supabase
      .from("threads")
      .update({ hubspot_contact_id: contactId })
      .eq("id", ingestResult.thread_id);
  }

  // Map agent action to ticket stage
  const stageMap: Record<string, string> = {
    ESCALATED: "escalated",
    AWAITING_INFO: "awaiting_customer",
    IN_PROGRESS: "in_progress",
    RESOLVED: "closed",
    NEW: "new",
  };

  const ticketStage = stageMap[ingestResult.state] || "in_progress";

  // Create or update ticket
  let ticketId = existingThread?.hubspot_ticket_id;

  if (!ticketId) {
    // Create new ticket
    const ticket = await createTicket(
      {
        subject: thread.subject,
        content: latestMessage.body.slice(0, 1000),
        hs_pipeline_stage: ticketStage,
        source_type: "EMAIL",
      },
      contactId
    );
    ticketId = ticket.id;
    result.ticketCreated = true;

    // Store ticket ID
    await supabase
      .from("threads")
      .update({ hubspot_ticket_id: ticketId })
      .eq("id", ingestResult.thread_id);
  } else {
    // Update existing ticket
    await updateTicket(ticketId, {
      hs_pipeline_stage: ticketStage,
    });
    result.ticketUpdated = true;
  }

  // Handle escalation
  if (ingestResult.action === "ESCALATE" || ingestResult.action === "ESCALATE_WITH_DRAFT") {
    result.escalated = true;

    // Get Rob's owner ID
    const robOwnerId = await getRobOwnerId();

    // Assign ticket to Rob
    if (robOwnerId) {
      await updateTicket(ticketId, {
        hubspot_owner_id: robOwnerId,
        hs_pipeline_stage: "escalated",
      });
    }

    // Generate escalation notes
    const { data: messages } = await supabase
      .from("messages")
      .select("id, direction, body_text, from_email, created_at")
      .eq("thread_id", ingestResult.thread_id)
      .order("created_at", { ascending: true });

    const escalationContext: EscalationContext = {
      threadId: ingestResult.thread_id,
      thread: {
        id: ingestResult.thread_id,
        subject: thread.subject,
        state: ingestResult.state,
      },
      messages: (messages || []).map((m) => ({
        id: m.id,
        direction: m.direction,
        body_text: m.body_text || "",
        from_email: m.from_email,
        created_at: m.created_at,
      })),
      escalationReason:
        ingestResult.action === "ESCALATE"
          ? "Requires human review"
          : "Draft needs approval",
      intent: ingestResult.intent,
      customerEmail: latestMessage.from,
    };

    const notes = await generateEscalationNotes(escalationContext);

    // Add notes to HubSpot ticket
    await addNoteToTicket(ticketId, notes.fullNote);

    // Save to database
    await saveEscalationNotes(
      ingestResult.thread_id,
      ticketId,
      escalationContext,
      notes
    );
  }
}

/**
 * Store Gmail OAuth tokens for persistent access
 */
export async function storeGmailTokens(
  email: string,
  refreshToken: string
): Promise<void> {
  await supabase
    .from("gmail_sync_state")
    .upsert(
      {
        email_address: email,
        refresh_token: refreshToken,
        sync_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email_address" }
    );
}

/**
 * Get monitoring status
 */
export async function getMonitorStatus(): Promise<{
  enabled: boolean;
  lastSyncAt: string | null;
  lastHistoryId: string | null;
  errorCount: number;
  lastError: string | null;
  recentRuns: Array<{
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    newMessages: number;
    escalations: number;
  }>;
}> {
  const { data: syncState } = await supabase
    .from("gmail_sync_state")
    .select("*")
    .eq("email_address", "support@squarewheelsauto.com")
    .single();

  const { data: recentRuns } = await supabase
    .from("agent_poll_runs")
    .select("id, status, started_at, completed_at, new_messages_found, escalations")
    .order("started_at", { ascending: false })
    .limit(10);

  return {
    enabled: syncState?.sync_enabled ?? false,
    lastSyncAt: syncState?.last_sync_at ?? null,
    lastHistoryId: syncState?.last_history_id ?? null,
    errorCount: syncState?.error_count ?? 0,
    lastError: syncState?.last_error ?? null,
    recentRuns: (recentRuns || []).map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      newMessages: r.new_messages_found || 0,
      escalations: r.escalations || 0,
    })),
  };
}
