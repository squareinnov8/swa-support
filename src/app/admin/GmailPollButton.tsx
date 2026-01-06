"use client";

import { useState } from "react";

type PollResult = {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  stats?: {
    threadsChecked: number;
    newMessagesFound: number;
    draftsGenerated: number;
    ticketsCreated: number;
    ticketsUpdated: number;
    escalations: number;
  };
  error?: string;
  hint?: string;
};

export function GmailPollButton() {
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<PollResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  async function handlePoll(fetchRecent: boolean = false) {
    setPolling(true);
    setResult(null);
    setShowResult(true);

    try {
      const params = new URLSearchParams({ force: "true" });
      if (fetchRecent) {
        params.set("fetchRecent", "true");
      }
      const res = await fetch(`/api/agent/poll?${params.toString()}`, {
        method: "POST",
      });
      const data = await res.json();
      setResult(data);

      // Auto-hide success message after 5 seconds
      if (data.success && !data.error) {
        setTimeout(() => setShowResult(false), 5000);
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setPolling(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        onClick={() => handlePoll(false)}
        disabled={polling}
        style={{
          padding: "8px 16px",
          backgroundColor: polling ? "#9ca3af" : "#059669",
          color: "white",
          borderRadius: 6,
          border: "none",
          fontSize: 14,
          fontWeight: 500,
          cursor: polling ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {polling ? (
          <>
            <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>
              ↻
            </span>
            Polling...
          </>
        ) : (
          <>📧 Poll New</>
        )}
      </button>
      <button
        onClick={() => handlePoll(true)}
        disabled={polling}
        style={{
          padding: "8px 16px",
          backgroundColor: polling ? "#9ca3af" : "#dc2626",
          color: "white",
          borderRadius: 6,
          border: "none",
          fontSize: 14,
          fontWeight: 500,
          cursor: polling ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        📥 Fetch Recent (2 days)
      </button>

      {showResult && result && (
        <div
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 13,
            backgroundColor: result.error
              ? "#fee2e2"
              : result.skipped
              ? "#fef3c7"
              : "#dcfce7",
            color: result.error
              ? "#991b1b"
              : result.skipped
              ? "#92400e"
              : "#166534",
          }}
        >
          {result.error ? (
            <span>{result.error}{result.hint && ` (${result.hint})`}</span>
          ) : result.skipped ? (
            <span>Skipped: {result.reason}</span>
          ) : result.stats ? (
            <span>
              Found {result.stats.newMessagesFound} new •{" "}
              {result.stats.ticketsCreated} tickets created •{" "}
              {result.stats.draftsGenerated} drafts
            </span>
          ) : (
            <span>Poll completed</span>
          )}
          <button
            onClick={() => setShowResult(false)}
            style={{
              marginLeft: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              opacity: 0.6,
            }}
          >
            ×
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
