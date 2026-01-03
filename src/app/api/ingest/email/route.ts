/**
 * Email ingestion endpoint.
 *
 * This is a thin adapter that normalizes email payloads to the
 * channel-agnostic IngestRequest format and delegates to processIngestRequest().
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { processIngestRequest } from "@/lib/ingest/processRequest";
import type { IngestRequest } from "@/lib/ingest/types";

const EmailIngestSchema = z.object({
  external_thread_id: z.string().optional(),
  subject: z.string().default(""),
  from_email: z.string().optional(),
  to_email: z.string().optional(),
  body_text: z.string().default(""),
  body_html: z.string().optional(),
  raw: z.any().optional(),
});

export async function POST(req: Request) {
  try {
    const payload = EmailIngestSchema.parse(await req.json());

    // Normalize email payload to channel-agnostic IngestRequest
    const ingestRequest: IngestRequest = {
      channel: "email",
      external_id: payload.external_thread_id,
      subject: payload.subject,
      body_text: payload.body_text,
      from_identifier: payload.from_email,
      to_identifier: payload.to_email,
      metadata: {
        body_html: payload.body_html,
        raw: payload.raw,
      },
    };

    const result = await processIngestRequest(ingestRequest);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
