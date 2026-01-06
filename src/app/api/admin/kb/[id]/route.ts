/**
 * KB Document API
 *
 * View, update, and delete individual KB documents.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET - Get a single document with chunks
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data: doc, error } = await supabase
      .from("kb_docs")
      .select(
        `
        *,
        kb_categories (
          id,
          name,
          slug
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get chunks for this document
    const { data: chunks } = await supabase
      .from("kb_chunks")
      .select("id, chunk_index, content, created_at")
      .eq("doc_id", id)
      .order("chunk_index");

    return NextResponse.json({
      doc,
      chunks: chunks || [],
      has_embeddings: (chunks?.length || 0) > 0,
    });
  } catch (error) {
    console.error("KB doc fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * PUT - Update a document
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      title,
      body: docBody,
      category_id,
      vehicle_tags,
      product_tags,
      intent_tags,
      metadata,
    } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) updateData.title = title;
    if (docBody !== undefined) updateData.body = docBody;
    if (category_id !== undefined) updateData.category_id = category_id;
    if (vehicle_tags !== undefined) updateData.vehicle_tags = vehicle_tags;
    if (product_tags !== undefined) updateData.product_tags = product_tags;
    if (intent_tags !== undefined) updateData.intent_tags = intent_tags;
    if (metadata !== undefined) updateData.metadata = metadata;

    const { data, error } = await supabase
      .from("kb_docs")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("KB update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If body changed, mark that embeddings need refresh
    const needsReembed = docBody !== undefined;

    return NextResponse.json({
      success: true,
      doc: data,
      needs_reembed: needsReembed,
    });
  } catch (error) {
    console.error("KB update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a document and its chunks
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Delete chunks first (cascade should handle this, but being explicit)
    await supabase.from("kb_chunks").delete().eq("doc_id", id);

    // Delete the document
    const { error } = await supabase.from("kb_docs").delete().eq("id", id);

    if (error) {
      console.error("KB delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("KB delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
