/**
 * Gmail OAuth Callback
 *
 * GET: Handle OAuth callback, exchange code for tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, verifyTokens, getUserEmail } from "@/lib/import/gmail";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        new URL(`/admin/kb/import/gmail?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/admin/kb/import/gmail?error=missing_code", request.url)
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Verify tokens work
    const isValid = await verifyTokens(tokens);
    if (!isValid) {
      return NextResponse.redirect(
        new URL("/admin/kb/import/gmail?error=invalid_token", request.url)
      );
    }

    // Get user email
    const email = await getUserEmail(tokens);

    const response = NextResponse.redirect(
      new URL("/admin/kb/import/gmail?connected=true", request.url)
    );

    // Store tokens in secure cookie (temporary for import)
    response.cookies.set("gmail_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600, // 1 hour
    });

    // Store email for display
    if (email) {
      response.cookies.set("gmail_email", email, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 3600,
      });
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed";
    console.error("Gmail OAuth error:", message);
    return NextResponse.redirect(
      new URL(`/admin/kb/import/gmail?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
