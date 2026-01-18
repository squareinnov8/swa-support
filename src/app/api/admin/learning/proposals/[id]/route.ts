/**
 * Single Learning Proposal API
 *
 * Get, approve, or reject a specific learning proposal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/db";
import { approveProposal, rejectProposal } from "@/lib/collaboration/learningGenerator";

// GET - Get single proposal
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: proposalId } = await params;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: proposal, error } = await supabase
      .from("learning_proposals")
      .select(`
        id,
        thread_id,
        proposal_type,
        title,
        summary,
        proposed_content,
        confidence_score,
        auto_approved,
        source_type,
        similarity_to_existing,
        similar_doc_id,
        source_context,
        status,
        reviewed_by,
        reviewed_at,
        review_notes,
        published_kb_doc_id,
        published_instruction_id,
        created_at
      `)
      .eq("id", proposalId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Get thread context
    const { data: thread } = await supabase
      .from("threads")
      .select("id, subject, last_intent")
      .eq("id", proposal.thread_id)
      .single();

    // Get similar doc if referenced
    let similarDoc = null;
    if (proposal.similar_doc_id) {
      const { data: doc } = await supabase
        .from("kb_docs")
        .select("id, title, body")
        .eq("id", proposal.similar_doc_id)
        .single();
      similarDoc = doc;
    }

    return NextResponse.json({
      proposal: {
        ...proposal,
        thread,
        similarDoc,
      },
    });
  } catch (err) {
    console.error("[Learning API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH - Update proposal (approve or reject)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: proposalId } = await params;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, notes, editedContent } = body;

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    // If edited content provided, update the proposal first
    if (editedContent && action === "approve") {
      await supabase
        .from("learning_proposals")
        .update({ proposed_content: editedContent })
        .eq("id", proposalId);
    }

    if (action === "approve") {
      const result = await approveProposal(proposalId, session.email, notes);
      return NextResponse.json({
        success: true,
        action: "approved",
        publishedId: result.publishedId,
      });
    } else {
      await rejectProposal(proposalId, session.email, notes);
      return NextResponse.json({
        success: true,
        action: "rejected",
      });
    }
  } catch (err) {
    console.error("[Learning API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a proposal (soft delete by setting status to 'deleted')
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: proposalId } = await params;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("learning_proposals")
      .update({
        status: "deleted",
        reviewed_by: session.email,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Learning API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
