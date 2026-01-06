/**
 * KB Admin API
 *
 * Browse, search, and manage knowledge base documents.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

/**
 * GET - Browse/search KB documents
 *
 * Query params:
 * - search: Full-text search query
 * - category_id: Filter by category
 * - source: Filter by source (manual, notion, thread_evolution)
 * - intent: Filter by intent tag
 * - limit: Max results (default 50)
 * - offset: Pagination offset
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const categoryId = searchParams.get("category_id");
    const source = searchParams.get("source");
    const intent = searchParams.get("intent");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("kb_docs")
      .select(
        `
        id,
        source,
        source_id,
        title,
        body,
        category_id,
        vehicle_tags,
        product_tags,
        intent_tags,
        evolution_status,
        metadata,
        updated_at,
        kb_categories (
          id,
          name,
          slug
        )
      `,
        { count: "exact" }
      )
      .order("updated_at", { ascending: false });

    // Apply filters
    if (search) {
      // Search in title and body
      query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    }

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (source) {
      query = query.eq("source", source);
    }

    if (intent) {
      query = query.contains("intent_tags", [intent]);
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data: docs, error, count } = await query;

    if (error) {
      console.error("KB fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get categories for filtering
    const { data: categories } = await supabase
      .from("kb_categories")
      .select("id, name, slug, parent_id")
      .order("sort_order");

    // Get stats
    const { count: totalDocs } = await supabase
      .from("kb_docs")
      .select("*", { count: "exact", head: true });

    const { count: embeddedCount } = await supabase
      .from("kb_chunks")
      .select("doc_id", { count: "exact", head: true });

    return NextResponse.json({
      docs: docs || [],
      total: count || 0,
      limit,
      offset,
      categories: categories || [],
      stats: {
        total_docs: totalDocs || 0,
        embedded_chunks: embeddedCount || 0,
      },
    });
  } catch (error) {
    console.error("KB API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new KB document
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, body: docBody, category_id, vehicle_tags, product_tags, intent_tags, metadata } =
      body;

    if (!title || !docBody) {
      return NextResponse.json(
        { error: "title and body are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("kb_docs")
      .insert({
        title,
        body: docBody,
        source: "manual",
        category_id: category_id || null,
        vehicle_tags: vehicle_tags || [],
        product_tags: product_tags || [],
        intent_tags: intent_tags || [],
        evolution_status: "published",
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error("KB insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, doc: data });
  } catch (error) {
    console.error("KB create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
