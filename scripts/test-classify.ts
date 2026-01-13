/**
 * Test intent classification
 */

import { classifyIntent } from "../src/lib/intents/classify";

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

console.log("Testing intent classification:\n");

for (const tc of testCases) {
  const result = classifyIntent(tc.subject, tc.body);
  console.log(`Subject: "${tc.subject}"`);
  console.log(`Body: "${tc.body.substring(0, 50)}..."`);
  console.log(`=> Intent: ${result.intent} (${result.confidence})\n`);
}
