/**
 * Admin Layout
 *
 * Wraps all admin pages with a header showing current user and logout button.
 */

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Double-check auth (middleware should handle this, but be safe)
  if (!session) {
    redirect("/login");
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb" }}>
      {/* Header */}
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "12px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a
            href="/admin"
            style={{
              fontWeight: 600,
              fontSize: 18,
              color: "#111827",
              textDecoration: "none",
            }}
          >
            Lina Support
          </a>
          <span
            style={{
              fontSize: 12,
              color: "#6b7280",
              backgroundColor: "#f3f4f6",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            SquareWheels Auto
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>
            {session.email}
          </span>
          <a
            href="/api/auth/logout"
            style={{
              fontSize: 14,
              color: "#991b1b",
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: 6,
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
            }}
          >
            Sign out
          </a>
        </div>
      </header>

      {/* Main content */}
      <main>{children}</main>
    </div>
  );
}
