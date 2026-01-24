/**
 * Thread Analysis Script
 *
 * Pulls all production threads and analyzes them from customer perspective.
 * Identifies gaps in logic and customer experience issues.
 *
 * Run: npx tsx scripts/analyze-threads.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ThreadAnalysis = {
  id: string;
  subject: string;
  state: string;
  lastIntent: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  draftCount: number;
  sentCount: number;
  verificationStatus: string | null;
  customerName: string | null;
  customerEmail: string | null;

  // Analysis
  customerPerspective: {
    hasAnswer: boolean;
    waitingForResponse: boolean;
    waitingDays: number;
    lastCustomerMessage: string | null;
    lastAgentResponse: string | null;
    issueResolved: boolean;
  };

  issues: string[];

  // Full data for detailed review
  messages: Array<{
    direction: string;
    role: string | null;
    body: string;
    createdAt: string;
    fromEmail: string | null;
  }>;

  draftGeneration: {
    policyGatePassed: boolean;
    policyViolations: string[];
    kbDocsUsed: number;
    wasSent: boolean;
  } | null;
};

async function analyzeThread(threadId: string): Promise<ThreadAnalysis | null> {
  // Get thread
  const { data: thread } = await supabase
    .from("threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (!thread) return null;

  // Get messages
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  // Get verification
  const { data: verification } = await supabase
    .from("customer_verifications")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get latest draft generation
  const { data: draftGen } = await supabase
    .from("draft_generations")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const allMessages = messages || [];
  const regularMessages = allMessages.filter(m => m.role !== "draft" && m.role !== "internal");
  const draftMessages = allMessages.filter(m => m.role === "draft");
  const sentMessages = allMessages.filter(m => m.direction === "outbound" && m.role !== "draft");

  // Find last customer message
  const customerMessages = regularMessages.filter(m => m.direction === "inbound");
  const agentMessages = regularMessages.filter(m => m.direction === "outbound");

  const lastCustomerMessage = customerMessages[customerMessages.length - 1];
  const lastAgentResponse = agentMessages[agentMessages.length - 1];

  // Calculate waiting time
  const lastMessageTime = new Date(thread.last_message_at || thread.created_at);
  const now = new Date();
  const waitingDays = Math.floor((now.getTime() - lastMessageTime.getTime()) / (1000 * 60 * 60 * 24));

  // Determine customer perspective
  const hasAnswer = agentMessages.length > 0 || sentMessages.length > 0;
  const lastMessageWasCustomer = lastCustomerMessage &&
    (!lastAgentResponse || new Date(lastCustomerMessage.created_at) > new Date(lastAgentResponse.created_at));
  const waitingForResponse = lastMessageWasCustomer && thread.state !== "RESOLVED";
  const issueResolved = thread.state === "RESOLVED";

  // Identify issues
  const issues: string[] = [];

  // Issue: Customer waiting too long
  if (waitingForResponse && waitingDays >= 2) {
    issues.push(`Customer waiting ${waitingDays} days for response`);
  }

  // Issue: Stuck in AWAITING_INFO
  if (thread.state === "AWAITING_INFO" && waitingDays >= 3) {
    issues.push(`Stuck in AWAITING_INFO for ${waitingDays} days`);
  }

  // Issue: Stuck in ESCALATED
  if (thread.state === "ESCALATED" && waitingDays >= 1) {
    issues.push(`Escalated and waiting ${waitingDays} days for Rob`);
  }

  // Issue: Draft blocked but no alternative
  if (draftGen && !draftGen.policy_gate_passed && draftMessages.length === 0) {
    issues.push(`Draft blocked by policy gate: ${draftGen.policy_violations?.join(", ")}`);
  }

  // Issue: Verification pending but customer already provided info
  if (verification?.status === "pending" && thread.state === "AWAITING_INFO") {
    // Check if customer replied with order info
    const customerReplies = customerMessages.slice(1); // After first message
    if (customerReplies.length > 0) {
      issues.push("Customer replied but still in AWAITING_INFO - possible stuck verification");
    }
  }

  // Issue: Multiple clarifying questions asked
  const clarifyingMessages = agentMessages.filter(m =>
    m.body_text?.toLowerCase().includes("could you") ||
    m.body_text?.toLowerCase().includes("can you provide") ||
    m.body_text?.toLowerCase().includes("order number")
  );
  if (clarifyingMessages.length >= 2) {
    issues.push(`Asked for clarification ${clarifyingMessages.length} times - possible loop`);
  }

  // Issue: No KB docs used when should have
  if (draftGen && draftGen.kb_docs_used?.length === 0 &&
      !["THANK_YOU_CLOSE", "VENDOR_SPAM", "UNKNOWN"].includes(thread.last_intent)) {
    issues.push("No KB docs used for substantive intent");
  }

  // Issue: HUMAN_HANDLING with no recent activity
  if (thread.state === "HUMAN_HANDLING" && waitingDays >= 2) {
    issues.push(`In HUMAN_HANDLING mode for ${waitingDays} days - possibly stuck`);
  }

  return {
    id: thread.id,
    subject: thread.subject || "(no subject)",
    state: thread.state,
    lastIntent: thread.last_intent,
    createdAt: thread.created_at,
    lastMessageAt: thread.last_message_at || thread.created_at,
    messageCount: regularMessages.length,
    draftCount: draftMessages.length,
    sentCount: sentMessages.length,
    verificationStatus: verification?.status || null,
    customerName: verification?.customer_name || null,
    customerEmail: regularMessages.find(m => m.direction === "inbound")?.from_email || null,

    customerPerspective: {
      hasAnswer,
      waitingForResponse,
      waitingDays,
      lastCustomerMessage: lastCustomerMessage?.body_text?.slice(0, 200) || null,
      lastAgentResponse: lastAgentResponse?.body_text?.slice(0, 200) || null,
      issueResolved,
    },

    issues,

    messages: allMessages.map(m => ({
      direction: m.direction,
      role: m.role,
      body: m.body_text?.slice(0, 500) || "",
      createdAt: m.created_at,
      fromEmail: m.from_email,
    })),

    draftGeneration: draftGen ? {
      policyGatePassed: draftGen.policy_gate_passed,
      policyViolations: draftGen.policy_violations || [],
      kbDocsUsed: draftGen.kb_docs_used?.length || 0,
      wasSent: draftGen.was_sent,
    } : null,
  };
}

async function main() {
  console.log("Fetching all threads...\n");

  // Get all non-archived threads
  const { data: threads, error } = await supabase
    .from("threads")
    .select("id, subject, state, last_intent, created_at, last_message_at, is_archived")
    .or("is_archived.is.null,is_archived.eq.false")
    .order("last_message_at", { ascending: false });

  if (error) {
    console.error("Error fetching threads:", error);
    process.exit(1);
  }

  console.log(`Found ${threads?.length || 0} threads to analyze\n`);

  const analyses: ThreadAnalysis[] = [];
  const issuesByType: Record<string, ThreadAnalysis[]> = {};

  for (const thread of threads || []) {
    const analysis = await analyzeThread(thread.id);
    if (analysis) {
      analyses.push(analysis);

      // Group by issue type
      for (const issue of analysis.issues) {
        const issueType = issue.split(" ")[0]; // First word as category
        if (!issuesByType[issueType]) {
          issuesByType[issueType] = [];
        }
        issuesByType[issueType].push(analysis);
      }
    }
  }

  // Print summary
  console.log("=" .repeat(80));
  console.log("THREAD ANALYSIS SUMMARY");
  console.log("=" .repeat(80));

  // State distribution
  const stateCount: Record<string, number> = {};
  for (const a of analyses) {
    stateCount[a.state] = (stateCount[a.state] || 0) + 1;
  }
  console.log("\n📊 State Distribution:");
  for (const [state, count] of Object.entries(stateCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${state}: ${count}`);
  }

  // Threads with issues
  const threadsWithIssues = analyses.filter(a => a.issues.length > 0);
  console.log(`\n⚠️  Threads with Issues: ${threadsWithIssues.length}/${analyses.length}`);

  // Issue breakdown
  console.log("\n🔍 Issues by Type:");
  for (const [issueType, threads] of Object.entries(issuesByType).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${issueType}: ${threads.length} threads`);
  }

  // Customer waiting analysis
  const waitingCustomers = analyses.filter(a => a.customerPerspective.waitingForResponse);
  console.log(`\n⏳ Customers Waiting for Response: ${waitingCustomers.length}`);

  // Detailed issue list
  console.log("\n" + "=" .repeat(80));
  console.log("DETAILED ISSUES");
  console.log("=" .repeat(80));

  for (const analysis of threadsWithIssues) {
    console.log(`\n📧 ${analysis.subject}`);
    console.log(`   ID: ${analysis.id}`);
    console.log(`   State: ${analysis.state} | Intent: ${analysis.lastIntent}`);
    console.log(`   Verification: ${analysis.verificationStatus || "none"}`);
    console.log(`   Messages: ${analysis.messageCount} | Drafts: ${analysis.draftCount} | Sent: ${analysis.sentCount}`);
    console.log(`   Issues:`);
    for (const issue of analysis.issues) {
      console.log(`     - ${issue}`);
    }
    if (analysis.customerPerspective.lastCustomerMessage) {
      console.log(`   Last customer message: "${analysis.customerPerspective.lastCustomerMessage.slice(0, 100)}..."`);
    }
  }

  // Full thread details for threads with issues
  console.log("\n" + "=" .repeat(80));
  console.log("FULL THREAD DETAILS (Issues Only)");
  console.log("=" .repeat(80));

  for (const analysis of threadsWithIssues.slice(0, 10)) { // Limit to first 10 for readability
    console.log(`\n${"─".repeat(80)}`);
    console.log(`Thread: ${analysis.subject}`);
    console.log(`ID: ${analysis.id}`);
    console.log(`State: ${analysis.state} | Intent: ${analysis.lastIntent}`);
    console.log(`Customer: ${analysis.customerName || "Unknown"} (${analysis.customerEmail || "no email"})`);
    console.log(`Verification: ${analysis.verificationStatus || "none"}`);
    console.log(`Issues: ${analysis.issues.join("; ")}`);
    console.log(`\nConversation:`);

    for (const msg of analysis.messages) {
      const role = msg.role ? `[${msg.role}]` : "";
      const direction = msg.direction === "inbound" ? "👤 Customer" : "🤖 Lina";
      console.log(`\n  ${direction} ${role} (${new Date(msg.createdAt).toLocaleString()}):`);
      console.log(`  ${msg.body.replace(/\n/g, "\n  ")}`);
    }

    if (analysis.draftGeneration) {
      console.log(`\n  Draft Generation:`);
      console.log(`    Policy Gate: ${analysis.draftGeneration.policyGatePassed ? "✅ Passed" : "❌ Blocked"}`);
      if (!analysis.draftGeneration.policyGatePassed) {
        console.log(`    Violations: ${analysis.draftGeneration.policyViolations.join(", ")}`);
      }
      console.log(`    KB Docs Used: ${analysis.draftGeneration.kbDocsUsed}`);
      console.log(`    Was Sent: ${analysis.draftGeneration.wasSent ? "Yes" : "No"}`);
    }
  }

  // Export full analysis to JSON
  const exportPath = `./data/thread-analysis-${new Date().toISOString().split("T")[0]}.json`;
  const fs = await import("fs");
  if (!fs.existsSync("./data")) {
    fs.mkdirSync("./data");
  }
  fs.writeFileSync(exportPath, JSON.stringify(analyses, null, 2));
  console.log(`\n\n📁 Full analysis exported to: ${exportPath}`);
}

main().catch(console.error);
