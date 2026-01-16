import { supabase } from "@/lib/db";
import { type ThreadState } from "@/lib/threads/stateMachine";
import { ThreadActions } from "./ThreadActions";
import { AgentReasoning } from "./AgentReasoning";
import { CustomerContextPanel, type CustomerContextData, type SupportTicket } from "./CustomerContextPanel";
import { MessageBubble } from "./MessageBubble";
import { lookupCustomerByEmail } from "@/lib/shopify/customer";
// Verification requirements now determined dynamically by LLM during classification

export const dynamic = "force-dynamic";

// Inline color styles for state badges (avoiding Tailwind dynamic class issues)
const STATE_COLORS: Record<ThreadState, { bg: string; text: string }> = {
  NEW: { bg: "#dbeafe", text: "#1e40af" },
  AWAITING_INFO: { bg: "#fef3c7", text: "#92400e" },
  IN_PROGRESS: { bg: "#ede9fe", text: "#6b21a8" },
  ESCALATED: { bg: "#fee2e2", text: "#991b1b" },
  HUMAN_HANDLING: { bg: "#ffedd5", text: "#9a3412" },
  RESOLVED: { bg: "#dcfce7", text: "#166534" },
};

const STATE_LABELS: Record<ThreadState, string> = {
  NEW: "New",
  AWAITING_INFO: "Awaiting Info",
  IN_PROGRESS: "In Progress",
  ESCALATED: "Escalated",
  HUMAN_HANDLING: "Human Handling",
  RESOLVED: "Resolved",
};

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: threadId } = await params;

  const { data: thread } = await supabase.from("threads").select("*").eq("id", threadId).single();
  const state = (thread?.state as ThreadState) || "NEW";
  const stateColors = STATE_COLORS[state];
  const stateLabel = STATE_LABELS[state];
  // Fetch messages - newest first for better UX
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false });

  // Get the customer email from the first inbound message
  const firstInboundMessage = messages?.slice().reverse().find(m => m.direction === "inbound");
  const customerEmail = firstInboundMessage?.from_email;

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(10);

  const latestTriageEvent = events?.find((e) => e.type === "auto_triage");
  const latestDraft = latestTriageEvent?.payload?.draft;
  const latestEventId = latestTriageEvent?.id;

  // Fetch draft generation details for agent reasoning
  const { data: draftGenerations } = await supabase
    .from("draft_generations")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestDraftGen = draftGenerations?.[0];

  // Fetch KB docs used in the draft
  let kbDocsUsed: { id: string; title: string }[] = [];
  if (latestDraftGen?.kb_docs_used?.length) {
    const { data: kbDocs } = await supabase
      .from("kb_docs")
      .select("id, title")
      .in("id", latestDraftGen.kb_docs_used);
    kbDocsUsed = kbDocs || [];
  }

  // Fetch customer verification with full context
  const { data: verification } = await supabase
    .from("customer_verifications")
    .select("status, order_number, flags, customer_name, customer_email, total_orders, total_spent, recent_orders, likely_product")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build customer context data for the panel
  let customerContext: CustomerContextData | null = null;
  let previousTickets: SupportTicket[] = [];

  if (verification) {
    // Parse recent_orders if it's a string
    let recentOrders = null;
    if (verification.recent_orders) {
      try {
        recentOrders = typeof verification.recent_orders === "string"
          ? JSON.parse(verification.recent_orders)
          : verification.recent_orders;
      } catch {
        // Ignore parse errors
      }
    }

    customerContext = {
      status: verification.status as CustomerContextData["status"],
      customerName: verification.customer_name,
      customerEmail: verification.customer_email,
      totalOrders: verification.total_orders,
      totalSpent: verification.total_spent,
      likelyProduct: verification.likely_product,
      recentOrders,
      flags: verification.flags || [],
    };
  } else if (customerEmail) {
    // No verification record yet - try to look up customer from Shopify by email
    try {
      const shopifyCustomer = await lookupCustomerByEmail(customerEmail);
      if (shopifyCustomer) {
        customerContext = {
          status: "pending", // Not verified yet, just looked up
          customerName: `${shopifyCustomer.firstName || ""} ${shopifyCustomer.lastName || ""}`.trim() || null,
          customerEmail: shopifyCustomer.email,
          totalOrders: shopifyCustomer.ordersCount,
          totalSpent: shopifyCustomer.totalSpent,
          likelyProduct: null,
          recentOrders: shopifyCustomer.recentOrders?.map(o => ({
            orderNumber: o.name,
            status: o.financialStatus || "UNKNOWN",
            fulfillmentStatus: o.fulfillmentStatus || "UNKNOWN",
            createdAt: o.createdAt,
            items: o.lineItems?.map(li => li.title) || [],
          })) || null,
          flags: [],
        };
      } else {
        // Customer not found in Shopify
        customerContext = {
          status: "not_found",
          customerName: null,
          customerEmail: customerEmail,
          totalOrders: null,
          totalSpent: null,
          likelyProduct: null,
          recentOrders: null,
          flags: [],
        };
      }
    } catch (error) {
      console.error("Error looking up customer:", error);
      // Still show unknown customer state on error
      customerContext = {
        status: "not_found",
        customerName: null,
        customerEmail: customerEmail,
        totalOrders: null,
        totalSpent: null,
        likelyProduct: null,
        recentOrders: null,
        flags: [],
      };
    }
  }

  // Fetch previous support tickets for this customer (by email)
  const emailForTicketLookup = verification?.customer_email || customerEmail;
  if (emailForTicketLookup) {
    const { data: customerThreads } = await supabase
      .from("threads")
      .select("id, subject, state, created_at")
      .neq("id", threadId) // Exclude current thread
      .order("created_at", { ascending: false })
      .limit(10);

    // Filter threads that have messages from this customer email
    if (customerThreads) {
      const { data: threadsWithEmail } = await supabase
        .from("messages")
        .select("thread_id")
        .eq("from_email", emailForTicketLookup)
        .in("thread_id", customerThreads.map(t => t.id));

      const customerThreadIds = new Set(threadsWithEmail?.map(m => m.thread_id) || []);
      previousTickets = customerThreads
        .filter(t => customerThreadIds.has(t.id))
        .map(t => ({
          id: t.id,
          subject: t.subject || "(no subject)",
          state: t.state || "UNKNOWN",
          createdAt: t.created_at,
        }));
    }
  }

  // Extract state transition history from events
  const stateHistory = events
    ?.filter((e) => e.payload?.stateTransition)
    ?.map((e) => ({
      from: e.payload.stateTransition.from,
      to: e.payload.stateTransition.to,
      reason: e.payload.stateTransition.reason,
      timestamp: e.created_at,
    }));

  // Fetch all intents for this thread
  const { data: threadIntents } = await supabase
    .from("thread_intents")
    .select(`
      id,
      confidence,
      detected_at,
      is_resolved,
      resolved_at,
      intents!inner(id, slug, name, category, priority, description)
    `)
    .eq("thread_id", threadId)
    .order("detected_at", { ascending: false });

  // Type for joined intents data
  type IntentData = {
    id: string;
    slug: string;
    name: string;
    category: string;
    priority: number;
    description: string | null;
  };

  const allIntents = threadIntents?.map((ti) => {
    const intent = ti.intents as unknown as IntentData;
    return {
      id: ti.id,
      slug: intent.slug,
      name: intent.name,
      category: intent.category,
      description: intent.description,
      confidence: ti.confidence,
      detected_at: ti.detected_at,
      is_resolved: ti.is_resolved,
      resolved_at: ti.resolved_at,
    };
  });

  const activeIntents = allIntents?.filter((i) => !i.is_resolved) || [];
  const resolvedIntents = allIntents?.filter((i) => i.is_resolved) || [];

  // Check if any active intent requires verification from database
  const { data: intentDetails } = await supabase
    .from("intents")
    .select("slug, requires_verification")
    .in("slug", activeIntents.map(i => i.slug).concat(thread?.last_intent ? [thread.last_intent] : []));

  // Verification requirements are determined by LLM during classification and stored in intent definitions
  // No more static PROTECTED_INTENTS fallback - we trust the LLM's contextual assessment
  const intentRequiresVerification = intentDetails?.some(i => i.requires_verification) ?? false;

  // Verification is complete only if status is "verified"
  const isVerificationComplete = verification?.status === "verified";

  // Block draft if verification is required but not complete, or if policy gate blocked
  const policyGatePassed = latestDraftGen?.policy_gate_passed ?? true;
  const shouldBlockDraft = (intentRequiresVerification && !isVerificationComplete) || !policyGatePassed;

  // Determine block reason for UI
  let draftBlockReason: string | null = null;
  if (intentRequiresVerification && !isVerificationComplete) {
    draftBlockReason = verification?.status === "pending"
      ? "Customer verification required. Please request order number."
      : verification?.status === "not_found"
      ? "Order not found in Shopify. Please verify order number."
      : verification?.status === "flagged"
      ? "Customer is flagged. Please escalate to human review."
      : "Customer verification required before sending response.";
  } else if (!policyGatePassed) {
    draftBlockReason = `Policy gate blocked: ${latestDraftGen?.policy_violations?.join(", ") || "Unknown violation"}`;
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <a href="/admin">← Back</a>
      <h1>{thread?.subject || "(no subject)"}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <span
          style={{
            padding: "4px 12px",
            borderRadius: 9999,
            fontSize: 12,
            fontWeight: 600,
            backgroundColor: stateColors.bg,
            color: stateColors.text,
          }}
        >
          {stateLabel}
        </span>
      </div>

      {/* Thread Intents Section */}
      {(activeIntents.length > 0 || resolvedIntents.length > 0) && (
        <div style={{ marginTop: 16, padding: 12, backgroundColor: "#f9fafb", borderRadius: 8 }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600 }}>
            Intents ({activeIntents.length} active, {resolvedIntents.length} resolved)
          </h4>

          {activeIntents.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: resolvedIntents.length > 0 ? 8 : 0 }}>
              {activeIntents.map((intent) => (
                <span
                  key={intent.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    backgroundColor: "#dbeafe",
                    color: "#1e40af",
                    border: "1px solid #93c5fd",
                  }}
                  title={intent.description || undefined}
                >
                  <span>{intent.name}</span>
                  <span style={{ opacity: 0.7, fontSize: 10 }}>
                    ({Math.round((intent.confidence || 0) * 100)}%)
                  </span>
                </span>
              ))}
            </div>
          )}

          {resolvedIntents.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {resolvedIntents.map((intent) => (
                <span
                  key={intent.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    backgroundColor: "#f3f4f6",
                    color: "#6b7280",
                    border: "1px solid #d1d5db",
                    textDecoration: "line-through",
                  }}
                  title={`Resolved: ${intent.resolved_at ? new Date(intent.resolved_at).toLocaleString() : "N/A"}`}
                >
                  <span>{intent.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {activeIntents.length === 0 && resolvedIntents.length === 0 && thread?.last_intent && (
        <div style={{ marginTop: 8, opacity: 0.7 }}>
          Legacy intent: {thread.last_intent}
        </div>
      )}

      {/* Customer Context Panel */}
      <CustomerContextPanel
        customer={customerContext}
        previousTickets={previousTickets}
      />

      <h2 style={{ marginTop: 24 }}>Messages</h2>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
        Showing newest first
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {messages?.map((m) => (
          <MessageBubble
            key={m.id}
            direction={m.direction as "inbound" | "outbound"}
            fromEmail={m.from_email}
            createdAt={m.created_at}
            bodyText={m.body_text}
            bodyHtml={m.body_html}
          />
        ))}
      </div>

      <h2 style={{ marginTop: 24 }}>Proposed Reply</h2>
      {shouldBlockDraft ? (
        <div
          style={{
            border: "2px solid #ef4444",
            backgroundColor: "#fef2f2",
            padding: 16,
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <strong style={{ color: "#dc2626" }}>Draft Blocked</strong>
          </div>
          <p style={{ color: "#991b1b", margin: 0 }}>{draftBlockReason}</p>
          {intentRequiresVerification && !isVerificationComplete && (
            <p style={{ color: "#64748b", marginTop: 12, fontSize: 14 }}>
              Verify the customer before this draft can be sent.
              {verification?.status === "pending" && " Ask the customer for their order number."}
            </p>
          )}
        </div>
      ) : (
        <div style={{ border: "1px solid #ddd", padding: 12 }}>
          <pre style={{ whiteSpace: "pre-wrap" }}>{latestDraft || "(no draft generated)"}</pre>
        </div>
      )}

      {/* Agent Reasoning Section */}
      <AgentReasoning
        threadId={threadId}
        intent={thread?.last_intent || null}
        confidence={latestTriageEvent?.payload?.confidence ?? null}
        kbDocs={kbDocsUsed}
        verification={
          verification
            ? {
                status: verification.status,
                orderNumber: verification.order_number,
                flags: verification.flags || [],
              }
            : null
        }
        draftInfo={
          latestDraftGen
            ? {
                policyGatePassed: latestDraftGen.policy_gate_passed ?? true,
                policyViolations: latestDraftGen.policy_violations || [],
                promptTokens: latestDraftGen.prompt_tokens || 0,
                completionTokens: latestDraftGen.completion_tokens || 0,
                citations: latestDraftGen.citations || [],
              }
            : null
        }
      />

      {stateHistory && stateHistory.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>State History</h2>
          <div style={{ fontSize: 14 }}>
            {stateHistory.map((h, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span style={{ opacity: 0.5, fontSize: 12 }}>
                  {new Date(h.timestamp).toLocaleString()}
                </span>
                <span>
                  {h.from} → {h.to}
                </span>
                {h.reason && (
                  <span style={{ opacity: 0.7, fontSize: 12 }}>({h.reason})</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Testing & Feedback Actions */}
      <ThreadActions
        threadId={threadId}
        latestDraft={latestDraft || null}
        latestEventId={latestEventId || null}
        intent={thread?.last_intent || null}
        isHumanHandling={thread?.human_handling_mode === true}
        humanHandler={thread?.human_handler || null}
        draftBlocked={shouldBlockDraft}
        draftBlockReason={draftBlockReason}
      />
    </div>
  );
}
