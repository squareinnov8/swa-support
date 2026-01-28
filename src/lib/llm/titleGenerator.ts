/**
 * Thread Title Generator
 *
 * Generates brief, scannable titles for support threads.
 * Titles are 3-6 words that capture the essence of the conversation.
 */

import { generate, isLLMConfigured } from "./client";
import { supabase } from "@/lib/db";
import type { Intent } from "@/lib/intents/taxonomy";

/**
 * Generate a brief title for a thread
 *
 * @param subject - Email subject line
 * @param firstMessage - First customer message content
 * @param intent - Classified intent (optional)
 * @returns Brief title (3-6 words)
 */
export async function generateThreadTitle(
  subject: string,
  firstMessage: string,
  intent?: Intent
): Promise<string> {
  if (!isLLMConfigured()) {
    // Fallback: use truncated subject
    return subject.slice(0, 50);
  }

  const prompt = `Generate a brief title (3-6 words) for this support thread.

The title should:
- Be scannable at a glance in an inbox list
- Capture the main topic/request
- Use lowercase except for proper nouns
- Start with a category prefix when appropriate:
  - "order #XXXX:" for order-related issues
  - "prospect:" for pre-sale questions
  - "support:" for product help
  - "return:" for return/refund requests
  - "firmware:" for firmware issues

Examples:
- "order #4094: tracking request"
- "prospect: military discount, jeep compatibility"
- "support: G-Series installation help"
- "return: wrong item received"
- "firmware: update not working"

Subject: ${subject}
${intent ? `Intent: ${intent}` : ""}

Customer message:
${firstMessage.slice(0, 500)}

Generate ONLY the title, nothing else:`;

  try {
    const result = await generate(prompt, {
      temperature: 0.3,
      maxTokens: 50,
    });

    // Clean up the result - remove quotes, trim
    let title = result.content
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^title:\s*/i, "");

    // Ensure reasonable length
    if (title.length > 60) {
      title = title.slice(0, 57) + "...";
    }

    return title;
  } catch (error) {
    console.error("[TitleGenerator] Error generating title:", error);
    // Fallback to truncated subject
    return subject.slice(0, 50);
  }
}

/**
 * Generate and save a title for a thread
 */
export async function generateAndSaveThreadTitle(
  threadId: string,
  subject: string,
  firstMessage: string,
  intent?: Intent
): Promise<string> {
  const title = await generateThreadTitle(subject, firstMessage, intent);

  const { error } = await supabase
    .from("threads")
    .update({ title })
    .eq("id", threadId);

  if (error) {
    console.error("[TitleGenerator] Failed to save title:", error.message);
  }

  return title;
}

/**
 * Generate titles for threads that don't have one
 * Useful for backfilling existing threads
 */
export async function backfillThreadTitles(limit: number = 50): Promise<number> {
  // Get threads without titles
  const { data: threads, error } = await supabase
    .from("threads")
    .select("id, subject, last_intent")
    .is("title", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !threads) {
    console.error("[TitleGenerator] Failed to fetch threads:", error?.message);
    return 0;
  }

  let count = 0;
  for (const thread of threads) {
    // Get first customer message
    const { data: firstMessage } = await supabase
      .from("messages")
      .select("body_text")
      .eq("thread_id", thread.id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (firstMessage?.body_text) {
      await generateAndSaveThreadTitle(
        thread.id,
        thread.subject || "",
        firstMessage.body_text,
        thread.last_intent as Intent | undefined
      );
      count++;
    }
  }

  return count;
}
