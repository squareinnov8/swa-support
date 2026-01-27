/**
 * Next.js Middleware
 *
 * Protects admin routes by requiring valid session.
 * - /admin/* pages redirect to /login if not authenticated
 * - /api/admin/* routes return 401 if not authenticated
 * - /api/auth/* routes are exempt (login/logout/callback)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromRequest, SESSION_COOKIE, isAllowedAdmin } from "@/lib/auth/edge";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth routes - they handle their own auth
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Check if route requires authentication
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  // Verify session
  const session = await getSessionFromRequest(request);

  if (!session || !isAllowedAdmin(session.email)) {
    // API routes return 401
    if (isAdminApi) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Page routes redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
