/**
 * LLM-Based Intent Classification
 *
 * Uses OpenAI to classify customer messages against dynamic intents from the database.
 * Supports multiple intents per message and provides confidence scores.
 */

import { getClient, isLLMConfigured } from "@/lib/llm/client";
import { supabase } from "@/lib/db";

interface Intent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  examples: string[];
  category: string;
  priority: number;
  requires_verification: boolean;
  auto_escalate: boolean;
}

export interface ClassificationResult {
  intents: Array<{
    slug: string;
    confidence: number;
    reasoning: string;
  }>;
  primary_intent: string;
  requires_verification: boolean;
  auto_escalate: boolean;
}

/**
 * Get active intents from database
 */
export async function getActiveIntents(): Promise<Intent[]> {
  const { data, error } = await supabase
    .from("intents")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (error) {
    console.error("Failed to fetch intents:", error);
    return [];
  }

  return data || [];
}

/**
 * Build the intent reference for the LLM prompt
 */
function buildIntentReference(intents: Intent[]): string {
  const byCategory: Record<string, Intent[]> = {};
  intents.forEach((i) => {
    if (!byCategory[i.category]) byCategory[i.category] = [];
    byCategory[i.category].push(i);
  });

  let ref = "";
  for (const [category, categoryIntents] of Object.entries(byCategory)) {
    ref += `\n## ${category.toUpperCase()}\n`;
    for (const intent of categoryIntents) {
      ref += `\n### ${intent.slug}\n`;
      ref += `Name: ${intent.name}\n`;
      if (intent.description) {
        ref += `Description: ${intent.description}\n`;
      }
      if (intent.examples && intent.examples.length > 0) {
        ref += `Examples: ${intent.examples.slice(0, 5).join(", ")}\n`;
      }
    }
  }

  return ref;
}

/**
 * Classify a message using LLM against database intents
 */
export async function classifyWithLLM(
  subject: string,
  body: string,
  conversationContext?: string
): Promise<ClassificationResult> {
  // Check if LLM is configured before attempting classification
  if (!isLLMConfigured()) {
    console.warn("LLM not configured (OPENAI_API_KEY missing), returning UNKNOWN");
    return {
      intents: [{ slug: "UNKNOWN", confidence: 0.3, reasoning: "LLM not configured" }],
      primary_intent: "UNKNOWN",
      requires_verification: false,
      auto_escalate: false,
    };
  }

  const intents = await getActiveIntents();

  if (intents.length === 0) {
    console.warn("No active intents found, returning UNKNOWN");
    return {
      intents: [{ slug: "UNKNOWN", confidence: 1.0, reasoning: "No intents configured" }],
      primary_intent: "UNKNOWN",
      requires_verification: false,
      auto_escalate: false,
    };
  }

  const intentReference = buildIntentReference(intents);
  const intentSlugs = intents.map((i) => i.slug);

  const systemPrompt = `You are an intent classifier for a customer support system. Your job is to analyze customer messages and classify them into one or more predefined intents.

AVAILABLE INTENTS:
${intentReference}

CLASSIFICATION RULES:
1. A message can have MULTIPLE intents if the customer is asking about multiple things
2. Assign confidence scores from 0.0 to 1.0 for each intent
3. Only include intents with confidence >= 0.5
4. If no intent matches with >= 0.5 confidence, return UNKNOWN
5. Order intents by confidence (highest first)
6. Consider the conversation context if provided
7. VENDOR_SPAM includes: partnership pitches, marketing outreach, automated platform notifications, sales emails, SEO/PR agencies, anyone trying to sell services

VERIFICATION ASSESSMENT:
Determine if this request requires customer verification (proving they are who they claim to be) BEFORE we can help them. Set requires_verification: true if ANY of these apply:
- They're asking about a specific order, shipment, or purchase
- They want to modify, cancel, or return something
- They need account-specific information (order history, tracking, etc.)
- Helping without verification could enable fraud or privacy violations
- They're reporting issues with a product they claim to own

Set requires_verification: false if:
- This is a pre-sale question (compatibility, pricing, availability)
- This is a general product question not tied to a purchase
- This is spam or vendor outreach
- This is general feedback or a question anyone could ask

ESCALATION ASSESSMENT:
Set auto_escalate: true if:
- Customer mentions chargeback, dispute, or legal action
- Message contains threats, abuse, or extreme frustration
- Request involves refunds over $200 or unusual circumstances
- Something feels "off" that a human should review

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "intents": [
    {"slug": "INTENT_SLUG", "confidence": 0.85, "reasoning": "Brief explanation"}
  ],
  "primary_intent": "HIGHEST_CONFIDENCE_SLUG",
  "requires_verification": true,
  "verification_reason": "Why verification is/isn't needed",
  "auto_escalate": false,
  "escalation_reason": null
}`;

  const userMessage = `Classify this customer message:

SUBJECT: ${subject}

BODY:
${body}
${conversationContext ? `\nCONVERSATION CONTEXT:\n${conversationContext}` : ""}

Return ONLY the JSON classification, no other text.`;

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 500,
      temperature: 0.3, // Lower temperature for more consistent classification
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in response");
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize the response
    const validIntents = (parsed.intents || [])
      .filter((i: { slug: string; confidence: number }) =>
        intentSlugs.includes(i.slug) && i.confidence >= 0.5
      )
      .map((i: { slug: string; confidence: number; reasoning?: string }) => ({
        slug: i.slug,
        confidence: Math.min(1, Math.max(0, i.confidence)),
        reasoning: i.reasoning || "",
      }));

    if (validIntents.length === 0) {
      validIntents.push({
        slug: "UNKNOWN",
        confidence: 0.5,
        reasoning: "No intent matched with sufficient confidence",
      });
    }

    const primarySlug = validIntents[0]?.slug || "UNKNOWN";
    const primaryIntent = intents.find((i) => i.slug === primarySlug);

    // Use LLM's contextual assessment, with database intent as fallback
    const llmRequiresVerification = parsed.requires_verification;
    const llmAutoEscalate = parsed.auto_escalate;

    // Trust the LLM's contextual judgment over static intent definitions
    const requiresVerification = typeof llmRequiresVerification === "boolean"
      ? llmRequiresVerification
      : (primaryIntent?.requires_verification || false);

    const autoEscalate = typeof llmAutoEscalate === "boolean"
      ? llmAutoEscalate
      : (primaryIntent?.auto_escalate || false);

    // Log the reasoning for debugging
    if (parsed.verification_reason) {
      console.log(`[Classification] Verification: ${requiresVerification} - ${parsed.verification_reason}`);
    }
    if (parsed.escalation_reason) {
      console.log(`[Classification] Escalation: ${autoEscalate} - ${parsed.escalation_reason}`);
    }

    return {
      intents: validIntents,
      primary_intent: primarySlug,
      requires_verification: requiresVerification,
      auto_escalate: autoEscalate,
    };
  } catch (error) {
    console.error("LLM classification error:", error);
    return {
      intents: [{ slug: "UNKNOWN", confidence: 0.3, reasoning: "Classification error" }],
      primary_intent: "UNKNOWN",
      requires_verification: false,
      auto_escalate: false,
    };
  }
}

