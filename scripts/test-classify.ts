/**
 * Test intent classification using LLM
 *
 * As of Jan 2026, intent classification uses LLM via classifyWithLLM()
 * Requires OPENAI_API_KEY environment variable.
 */

import { classifyWithLLM } from "../src/lib/intents/llmClassify";
import { isLLMConfigured } from "../src/lib/llm/client";

const testCases = [
  { subject: "Honor combo deal", body: "Thanks, you too!" },
  { subject: "Re: Order Status", body: "Thanks!" },
  { subject: "Re: Support", body: "Great, thanks!" },
  { subject: "Re: Help", body: "Perfect, will do!" },
  { subject: "Re: Issue", body: "Appreciate it!" },
  { subject: "Re: Support", body: "Thanks, you too!\n\nOn Mon, Jan 12, 2026 wrote:\n> Previous message about issues" },
  { subject: "MK7 Audio Issue", body: "Still having audio problems with my MK7" },
  { subject: "Order #4013", body: "When will my order ship?" },
];

async function main() {
  if (!isLLMConfigured()) {
    console.error("Error: OPENAI_API_KEY not configured");
    process.exit(1);
  }

  console.log("Testing LLM-based intent classification:\n");

  for (const tc of testCases) {
    const result = await classifyWithLLM(tc.subject, tc.body);
    console.log(`Subject: "${tc.subject}"`);
    console.log(`Body: "${tc.body.substring(0, 50)}..."`);
    console.log(`=> Primary: ${result.primary_intent}`);
    console.log(`   Intents: ${result.intents.map(i => `${i.slug} (${i.confidence})`).join(", ")}`);
    console.log(`   Verification: ${result.requires_verification}, Escalate: ${result.auto_escalate}`);
    console.log(`   Missing info: ${result.missing_info.map(i => i.id).join(", ") || "none"}`);
    console.log("");
  }
}

main().catch(console.error);
