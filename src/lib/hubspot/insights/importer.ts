/**
 * HubSpot Email Importer
 *
 * Fetches emails from HubSpot and imports them for analysis.
 */

import { supabase } from "@/lib/db";
import { isHubSpotConfigured } from "../client";
import type {
  HubSpotEmailRaw,
  ProcessedEmail,
  EmailCategory,
  TopicCategory,
  ImportRunResult,
} from "./types";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

function getToken(): string {
  return process.env.HUBSPOT_ACCESS_TOKEN || "";
}

async function hubspotFetch<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${HUBSPOT_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HubSpot API error: ${response.status}`);
  }

  return response.json();
}

// Topic detection patterns
const TOPIC_PATTERNS: Record<TopicCategory, RegExp> = {
  carplay_android_auto: /carplay|android auto|wireless.*carplay|wired.*carplay/i,
  audio_sound: /audio|sound|music|speaker|volume|bose|aux|bluetooth/i,
  screen_display: /screen|display|touch|brightness|black|freeze|resolution/i,
  installation: /install|wiring|harness|connector|mount|plug|wire/i,
  firmware_updates: /firmware|update|version|flash|download/i,
  order_shipping: /order|ship|track|deliver|arrive|status|when/i,
  compatibility: /compatible|fit|work with|support|model|year/i,
  intouch_oem: /intouch|oem|factory|stock|steering wheel|climate|ac\b/i,
  camera_parking: /camera|reverse|parking|rear|360/i,
  return_refund: /return|refund|exchange|replace|money back/i,
  headlights: /headlight|light|glowe|led|beam|bulb/i,
  general: /question|help|support|issue|problem/i,
  uncategorized: /./,
};

// Check if email is SWA-related
function isSWARelated(email: HubSpotEmailRaw): boolean {
  const indicators = [
    "squarewheels",
    "tesla",
    "q50",
    "q60",
    "infiniti",
    "aucar",
    "mk7",
    "mk8",
    "apex",
    "firmware",
    "carplay",
    "headlight",
    "glowe",
  ];

  const fullText = `${email.from} ${email.to.join(" ")} ${email.subject} ${email.text}`.toLowerCase();

  return indicators.some((ind) => fullText.includes(ind));
}

// Categorize email
function categorizeEmail(email: HubSpotEmailRaw): EmailCategory {
  const fromLower = email.from.toLowerCase();

  // Rob's emails - check various patterns
  if (
    fromLower.includes("rob@squarewheels") ||
    fromLower.includes("rob@swa") ||
    fromLower.startsWith("rob@")
  ) {
    return "rob_instruction";
  }

  // Support team responses
  if (fromLower.includes("support@squarewheels")) {
    return "support_response";
  }

  // Customer questions - incoming emails not from squarewheels
  if (
    email.type === "INCOMING_EMAIL" &&
    !fromLower.includes("squarewheels")
  ) {
    return "customer_question";
  }

  return "other";
}

// Detect topic from email content
function detectTopic(email: HubSpotEmailRaw): TopicCategory {
  const fullText = `${email.subject} ${email.text}`;

  for (const [topic, pattern] of Object.entries(TOPIC_PATTERNS)) {
    if (topic === "uncategorized") continue;
    if (pattern.test(fullText)) {
      return topic as TopicCategory;
    }
  }

  return "uncategorized";
}

// Process raw HubSpot email into structured format
function processEmail(raw: HubSpotEmailRaw): ProcessedEmail {
  const category = categorizeEmail(raw);
  const fromLower = raw.from.toLowerCase();

  return {
    hubspot_id: raw.id,
    email_type: raw.type,
    direction:
      raw.type === "INCOMING_EMAIL" || !fromLower.includes("squarewheels")
        ? "inbound"
        : "outbound",
    from_email: raw.from,
    to_emails: raw.to,
    subject: raw.subject,
    body_text: raw.text,
    email_category: category,
    topic: category === "customer_question" ? detectTopic(raw) : null,
    hubspot_contact_ids: raw.contactIds,
    email_date: new Date(raw.createdAt).toISOString(),
  };
}

/**
 * Fetch emails from HubSpot engagements API
 * Uses the "recent/modified" endpoint to get recently modified engagements
 * which includes all recent email activity
 */
async function fetchHubSpotEmails(limit = 500): Promise<HubSpotEmailRaw[]> {
  const emails: HubSpotEmailRaw[] = [];

  // Use recent/modified endpoint - returns recently modified engagements
  const response = await hubspotFetch<{
    results: Array<{
      engagement: { id: number; type: string; createdAt: number };
      metadata: {
        from?: { email?: string };
        to?: Array<{ email?: string }>;
        subject?: string;
        text?: string;
      };
      associations?: { contactIds?: number[] };
    }>;
  }>(`/engagements/v1/engagements/recent/modified?count=${Math.min(limit, 200)}`);

  for (const e of response.results || []) {
    if (
      e.engagement?.type !== "INCOMING_EMAIL" &&
      e.engagement?.type !== "EMAIL"
    ) {
      continue;
    }

    const meta = e.metadata || {};
    const text = meta.text || "";

    if (!text || text.length < 20) continue;

    const email: HubSpotEmailRaw = {
      id: e.engagement.id,
      type: e.engagement.type as "INCOMING_EMAIL" | "EMAIL",
      createdAt: e.engagement.createdAt,
      from: meta.from?.email || "",
      to: (meta.to || []).map((t) => t.email || "").filter(Boolean),
      subject: meta.subject || "",
      text,
      contactIds: e.associations?.contactIds || [],
    };

    // Only include SWA-related emails
    if (isSWARelated(email)) {
      emails.push(email);
    }
  }

  return emails;
}

/**
 * Import emails from HubSpot into database
 */
export async function importHubSpotEmails(
  options: { limit?: number } = {}
): Promise<ImportRunResult> {
  const { limit = 500 } = options;

  if (!isHubSpotConfigured()) {
    return {
      success: false,
      stats: {
        emails_fetched: 0,
        emails_imported: 0,
        instructions_extracted: 0,
        kb_gaps_identified: 0,
        escalation_patterns_found: 0,
      },
      error: "HubSpot not configured",
    };
  }

  // Create import run record
  const { data: run, error: runError } = await supabase
    .from("hubspot_import_runs")
    .insert({
      status: "running",
    })
    .select("id")
    .single();

  if (runError) {
    throw new Error(`Failed to create import run: ${runError.message}`);
  }

  const runId = run.id;

  try {
    // Fetch emails from HubSpot
    const rawEmails = await fetchHubSpotEmails(limit);

    const stats = {
      emails_fetched: rawEmails.length,
      emails_imported: 0,
      instructions_extracted: 0,
      kb_gaps_identified: 0,
      escalation_patterns_found: 0,
    };

    // Process and insert emails
    for (const raw of rawEmails) {
      const processed = processEmail(raw);

      // Check if already imported
      const { data: existing } = await supabase
        .from("hubspot_emails")
        .select("id")
        .eq("hubspot_id", processed.hubspot_id)
        .maybeSingle();

      if (existing) continue;

      // Insert email
      const { error: insertError } = await supabase
        .from("hubspot_emails")
        .insert(processed);

      if (!insertError) {
        stats.emails_imported++;
      }
    }

    // Update run record
    await supabase
      .from("hubspot_import_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        emails_fetched: stats.emails_fetched,
        emails_imported: stats.emails_imported,
      })
      .eq("id", runId);

    return {
      success: true,
      run_id: runId,
      stats,
    };
  } catch (error) {
    // Update run with error
    await supabase
      .from("hubspot_import_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", runId);

    return {
      success: false,
      run_id: runId,
      stats: {
        emails_fetched: 0,
        emails_imported: 0,
        instructions_extracted: 0,
        kb_gaps_identified: 0,
        escalation_patterns_found: 0,
      },
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get import statistics
 */
export async function getImportStats() {
  const { data: emails } = await supabase
    .from("hubspot_emails")
    .select("email_category, topic")
    .not("email_category", "is", null);

  const stats = {
    total: emails?.length || 0,
    byCategory: {} as Record<string, number>,
    byTopic: {} as Record<string, number>,
  };

  for (const email of emails || []) {
    stats.byCategory[email.email_category] =
      (stats.byCategory[email.email_category] || 0) + 1;
    if (email.topic) {
      stats.byTopic[email.topic] = (stats.byTopic[email.topic] || 0) + 1;
    }
  }

  return stats;
}
