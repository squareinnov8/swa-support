/**
 * Threads API endpoint.
 *
 * POST /api/threads - Create a new thread via admin web form
 *
 * This endpoint is used by the admin UI to manually create threads
 * (e.g., from phone calls, walk-ins, or other non-automated sources).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { processIngestRequest } from "@/lib/ingest/processRequest";
import type { IngestRequest } from "@/lib/ingest/types";

const CreateThreadSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  customer_email: z.string().email().optional(),
  body_text: z.string().min(1, "Message body is required"),
});

export async function POST(req: Request) {
  try {
    const payload = CreateThreadSchema.parse(await req.json());

    // Normalize web form payload to channel-agnostic IngestRequest
    const ingestRequest: IngestRequest = {
      channel: "web_form",
      subject: payload.subject,
      body_text: payload.body_text,
      from_identifier: payload.customer_email,
      metadata: {
        created_via: "admin_ui",
      },
    };

    const result = await processIngestRequest(ingestRequest);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
