/**
 * OAuth Callback Route
 *
 * Handles the callback from Google OAuth:
 * 1. Validates state parameter (CSRF protection)
 * 2. Exchanges code for tokens
 * 3. Verifies email is the allowed admin
 * 4. Creates session and sets cookie
 * 5. Updates Gmail monitoring token if new one received
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeAdminCode,
  createAdminSession,
  setSessionCookie,
  isAllowedAdmin,
  maybeUpdateGmailToken,
  ADMIN_EMAIL,
} from "@/lib/auth";

const STATE_COOKIE = "oauth_state";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/login?error=missing_params", request.url)
    );
  }

  // Validate state (CSRF protection)
  const cookieStore = await cookies();
  const storedState = cookieStore.get(STATE_COOKIE)?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_state", request.url)
    );
  }

  // Clear state cookie
  cookieStore.delete(STATE_COOKIE);

  try {
    // Exchange code for tokens and get user email
    const { email, tokens } = await exchangeAdminCode(code);

    // Verify email is allowed admin
    if (!isAllowedAdmin(email)) {
      console.warn(`Unauthorized login attempt from: ${email}`);
      return NextResponse.redirect(
        new URL("/login?error=unauthorized", request.url)
      );
    }

    // Create session token
    const sessionToken = await createAdminSession(email);

    // Set session cookie
    await setSessionCookie(sessionToken);

    // Update Gmail monitoring token if we got a new refresh token
    const tokenUpdated = await maybeUpdateGmailToken(email, tokens.refresh_token);
    if (tokenUpdated) {
      console.log("Gmail monitoring token refreshed on admin login");
    }

    // Redirect to admin dashboard
    return NextResponse.redirect(new URL("/admin", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/login?error=auth_failed", request.url)
    );
  }
}
