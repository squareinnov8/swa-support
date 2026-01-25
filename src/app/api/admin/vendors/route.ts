/**
 * Vendors Admin API
 *
 * GET - List cached vendors
 * POST - Sync vendors from Google Sheet
 */

import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { syncVendorsFromSheet, getVendorSheetUrl } from "@/lib/vendors";

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
      sheetUrl: getVendorSheetUrl(),
    });
  } catch (error) {
    console.error("[API] Failed to list vendors:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const { synced, vendors } = await syncVendorsFromSheet();

    return NextResponse.json({
      success: true,
      synced,
      vendors,
      sheetUrl: getVendorSheetUrl(),
    });
  } catch (error) {
    console.error("[API] Failed to sync vendors:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
