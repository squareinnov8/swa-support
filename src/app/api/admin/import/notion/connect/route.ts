/**
 * Notion Connect
 *
 * GET: Check connection status / get OAuth URL if needed
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isNotionConfigured,
  isInternalIntegration,
  getAuthorizationUrl,
  verifyToken,
  getInternalToken,
} from "@/lib/import/notion";

export async function GET(request: NextRequest) {
  try {
    if (!isNotionConfigured()) {
      return NextResponse.json(
        { error: "Notion not configured. Set NOTION_TOKEN for internal integration." },
        { status: 500 }
      );
    }

    // If using internal integration, verify token and return connected status
    if (isInternalIntegration()) {
      const token = getInternalToken();
      if (!token) {
        return NextResponse.json({ error: "NOTION_TOKEN not set" }, { status: 500 });
      }

      const isValid = await verifyToken(token);
      if (!isValid) {
        return NextResponse.json({ error: "NOTION_TOKEN is invalid" }, { status: 500 });
      }

      return NextResponse.json({
        connected: true,
        method: "internal_integration",
        message: "Connected via internal integration token",
      });
    }

    // OAuth flow
    const state = crypto.randomUUID();
    const authUrl = getAuthorizationUrl(state);

    return NextResponse.json({
      connected: false,
      method: "oauth",
      authUrl,
      state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to check connection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
