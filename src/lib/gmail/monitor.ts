/**
 * Gmail Monitoring Service
 *
 * Polls Gmail for new messages and processes them through the ingest pipeline.
 * Uses historyId for efficient incremental sync.
 */

import { supabase } from "@/lib/db";
import { createGmailClient, refreshTokenIfNeeded, type GmailTokens } from "@/lib/import/gmail/auth";
import { fetchThread, listThreads, downloadAttachment, type GmailThread, type GmailMessage, type GmailAttachment } from "@/lib/import/gmail/fetcher";
import { processIngestRequest } from "@/lib/ingest/processRequest";
import type { IngestRequest, MessageAttachment } from "@/lib/ingest/types";
import { processAttachment, type ExtractedAttachmentContent } from "@/lib/attachments";
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
  buildCustomerProfile,
  generateEscalationEmail,
  sendEscalationEmail,
  shouldSendEscalationEmail,
  isGmailSendConfigured,
  applyEscalationLabel,
  type EscalationContext,
} from "@/lib/escalation";
import {
  detectGmailIntervention,
  enterObservationMode,
  isInObservationMode,
  recordObservation,
  wasMessageGeneratedByAgent,
} from "@/lib/collaboration";
import {
  findEscalationForReply,
  parseResponse,
  processEscalationResponse,
} from "@/lib/escalation/responseHandler";
import { getAgentSettings } from "@/lib/settings";
import { sendApprovedDraft, isGmailSendConfigured as isGmailSendReady } from "@/lib/gmail/sendDraft";

