/**
 * Admin Authentication
 *
 * Uses Google OAuth to authenticate admins. Only support@squarewheelsauto.com
 * is allowed to access admin routes. On login, automatically refreshes the
 * Gmail monitoring token if a new one was received.
 */

import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { supabase } from "@/lib/db";
import { storeGmailTokens } from "@/lib/gmail";
import {
  ADMIN_EMAIL,
  SESSION_COOKIE,
  verifyAdminSession,
} from "./edge";

// Re-export edge-compatible functions
export {
  ADMIN_EMAIL,
  SESSION_COOKIE,
  verifyAdminSession,
  getSessionFromRequest,
  isAllowedAdmin,
} from "./edge";

// Session duration: 24 hours
const SESSION_DURATION = 24 * 60 * 60;

// Gmail scopes - same as monitoring but we only need email for auth
const AUTH_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

/**
 * Get the JWT signing secret
 */
function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("No session secret configured");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Get OAuth configuration
 */
function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  // Use dedicated admin redirect URI if set, otherwise derive from Gmail redirect
  const baseRedirectUri = process.env.GOOGLE_REDIRECT_URI || "";
  const redirectUri = process.env.GOOGLE_ADMIN_REDIRECT_URI ||
    baseRedirectUri.replace("/api/admin/import/gmail/auth", "/api/auth/callback");

  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth configuration");
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Create OAuth2 client
 */
function createOAuth2Client() {
  const config = getOAuthConfig();
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
}

/**
 * Generate Google OAuth authorization URL
 */
export function getAdminAuthUrl(state: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: AUTH_SCOPES,
    prompt: "select_account consent",
    state,
    login_hint: ADMIN_EMAIL,
  });
}

/**
 * Exchange authorization code for tokens and get user email
 */
export async function exchangeAdminCode(code: string): Promise<{
  email: string;
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
  };
}> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  // Set credentials and get user info
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();

  if (!data.email) {
    throw new Error("Could not get user email from Google");
  }

  return {
    email: data.email,
    tokens: {
      access_token: tokens.access_token ?? undefined,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    },
  };
}

/**
 * Create a signed JWT session token
 */
export async function createAdminSession(email: string): Promise<string> {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSecret());

  return token;
}

/**
 * Get session from server component cookies
 */
export async function getSession(): Promise<{ email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(token);
}

/**
 * Set session cookie
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION,
    path: "/",
  });
}

/**
 * Clear session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Update Gmail monitoring token if we got a new refresh token
 */
export async function maybeUpdateGmailToken(
  email: string,
  refreshToken: string | undefined
): Promise<boolean> {
  if (!refreshToken) return false;

  try {
    // Check current token
    const { data: syncState } = await supabase
      .from("gmail_sync_state")
      .select("refresh_token")
      .eq("email_address", email)
      .single();

    // Update if different or if no existing token
    if (!syncState?.refresh_token || syncState.refresh_token !== refreshToken) {
      await storeGmailTokens(email, refreshToken);
      console.log("Gmail refresh token updated on admin login");
      return true;
    }

    return false;
  } catch (error) {
    console.error("Failed to update Gmail token:", error);
    return false;
  }
}
