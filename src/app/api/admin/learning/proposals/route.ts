/**
 * Learning Proposals API
 *
 * List and manage learning proposals generated from resolved threads.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/db";

// GET - List learning proposals
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query
    let query = supabase
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
        status,
        reviewed_by,
        reviewed_at,
        review_notes,
        created_at
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status if not "all"
    if (status !== "all") {
      if (status === "approved") {
        // Include both published and approved (auto-approved)
        query = query.in("status", ["published", "approved"]);
      } else {
        query = query.eq("status", status);
      }
    }

    const { data: proposals, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get thread subjects for context
    const threadIds = [...new Set(proposals?.map(p => p.thread_id) || [])];
    const { data: threads } = await supabase
      .from("threads")
      .select("id, subject, last_intent")
      .in("id", threadIds);

    const threadsMap = new Map(threads?.map(t => [t.id, t]) || []);

    // Enrich proposals with thread info
    const enrichedProposals = proposals?.map(p => ({
      ...p,
      thread: threadsMap.get(p.thread_id) || null,
    }));

    return NextResponse.json({
      proposals: enrichedProposals,
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[Learning API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
