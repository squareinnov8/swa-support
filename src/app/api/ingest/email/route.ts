import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/db";
import { classifyIntent } from "@/lib/intents/classify";
import { policyGate } from "@/lib/responders/policyGate";
import { macroDocsVideoMismatch, macroFirmwareAccessClarify } from "@/lib/responders/macros";

const IngestSchema = z.object({
  external_thread_id: z.string().optional(),
  subject: z.string().default(""),
  from_email: z.string().optional(),
  to_email: z.string().optional(),
  body_text: z.string().default(""),
  body_html: z.string().optional(),
  raw: z.any().optional(),
});

export async function POST(req: Request) {
  const payload = IngestSchema.parse(await req.json());

  // Upsert thread
  let threadId: string | null = null;

  if (payload.external_thread_id) {
    const { data: existing } = await supabase
      .from("threads")
      .select("id")
      .eq("external_thread_id", payload.external_thread_id)
      .maybeSingle();

    if (existing?.id) threadId = existing.id;
  }

  if (!threadId) {
    const { data: created, error } = await supabase
      .from("threads")
      .insert({
        external_thread_id: payload.external_thread_id ?? null,
        subject: payload.subject,
        state: "NEW",
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    threadId = created.id;
  }

  // Insert message
  await supabase.from("messages").insert({
    thread_id: threadId,
    direction: "inbound",
    from_email: payload.from_email ?? null,
    to_email: payload.to_email ?? null,
    body_text: payload.body_text,
    body_html: payload.body_html ?? null,
    raw: payload.raw ?? null,
  });

  const { intent, confidence } = classifyIntent(payload.subject, payload.body_text);

  // Decide action (MVP)
  let action: string = "ASK_CLARIFYING_QUESTIONS";
  let draft: string | null = null;

  if (intent === "THANK_YOU_CLOSE") {
    action = "NO_REPLY";
    await supabase.from("threads").update({ state: "RESOLVED", last_intent: intent }).eq("id", threadId);
  } else if (intent === "DOCS_VIDEO_MISMATCH") {
    action = "SEND_PREAPPROVED_MACRO";
    draft = macroDocsVideoMismatch();
  } else if (intent === "FIRMWARE_ACCESS_ISSUE") {
    action = "ASK_CLARIFYING_QUESTIONS";
    draft = macroFirmwareAccessClarify();
  } else if (intent === "CHARGEBACK_THREAT") {
    action = "ESCALATE_WITH_DRAFT";
    draft = `Draft only (escalate): Customer mentions chargeback/dispute. Do not promise. Ask for order # + summarize situation.`;
  } else {
    action = confidence >= 0.6 ? "ASK_CLARIFYING_QUESTIONS" : "ASK_CLARIFYING_QUESTIONS";
  }

  if (draft) {
    const gate = policyGate(draft);
    if (!gate.ok) {
      action = "ESCALATE_WITH_DRAFT";
      draft = `Policy gate blocked draft due to banned language: ${gate.reasons.join(", ")}`;
    }
  }

  await supabase.from("events").insert({
    thread_id: threadId,
    type: "auto_triage",
    payload: { intent, confidence, action, draft },
  });

  await supabase.from("threads").update({ last_intent: intent, updated_at: new Date().toISOString() }).eq("id", threadId);

  return NextResponse.json({ thread_id: threadId, intent, confidence, action, draft });
}
