"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewThreadPage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          customer_email: customerEmail || undefined,
          body_text: body,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create thread");
      }

      // Redirect to the new thread
      router.push(`/admin/thread/${data.thread_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "0 0 24px 0", maxWidth: 600, margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 20px",
        borderBottom: "1px solid #dfe3eb",
        backgroundColor: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "#33475b", margin: 0 }}>New ticket</h1>
          <span style={{ fontSize: 13, color: "#7c98b6" }}>Manual entry</span>
        </div>
        <a
          href="/admin"
          style={{
            color: "#0073aa",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          ← Tickets
        </a>
      </div>

      <div style={{ padding: "16px 20px" }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label
              htmlFor="subject"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 500,
                marginBottom: 4,
                color: "#516f90",
              }}
            >
              Subject *
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              placeholder="e.g., Firmware update issue"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #dfe3eb",
                borderRadius: 3,
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 500,
                marginBottom: 4,
                color: "#516f90",
              }}
            >
              Customer email
            </label>
            <input
              id="email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #dfe3eb",
                borderRadius: 3,
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="body"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 500,
                marginBottom: 4,
                color: "#516f90",
              }}
            >
              Message *
            </label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={5}
              placeholder="Describe the issue..."
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #dfe3eb",
                borderRadius: 3,
                fontSize: 14,
                resize: "vertical",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "#fff0f0",
                color: "#d63638",
                borderRadius: 3,
                marginBottom: 14,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "8px 16px",
              backgroundColor: loading ? "#99acc2" : "#ff5c35",
              color: "white",
              border: "none",
              borderRadius: 3,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating..." : "Create ticket"}
          </button>
        </form>
      </div>
    </div>
  );
}
