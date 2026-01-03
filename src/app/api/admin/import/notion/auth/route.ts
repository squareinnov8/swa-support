/**
 * Notion OAuth Callback
 *
 * GET: Handle OAuth callback, exchange code for token
 */

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, verifyToken, getWorkspaceInfo } from "@/lib/import/notion";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      // Redirect to import page with error
      return NextResponse.redirect(
        new URL(`/admin/kb/import/notion?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/admin/kb/import/notion?error=missing_code", request.url)
      );
    }

    // Exchange code for token
    const tokenResponse = await exchangeCodeForToken(code);

    // Verify token works
    const isValid = await verifyToken(tokenResponse.access_token);
    if (!isValid) {
      return NextResponse.redirect(
        new URL("/admin/kb/import/notion?error=invalid_token", request.url)
      );
    }

    // Get workspace info
    const workspaceInfo = await getWorkspaceInfo(tokenResponse.access_token);

    // Store token in session/cookie (temporary for import)
    // In production, use secure session storage
    const response = NextResponse.redirect(
      new URL("/admin/kb/import/notion?connected=true", request.url)
    );

    // Set token as HTTP-only cookie (expires in 1 hour)
    response.cookies.set("notion_token", tokenResponse.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600, // 1 hour
    });

    // Set workspace info in cookie for display
    if (workspaceInfo) {
      response.cookies.set(
        "notion_workspace",
        JSON.stringify({
          id: tokenResponse.workspace_id,
          name: tokenResponse.workspace_name ?? workspaceInfo.workspaceName,
        }),
        {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 3600,
        }
      );
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed";
    console.error("Notion OAuth error:", message);
    return NextResponse.redirect(
      new URL(`/admin/kb/import/notion?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
