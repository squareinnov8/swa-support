/**
 * Thread Intents API
 *
 * Manage intents for a specific thread.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

// GET - Get all intents for a thread
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: threadId } = await params;

  const { data, error } = await supabase
    .from("thread_intents")
    .select(`
      id,
      confidence,
      detected_at,
      is_resolved,
      resolved_at,
      intents!inner(id, slug, name, category, priority, description)
    `)
    .eq("thread_id", threadId)
    .order("detected_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Type for joined intents data
  type IntentData = {
    id: string;
    slug: string;
    name: string;
    category: string;
    priority: number;
    description: string | null;
  };

  const intents = data?.map((ti) => {
    const intent = ti.intents as unknown as IntentData;
    return {
      id: ti.id,
      intent_id: intent.id,
      slug: intent.slug,
      name: intent.name,
      category: intent.category,
      priority: intent.priority,
      description: intent.description,
      confidence: ti.confidence,
      detected_at: ti.detected_at,
      is_resolved: ti.is_resolved,
      resolved_at: ti.resolved_at,
    };
  });

  return NextResponse.json({
    thread_id: threadId,
    intents,
    active_intents: intents?.filter((i) => !i.is_resolved),
    resolved_intents: intents?.filter((i) => i.is_resolved),
  });
}

// POST - Add intent to thread
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: threadId } = await params;

  try {
    const body = await request.json();
    const { intent_slug, confidence, message_id } = body;

    if (!intent_slug) {
      return NextResponse.json(
        { error: "intent_slug is required" },
        { status: 400 }
      );
    }

    // Use the database function to add intent
    const { data, error } = await supabase.rpc("add_thread_intent", {
      p_thread_id: threadId,
      p_intent_slug: intent_slug,
      p_confidence: confidence ?? 0.5,
      p_message_id: message_id ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get updated thread intents
    const { data: intents } = await supabase
      .from("thread_intents")
      .select(`
        id,
        confidence,
        detected_at,
        is_resolved,
        intents!inner(slug, name, category)
      `)
      .eq("thread_id", threadId)
      .eq("is_resolved", false);

    // Type for joined intents data
    type IntentBasic = { slug: string; name: string; category: string };

    return NextResponse.json({
      success: true,
      thread_intent_id: data,
      active_intents: intents?.map((ti) => {
        const intent = ti.intents as unknown as IntentBasic;
        return {
          slug: intent.slug,
          name: intent.name,
          category: intent.category,
          confidence: ti.confidence,
        };
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

// DELETE - Remove intent from thread
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: threadId } = await params;
  const { searchParams } = new URL(request.url);
  const intentSlug = searchParams.get("intent");

  if (!intentSlug) {
    return NextResponse.json(
      { error: "intent query parameter is required" },
      { status: 400 }
    );
  }

  // Get intent ID
  const { data: intent } = await supabase
    .from("intents")
    .select("id")
    .eq("slug", intentSlug)
    .single();

  if (!intent) {
    return NextResponse.json({ error: "Intent not found" }, { status: 404 });
  }

  // Delete the thread_intent
  const { error } = await supabase
    .from("thread_intents")
    .delete()
    .eq("thread_id", threadId)
    .eq("intent_id", intent.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update thread's last_intent
  const { data: topIntent } = await supabase
    .from("thread_intents")
    .select("intents!inner(slug, priority)")
    .eq("thread_id", threadId)
    .eq("is_resolved", false)
    .order("intents(priority)", { ascending: false })
    .limit(1)
    .single();

  const topIntentSlug = topIntent
    ? (topIntent.intents as unknown as { slug: string }).slug
    : null;

  await supabase
    .from("threads")
    .update({
      last_intent: topIntentSlug,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  return NextResponse.json({ success: true });
}

// PATCH - Resolve/unresolve intent on thread
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: threadId } = await params;

  try {
    const body = await request.json();
    const { intent_slug, is_resolved } = body;

    if (!intent_slug || is_resolved === undefined) {
      return NextResponse.json(
        { error: "intent_slug and is_resolved are required" },
        { status: 400 }
      );
    }

    if (is_resolved) {
      // Use database function to resolve
      await supabase.rpc("resolve_thread_intent", {
        p_thread_id: threadId,
        p_intent_slug: intent_slug,
      });
    } else {
      // Unresolve - get intent ID and update
      const { data: intent } = await supabase
        .from("intents")
        .select("id")
        .eq("slug", intent_slug)
        .single();

      if (intent) {
        await supabase
          .from("thread_intents")
          .update({ is_resolved: false, resolved_at: null })
          .eq("thread_id", threadId)
          .eq("intent_id", intent.id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
