/**
 * Escalation Email Generator
 *
 * Generates rich HTML emails for escalation notifications to Rob.
 * Includes customer profiles, issue analysis, and response instructions.
 */

import { supabase } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import type { CustomerProfile, EscalationEmailContent } from "@/lib/collaboration/types";

const anthropic = new Anthropic();

/**
 * Build customer profile for escalation email
 */
export async function buildCustomerProfile(
  email: string,
  currentIssue: string
): Promise<CustomerProfile> {
  // Get customer info
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, email, shopify_customer_id")
    .eq("email", email)
    .maybeSingle();

  // Get verification status
  const { data: verification } = await supabase
    .from("customer_verifications")
    .select("status, flags, verified_at")
    .eq("email", email)
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get order history from Shopify orders table (if exists)
  const { data: orders } = await supabase
    .from("orders")
    .select("order_number, created_at, total_price, financial_status")
    .eq("customer_email", email)
    .order("created_at", { ascending: false })
    .limit(5);

  // Get previous tickets/threads
  const { data: previousThreads } = await supabase
    .from("threads")
    .select("id, subject, state, last_intent, created_at")
    .eq("customer_id", customer?.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Calculate order metrics
  const orderHistory = {
    count: orders?.length || 0,
    totalSpent: orders?.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0) || 0,
    recentOrders: (orders || []).map((o) => ({
      orderNumber: o.order_number,
      date: new Date(o.created_at).toLocaleDateString(),
      total: parseFloat(o.total_price) || 0,
      status: o.financial_status || "unknown",
    })),
  };

  // Extract topics from previous tickets
  const topics = [...new Set(
    (previousThreads || [])
      .map((t) => t.last_intent)
      .filter((i): i is string => !!i)
  )];

  const lastOutcome = previousThreads?.[0]?.state || undefined;

  // Generate AI summary of relevant history if there's enough context
  let relevantHistory: string | undefined;
  if (previousThreads && previousThreads.length > 0) {
    relevantHistory = await generateHistorySummary(previousThreads, currentIssue);
  }

  return {
    name: customer?.name || "Unknown",
    email,
    verificationStatus: verification?.status || "unverified",
    verificationFlags: verification?.flags || undefined,
    orderHistory,
    previousTickets: {
      count: previousThreads?.length || 0,
      topics,
      lastOutcome,
    },
    relevantHistory,
  };
}

/**
 * Generate AI summary of customer history relevant to current issue
 */
async function generateHistorySummary(
  threads: Array<{ subject: string | null; last_intent: string | null; state: string; created_at: string }>,
  currentIssue: string
): Promise<string> {
  const threadSummaries = threads.map((t) =>
    `- ${t.created_at}: ${t.subject || "No subject"} (${t.last_intent || "unknown intent"}) - ${t.state}`
  ).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Given this customer's previous support history and their current issue, write a 1-2 sentence summary of what's most relevant.

Current Issue: ${currentIssue}

Previous Tickets:
${threadSummaries}

Response (1-2 sentences, be concise):`,
      },
    ],
  });

  const text = response.content[0];
  return text.type === "text" ? text.text : "";
}

/**
 * Generate escalation email content
 */
export async function generateEscalationEmail(
  threadId: string,
  customerProfile: CustomerProfile,
  escalationReason: string,
  troubleshootingAttempted: string[]
): Promise<EscalationEmailContent> {
  // Get thread info
  const { data: thread } = await supabase
    .from("threads")
    .select("id, subject, last_intent, created_at")
    .eq("id", threadId)
    .single();

  // Get messages
  const { data: messages } = await supabase
    .from("messages")
    .select("direction, body_text, from_email, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  // Calculate metrics
  const emailCount = messages?.length || 0;
  const firstContact = messages?.[0]?.created_at
    ? new Date(messages[0].created_at)
    : new Date();
  const daysSinceFirstContact = Math.floor(
    (Date.now() - firstContact.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Analyze frustration level based on message content
  const frustrationLevel = await analyzeFrustrationLevel(messages || []);

  // Generate recommendations
  const recommendations = await generateRecommendations(
    thread?.last_intent || "unknown",
    escalationReason,
    customerProfile
  );

  // Generate thread summary
  const threadSummary = await generateThreadSummary(messages || []);

  return {
    subject: `[Escalation] ${thread?.subject || "Support Request"} - ${customerProfile.email}`,
    customerProfile,
    issueAnalysis: {
      intent: thread?.last_intent || "unknown",
      sentiment: frustrationLevel === "high" ? "frustrated" : frustrationLevel === "medium" ? "concerned" : "neutral",
      frustrationLevel,
      emailCount,
      daysSinceFirstContact,
    },
    troubleshootingAttempted,
    recommendations,
    threadSummary,
  };
}

/**
 * Analyze customer frustration level from messages
 */
async function analyzeFrustrationLevel(
  messages: Array<{ direction: string; body_text: string }>
): Promise<"low" | "medium" | "high"> {
  const customerMessages = messages
    .filter((m) => m.direction === "inbound")
    .map((m) => m.body_text)
    .join("\n\n");

  if (!customerMessages) return "low";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `Analyze the customer frustration level in these messages. Respond with only: low, medium, or high

Messages:
${customerMessages.substring(0, 2000)}

Frustration level:`,
      },
    ],
  });

  const text = response.content[0];
  const level = text.type === "text" ? text.text.toLowerCase().trim() : "medium";

  if (level.includes("high")) return "high";
  if (level.includes("low")) return "low";
  return "medium";
}

/**
 * Generate recommendations for handling the escalation
 */
async function generateRecommendations(
  intent: string,
  escalationReason: string,
  customerProfile: CustomerProfile
): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Generate 3-4 specific recommendations for handling this escalation.

Issue Type: ${intent}
Escalation Reason: ${escalationReason}
Customer: ${customerProfile.name} (${customerProfile.orderHistory.count} orders, $${customerProfile.orderHistory.totalSpent.toFixed(2)} total)
Verification: ${customerProfile.verificationStatus}

Respond with a JSON array of strings:`,
      },
    ],
  });

  const text = response.content[0];
  if (text.type !== "text") return ["Review the conversation and respond directly"];

  try {
    const match = text.text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]) as string[];
    }
  } catch {
    // Fallback
  }

  return ["Review the conversation", "Contact customer directly", "Check for product/order issues"];
}

