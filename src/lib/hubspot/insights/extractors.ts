/**
 * Instruction and Pattern Extractors
 *
 * Extracts actionable insights from HubSpot emails.
 */

import { supabase } from "@/lib/db";
import type {
  ExtractedInstruction,
  InstructionType,
  KBGapCandidate,
  EscalationPattern,
  TopicCategory,
} from "./types";

// Instruction detection patterns
const INSTRUCTION_PATTERNS: Array<{
  pattern: RegExp;
  type: InstructionType;
  extractContext: boolean;
}> = [
  // Prohibitions
  { pattern: /don'?t\s+([^.!?\n]+)/gi, type: "prohibition", extractContext: true },
  { pattern: /never\s+([^.!?\n]+)/gi, type: "prohibition", extractContext: true },
  { pattern: /stop\s+([^.!?\n]+)/gi, type: "prohibition", extractContext: true },

  // Requirements
  { pattern: /always\s+([^.!?\n]+)/gi, type: "policy", extractContext: true },
  { pattern: /make sure\s+([^.!?\n]+)/gi, type: "policy", extractContext: true },
  { pattern: /ensure\s+([^.!?\n]+)/gi, type: "policy", extractContext: true },

  // Policy statements
  { pattern: /(?:refund|return).*(?:policy|subject to|fee)/gi, type: "policy", extractContext: true },
  { pattern: /(?:non[- ]?refundable|no refund)/gi, type: "policy", extractContext: true },
  { pattern: /cancellation fee/gi, type: "policy", extractContext: true },
  { pattern: /(?:within|outside)\s+(?:the\s+)?SLA/gi, type: "policy", extractContext: true },

  // Routing
  { pattern: /(?:email|contact|reach out to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g, type: "routing", extractContext: true },
  { pattern: /(?:is with|handled by|managed by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g, type: "routing", extractContext: true },

  // Escalation feedback
  { pattern: /shouldn'?t\s+(?:have\s+)?(?:been\s+)?escalat/gi, type: "escalation", extractContext: true },
  { pattern: /(?:too many|killing me with)\s+escalation/gi, type: "escalation", extractContext: true },
  { pattern: /I'?ll?\s+take\s+(?:it|this)\s+from here/gi, type: "escalation", extractContext: true },

  // KB facts
  { pattern: /(?:units?|products?)\s+(?:come|ship)\s+(?:with|pre)/gi, type: "kb_fact", extractContext: true },
  { pattern: /no need to\s+([^.!?\n]+)/gi, type: "kb_fact", extractContext: true },
  { pattern: /firmware.*(?:preinstalled|pre-installed)/gi, type: "kb_fact", extractContext: true },

  // Approvals
  { pattern: /(?:approved?|authorized?|go ahead)/gi, type: "approval", extractContext: true },
  { pattern: /(?:will|i'?ll)\s+(?:cancel|refund|replace|send)/gi, type: "approval", extractContext: true },
];

// Topic keywords for categorization
const TOPIC_KEYWORDS: Record<string, string[]> = {
  headlights: ["headlight", "light", "glowe", "led", "beam", "bulb", "lighting"],
  orders: ["order", "shipping", "tracking", "delivery", "cancel"],
  refunds: ["refund", "return", "exchange", "money back", "credit"],
  firmware: ["firmware", "update", "version", "flash"],
  escalation: ["escalate", "escalation", "urgent", "priority"],
  support: ["support", "customer", "respond", "reply"],
};

/**
 * Extract instructions from Rob's emails
 */
export async function extractInstructions(): Promise<{
  extracted: number;
  errors: string[];
}> {
  // Get Rob's emails that haven't been processed
  const { data: emails, error } = await supabase
    .from("hubspot_emails")
    .select("id, body_text, subject")
    .eq("email_category", "rob_instruction")
    .is("processed_at", null);

  if (error) {
    return { extracted: 0, errors: [error.message] };
  }

  let extracted = 0;
  const errors: string[] = [];

  for (const email of emails || []) {
    const fullText = `${email.subject}\n${email.body_text}`;
    const instructions: ExtractedInstruction[] = [];

    // Try each pattern
    for (const { pattern, type, extractContext } of INSTRUCTION_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex state
      let match;

      while ((match = pattern.exec(fullText)) !== null) {
        // Get surrounding context
        const matchStart = match.index;
        const contextStart = Math.max(0, matchStart - 50);
        const contextEnd = Math.min(fullText.length, matchStart + match[0].length + 100);
        const context = fullText.slice(contextStart, contextEnd).trim();

        // Determine what this instruction applies to
        const appliesTo: string[] = [];
        const contextLower = context.toLowerCase();

        for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
          if (keywords.some((kw) => contextLower.includes(kw))) {
            appliesTo.push(topic);
          }
        }

        // Extract keywords from the match
        const keywords = match[0]
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);

        instructions.push({
          email_id: email.id,
          instruction_text: extractContext ? context : match[0],
          instruction_type: type,
          applies_to: appliesTo.length > 0 ? appliesTo : ["general"],
          keywords,
        });
      }
    }

    // Insert extracted instructions
    if (instructions.length > 0) {
      const { error: insertError } = await supabase
        .from("extracted_instructions")
        .insert(instructions);

      if (insertError) {
        errors.push(`Email ${email.id}: ${insertError.message}`);
      } else {
        extracted += instructions.length;
      }
    }

    // Mark email as processed
    await supabase
      .from("hubspot_emails")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", email.id);
  }

  return { extracted, errors };
}

/**
 * Identify KB gaps from customer questions
 */
export async function identifyKBGaps(): Promise<{
  identified: number;
  errors: string[];
}> {
  // Get customer questions that haven't been analyzed
  const { data: emails, error } = await supabase
    .from("hubspot_emails")
    .select("id, body_text, subject, topic")
    .eq("email_category", "customer_question")
    .is("processed_at", null);

  if (error) {
    return { identified: 0, errors: [error.message] };
  }

  let identified = 0;
  const errors: string[] = [];

  for (const email of emails || []) {
    const questionText = `${email.subject}\n${email.body_text}`.slice(0, 500);
    const topic = email.topic as TopicCategory || "uncategorized";

    // Determine gap severity based on topic and content
    let severity: "high" | "medium" | "low" = "low";

    // High severity: Technical questions, compatibility, installation
    if (["compatibility", "installation", "firmware_updates"].includes(topic)) {
      severity = "high";
    }
    // Medium severity: Feature questions, audio/display issues
    else if (["audio_sound", "screen_display", "carplay_android_auto"].includes(topic)) {
      severity = "medium";
    }

    // Check if question contains specific product/model references
    if (/\b(q50|q60|mk7|mk8|aucar|apex)\b/i.test(questionText)) {
      severity = severity === "low" ? "medium" : "high";
    }

    const gap: KBGapCandidate = {
      email_id: email.id,
      question_text: questionText,
      topic,
      gap_severity: severity,
    };

    const { error: insertError } = await supabase
      .from("kb_gap_candidates")
      .insert(gap);

    if (insertError) {
      errors.push(`Email ${email.id}: ${insertError.message}`);
    } else {
      identified++;
    }

    // Mark email as processed
    await supabase
      .from("hubspot_emails")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", email.id);
  }

  return { identified, errors };
}

/**
 * Extract escalation patterns from Rob's feedback
 */
export async function extractEscalationPatterns(): Promise<{
  found: number;
  errors: string[];
}> {
  // Get Rob's emails that contain escalation-related content
  const { data: emails, error } = await supabase
    .from("hubspot_emails")
    .select("id, body_text, subject")
    .eq("email_category", "rob_instruction")
    .or("body_text.ilike.%escalat%,body_text.ilike.%take it from here%,body_text.ilike.%killing me%");

  if (error) {
    return { found: 0, errors: [error.message] };
  }

  let found = 0;
  const errors: string[] = [];

  const escalationIndicators = [
    { pattern: /shouldn'?t\s+(?:have\s+)?(?:been\s+)?escalat/i, type: "should_not_escalate" as const },
    { pattern: /too many.*escalation|killing me.*escalation/i, type: "should_not_escalate" as const },
    { pattern: /I'?ll?\s+take\s+(?:it|this)\s+from here/i, type: "takeover" as const },
    { pattern: /stop\s+respond/i, type: "takeover" as const },
    { pattern: /needs?\s+(?:my|immediate)\s+(?:attention|approval)/i, type: "should_escalate" as const },
  ];

  for (const email of emails || []) {
    const fullText = `${email.subject}\n${email.body_text}`;

    for (const { pattern, type } of escalationIndicators) {
      if (pattern.test(fullText)) {
        // Extract the feedback context
        const match = fullText.match(pattern);
        if (!match) continue;

        const matchIndex = match.index || 0;
        const contextStart = Math.max(0, matchIndex - 100);
        const contextEnd = Math.min(fullText.length, matchIndex + match[0].length + 200);
        const context = fullText.slice(contextStart, contextEnd).trim();

        // Try to extract the trigger/reason
        let triggerDescription = "Unknown trigger";
        const reasonPatterns = [
          /(?:He|She|They|Customer)\s+ordered?\s+([^.]+)/i,
          /(?:still\s+)?(?:well\s+)?within\s+(?:the\s+)?SLA/i,
          /(?:first|same)\s+business\s+day/i,
        ];

        for (const rp of reasonPatterns) {
          const reasonMatch = context.match(rp);
          if (reasonMatch) {
            triggerDescription = reasonMatch[0];
            break;
          }
        }

        // Generate suggested rule
        let suggestedRule = "";
        if (type === "should_not_escalate") {
          suggestedRule = `Do not escalate when: ${triggerDescription}`;
        } else if (type === "takeover") {
          suggestedRule = `Hand off to human when customer becomes adversarial or escalation loop detected`;
        }

        const escalationPattern: EscalationPattern = {
          email_id: email.id,
          pattern_type: type,
          trigger_description: triggerDescription,
          rob_feedback: context,
          suggested_rule: suggestedRule,
        };

        const { error: insertError } = await supabase
          .from("escalation_patterns")
          .insert(escalationPattern);

        if (insertError) {
          errors.push(`Email ${email.id}: ${insertError.message}`);
        } else {
          found++;
        }

        break; // Only one pattern per email
      }
    }
  }

  return { found, errors };
}

/**
 * Run all extraction processes
 */
export async function runAllExtractors(): Promise<{
  instructions: { extracted: number; errors: string[] };
  kbGaps: { identified: number; errors: string[] };
  escalationPatterns: { found: number; errors: string[] };
}> {
  const [instructions, kbGaps, escalationPatterns] = await Promise.all([
    extractInstructions(),
    identifyKBGaps(),
    extractEscalationPatterns(),
  ]);

  return { instructions, kbGaps, escalationPatterns };
}
