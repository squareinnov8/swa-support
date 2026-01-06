/**
 * Agent Instructions API
 *
 * CRUD operations for agent instruction sections.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

// GET - Fetch all instructions
export async function GET() {
  const { data, error } = await supabase
    .from("agent_instructions")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ instructions: data });
}

// PUT - Update an instruction section
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, content, change_reason } = body;

    if (!id || !content) {
      return NextResponse.json(
        { error: "id and content are required" },
        { status: 400 }
      );
    }

    // Get current instruction for history
    const { data: current, error: fetchError } = await supabase
      .from("agent_instructions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { error: "Instruction not found" },
        { status: 404 }
      );
    }

    // Don't save if content hasn't changed
    if (current.content === content) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    const newVersion = (current.version || 1) + 1;

    // Save to history
    await supabase.from("agent_instruction_history").insert({
      instruction_id: id,
      previous_content: current.content,
      new_content: content,
      change_reason: change_reason || "Manual edit",
      version: newVersion,
      created_by: "admin",
    });

    // Update instruction
    const { error: updateError } = await supabase
      .from("agent_instructions")
      .update({
        content,
        version: newVersion,
        updated_at: new Date().toISOString(),
        updated_by: "admin",
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, version: newVersion });
  } catch (error) {
    console.error("Instructions update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