/**
 * Generate thread summary
 */
async function generateThreadSummary(
  messages: Array<{ direction: string; body_text: string; from_email: string | null; created_at: string }>
): Promise<string> {
  const conversation = messages
    .map((m) => `[${m.direction === "inbound" ? "Customer" : "Support"}]: ${m.body_text.substring(0, 300)}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Summarize this support conversation in 2-3 sentences:

${conversation}

Summary:`,
      },
    ],
  });

  const text = response.content[0];
  return text.type === "text" ? text.text : "Unable to generate summary";
}

/**
 * Generate HTML email body
 */
export function generateEscalationEmailHtml(content: EscalationEmailContent): string {
  const { customerProfile, issueAnalysis, troubleshootingAttempted, recommendations, threadSummary } = content;

  const frustrationBadge = {
    low: '<span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px;">Low</span>',
    medium: '<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px;">Medium</span>',
    high: '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px;">High</span>',
  }[issueAnalysis.frustrationLevel];

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { background: #f97316; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; }
    .metric { display: inline-block; background: #f3f4f6; padding: 8px 12px; border-radius: 6px; margin-right: 8px; margin-bottom: 8px; }
    .metric-value { font-size: 18px; font-weight: 600; }
    .metric-label { font-size: 12px; color: #6b7280; }
    ul { margin: 0; padding-left: 20px; }
    li { margin-bottom: 4px; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; }
    .response-instructions { background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 6px; margin-top: 20px; }
    .response-instructions h4 { margin: 0 0 8px 0; color: #1e40af; }
    code { background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="header">
    <h2 style="margin: 0;">Escalation: ${content.subject.replace(/^\[Escalation\]\s*/, '')}</h2>
  </div>

  <div class="content">
    <div class="section">
      <div class="section-title">Customer Profile</div>
      <p><strong>${customerProfile.name}</strong> &lt;${customerProfile.email}&gt;</p>
      <div class="metric">
        <div class="metric-value">${customerProfile.orderHistory.count}</div>
        <div class="metric-label">Orders</div>
      </div>
      <div class="metric">
        <div class="metric-value">$${customerProfile.orderHistory.totalSpent.toFixed(0)}</div>
        <div class="metric-label">Total Spent</div>
      </div>
      <div class="metric">
        <div class="metric-value">${customerProfile.verificationStatus}</div>
        <div class="metric-label">Verification</div>
      </div>
      ${customerProfile.relevantHistory ? `<p style="color: #6b7280; font-size: 14px;"><em>${customerProfile.relevantHistory}</em></p>` : ''}
    </div>

    <div class="section">
      <div class="section-title">Issue Analysis</div>
      <div class="metric">
        <div class="metric-value">${issueAnalysis.intent}</div>
        <div class="metric-label">Intent</div>
      </div>
      <div class="metric">
        <div class="metric-value">${issueAnalysis.emailCount}</div>
        <div class="metric-label">Emails</div>
      </div>
      <div class="metric">
        <div class="metric-value">${issueAnalysis.daysSinceFirstContact}</div>
        <div class="metric-label">Days Open</div>
      </div>
      <p>Frustration Level: ${frustrationBadge}</p>
    </div>

    <div class="section">
      <div class="section-title">Thread Summary</div>
      <p>${threadSummary}</p>
    </div>

    ${troubleshootingAttempted.length > 0 ? `
    <div class="section">
      <div class="section-title">Troubleshooting Attempted</div>
      <ul>
        ${troubleshootingAttempted.map(t => `<li>${t}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-title">Lina's Recommendations</div>
      <ul>
        ${recommendations.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>

    <div class="response-instructions">
      <h4>How to Respond</h4>
      <p>Reply to this email with one of these tags:</p>
      <ul>
        <li><code>[INSTRUCTION]</code> - Give Lina specific instructions for this case</li>
        <li><code>[RESOLVE]</code> - Mark as resolved with notes</li>
        <li><code>[DRAFT]</code> - Have Lina draft a response for your review</li>
        <li>Or just reply normally to take over the thread</li>
      </ul>
    </div>

    <div class="footer">
      <p>Generated by Lina (Support Agent) at ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
`;
}
