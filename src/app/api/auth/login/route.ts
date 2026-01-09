/**
 * Admin Login Route
 *
 * Initiates Google OAuth flow for admin authentication.
 * Generates a state parameter for CSRF protection and redirects to Google.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminAuthUrl } from "@/lib/auth";

// State cookie for CSRF protection
const STATE_COOKIE = "oauth_state";
const STATE_DURATION = 10 * 60; // 10 minutes

export async function GET() {
  // Generate random state for CSRF protection
  const state = crypto.randomUUID();

  // Store state in cookie
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_DURATION,
    path: "/",
  });

  // Get OAuth URL and redirect
  const authUrl = getAdminAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
