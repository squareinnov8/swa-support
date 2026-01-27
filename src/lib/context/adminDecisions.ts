/**
 * Admin Decisions
 *
 * Extracts admin decisions from lina_tool_actions table.
 * Provides human-readable summaries of what Rob decided.
 */

import { supabase } from "@/lib/db";
import type { AdminDecision } from "./types";

/**
 * Tool action record from database
 */
interface ToolActionRecord {
  id: string;
  thread_id: string | null;
  conversation_id: string | null;
  tool_name: string;
  tool_input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  admin_email: string;
  created_at: string;
}

/**
 * Get admin decisions for a thread
 */
export async function getAdminDecisions(threadId: string): Promise<AdminDecision[]> {
  // Query lina_tool_actions for this thread
  const { data: toolActions, error } = await supabase
    .from("lina_tool_actions")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[AdminDecisions] Error fetching tool actions:", error);
    return [];
  }

  if (!toolActions || toolActions.length === 0) {
    return [];
  }

  // Map tool actions to decisions
  return toolActions
    .filter((action: ToolActionRecord) => action.result && (action.result as { success?: boolean }).success)
    .map((action: ToolActionRecord) => ({
      timestamp: new Date(action.created_at),
      toolUsed: action.tool_name,
      decision: summarizeToolAction(action),
      adminEmail: action.admin_email,
      details: action.tool_input,
    }));
}

/**
 * Summarize a tool action into human-readable text
 */
function summarizeToolAction(action: ToolActionRecord): string {
  const input = action.tool_input;

  switch (action.tool_name) {
    case "draft_relay_response": {
      const attribution = input.attribution as string || "support_team";
      const recipientOverride = input.recipient_override as string;
      const message = (input.customer_message as string || "").slice(0, 100);

      if (recipientOverride) {
        return `Forwarded to vendor (${recipientOverride}): "${message}..."`;
      }
      return `Created reply to customer (via ${attribution}): "${message}..."`;
    }

    case "lookup_order": {
      const orderNumber = input.order_number as string;
      return `Looked up order #${orderNumber}`;
    }

    case "associate_thread_customer": {
      const email = input.customer_email as string;
      const name = input.customer_name as string;
      return `Associated thread with customer: ${name || email}`;
    }

    case "return_thread_to_agent": {
      const reason = input.reason as string;
      return `Returned thread to Lina: ${reason}`;
    }

    case "create_kb_article": {
      const title = input.title as string;
      return `Created KB article: "${title}"`;
    }

    case "update_instruction": {
      const section = input.section as string;
      return `Updated agent instruction (${section})`;
    }

    case "note_feedback": {
      const summary = input.summary as string;
      return `Noted feedback: ${summary}`;
    }

    default:
      return `Used tool: ${action.tool_name}`;
  }
}

/**
 * Get a concise summary of admin decisions for prompt context
 */
export function formatAdminDecisionsForPrompt(decisions: AdminDecision[]): string {
  if (decisions.length === 0) {
    return "";
  }

  const lines = [
    "## Admin Decisions on This Thread",
    "These are actions taken by Rob (admin) via chat with Lina:",
    "",
  ];

  for (const decision of decisions) {
    const timestamp = decision.timestamp.toLocaleString();
    lines.push(`- [${timestamp}] ${decision.decision}`);
  }

  lines.push("");
  lines.push("IMPORTANT: Continue from these decisions. If Rob approved something, honor it.");

  return lines.join("\n");
}
