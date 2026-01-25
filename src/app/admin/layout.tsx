/**
 * Admin Layout
 *
 * HubSpot-inspired layout with sticky header and navigation.
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
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f8fa" }}>
      {/* Header */}
      <header
        style={{
          backgroundColor: "#2d3e50",
          padding: "0 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: 56,
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <a
            href="/admin"
            style={{
              fontWeight: 600,
              fontSize: 16,
              color: "#ffffff",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                backgroundColor: "#ff7a59",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              L
            </span>
            Lina
          </a>
          <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <a
              href="/admin"
              style={{
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 500,
                color: "#99acc2",
                textDecoration: "none",
                borderRadius: 4,
              }}
            >
              Inbox
            </a>
            <a
              href="/admin/orders"
              style={{
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 500,
                color: "#99acc2",
                textDecoration: "none",
                borderRadius: 4,
              }}
            >
              Orders
            </a>
            <a
              href="/admin/kb"
              style={{
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 500,
                color: "#99acc2",
                textDecoration: "none",
                borderRadius: 4,
              }}
            >
              Knowledge Base
            </a>
            <a
              href="/admin/intents"
              style={{
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 500,
                color: "#99acc2",
                textDecoration: "none",
                borderRadius: 4,
              }}
            >
              Intents
            </a>
            <a
              href="/admin/instructions"
              style={{
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 500,
                color: "#99acc2",
                textDecoration: "none",
                borderRadius: 4,
              }}
            >
              Instructions
            </a>
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 14, color: "#99acc2" }}>
            {session.email}
          </span>
          <a
            href="/api/auth/logout"
            style={{
              fontSize: 13,
              color: "#ff8f73",
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: 4,
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
