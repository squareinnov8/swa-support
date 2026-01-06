/**
 * CRM Admin API
 *
 * Manage HubSpot CRM operations.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isHubSpotConfigured,
  getContactByEmail,
  getContactEmails,
  getTicketsByContact,
  syncInteractionToHubSpot,
} from "@/lib/hubspot";
import { supabase } from "@/lib/db";

/**
 * GET - Check CRM status or lookup contact
 *
 * Query params:
 * - email: Look up contact by email
 * - status: Return overall CRM sync status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const status = searchParams.get("status");

  if (!isHubSpotConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error: "HUBSPOT_ACCESS_TOKEN not configured",
        hint: "Add HUBSPOT_ACCESS_TOKEN to your .env file",
      },
      { status: 503 }
    );
  }

  // Return overall sync status
  if (status === "true") {
    const { count: totalThreads } = await supabase
      .from("threads")
      .select("*", { count: "exact", head: true });

    const { count: syncedThreads } = await supabase
      .from("threads")
      .select("*", { count: "exact", head: true })
      .not("crm_contact_id", "is", null);

    const { count: unsyncedThreads } = await supabase
      .from("threads")
      .select("*", { count: "exact", head: true })
      .is("crm_contact_id", null);

    return NextResponse.json({
      configured: true,
      crm: "hubspot",
      stats: {
        total_threads: totalThreads ?? 0,
        synced_threads: syncedThreads ?? 0,
        unsynced_threads: unsyncedThreads ?? 0,
        sync_percentage: totalThreads
          ? Math.round(((syncedThreads ?? 0) / totalThreads) * 100)
          : 0,
      },
    });
  }

  // Look up contact by email
  if (email) {
    try {
      const contact = await getContactByEmail(email);

      if (!contact) {
        return NextResponse.json({ found: false, email });
      }

      // Get additional context
      const [emails, tickets] = await Promise.all([
        getContactEmails(contact.id, 5),
        getTicketsByContact(contact.id, 5),
      ]);

      return NextResponse.json({
        found: true,
        contact: {
          id: contact.id,
          email: contact.properties.email,
          name: [
            contact.properties.firstname,
            contact.properties.lastname,
          ]
            .filter(Boolean)
            .join(" "),
          company: contact.properties.company,
          shopify: {
            ordersCount: contact.properties.ip__shopify__orders_count,
            totalSpent: contact.properties.ip__shopify__total_spent,
            customerId: contact.properties.ip__shopify__customer_id,
          },
          support: {
            lastDate: contact.properties.last_support_date,
            threadCount: contact.properties.support_thread_count,
            status: contact.properties.support_status,
          },
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        },
        recentEmails: emails,
        recentTickets: tickets.map((t) => ({
          id: t.id,
          subject: t.properties.subject,
          stage: t.properties.hs_pipeline_stage,
          createdAt: t.properties.createdate,
        })),
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Lookup failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: "Provide ?email=... or ?status=true" },
    { status: 400 }
  );
}

/**
 * POST - Trigger CRM sync operations
 *
 * Body:
 * - action: "sync_thread"
 * - thread_id: Thread ID to sync
 */
export async function POST(request: NextRequest) {
  if (!isHubSpotConfigured()) {
    return NextResponse.json(
      { error: "HUBSPOT_ACCESS_TOKEN not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { action, thread_id } = body;

    if (action === "sync_thread") {
      if (!thread_id) {
        return NextResponse.json(
          { error: "thread_id is required for sync_thread action" },
          { status: 400 }
        );
      }

      // Get thread details
      const { data: thread } = await supabase
        .from("threads")
        .select(
          `
          id,
          subject,
          state,
          last_intent,
          messages (
            from_email,
            body_text,
            direction
          )
        `
        )
        .eq("id", thread_id)
        .single();

      if (!thread) {
        return NextResponse.json(
          { error: "Thread not found" },
          { status: 404 }
        );
      }

      const inboundMessage = (
        thread.messages as {
          from_email: string;
          body_text: string;
          direction: string;
        }[]
      )?.find((m) => m.direction === "inbound");

      if (!inboundMessage?.from_email) {
        return NextResponse.json(
          { error: "No inbound message with email found" },
          { status: 400 }
        );
      }

      const result = await syncInteractionToHubSpot({
        email: inboundMessage.from_email,
        threadId: thread.id,
        intent: thread.last_intent || "UNKNOWN",
        subject: thread.subject,
        messageSnippet: inboundMessage.body_text?.slice(0, 200),
        state: thread.state || "NEW",
      });

      return NextResponse.json({
        success: result.success,
        action: "sync_thread",
        thread_id,
        contact_id: result.contactId,
        note_created: result.noteCreated,
        error: result.error,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "sync_thread"' },
      { status: 400 }
    );
  } catch (error) {
    console.error("CRM API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
