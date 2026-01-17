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
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 600 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "#33475b" }}>
            Create New Support Request
          </h1>
          <p style={{ color: "#7c98b6", marginTop: 4, fontSize: 14 }}>
            Manually create a thread (e.g., from a phone call or walk-in)
          </p>
        </div>
        <a
          href="/admin"
          style={{
            color: "#0091ae",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ← Back to Inbox
        </a>
      </div>

      <div
        style={{
          border: "1px solid #cbd6e2",
          borderRadius: 4,
          overflow: "hidden",
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#f5f8fa",
            borderBottom: "1px solid #cbd6e2",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 500,
              color: "#516f90",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Request Details
          </h2>
        </div>

        <div style={{ padding: 20 }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="subject"
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "#516f90",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
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
                  padding: "8px 12px",
                  border: "1px solid #cbd6e2",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="email"
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "#516f90",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Customer Email (optional)
              </label>
              <input
                id="email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #cbd6e2",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label
                htmlFor="body"
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "#516f90",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Message *
              </label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={6}
                placeholder="Describe the customer's issue..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #cbd6e2",
                  borderRadius: 4,
                  fontSize: 14,
                  resize: "vertical",
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: 12,
                  backgroundColor: "#fde8e9",
                  color: "#c93b41",
                  borderRadius: 4,
                  marginBottom: 16,
                  border: "1px solid #f2545b",
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "10px 20px",
                backgroundColor: loading ? "#cbd6e2" : "#0091ae",
                color: "white",
                border: "none",
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Creating..." : "Create Thread"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
