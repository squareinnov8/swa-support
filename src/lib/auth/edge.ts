/**
 * Edge-compatible Auth Functions
 *
 * These functions can run in Edge Runtime (middleware).
 * They only use jose for JWT verification - no Node.js APIs.
 */

import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";

// Admin email - only this account can access admin routes
export const ADMIN_EMAIL = "support@squarewheelsauto.com";

// Cookie name for session
export const SESSION_COOKIE = "admin_session";

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
 * Verify a session token and return the payload
 */
export async function verifyAdminSession(
  token: string
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.email === "string") {
      return { email: payload.email };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get session from request cookies (for middleware)
 */
export async function getSessionFromRequest(
  request: NextRequest
): Promise<{ email: string } | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(token);
}

/**
 * Check if email is allowed admin
 */
export function isAllowedAdmin(email: string): boolean {
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
