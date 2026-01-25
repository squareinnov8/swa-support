/**
 * Vendors Admin API
 *
 * GET - List all vendors
 * POST - Create a new vendor
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export async function GET() {
  try {
    const { data: vendors, error } = await supabase
      .from("vendors")
      .select("*")
      .order("name");

    if (error) {
      throw new Error(`Failed to fetch vendors: ${error.message}`);
    }

    return NextResponse.json({
      vendors: vendors || [],
    });
  } catch (error) {
    console.error("[API] Failed to list vendors:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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
      .insert({
        name: name.trim(),
        contact_emails: contact_emails || [],
        product_patterns: product_patterns || [],
        new_order_instructions: new_order_instructions || null,
        cancel_instructions: cancel_instructions || null,
        escalation_instructions: escalation_instructions || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A vendor with this name already exists" },
          { status: 409 }
        );
      }
      throw new Error(`Failed to create vendor: ${error.message}`);
    }

    return NextResponse.json({ vendor }, { status: 201 });
  } catch (error) {
    console.error("[API] Failed to create vendor:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