/**
 * Add classified intents to a thread
 */
export async function addIntentsToThread(
  threadId: string,
  classification: ClassificationResult,
  messageId?: string
): Promise<void> {
  for (const intent of classification.intents) {
    try {
      await supabase.rpc("add_thread_intent", {
        p_thread_id: threadId,
        p_intent_slug: intent.slug,
        p_confidence: intent.confidence,
        p_message_id: messageId || null,
      });
    } catch (error) {
      console.error(`Failed to add intent ${intent.slug} to thread:`, error);
    }
  }
}

/**
 * Get the primary intent for a thread (highest priority unresolved)
 */
export async function getThreadPrimaryIntent(threadId: string): Promise<string | null> {
  const { data } = await supabase
    .from("thread_intents")
    .select(`
      intents!inner(slug, priority)
    `)
    .eq("thread_id", threadId)
    .eq("is_resolved", false)
    .order("intents(priority)", { ascending: false })
    .limit(1)
    .single();

  return data ? (data.intents as unknown as { slug: string }).slug : null;
}

/**
 * Reclassify a thread based on new message
 * - If UNKNOWN was the only intent, remove it when a real intent is detected
 * - Add new intents without removing existing ones (unless UNKNOWN)
 */
export async function reclassifyThread(
  threadId: string,
  newMessage: { subject: string; body: string },
  messageId?: string
): Promise<ClassificationResult> {
  // Get existing intents
  const { data: existingIntents } = await supabase
    .from("thread_intents")
    .select(`
      intents!inner(slug)
    `)
    .eq("thread_id", threadId);

  const existingSlugs = existingIntents?.map((ti) => (ti.intents as unknown as { slug: string }).slug) || [];
  const hasOnlyUnknown = existingSlugs.length === 1 && existingSlugs[0] === "UNKNOWN";

  // Build context from previous messages
  const { data: messages } = await supabase
    .from("messages")
    .select("body_text, direction")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(5);

  const context = messages
    ?.map((m) => `[${m.direction}]: ${m.body_text?.substring(0, 200)}`)
    .join("\n");

  // Classify the new message
  const classification = await classifyWithLLM(
    newMessage.subject,
    newMessage.body,
    context
  );

  // Add new intents to thread
  // The add_thread_intent function automatically removes UNKNOWN when adding known intents
  await addIntentsToThread(threadId, classification, messageId);

  // Log the transition if we went from UNKNOWN to known
  if (hasOnlyUnknown && classification.primary_intent !== "UNKNOWN") {
    console.log(
      `Thread ${threadId}: Intent clarified from UNKNOWN to ${classification.primary_intent}`
    );

    // Record event
    await supabase.from("events").insert({
      thread_id: threadId,
      type: "INTENT_CLARIFIED",
      payload: {
        from: "UNKNOWN",
        to: classification.intents.map((i) => i.slug),
        message_id: messageId,
      },
    });
  }

  return classification;
}
