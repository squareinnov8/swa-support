/**
 * Backfill HubSpot Tickets
 *
 * Syncs existing threads to HubSpot tickets with full activity history.
 *
 * Usage:
 *   npx tsx scripts/backfill-hubspot-tickets.ts [--dry-run] [--limit N] [--thread-id UUID]
 *
 * Options:
 *   --dry-run     Preview what would be synced without making changes
 *   --limit N     Only sync first N threads
 *   --thread-id   Sync a specific thread by ID
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!hubspotToken) {
  console.error("Missing HUBSPOT_ACCESS_TOKEN");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Map thread states to HubSpot pipeline stages
const STATE_TO_STAGE: Record<string, string> = {
  NEW: "1",
  AWAITING_INFO: "2",
  IN_PROGRESS: "3",
  HUMAN_HANDLING: "3",
  ESCALATED: "3",
  RESOLVED: "4",
};

// ========================================
// AUTOMATED EMAIL FILTERING
// ========================================

const AUTOMATED_SENDER_DOMAINS = [
  "facebookmail.com", "instagram.com", "fb.com", "meta.com",
  "google.com", "googlemail.com", "accounts.google.com",
  "tiktok.com", "bytedance.com",
  "twitter.com", "x.com",
  "apple.com", "id.apple.com",
  "microsoft.com", "account.microsoft.com",
  "amazon.com", "amazon.co.uk", "amazonses.com",
  "linkedin.com", "linkedinmail.com",
  "shopify.com", "myshopify.com",
  "paypal.com", "stripe.com",
  "mailchimp.com", "sendgrid.net", "sendgrid.com",
  "constantcontact.com", "mailgun.org", "postmarkapp.com",
  "mandrill.com", "hubspot.com", "intercom.io", "zendesk.com", "freshdesk.com",
];

const AUTOMATED_SUBJECT_PATTERNS = [
  /security\s*alert/i,
  /sign[- ]?in\s*(attempt|notification|alert)/i,
  /verification\s*code/i,
  /confirm\s*your\s*(email|account)/i,
  /reset\s*your\s*password/i,
  /password\s*(reset|changed|updated)/i,
  /google\s*(security|alert|sign[- ]?in)/i,
  /critical\s*security\s*alert/i,
  /archive\s*of\s*google\s*data/i,
  /your\s*account\s*(has\s*been|was|is)/i,
  /your\s*(order|package|shipment)\s*(has\s*shipped|is\s*on\s*its\s*way|was\s*delivered)/i,
  /delivery\s*(confirmation|notification|update)/i,
  /receipt\s*(for|from)/i,
  /newsletter/i,
  /weekly\s*(digest|update|roundup)/i,
  /tiktok\s*(ads?|campaign|partner|privacy)/i,
  /enhance\s*your\s*tiktok/i,
  /supercharge\s*your\s*tiktok/i,
  /recommendations?\s*to\s*enhance/i,
  /optimize\s*your\s*tiktok/i,
  /must[- ]try\s*tiktok/i,
  /holiday\s*campaign/i,
  /event\s*names?\s*(go\s*live|update)/i,
];

const AUTOMATED_SENDER_PATTERNS = [
  /^no[-_]?reply@/i,
  /^noreply@/i,
  /^do[-_]?not[-_]?reply@/i,
  /^notifications?@/i,
  /^alerts?@/i,
  /^system@/i,
  /^mailer[-_]?daemon@/i,
  /^postmaster@/i,
];

function isAutomatedEmail(senderEmail: string | null, subject: string | null): boolean {
  const email = (senderEmail || "").toLowerCase().trim();
  const subjectText = (subject || "").toLowerCase();

  // Check sender domain
  if (email) {
    const domain = email.split("@")[1] || "";
    for (const blockedDomain of AUTOMATED_SENDER_DOMAINS) {
      if (domain === blockedDomain || domain.endsWith(`.${blockedDomain}`)) {
        return true;
      }
    }

    // Check sender patterns (noreply, etc.)
    for (const pattern of AUTOMATED_SENDER_PATTERNS) {
      if (pattern.test(email)) {
        return true;
      }
    }
  }

  // Check subject patterns
  for (const pattern of AUTOMATED_SUBJECT_PATTERNS) {
    if (pattern.test(subjectText)) {
      return true;
    }
  }

  return false;
}

interface BackfillOptions {
  dryRun: boolean;
  limit?: number;
  threadId?: string;
}

interface SyncResult {
  success: boolean;
  ticketId?: string;
  contactId?: string;
  activityCount?: number;
  error?: string;
}

type TicketActivity =
  | { type: "message"; direction: "inbound" | "outbound"; from: string; body: string; timestamp: Date }
  | { type: "state_change"; from: string; to: string; reason?: string; timestamp: Date }
  | { type: "admin_decision"; tool: string; summary: string; admin: string; timestamp: Date }
  | { type: "escalation"; reason: string; timestamp: Date }
  | { type: "promised_action"; promises: string[]; timestamp: Date };

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: false,
    limit: undefined,
    threadId: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      options.dryRun = true;
    } else if (args[i] === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--thread-id" && args[i + 1]) {
      options.threadId = args[i + 1];
      i++;
    }
  }

  return options;
}

// HubSpot API helpers
async function hubspotFetch(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`https://api.hubapi.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${hubspotToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot API error: ${response.status} - ${error}`);
  }

  return response.json();
}

async function getContactByEmail(email: string): Promise<{ id: string } | null> {
  try {
    const data = await hubspotFetch(
      `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`
    );
    return { id: data.id };
  } catch {
    return null;
  }
}

async function createContact(email: string): Promise<{ id: string }> {
  const data = await hubspotFetch("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({ properties: { email } }),
  });
  return { id: data.id };
}

async function createTicket(
  properties: Record<string, string>,
  contactId: string
): Promise<{ id: string }> {
  const data = await hubspotFetch("/crm/v3/objects/tickets", {
    method: "POST",
    body: JSON.stringify({
      properties,
      associations: [
        {
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 16 }],
        },
      ],
    }),
  });
  return { id: data.id };
}

async function addNoteToTicket(
  ticketId: string,
  contactId: string,
  body: string,
  timestamp: number
): Promise<void> {
  await fetch("https://api.hubapi.com/engagements/v1/engagements", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hubspotToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      engagement: {
        active: true,
        type: "NOTE",
        timestamp,
      },
      associations: {
        contactIds: [parseInt(contactId, 10)],
        companyIds: [],
        dealIds: [],
        ticketIds: [parseInt(ticketId, 10)],
      },
      metadata: {
        body,
      },
    }),
  });
}

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

async function syncThread(threadId: string, dryRun: boolean): Promise<SyncResult> {
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

    // Skip if already synced
    if (thread.hubspot_ticket_id) {
      return {
        success: true,
        ticketId: thread.hubspot_ticket_id,
        contactId: thread.hubspot_contact_id,
        error: "Already synced"
      };
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

    const customerEmail = firstMessage.from_email;

    // Skip automated emails
    if (isAutomatedEmail(customerEmail, thread.subject)) {
      return { success: false, error: "Automated email - skipped" };
    }

    if (dryRun) {
      // Count activities that would be synced
      const { count: messageCount } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("thread_id", threadId);

      return {
        success: true,
        activityCount: messageCount || 0,
      };
    }

    // Find or create HubSpot contact
    let contact = await getContactByEmail(customerEmail);
    if (!contact) {
      console.log(`  Creating contact for ${customerEmail}`);
      contact = await createContact(customerEmail);
    }

    const contactId = contact.id;

    // Create the ticket
    const stageId = STATE_TO_STAGE[thread.state] || "1";
    const priority = thread.state === "ESCALATED" ? "HIGH" : "MEDIUM";

    const { data: initialMsg } = await supabase
      .from("messages")
      .select("body_text")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    const ticket = await createTicket(
      {
        subject: thread.subject || "(no subject)",
        content: (initialMsg?.body_text || "").slice(0, 500),
        hs_pipeline: "0",
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

    // Collect all activities
    const activities: Array<{ timestamp: Date; activity: TicketActivity }> = [];

    // Get all messages
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    for (const msg of messages || []) {
      if (msg.role === "draft") continue;
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

    // Get events (state changes)
    const { data: events } = await supabase
      .from("events")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

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

    // Get admin decisions
    const { data: decisions } = await supabase
      .from("lina_tool_actions")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

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

    // Add notes
    for (const { activity } of activities) {
      const noteBody = formatActivityNote(activity);
      await addNoteToTicket(ticket.id, contactId, noteBody, activity.timestamp.getTime());
      // Small delay for rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      success: true,
      ticketId: ticket.id,
      contactId,
      activityCount: activities.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function getThreadsToSync(options: BackfillOptions) {
  let query = supabase
    .from("threads")
    .select("id, subject, state, created_at")
    .is("hubspot_ticket_id", null)
    .order("created_at", { ascending: true });

  if (options.threadId) {
    query = supabase
      .from("threads")
      .select("id, subject, state, created_at")
      .eq("id", options.threadId);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: threads, error } = await query;

  if (error) {
    console.error("Failed to fetch threads:", error);
    process.exit(1);
  }

  return threads || [];
}

async function main() {
  const options = parseArgs();

  console.log("=== HubSpot Ticket Backfill ===\n");

  if (options.dryRun) {
    console.log("DRY RUN MODE - No changes will be made\n");
  }

  // Get threads to sync
  const threads = await getThreadsToSync(options);

  if (threads.length === 0) {
    console.log("No threads found to sync.");
    if (!options.threadId) {
      console.log("(All threads may already have HubSpot tickets)");
    }
    return;
  }

  console.log(`Found ${threads.length} thread(s) to sync\n`);

  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const thread of threads) {
    const truncatedSubject =
      thread.subject && thread.subject.length > 50
        ? thread.subject.slice(0, 50) + "..."
        : thread.subject || "(no subject)";

    console.log(`[${synced + failed + skipped + 1}/${threads.length}] ${thread.id}`);
    console.log(`  Subject: ${truncatedSubject}`);
    console.log(`  State: ${thread.state}`);

    const result = await syncThread(thread.id, options.dryRun);

    if (options.dryRun) {
      if (!result.success) {
        console.log(`  Status: Skipped - ${result.error}\n`);
        skipped++;
      } else {
        console.log(`  Activities: ${result.activityCount || 0}`);
        console.log(`  Status: Would sync (dry run)\n`);
        synced++;
      }
      continue;
    }

    if (result.success) {
      if (result.error === "Already synced") {
        console.log(`  Status: Already synced`);
        console.log(`  Ticket ID: ${result.ticketId}\n`);
        skipped++;
      } else {
        console.log(`  Status: Synced`);
        console.log(`  Ticket ID: ${result.ticketId}`);
        console.log(`  Contact ID: ${result.contactId}`);
        console.log(`  Activities: ${result.activityCount}\n`);
        synced++;
      }
    } else {
      console.log(`  Status: Failed - ${result.error}\n`);
      failed++;
    }

    // Small delay between threads to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("=== Summary ===");
  console.log(`Total threads: ${threads.length}`);
  if (options.dryRun) {
    console.log(`Would sync: ${synced}`);
    console.log(`Would skip (automated): ${skipped}`);
  } else {
    console.log(`Synced: ${synced}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
