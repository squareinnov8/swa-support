/**
 * Thread Archive API
 *
 * Archive/unarchive threads with optional learning extraction.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveAndArchive, unarchiveThread } from "@/lib/threads/archiveThread";

// POST - Resolve and archive a thread
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: threadId } = await params;

  try {
    // Get current admin session
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    let triggerLearning = true;
    try {
      const body = await request.json();
      if (typeof body.triggerLearning === "boolean") {
        triggerLearning = body.triggerLearning;
      }
    } catch {
      // Empty body is fine, use defaults
    }

    // Archive the thread
    const result = await resolveAndArchive(threadId, session.email, {
      triggerLearning,
      skipLowQuality: true,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to archive thread" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      archivedAt: result.archivedAt,
      learningStatus: result.learningStatus,
      proposalsGenerated: result.proposalsGenerated,
      proposalsAutoApproved: result.proposalsAutoApproved,
    });
  } catch (err) {
    console.error("[Archive API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Unarchive a thread
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: threadId } = await params;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await unarchiveThread(threadId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to unarchive thread" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Archive API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
