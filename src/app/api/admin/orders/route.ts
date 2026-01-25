/**
 * Orders Admin API
 *
 * GET - List orders with optional filters
 */

import { NextRequest, NextResponse } from "next/server";
import { listOrders } from "@/lib/orders";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { orders, count } = await listOrders({
      status,
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      orders,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[API] Failed to list orders:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
