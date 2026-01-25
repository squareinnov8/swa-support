/**
 * Individual Order Admin API
 *
 * GET - Get order details with vendor info
 * POST - Perform actions (approve, reject, blacklist)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import {
  getOrderWithVendors,
  updateOrderStatus,
  logOrderEvent,
} from "@/lib/orders";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await getOrderWithVendors(id);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Also fetch events for this order
    const { data: events } = await supabase
      .from("order_events")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      ...order,
      events: events || [],
    });
  } catch (error) {
    console.error("[API] Failed to get order:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;


    // Verify order exists
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    switch (action) {
      case "approve": {
        // Manually approve a flagged order
        await supabase
          .from("orders")
          .update({
            status: "processing",
            reviewed_by: "rob",
            reviewed_at: new Date().toISOString(),
            last_action_at: new Date().toISOString(),
          })
          .eq("id", id);

        await logOrderEvent(id, "manually_approved", {
          previous_status: order.status,
          approved_by: "rob",
        });

        // TODO: Trigger vendor forwarding for approved orders
        // This will be implemented when we add the vendor routing action

        return NextResponse.json({ success: true, status: "processing" });
      }

      case "reject": {
        // Reject and cancel an order
        const { reason } = body;

        await supabase
          .from("orders")
          .update({
            status: "cancelled",
            reviewed_by: "rob",
            reviewed_at: new Date().toISOString(),
            last_action_at: new Date().toISOString(),
          })
          .eq("id", id);

        await logOrderEvent(id, "status_changed", {
          previous_status: order.status,
          new_status: "cancelled",
          reason: reason || "Manually rejected",
          rejected_by: "rob",
        });

        return NextResponse.json({ success: true, status: "cancelled" });
      }

      case "blacklist": {
        // Blacklist the customer and cancel the order
        const { reason } = body;

        // Add customer to blacklist
        await supabase.from("blacklisted_customers").upsert(
          {
            email: order.customer_email.toLowerCase(),
            name: order.customer_name,
            reason: reason || "Manually blacklisted",
            added_by: "rob",
            auto_detected: false,
            active: true,
          },
          { onConflict: "email" }
        );

        // Cancel the order
        await supabase
          .from("orders")
          .update({
            status: "cancelled",
            reviewed_by: "rob",
            reviewed_at: new Date().toISOString(),
            last_action_at: new Date().toISOString(),
          })
          .eq("id", id);

        await logOrderEvent(id, "status_changed", {
          previous_status: order.status,
          new_status: "cancelled",
          reason: "Customer blacklisted",
          blacklist_reason: reason,
        });

        return NextResponse.json({
          success: true,
          status: "cancelled",
          blacklisted: true,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[API] Failed to perform order action:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