export type MonitorResult = {
  success: boolean;
  runId?: string;
  threadsChecked: number;
  threadsSkipped: number;
  newMessagesFound: number;
  draftsGenerated: number;
  draftsAutoSent: number;
  ticketsCreated: number;
  ticketsUpdated: number;
  escalations: number;
  escalationResponsesProcessed: number;
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
 * @param options.fetchRecent - If true, fetch emails from last N days (for testing/initial setup)
 * @param options.fetchDays - Number of days to fetch when fetchRecent is true (default: 3)
 */
export async function runGmailMonitor(options?: { fetchRecent?: boolean; fetchDays?: number }): Promise<MonitorResult> {
  const { fetchRecent = false, fetchDays = 3 } = options || {};
  const result: MonitorResult = {
    success: false,
    threadsChecked: 0,
    threadsSkipped: 0,
    newMessagesFound: 0,
    draftsGenerated: 0,
    draftsAutoSent: 0,
    ticketsCreated: 0,
    ticketsUpdated: 0,
    escalations: 0,
    escalationResponsesProcessed: 0,
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
    const updates = await getNewMessages(gmail, syncState.last_history_id, fetchRecent, fetchDays);

    result.threadsChecked = updates.threadIds.size;

    // Process each updated thread
    const skipReasons: Record<string, number> = {};

    for (const threadId of updates.threadIds) {
      try {
        const threadResult = await processGmailThread(tokens, threadId);

        if (threadResult.skipped) {
          result.threadsSkipped++;
          const reason = threadResult.skipReason || "Unknown";
          skipReasons[reason] = (skipReasons[reason] || 0) + 1;
          continue;
        }
        if (threadResult.newMessage) {
          result.newMessagesFound++;
        }
        if (threadResult.draftGenerated) {
          result.draftsGenerated++;
        }
        if (threadResult.draftAutoSent) {
          result.draftsAutoSent++;
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
        if (threadResult.escalationResponseProcessed) {
          result.escalationResponsesProcessed++;
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

    // Add skip summary to errors for visibility
    if (result.threadsSkipped > 0) {
      const skipSummary = Object.entries(skipReasons)
        .map(([reason, count]) => `${count} ${reason}`)
        .join(", ");
      result.errors.push(`Skipped: ${skipSummary}`);
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
 * @param fetchRecent - If true, fetch emails from last N days (bypasses historyId check)
 * @param fetchDays - Number of days to fetch when fetchRecent is true
 */
async function getNewMessages(
  gmail: ReturnType<typeof createGmailClient>,
  lastHistoryId: string | null,
  fetchRecent: boolean = false,
  fetchDays: number = 3
): Promise<{ threadIds: Set<string>; newHistoryId: string }> {
  const threadIds = new Set<string>();

  // Get current profile for historyId
  const profile = await gmail.users.getProfile({ userId: "me" });
  const newHistoryId = profile.data.historyId || "0";

  // If fetchRecent is true, fetch emails from the last N days
  if (fetchRecent) {
    console.log(`Fetching recent emails from last ${fetchDays} days...`);

    const response = await gmail.users.messages.list({
      userId: "me",
      q: `newer_than:${fetchDays}d`,
      maxResults: 100,
    });

    for (const msg of response.data.messages || []) {
      if (msg.threadId) {
        threadIds.add(msg.threadId);
      }
    }

    console.log(`Found ${threadIds.size} threads from last ${fetchDays} days`);
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
  draftAutoSent: boolean;
  ticketCreated: boolean;
  ticketUpdated: boolean;
  escalated: boolean;
  escalationResponseProcessed: boolean;
  skipped: boolean;
  skipReason?: string;
  error?: string;
  interventionDetected?: boolean;
  observationMode?: boolean;
};

/**
 * Sync all messages from a Gmail thread to our database
 * This ensures we have the full conversation history, including:
 * - Outbound messages sent directly via Gmail (not through our system)
 * - Any messages we may have missed
 */
async function syncGmailMessagesToThread(
  threadId: string,
  gmailThread: GmailThread
): Promise<{ synced: number; skipped: number }> {
  let synced = 0;
  let skipped = 0;

  for (const gmailMsg of gmailThread.messages) {
    // Check if message already exists in our database by Gmail message ID
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("channel_metadata->>gmail_message_id", gmailMsg.id)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    // Insert the message
    const direction = gmailMsg.isIncoming ? "inbound" : "outbound";

    const { error } = await supabase.from("messages").insert({
      thread_id: threadId,
      direction,
      from_email: gmailMsg.from,
      to_email: gmailMsg.to[0] || null,
      body_text: gmailMsg.body,
      channel: "email",
      channel_metadata: {
        gmail_thread_id: gmailMsg.threadId,
        gmail_message_id: gmailMsg.id,
        gmail_date: gmailMsg.date.toISOString(),
        synced_from_gmail: true, // Mark as synced rather than processed
      },
      // Use the Gmail message date for proper ordering
      created_at: gmailMsg.date.toISOString(),
    });

    if (!error) {
      synced++;
      console.log(`[Monitor] Synced ${direction} message ${gmailMsg.id} to thread ${threadId}`);
    } else {
      console.warn(`[Monitor] Failed to sync message ${gmailMsg.id}: ${error.message}`);
    }
  }

  if (synced > 0) {
    console.log(`[Monitor] Synced ${synced} messages for thread ${threadId} (${skipped} already existed)`);
  }

  return { synced, skipped };
}

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
    draftAutoSent: false,
    ticketCreated: false,
    ticketUpdated: false,
    escalated: false,
    escalationResponseProcessed: false,
    skipped: false,
  };

  // Fetch full thread
  const thread = await fetchThread(tokens, gmailThreadId);
  if (!thread || thread.messages.length === 0) {
    result.skipped = true;
    result.skipReason = "Empty thread";
    return result;
  }

  // Check if thread exists in our system first (needed for intervention detection)
  const { data: existingThread } = await supabase
    .from("threads")
    .select("id, hubspot_ticket_id, hubspot_contact_id, state, human_handling_mode")
    .eq("gmail_thread_id", gmailThreadId)
    .maybeSingle();

  // IMPORTANT: Sync all messages from the Gmail thread to ensure full context
  // This includes outbound messages that may have been sent via Gmail directly
  if (existingThread?.id) {
    await syncGmailMessagesToThread(existingThread.id, thread);
  }

  // Check for intervention: look for outgoing messages from support@ that weren't agent-generated
  if (existingThread?.id && !existingThread.human_handling_mode) {
    const latestOutgoing = [...thread.messages]
      .reverse()
      .find((m) => !m.isIncoming);

    if (latestOutgoing) {
      // Check if this outgoing message was generated by the agent
      const wasAgentGenerated = await wasMessageGeneratedByAgent(supabase, latestOutgoing.id);

      if (!wasAgentGenerated) {
        // Human sent this message - intervention detected!
        const intervention = detectGmailIntervention(
          latestOutgoing,
          existingThread.id,
          gmailThreadId,
          false
        );

        if (intervention) {
          console.log(`[Monitor] Intervention detected in thread ${gmailThreadId}`);
          await enterObservationMode(intervention);
          result.interventionDetected = true;
          result.observationMode = true;
        }
      }
    }
  }

  // If thread is in observation mode, record incoming messages but don't generate drafts
  if (existingThread?.human_handling_mode) {
    result.observationMode = true;
    // Find new messages and record them as observations
    const latestMessage = thread.messages[thread.messages.length - 1];
    if (latestMessage) {
      await recordObservation(existingThread.id, {
        direction: latestMessage.isIncoming ? "inbound" : "outbound",
        from: latestMessage.from,
        to: latestMessage.to[0] || "",
        content: latestMessage.body,
        timestamp: latestMessage.date,
        gmailMessageId: latestMessage.id,
      });
    }
    result.skipped = true;
    result.skipReason = "Thread in observation mode";
    return result;
  }

  // Find the latest customer message (not from support email)
  const latestIncoming = [...thread.messages]
    .reverse()
    .find((m) => m.isIncoming);

  if (!latestIncoming) {
    // No customer messages - all from support email, skip
    result.skipped = true;
    result.skipReason = `No customer messages (${thread.messages.length} from support)`;
    return result;
  }

  // Check if this is Rob replying to an escalation email
  // Rob's replies come into support@ inbox and should be handled specially
  const senderEmail = extractEmailAddress(latestIncoming.from);
  const escalationEmail = await findEscalationForReply(gmailThreadId, senderEmail);

  if (escalationEmail) {
    console.log(`[Monitor] Detected Rob's reply to escalation for thread ${escalationEmail.thread_id}`);

    // Parse and process Rob's response
    const parsedResponse = parseResponse(latestIncoming.body);
    const processResult = await processEscalationResponse(
      escalationEmail.id,
      escalationEmail.thread_id,
      parsedResponse
    );

    console.log(`[Monitor] Escalation response processed:`, {
      type: parsedResponse.type,
      tags: parsedResponse.tags,
      actionsCount: processResult.actions.length,
    });

    result.escalationResponseProcessed = true;
    result.newMessage = true;

    // Sync this message to the thread
    await supabase.from("messages").insert({
      thread_id: escalationEmail.thread_id,
      direction: "inbound",
      from_email: senderEmail,
      to_email: "support@squarewheelsauto.com",
      body_text: latestIncoming.body,
      channel: "email",
      role: "internal", // Mark as internal (Rob's response)
      channel_metadata: {
        gmail_thread_id: gmailThreadId,
        gmail_message_id: latestIncoming.id,
        gmail_date: latestIncoming.date.toISOString(),
        escalation_response: true,
        response_type: parsedResponse.type,
        response_tags: parsedResponse.tags,
      },
    });

    return result;
  }

  // Check if we've already PROCESSED this message (not just synced)
  // Messages synced from Gmail have synced_from_gmail=true in metadata
  // Only skip if we find a PROCESSED message (without synced_from_gmail flag)
  const { data: existingMessage } = await supabase
    .from("messages")
    .select("id, channel_metadata")
    .eq("channel_metadata->>gmail_message_id", latestIncoming.id)
    .maybeSingle();

  // Skip only if message exists AND was actually processed (not just synced)
  if (existingMessage) {
    const metadata = existingMessage.channel_metadata as Record<string, unknown> | null;
    const wasSyncedOnly = metadata?.synced_from_gmail === true;

    if (!wasSyncedOnly) {
      // Already processed through ingest pipeline
      result.skipped = true;
      result.skipReason = "Already processed";
      return result;
    }
    // Message was only synced, not processed - delete it so processIngestRequest can insert properly
    console.log(`[Monitor] Message ${latestIncoming.id} was synced but not processed, removing synced version...`);
    await supabase
      .from("messages")
      .delete()
      .eq("id", existingMessage.id);
  }

  result.newMessage = true;

  // Note: existingThread already fetched earlier for intervention detection

  // Process attachments if any
  const processedAttachments: MessageAttachment[] = [];
  if (latestIncoming.attachments && latestIncoming.attachments.length > 0) {
    console.log(`[Monitor] Processing ${latestIncoming.attachments.length} attachment(s) from message ${latestIncoming.id}`);

    for (const attachment of latestIncoming.attachments) {
      try {
        // Download attachment content from Gmail
        const content = await downloadAttachment(tokens, latestIncoming.id, attachment.id);
        if (!content) {
          console.warn(`[Monitor] Failed to download attachment: ${attachment.filename}`);
          continue;
        }

        // Process the attachment to extract text/data
        const extracted = await processAttachment(attachment, content);

        processedAttachments.push({
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          extractedContent: extracted,
        });

        if (extracted.extractedData?.orderNumber) {
          console.log(`[Monitor] Extracted order number from attachment: ${extracted.extractedData.orderNumber}`);
        }
      } catch (err) {
        console.error(`[Monitor] Error processing attachment ${attachment.filename}:`, err);
      }
    }
  }

  // Build ingest request
  const ingestRequest: IngestRequest = {
    channel: "email",
    external_id: gmailThreadId,
    from_identifier: latestIncoming.from,
    to_identifier: latestIncoming.to[0],
    subject: thread.subject,
    body_text: latestIncoming.body,
    attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
    // Use the email's actual date for accurate thread/message timestamps
    message_date: latestIncoming.date,
    metadata: {
      gmail_thread_id: gmailThreadId,
      gmail_message_id: latestIncoming.id,
      gmail_date: latestIncoming.date.toISOString(),
      attachment_count: latestIncoming.attachments?.length || 0,
    },
  };

  // Process through ingest pipeline
  const ingestResult = await processIngestRequest(ingestRequest);

  if (ingestResult.draft) {
    result.draftGenerated = true;

    // Check if we should auto-send this draft
    const shouldAutoSend = await checkAutoSendEligibility(ingestResult, gmailThreadId);
    if (shouldAutoSend.eligible) {
      console.log(`[Monitor] Auto-sending draft for thread ${ingestResult.thread_id}: ${shouldAutoSend.reason}`);

      const sendResult = await sendApprovedDraft({
        threadId: ingestResult.thread_id,
        draftText: ingestResult.draft,
      });

      if (sendResult.success) {
        console.log(`[Monitor] Auto-sent draft successfully, Gmail message ID: ${sendResult.gmailMessageId}`);
        result.draftAutoSent = true;
        // Log auto-send event
        await supabase.from("events").insert({
          thread_id: ingestResult.thread_id,
          type: "auto_send",
          payload: {
            gmail_message_id: sendResult.gmailMessageId,
            confidence: ingestResult.confidence,
            intent: ingestResult.intent,
          },
        });
      } else {
        console.error(`[Monitor] Auto-send failed: ${sendResult.error}`);
        result.error = `Auto-send failed: ${sendResult.error}`;
      }
    } else {
      console.log(`[Monitor] Not auto-sending: ${shouldAutoSend.reason}`);

      // Always save draft to messages table for human review
      // This ensures drafts are visible in the admin UI even when not auto-sent
      await supabase.from("messages").insert({
        thread_id: ingestResult.thread_id,
        direction: "outbound",
        body_text: ingestResult.draft,
        role: "draft",
        channel: "email",
        channel_metadata: {
          auto_send_blocked: true,
          auto_send_reason: shouldAutoSend.reason,
          confidence: ingestResult.confidence,
          intent: ingestResult.intent,
          action: ingestResult.action,
        },
      });
      console.log(`[Monitor] Saved draft for human review: ${ingestResult.thread_id}`);
    }
  }

  // Update thread with Gmail ID
  await supabase
    .from("threads")
    .update({
      gmail_thread_id: gmailThreadId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingestResult.thread_id);

  // For NEW threads, sync all messages from Gmail to ensure full context
  // (Existing threads were already synced above)
  if (!existingThread) {
    await syncGmailMessagesToThread(ingestResult.thread_id, thread);

    // For new customers, fetch their historical threads from Gmail
    // This builds support history for the customer context panel
    const customerEmail = latestIncoming.from;
    const isNew = await isNewCustomer(customerEmail);
    if (isNew) {
      console.log(`[Monitor] New customer detected: ${customerEmail}, fetching history...`);
      await fetchCustomerHistory(tokens, customerEmail, gmailThreadId);
    }
  }

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
  // HubSpot uses numeric pipeline stage IDs: 1=New, 2=Waiting on contact, 3=Waiting on us, 4=Closed
  const stageMap: Record<string, string> = {
    NEW: "1",
    AWAITING_INFO: "2", // Waiting on customer
    IN_PROGRESS: "3",   // Waiting on us / in progress
    ESCALATED: "3",     // Needs attention
    RESOLVED: "4",      // Closed
  };

  const ticketStage = stageMap[ingestResult.state] || "1";

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

    // Get Gmail thread ID for label and observation mode
    const { data: threadData } = await supabase
      .from("threads")
      .select("gmail_thread_id")
      .eq("id", ingestResult.thread_id)
      .single();

    const gmailThreadId = threadData?.gmail_thread_id;

    // Apply the support-escalation Gmail label
    if (gmailThreadId) {
      try {
        await applyEscalationLabel(gmailThreadId);
        console.log(`[Monitor] Applied escalation label to Gmail thread ${gmailThreadId}`);
      } catch (labelError) {
        console.error("Failed to apply escalation label:", labelError);
      }
    }

    // Enter observation mode so Lina can learn from Rob's responses
    if (gmailThreadId) {
      try {
        await enterObservationMode({
          type: "admin_takeover",
          threadId: ingestResult.thread_id,
          gmailThreadId,
          handler: "rob@squarewheelsauto.com",
          channel: "email",
          timestamp: new Date(),
          content: `Escalated: ${ingestResult.intent}`,
        });
        console.log(`[Monitor] Entered observation mode for thread ${ingestResult.thread_id}`);
      } catch (obsError) {
        console.error("Failed to enter observation mode:", obsError);
      }
    }

    // Get Rob's owner ID
    const robOwnerId = await getRobOwnerId();

    // Assign ticket to Rob
    if (robOwnerId) {
      await updateTicket(ticketId, {
        hubspot_owner_id: robOwnerId,
        hs_pipeline_stage: "3", // Escalated/Needs attention
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

    // Send escalation email to Rob (if Gmail is configured and not a duplicate)
    if (isGmailSendConfigured()) {
      const shouldSend = await shouldSendEscalationEmail(ingestResult.thread_id);
      if (shouldSend) {
        try {
          // Build customer profile for rich email
          const customerProfile = await buildCustomerProfile(
            latestMessage.from,
            `${thread.subject}: ${latestMessage.body.slice(0, 200)}`
          );

          // Extract detailed troubleshooting steps and questions from agent messages
          const troubleshootingAttempted: string[] = [];
          const questionsAsked: string[] = [];

          for (const msg of messages || []) {
            if (msg.direction === "outbound" && msg.body_text) {
              const text = msg.body_text;

              // Extract questions (sentences ending with ?)
              const questionMatches = text.match(/[^.!?]*\?/g);
              if (questionMatches) {
                for (const q of questionMatches) {
                  const cleanQuestion = q.trim();
                  if (cleanQuestion.length > 10 && cleanQuestion.length < 200) {
                    questionsAsked.push(cleanQuestion);
                  }
                }
              }

              // Extract troubleshooting actions/steps
              if (text.includes("verify") || text.includes("confirm")) {
                troubleshootingAttempted.push("Requested verification/confirmation from customer");
              }
              if (text.includes("order") && (text.includes("number") || text.includes("#"))) {
                troubleshootingAttempted.push("Asked for order number");
              }
              if (text.includes("tracking") || text.includes("shipment")) {
                troubleshootingAttempted.push("Provided tracking/shipping information");
              }
              if (text.includes("firmware") || text.includes("update")) {
                troubleshootingAttempted.push("Discussed firmware/update process");
              }
              if (text.includes("reset") || text.includes("restart")) {
                troubleshootingAttempted.push("Suggested reset/restart");
              }
              if (text.includes("return") || text.includes("refund")) {
                troubleshootingAttempted.push("Discussed return/refund policy");
              }
              if (text.includes("vehicle") || text.includes("car") || text.includes("fitment")) {
                troubleshootingAttempted.push("Asked about vehicle/fitment details");
              }
              if (text.includes("KB:") || text.includes("knowledge base")) {
                troubleshootingAttempted.push("Referenced KB documentation");
              }
              if (text.includes("escalat") || text.includes("team member")) {
                troubleshootingAttempted.push("Mentioned escalation to team");
              }
            }
          }

          // Deduplicate troubleshooting steps
          const uniqueTroubleshooting = [...new Set(troubleshootingAttempted)];

          // Limit questions to most recent 5
          const recentQuestions = questionsAsked.slice(-5);

          // Add questions asked to troubleshooting for email context
          if (recentQuestions.length > 0) {
            uniqueTroubleshooting.push(`Questions asked: ${recentQuestions.length} questions including: "${recentQuestions[0]}"`);
          }

          // Generate escalation email content
          const emailContent = await generateEscalationEmail(
            ingestResult.thread_id,
            customerProfile,
            escalationContext.escalationReason,
            uniqueTroubleshooting
          );

          // Send the email (use gmailThreadId from earlier fetch)
          await sendEscalationEmail(
            ingestResult.thread_id,
            emailContent,
            gmailThreadId || undefined
          );

          console.log(`[Monitor] Sent escalation email for thread ${ingestResult.thread_id}`);
        } catch (emailError) {
          console.error("Failed to send escalation email:", emailError);
          // Don't fail the whole process if email fails
        }
      }
    }
  }
}

/**
 * Check if this is a new customer (first thread we've processed from them)
 */
async function isNewCustomer(customerEmail: string): Promise<boolean> {
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("from_email", customerEmail)
    .eq("direction", "inbound")
    .limit(2);

  // If we have 0 or 1 messages, they're effectively new (current message might be first)
  return (count ?? 0) <= 1;
}

/**
 * Fetch and ingest historical threads from a customer
 * Called when we first see a new customer to build support history
 */
async function fetchCustomerHistory(
  tokens: GmailTokens,
  customerEmail: string,
  excludeThreadId?: string
): Promise<{ threadsFound: number; threadsIngested: number }> {
  let threadsFound = 0;
  let threadsIngested = 0;

  try {
    console.log(`[Monitor] Fetching history for customer: ${customerEmail}`);

    // Search Gmail for threads from this customer
    const result = await listThreads(tokens, {
      query: `from:${customerEmail}`,
      maxResults: 20, // Limit to avoid overwhelming the system
    });

    threadsFound = result.threads.length;
    console.log(`[Monitor] Found ${threadsFound} historical threads for ${customerEmail}`);

    for (const threadSummary of result.threads) {
      // Skip the current thread we're already processing
      if (excludeThreadId && threadSummary.threadId === excludeThreadId) {
        continue;
      }

      // Check if we already have this thread
      const { data: existing } = await supabase
        .from("threads")
        .select("id")
        .eq("gmail_thread_id", threadSummary.threadId)
        .maybeSingle();

      if (existing) {
        continue;
      }

      // Fetch and process the historical thread
      try {
        const thread = await fetchThread(tokens, threadSummary.threadId);
        if (!thread || thread.messages.length === 0) {
          continue;
        }

        // Find the first customer message
        const customerMessage = thread.messages.find((m) => m.isIncoming);
        if (!customerMessage) {
          continue;
        }

        // Ingest as a historical thread (won't generate drafts for old resolved threads)
        const ingestRequest: IngestRequest = {
          channel: "email",
          external_id: threadSummary.threadId,
          from_identifier: customerMessage.from,
          to_identifier: customerMessage.to[0],
          subject: thread.subject,
          body_text: customerMessage.body,
          message_date: customerMessage.date,
          metadata: {
            gmail_thread_id: threadSummary.threadId,
            gmail_message_id: customerMessage.id,
            gmail_date: customerMessage.date.toISOString(),
            historical_import: true,
          },
        };

        const result = await processIngestRequest(ingestRequest);

        // Update thread with Gmail ID and mark as resolved (historical)
        await supabase
          .from("threads")
          .update({
            gmail_thread_id: threadSummary.threadId,
            state: "RESOLVED", // Historical threads are resolved
            updated_at: new Date().toISOString(),
          })
          .eq("id", result.thread_id);

        // Sync all messages from the thread
        await syncGmailMessagesToThread(result.thread_id, thread);

        threadsIngested++;
        console.log(`[Monitor] Ingested historical thread: ${thread.subject}`);
      } catch (err) {
        console.error(`[Monitor] Failed to ingest historical thread ${threadSummary.threadId}:`, err);
      }
    }

    console.log(`[Monitor] Customer history sync complete: ${threadsIngested}/${threadsFound} threads ingested`);
  } catch (err) {
    console.error(`[Monitor] Failed to fetch customer history:`, err);
  }

  return { threadsFound, threadsIngested };
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
 * Check if a draft is eligible for auto-send
 *
 * Intent-based auto-send logic:
 * - General questions (product info, compatibility): auto-send at 0.6+ confidence
 * - Order-related queries: require verification + high confidence (0.85+)
 * - Greetings/UNKNOWN: auto-send friendly responses at 0.5+ confidence
 * - Escalations: never auto-send
 */
async function checkAutoSendEligibility(
  ingestResult: {
    thread_id: string;
    confidence: number;
    action: string;
    state: string;
    draft: string | null;
    intent: string;
  },
  gmailThreadId: string
): Promise<{ eligible: boolean; reason: string }> {
  // Order-related intents that need verification
  const ORDER_RELATED_INTENTS = [
    "ORDER_STATUS",
    "ORDER_CHANGE_REQUEST",
    "MISSING_DAMAGED_ITEM",
    "WRONG_ITEM_RECEIVED",
    "RETURN_REFUND_REQUEST",
  ];

  // General product/support intents - lower threshold, no verification
  const GENERAL_INTENTS = [
    "PRODUCT_SUPPORT",
    "FIRMWARE_UPDATE_REQUEST",
    "FIRMWARE_ACCESS_ISSUE",
    "DOCS_VIDEO_MISMATCH",
    "INSTALL_GUIDANCE",
    "FUNCTIONALITY_BUG",
    "COMPATIBILITY_QUESTION",
    "PART_IDENTIFICATION",
  ];

  // Low-risk intents - can auto-send at very low threshold
  const LOW_RISK_INTENTS = [
    "THANK_YOU_CLOSE",
    "UNKNOWN", // General greetings, how's it going, etc.
  ];

  // 1. Check if Gmail is configured for sending
  if (!isGmailSendReady()) {
    return { eligible: false, reason: "Gmail not configured for sending" };
  }

  // 2. Check agent settings
  const settings = await getAgentSettings();

  if (!settings.autoSendEnabled) {
    return { eligible: false, reason: "Auto-send disabled in settings" };
  }

  // 3. Check if action is escalation (never auto-send escalations)
  if (ingestResult.action === "ESCALATE" || ingestResult.action === "ESCALATE_WITH_DRAFT") {
    return { eligible: false, reason: "Escalated - requires human review" };
  }

  // 4. Check if action is NO_REPLY (don't send empty replies)
  if (ingestResult.action === "NO_REPLY") {
    return { eligible: false, reason: "No reply needed" };
  }

  // 5. Determine confidence threshold based on intent type
  const intent = ingestResult.intent;
  let requiredConfidence = settings.autoSendConfidenceThreshold; // Default: 0.85
  let needsVerification = false;

  if (ORDER_RELATED_INTENTS.includes(intent)) {
    // Order-related: high confidence + verification required
    requiredConfidence = settings.autoSendConfidenceThreshold;
    needsVerification = settings.requireVerificationForSend;
  } else if (GENERAL_INTENTS.includes(intent)) {
    // General product questions: medium confidence, no verification
    requiredConfidence = 0.6;
    needsVerification = false;
  } else if (LOW_RISK_INTENTS.includes(intent)) {
    // Greetings and thank-yous: low confidence is fine
    requiredConfidence = 0.4;
    needsVerification = false;
  }

  // 6. Check confidence threshold
  if (ingestResult.confidence < requiredConfidence) {
    return {
      eligible: false,
      reason: `Confidence ${ingestResult.confidence.toFixed(2)} below threshold ${requiredConfidence} for ${intent}`,
    };
  }

  // 7. Check verification requirement for order-related intents
  if (needsVerification) {
    const { data: verification } = await supabase
      .from("customer_verifications")
      .select("status")
      .eq("thread_id", ingestResult.thread_id)
      .eq("status", "verified")
      .maybeSingle();

    if (!verification) {
      return { eligible: false, reason: `Order-related intent ${intent} requires customer verification` };
    }
  }

  // All checks passed
  return {
    eligible: true,
    reason: `Confidence ${ingestResult.confidence.toFixed(2)} >= ${requiredConfidence} threshold for ${intent}`,
  };
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

/**
 * Extract email address from "Name <email@example.com>" format
 */
function extractEmailAddress(emailString: string): string {
  const match = emailString.match(/<([^>]+)>/);
  if (match) {
    return match[1].toLowerCase();
  }
  return emailString.toLowerCase().trim();
}
