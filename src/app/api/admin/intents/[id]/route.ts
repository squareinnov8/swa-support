/**
 * Single Intent API
 *
 * Get, update, or delete a specific intent.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

// GET - Get single intent with usage stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Get intent
  const { data: intent, error } = await supabase
    .from("intents")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !intent) {
    return NextResponse.json({ error: "Intent not found" }, { status: 404 });
  }

  // Get usage count
  const { count } = await supabase
    .from("thread_intents")
    .select("*", { count: "exact", head: true })
    .eq("intent_id", id);

  // Get recent threads with this intent
  const { data: recentThreads } = await supabase
    .from("thread_intents")
    .select(`
      thread_id,
      confidence,
      detected_at,
      is_resolved,
      threads!inner(id, subject, state, created_at)
    `)
    .eq("intent_id", id)
    .order("detected_at", { ascending: false })
    .limit(10);

  // Type for the joined threads data
  type ThreadData = { id: string; subject: string; state: string; created_at: string };

  return NextResponse.json({
    intent,
    usage: {
      total_threads: count || 0,
      recent_threads: recentThreads?.map((ti) => {
        const thread = ti.threads as unknown as ThreadData;
        return {
          thread_id: ti.thread_id,
          subject: thread.subject,
          state: thread.state,
          confidence: ti.confidence,
          detected_at: ti.detected_at,
          is_resolved: ti.is_resolved,
        };
      }),
    },
  });
}

// PUT - Update intent
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const {
      name,
      description,
      category,
      priority,
      examples,
      requires_verification,
      auto_escalate,
      is_active,
    } = body;

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (priority !== undefined) updates.priority = priority;
    if (examples !== undefined) updates.examples = examples;
    if (requires_verification !== undefined) updates.requires_verification = requires_verification;
    if (auto_escalate !== undefined) updates.auto_escalate = auto_escalate;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("intents")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Intent not found" }, { status: 404 });
    }

    return NextResponse.json({ intent: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

// DELETE - Delete intent (soft delete by deactivating)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const hard = searchParams.get("hard") === "true";

  // Check if intent has any thread associations
  const { count } = await supabase
    .from("thread_intents")
    .select("*", { count: "exact", head: true })
    .eq("intent_id", id);

  if (hard) {
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete intent with ${count} thread associations. Use soft delete instead.` },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("intents")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    // Soft delete - deactivate
    const { error } = await supabase
      .from("intents")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, hard_delete: hard });
}
