/**
 * Intents API
 *
 * Manage intent definitions for classification.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

// GET - List all intents
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const activeOnly = searchParams.get("active") !== "false";

  let query = supabase
    .from("intents")
    .select("*")
    .order("category")
    .order("priority", { ascending: false })
    .order("name");

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by category for UI
  const byCategory: Record<string, typeof data> = {};
  data?.forEach((intent) => {
    if (!byCategory[intent.category]) {
      byCategory[intent.category] = [];
    }
    byCategory[intent.category].push(intent);
  });

  return NextResponse.json({
    intents: data,
    byCategory,
    categories: Object.keys(byCategory).sort(),
  });
}

// POST - Create new intent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      slug,
      name,
      description,
      category,
      priority,
      examples,
      requires_verification,
      auto_escalate,
    } = body;

    if (!slug || !name) {
      return NextResponse.json(
        { error: "slug and name are required" },
        { status: 400 }
      );
    }

    // Validate slug format (uppercase with underscores)
    const slugUpper = slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_");

    const { data, error } = await supabase
      .from("intents")
      .insert({
        slug: slugUpper,
        name,
        description: description || null,
        category: category || "general",
        priority: priority ?? 0,
        examples: examples || [],
        requires_verification: requires_verification ?? false,
        auto_escalate: auto_escalate ?? false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Intent with this slug already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ intent: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
