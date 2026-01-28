import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const threadId = "85ccd857-da8e-4b13-89cc-7c64ff1a6bb0";

async function check() {
  // Get ALL messages in order
  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, from_email, to_email, body_text, channel_metadata, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  console.log("All messages in chronological order:\n");
  for (const m of messages || []) {
    const meta = m.channel_metadata as Record<string, unknown> | null;
    const isDraft = meta?.is_draft;
    const wasRelayDraft = meta?.relay_draft;
    const recipientOverride = meta?.recipient_override;
    const gmailId = meta?.gmail_message_id;

    console.log(`[${m.direction}${isDraft ? "/DRAFT" : ""}] ${new Date(m.created_at).toLocaleString()}`);
    console.log(`  From: ${m.from_email}`);
    console.log(`  To: ${m.to_email}`);
    if (recipientOverride) console.log(`  Recipient Override: ${recipientOverride}`);
    if (wasRelayDraft) console.log(`  Was relay draft: yes`);
    console.log(`  Gmail ID: ${gmailId || "none"}`);
    console.log(`  Preview: ${(m.body_text || "").slice(0, 150).replace(/\n/g, " ")}...`);
    const attachments = meta?.attachments as Array<unknown> | undefined;
    if (attachments?.length) {
      console.log(`  Attachments: ${attachments.length}`);
    }
    console.log();
  }
}

check().catch(console.error);
