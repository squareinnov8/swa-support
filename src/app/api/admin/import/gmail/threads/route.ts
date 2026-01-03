/**
 * Gmail Threads API
 *
 * GET: List thread candidates for selection
 * POST: Create candidate list from search
 * PUT: Toggle selection for candidates
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listGmailCandidates,
  getLabels,
  type GmailTokens,
} from "@/lib/import/gmail";
import {
  getGmailCandidates,
  toggleGmailCandidateSelection,
  bulkSelectGmailCandidates,
} from "@/lib/import/review";
import type { GmailImportConfig } from "@/lib/import/types";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get("job_id");
    const selected = searchParams.get("selected");

    // If job_id provided, get existing candidates
    if (jobId) {
      const candidates = await getGmailCandidates(jobId, {
        selected: selected === "true" ? true : selected === "false" ? false : undefined,
      });
      return NextResponse.json({ candidates });
    }

    // Get tokens from cookie
    const tokensJson = request.cookies.get("gmail_tokens")?.value;
    if (!tokensJson) {
      return NextResponse.json(
        { error: "Not connected to Gmail. Please connect first." },
        { status: 401 }
      );
    }

    const tokens: GmailTokens = JSON.parse(tokensJson);

    // Get available labels
    const labels = await getLabels(tokens);

    return NextResponse.json({ labels });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Gmail data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tokensJson = request.cookies.get("gmail_tokens")?.value;
    if (!tokensJson) {
      return NextResponse.json(
        { error: "Not connected to Gmail. Please connect first." },
        { status: 401 }
      );
    }

    const tokens: GmailTokens = JSON.parse(tokensJson);
    const body = await request.json();

    const config: GmailImportConfig = {
      query: body.query,
      labels: body.labels,
      date_range: body.date_range,
    };

    const { job, candidates } = await listGmailCandidates(tokens, config);

    return NextResponse.json({
      jobId: job.id,
      totalCandidates: candidates.length,
      candidates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list Gmail threads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Toggle single candidate
    if (body.id && typeof body.selected === "boolean") {
      const candidate = await toggleGmailCandidateSelection(body.id, body.selected);
      return NextResponse.json({ candidate });
    }

    // Bulk select/deselect
    if (body.ids && Array.isArray(body.ids) && typeof body.selected === "boolean") {
      await bulkSelectGmailCandidates(body.ids, body.selected);
      return NextResponse.json({
        updated: body.ids.length,
        selected: body.selected,
      });
    }

    return NextResponse.json(
      { error: "Invalid request. Provide id+selected or ids+selected" },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update selection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
