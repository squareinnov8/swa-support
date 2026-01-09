/**
 * Admin Login Page
 *
 * Simple login page with Google OAuth button.
 * Only support@squarewheelsauto.com can access admin routes.
 */

import { redirect } from "next/navigation";
import { getSession, ADMIN_EMAIL } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  // Check if already logged in
  const session = await getSession();
  if (session) {
    redirect("/admin");
  }

  const params = await searchParams;
  const error = params.error;

  const errorMessages: Record<string, string> = {
    unauthorized: "Only support@squarewheelsauto.com can access this dashboard.",
    invalid_state: "Session expired. Please try again.",
    missing_params: "Invalid OAuth response. Please try again.",
    auth_failed: "Authentication failed. Please try again.",
    access_denied: "Access was denied. Please try again.",
  };

  const errorMessage = error ? errorMessages[error] || "An error occurred." : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f9fafb",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: 48,
          borderRadius: 12,
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          textAlign: "center",
          maxWidth: 400,
          width: "100%",
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "#111827",
            marginBottom: 8,
          }}
        >
          Support Admin
        </h1>
        <p
          style={{
            color: "#6b7280",
            marginBottom: 32,
            fontSize: 14,
          }}
        >
          Sign in to access the SquareWheels Auto support dashboard
        </p>

        {errorMessage && (
          <div
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: 12,
              borderRadius: 8,
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            {errorMessage}
          </div>
        )}

        <a
          href="/api/auth/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            backgroundColor: "#1e40af",
            color: "white",
            padding: "12px 24px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 500,
            fontSize: 15,
            transition: "background-color 0.2s",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign in with Google
        </a>

        <p
          style={{
            marginTop: 24,
            fontSize: 12,
            color: "#9ca3af",
          }}
        >
          Access restricted to {ADMIN_EMAIL}
        </p>
      </div>
    </div>
  );
}
