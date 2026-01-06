/**
 * Agent Settings API
 *
 * GET - Retrieve current settings
 * PATCH - Update settings
 */

import { NextRequest, NextResponse } from "next/server";
import { getAgentSettings, updateSetting } from "@/lib/settings";

export async function GET() {
  try {
    const settings = await getAgentSettings();
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Update each provided setting
    if (typeof body.autoSendEnabled === "boolean") {
      await updateSetting("autoSendEnabled", body.autoSendEnabled);
    }

    if (typeof body.autoSendConfidenceThreshold === "number") {
      await updateSetting(
        "autoSendConfidenceThreshold",
        body.autoSendConfidenceThreshold
      );
    }

    if (typeof body.requireVerificationForSend === "boolean") {
      await updateSetting(
        "requireVerificationForSend",
        body.requireVerificationForSend
      );
    }

    // Return updated settings
    const settings = await getAgentSettings();
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
