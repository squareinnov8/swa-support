/**
 * Feedback Integration
 *
 * Uses LLM to intelligently merge feedback into relevant instruction sections.
 */

import { supabase } from "@/lib/db";
import { getClient, isLLMConfigured } from "@/lib/llm/client";

type Instruction = {
  id: string;
  section_key: string;
  title: string;
  content: string;
  version: number;
};

type FeedbackContext = {
  feedbackId: string;
  rating: "approved" | "rejected" | "needs_edit";
  feedbackNotes: string;
  draftText: string;
  intent: string | null;
};

/**
 * Integrate feedback into relevant instruction sections
 *
 * Flow:
 * 1. Get all instruction sections
 * 2. Use LLM to identify which section(s) are relevant
 * 3. Use LLM to rewrite that section incorporating the feedback
 * 4. Save the updated instruction with history
 */
export async function integrateFeedback(
  feedback: FeedbackContext
): Promise<{ success: boolean; updatedSections: string[]; error?: string }> {
  if (!isLLMConfigured()) {
    return { success: false, updatedSections: [], error: "LLM not configured" };
  }

  try {
    // 1. Get all instruction sections
    const { data: instructions, error: fetchError } = await supabase
      .from("agent_instructions")
      .select("*")
      .order("display_order");

    if (fetchError || !instructions || instructions.length === 0) {
      return { success: false, updatedSections: [], error: "No instructions found" };
    }

    // 2. Identify relevant section(s)
    const relevantSections = await identifyRelevantSections(instructions, feedback);

    if (relevantSections.length === 0) {
      console.log("No relevant sections identified for feedback");
      return { success: true, updatedSections: [] };
    }

    // 3. For each relevant section, generate updated content
    const updatedSections: string[] = [];

    for (const sectionKey of relevantSections) {
      const instruction = instructions.find((i) => i.section_key === sectionKey);
      if (!instruction) continue;

      const updatedContent = await generateUpdatedContent(instruction, feedback);

      if (updatedContent && updatedContent !== instruction.content) {
        // 4. Save the updated instruction
        const newVersion = (instruction.version || 1) + 1;

        // Save history
        await supabase.from("agent_instruction_history").insert({
          instruction_id: instruction.id,
          previous_content: instruction.content,
          new_content: updatedContent,
          change_reason: `Feedback integration: ${feedback.rating} - ${feedback.feedbackNotes.slice(0, 100)}`,
          feedback_id: feedback.feedbackId,
          version: newVersion,
          created_by: "system",
        });

        // Update instruction
        await supabase
          .from("agent_instructions")
          .update({
            content: updatedContent,
            version: newVersion,
            updated_at: new Date().toISOString(),
            updated_by: "feedback_system",
          })
          .eq("id", instruction.id);

        updatedSections.push(sectionKey);
      }
    }

    return { success: true, updatedSections };
  } catch (error) {
    console.error("Feedback integration error:", error);
    return {
      success: false,
      updatedSections: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Use LLM to identify which instruction sections are relevant to the feedback
 */
async function identifyRelevantSections(
  instructions: Instruction[],
  feedback: FeedbackContext
): Promise<string[]> {
  const client = getClient();

  const sectionList = instructions
    .map((i) => `- ${i.section_key}: ${i.title}`)
    .join("\n");

  const prompt = `You are analyzing feedback on an AI support agent's draft response.

## Available Instruction Sections:
${sectionList}

## Feedback Context:
- Rating: ${feedback.rating}
- Intent: ${feedback.intent || "unknown"}
- Feedback Notes: ${feedback.feedbackNotes}
- Draft that received feedback:
"""
${feedback.draftText}
"""

## Task:
Identify which instruction section(s) should be updated based on this feedback.
Return ONLY the section_key values as a JSON array, e.g., ["tone_style", "intent_firmware"]
If no sections need updating (e.g., the feedback is about something outside instruction scope), return []

Consider:
- If feedback is about tone/style → "tone_style"
- If feedback is about safety/promises → "core_rules"
- If feedback is about a specific intent → the matching "intent_*" section
- If feedback mentions citations → "citations"

Return only the JSON array, no other text.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 100,
  });

  const text = response.choices[0]?.message?.content?.trim() || "[]";

  try {
    // Parse JSON array from response ([\s\S]* matches any char including newlines)
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]) as string[];
    }
  } catch {
    console.warn("Failed to parse section identification:", text);
  }

  return [];
}

/**
 * Use LLM to generate updated instruction content incorporating feedback
 */
async function generateUpdatedContent(
  instruction: Instruction,
  feedback: FeedbackContext
): Promise<string | null> {
  const client = getClient();

  const prompt = `You are updating an instruction section for an AI support agent based on human feedback.

## Current Instruction Section: "${instruction.title}"
"""
${instruction.content}
"""

## Feedback Received:
- Rating: ${feedback.rating}
- Intent: ${feedback.intent || "unknown"}
- Notes: ${feedback.feedbackNotes}
- Draft that received this feedback:
"""
${feedback.draftText}
"""

## Task:
Rewrite the instruction section to incorporate this feedback.

CRITICAL RULES:
1. INTEGRATE the feedback into the existing structure - don't just append
2. If feedback contradicts existing instructions, update/replace the relevant part
3. Keep the same general format and organization
4. Be concise - don't bloat the instructions
5. Remove any conflicting or duplicative guidance
6. If the feedback suggests adding a new rule/guideline, integrate it naturally

If the feedback is an "approved" rating with no notes, the instructions are working well - return the content unchanged.
If the feedback is "rejected" or "needs_edit", identify what went wrong and add/modify instructions to prevent it.

Return ONLY the updated instruction content, no explanations or preamble.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
  });

  return response.choices[0]?.message?.content?.trim() || null;
}
