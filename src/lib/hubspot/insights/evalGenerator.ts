/**
 * Eval Test Case Generator
 *
 * Creates eval test cases from real Q&A pairs in HubSpot emails.
 */

import { supabase } from "@/lib/db";
import type { TopicCategory } from "./types";

type EvalTestCase = {
  question_email_id: string;
  response_email_id?: string;
  customer_message: string;
  expected_intent?: string;
  expected_response?: string;
  response_quality?: "excellent" | "good" | "needs_improvement";
  test_type: "intent_classification" | "response_quality" | "escalation_decision";
  topic?: string;
};

// Intent patterns for classification
const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: string }> = [
  // Order-related
  { pattern: /where.*order|track.*order|order.*status|when.*arrive|shipping.*update/i, intent: "ORDER_STATUS" },
  { pattern: /cancel.*order|change.*order|modify.*order/i, intent: "ORDER_CHANGE_REQUEST" },
  { pattern: /didn'?t.*receive|missing|never.*arrived|lost.*package/i, intent: "MISSING_DAMAGED_ITEM" },
  { pattern: /wrong.*item|incorrect.*product|sent.*wrong/i, intent: "WRONG_ITEM_RECEIVED" },
  { pattern: /return|refund|money back|exchange/i, intent: "RETURN_REFUND_REQUEST" },

  // Technical support
  { pattern: /firmware|update.*version|flash|download.*update/i, intent: "FIRMWARE_UPDATE_REQUEST" },
  { pattern: /can'?t.*access|unable.*download|firmware.*access/i, intent: "FIRMWARE_ACCESS_ISSUE" },
  { pattern: /install|wiring|connect|mount|plug|harness/i, intent: "INSTALL_GUIDANCE" },
  { pattern: /compatible|fit|work.*with|support.*model/i, intent: "COMPATIBILITY_QUESTION" },

  // Issues
  { pattern: /not working|doesn'?t work|broken|defective|issue|problem/i, intent: "FUNCTIONALITY_BUG" },
  { pattern: /no.*sound|audio.*issue|speaker|volume/i, intent: "FUNCTIONALITY_BUG" },
  { pattern: /screen.*black|display.*issue|touch.*not.*respond/i, intent: "FUNCTIONALITY_BUG" },
  { pattern: /carplay.*not|android auto.*not|wireless.*issue/i, intent: "FUNCTIONALITY_BUG" },
];

/**
 * Classify intent from message text
 */
function classifyIntent(text: string): string {
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(text)) {
      return intent;
    }
  }
  return "GENERAL";
}

/**
 * Match customer questions with support responses to create Q&A pairs
 */
async function findQAPairs(): Promise<
  Array<{
    question: { id: string; text: string; subject: string; topic: string; date: string };
    response?: { id: string; text: string; date: string };
  }>
> {
  // Get customer questions
  const { data: questions } = await supabase
    .from("hubspot_emails")
    .select("id, body_text, subject, topic, email_date, hubspot_contact_ids")
    .eq("email_category", "customer_question")
    .order("email_date", { ascending: true });

  // Get support responses
  const { data: responses } = await supabase
    .from("hubspot_emails")
    .select("id, body_text, email_date, hubspot_contact_ids")
    .in("email_category", ["support_response", "rob_instruction"])
    .order("email_date", { ascending: true });

  const pairs: Array<{
    question: { id: string; text: string; subject: string; topic: string; date: string };
    response?: { id: string; text: string; date: string };
  }> = [];

  for (const q of questions || []) {
    // Find a response from the same contact(s) that came after the question
    const matchingResponse = (responses || []).find((r) => {
      // Check if they share any contact IDs
      const qContacts = q.hubspot_contact_ids || [];
      const rContacts = r.hubspot_contact_ids || [];
      const sharedContact = qContacts.some((c: number) => rContacts.includes(c));

      // Response should be after question
      const isAfter = new Date(r.email_date) > new Date(q.email_date);

      // Response should be within 7 days
      const withinWeek =
        new Date(r.email_date).getTime() - new Date(q.email_date).getTime() <
        7 * 24 * 60 * 60 * 1000;

      return sharedContact && isAfter && withinWeek;
    });

    pairs.push({
      question: {
        id: q.id,
        text: q.body_text || "",
        subject: q.subject || "",
        topic: q.topic || "uncategorized",
        date: q.email_date,
      },
      response: matchingResponse
        ? {
            id: matchingResponse.id,
            text: matchingResponse.body_text || "",
            date: matchingResponse.email_date,
          }
        : undefined,
    });
  }

  return pairs;
}

/**
 * Generate eval test cases from email Q&A pairs
 */
export async function generateEvalTestCases(): Promise<{
  created: number;
  errors: string[];
}> {
  const pairs = await findQAPairs();
  let created = 0;
  const errors: string[] = [];

  for (const { question, response } of pairs) {
    // Skip very short questions
    if (question.text.length < 50) continue;

    // Classify the intent
    const intent = classifyIntent(`${question.subject} ${question.text}`);

    // Determine test type
    let testType: EvalTestCase["test_type"] = "intent_classification";

    if (response) {
      testType = "response_quality";
    }

    // Check if this is an escalation-related case
    if (
      question.text.toLowerCase().includes("urgent") ||
      question.text.toLowerCase().includes("escalat") ||
      question.text.toLowerCase().includes("speak to") ||
      question.text.toLowerCase().includes("manager")
    ) {
      testType = "escalation_decision";
    }

    // Assess response quality (basic heuristic)
    let responseQuality: EvalTestCase["response_quality"] | undefined;
    if (response) {
      const responseLength = response.text.length;
      const hasGreeting = /^(hi|hello|dear|thank)/i.test(response.text.trim());
      const hasSignoff = /(regards|best|thanks|rob|support)/i.test(response.text.trim());

      if (responseLength > 200 && hasGreeting && hasSignoff) {
        responseQuality = "excellent";
      } else if (responseLength > 100) {
        responseQuality = "good";
      } else {
        responseQuality = "needs_improvement";
      }
    }

    // Check if test case already exists
    const { data: existing } = await supabase
      .from("eval_test_cases")
      .select("id")
      .eq("question_email_id", question.id)
      .maybeSingle();

    if (existing) continue;

    // Create test case
    const testCase: EvalTestCase = {
      question_email_id: question.id,
      response_email_id: response?.id,
      customer_message: `${question.subject}\n\n${question.text}`.slice(0, 2000),
      expected_intent: intent,
      expected_response: response?.text.slice(0, 2000),
      response_quality: responseQuality,
      test_type: testType,
      topic: question.topic,
    };

    const { error } = await supabase.from("eval_test_cases").insert(testCase);

    if (error) {
      errors.push(`Question ${question.id}: ${error.message}`);
    } else {
      created++;
    }
  }

  return { created, errors };
}

/**
 * Get eval test cases for a specific test type
 */
export async function getEvalTestCases(options: {
  testType?: string;
  topic?: string;
  validated?: boolean;
  limit?: number;
}): Promise<EvalTestCase[]> {
  let query = supabase.from("eval_test_cases").select("*");

  if (options.testType) {
    query = query.eq("test_type", options.testType);
  }

  if (options.topic) {
    query = query.eq("topic", options.topic);
  }

  if (options.validated !== undefined) {
    query = query.eq("is_validated", options.validated);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data } = await query;
  return (data || []) as EvalTestCase[];
}

/**
 * Get eval statistics
 */
export async function getEvalStats(): Promise<{
  total: number;
  byType: Record<string, number>;
  byTopic: Record<string, number>;
  validated: number;
}> {
  const { data: cases } = await supabase
    .from("eval_test_cases")
    .select("test_type, topic, is_validated");

  const stats = {
    total: cases?.length || 0,
    byType: {} as Record<string, number>,
    byTopic: {} as Record<string, number>,
    validated: 0,
  };

  for (const c of cases || []) {
    stats.byType[c.test_type] = (stats.byType[c.test_type] || 0) + 1;
    if (c.topic) {
      stats.byTopic[c.topic] = (stats.byTopic[c.topic] || 0) + 1;
    }
    if (c.is_validated) {
      stats.validated++;
    }
  }

  return stats;
}
