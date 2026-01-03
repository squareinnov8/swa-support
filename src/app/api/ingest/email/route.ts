import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/db";
import { classifyIntent } from "@/lib/intents/classify";
import { checkRequiredInfo, generateMissingInfoPrompt } from "@/lib/intents/requiredInfo";
import { policyGate } from "@/lib/responders/policyGate";
import { macroDocsVideoMismatch, macroFirmwareAccessClarify } from "@/lib/responders/macros";
import { getNextState, getTransitionReason, type ThreadState, type Action } from "@/lib/threads/stateMachine";

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
  let currentState: ThreadState = "NEW";

  if (payload.external_thread_id) {
    const { data: existing } = await supabase
      .from("threads")
      .select("id, state")
      .eq("external_thread_id", payload.external_thread_id)
      .maybeSingle();

    if (existing?.id) {
      threadId = existing.id;
      currentState = (existing.state as ThreadState) || "NEW";
    }
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
    currentState = "NEW";
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

  // Check required info for this intent
  const fullText = `${payload.subject}\n${payload.body_text}`;
  const requiredInfoCheck = checkRequiredInfo(intent, fullText);

  // Decide action (MVP)
  let action: Action = "ASK_CLARIFYING_QUESTIONS";
  let draft: string | null = null;
  let policyBlocked = false;

  if (intent === "THANK_YOU_CLOSE") {
    action = "NO_REPLY";
  } else if (intent === "CHARGEBACK_THREAT") {
    // Always escalate chargebacks, regardless of required info
    action = "ESCALATE_WITH_DRAFT";
    draft = `Draft only (escalate): Customer mentions chargeback/dispute. Do not promise. Ask for order # + summarize situation.`;
  } else if (!requiredInfoCheck.allRequiredPresent) {
    // Missing required info - ask for it
    action = "ASK_CLARIFYING_QUESTIONS";
    // Use specific macro if available, otherwise generate from missing fields
    if (intent === "FIRMWARE_ACCESS_ISSUE") {
      draft = macroFirmwareAccessClarify();
    } else if (intent === "DOCS_VIDEO_MISMATCH") {
      draft = macroDocsVideoMismatch();
    } else {
      draft = generateMissingInfoPrompt(requiredInfoCheck.missingRequired);
    }
  } else if (intent === "DOCS_VIDEO_MISMATCH") {
    action = "SEND_PREAPPROVED_MACRO";
    draft = macroDocsVideoMismatch();
  } else if (intent === "FIRMWARE_ACCESS_ISSUE") {
    // Has required info - could proceed with more specific help
    action = "ASK_CLARIFYING_QUESTIONS";
    draft = macroFirmwareAccessClarify();
  } else {
    // Default: ask clarifying questions
    action = "ASK_CLARIFYING_QUESTIONS";
  }

  // Policy gate check
  if (draft) {
    const gate = policyGate(draft);
    if (!gate.ok) {
      action = "ESCALATE_WITH_DRAFT";
      policyBlocked = true;
      draft = `Policy gate blocked draft due to banned language: ${gate.reasons.join(", ")}`;
    }
  }

  // Calculate next state using state machine
  const transitionContext = {
    currentState,
    action,
    intent,
    policyBlocked,
    missingRequiredInfo: !requiredInfoCheck.allRequiredPresent,
  };
  const nextState = getNextState(transitionContext);
  const stateChangeReason = currentState !== nextState ? getTransitionReason(transitionContext, nextState) : null;

  await supabase.from("events").insert({
    thread_id: threadId,
    type: "auto_triage",
    payload: {
      intent,
      confidence,
      action,
      draft,
      requiredInfo: {
        allPresent: requiredInfoCheck.allRequiredPresent,
        missingFields: requiredInfoCheck.missingRequired.map((f) => f.id),
        presentFields: requiredInfoCheck.presentFields.map((f) => f.id),
      },
      stateTransition: {
        from: currentState,
        to: nextState,
        reason: stateChangeReason,
      },
    },
  });

  // Update thread with new state and intent
  await supabase
    .from("threads")
    .update({
      state: nextState,
      last_intent: intent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  return NextResponse.json({
    thread_id: threadId,
    intent,
    confidence,
    action,
    draft,
    state: nextState,
    previous_state: currentState,
  });
}
