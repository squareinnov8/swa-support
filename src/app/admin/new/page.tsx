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
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 600 }}>
      <a href="/admin" style={{ color: "#1e40af", textDecoration: "none" }}>
        ← Back to Inbox
      </a>
      <h1 style={{ marginTop: 16 }}>Create New Support Request</h1>
      <p style={{ opacity: 0.6, marginBottom: 24 }}>
        Manually create a thread (e.g., from a phone call or walk-in)
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="subject"
            style={{ display: "block", fontWeight: 500, marginBottom: 4 }}
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
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="email"
            style={{ display: "block", fontWeight: 500, marginBottom: 4 }}
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
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label
            htmlFor="body"
            style={{ display: "block", fontWeight: 500, marginBottom: 4 }}
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
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 14,
              resize: "vertical",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              borderRadius: 6,
              marginBottom: 16,
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
            backgroundColor: loading ? "#9ca3af" : "#1e40af",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creating..." : "Create Thread"}
        </button>
      </form>
    </div>
  );
}
