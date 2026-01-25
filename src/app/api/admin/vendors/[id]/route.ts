/**
 * Vendor Admin API - Single Vendor Operations
 *
 * GET - Get vendor by ID
 * PUT - Update vendor
 * DELETE - Delete vendor
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: vendor, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !vendor) {
      return NextResponse.json(
        { error: "Vendor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ vendor });
  } catch (error) {
    console.error("[API] Failed to get vendor:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      name,
      contact_emails,
      product_patterns,
      new_order_instructions,
      cancel_instructions,
      escalation_instructions,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Vendor name is required" },
        { status: 400 }
      );
    }

    const { data: vendor, error } = await supabase
      .from("vendors")
      .update({
        name: name.trim(),
        contact_emails: contact_emails || [],
        product_patterns: product_patterns || [],
        new_order_instructions: new_order_instructions || null,
        cancel_instructions: cancel_instructions || null,
        escalation_instructions: escalation_instructions || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A vendor with this name already exists" },
          { status: 409 }
        );
      }
      throw new Error(`Failed to update vendor: ${error.message}`);
    }

    return NextResponse.json({ vendor });
  } catch (error) {
    console.error("[API] Failed to update vendor:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if vendor has any associated order_vendors records
    const { count } = await supabase
      .from("order_vendors")
      .select("*", { count: "exact", head: true })
      .eq("vendor_name", id);

    if (count && count > 0) {
      return NextResponse.json(
        { error: "Cannot delete vendor with associated orders. Archive it instead." },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("vendors").delete().eq("id", id);

    if (error) {
      throw new Error(`Failed to delete vendor: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to delete vendor:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
