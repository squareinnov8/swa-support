"use client";

import { useState } from "react";

type PollResult = {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  stats?: {
    threadsChecked: number;
    threadsSkipped: number;
    newMessagesFound: number;
    draftsGenerated: number;
    ticketsCreated: number;
    ticketsUpdated: number;
    escalations: number;
  };
  errors?: string[];
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
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => handlePoll(false)}
        disabled={polling}
        style={{
          padding: "9px 14px",
          backgroundColor: polling ? "#cbd6e2" : "#ffffff",
          color: polling ? "#7c98b6" : "#33475b",
          borderRadius: 4,
          border: "1px solid #cbd6e2",
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
          <>Poll Gmail</>
        )}
      </button>
      <button
        onClick={() => handlePoll(true)}
        disabled={polling}
        style={{
          padding: "9px 14px",
          backgroundColor: polling ? "#cbd6e2" : "#ffffff",
          color: polling ? "#7c98b6" : "#33475b",
          borderRadius: 4,
          border: "1px solid #cbd6e2",
          fontSize: 14,
          fontWeight: 500,
          cursor: polling ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Fetch Recent
      </button>

      {showResult && result && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 4,
            fontSize: 13,
            backgroundColor: result.error
              ? "#fde8e9"
              : result.skipped
              ? "#fef6e7"
              : "#e5f8f4",
            color: result.error
              ? "#c93b41"
              : result.skipped
              ? "#b36b00"
              : "#00a182",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {result.error ? (
            <span>{result.error}{result.hint && ` (${result.hint})`}</span>
          ) : result.skipped ? (
            <span>Skipped: {result.reason}</span>
          ) : result.stats ? (
            <div>
              <span>
                {result.stats.threadsChecked} threads
                {result.stats.threadsSkipped > 0 && ` (${result.stats.threadsSkipped} skipped)`}
                {" · "}{result.stats.newMessagesFound} new
                {" · "}{result.stats.ticketsCreated} tickets
                {" · "}{result.stats.draftsGenerated} drafts
              </span>
              {result.errors && result.errors.length > 0 && (
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                  {result.errors.slice(0, 2).join("; ")}
                </div>
              )}
            </div>
          ) : (
            <span>Poll completed</span>
          )}
          <button
            onClick={() => setShowResult(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              opacity: 0.6,
              padding: 0,
              fontSize: 16,
              color: "inherit",
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
