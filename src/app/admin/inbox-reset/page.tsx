"use client";

import { useState, useEffect } from "react";

type InboxStats = {
  stats: {
    threads: number;
    messages: number;
    events: number;
    draftGenerations: number;
    customerVerifications: number;
  };
  gmailSync: {
    lastHistoryId: string | null;
    lastSyncAt: string | null;
    errorCount: number;
  };
};

type PurgeResult = {
  success: boolean;
  purged: Record<string, string>;
  repoll?: {
    success?: boolean;
    stats?: {
      threadsChecked: number;
      newMessagesFound: number;
      draftsGenerated: number;
    };
    error?: string;
  };
  message: string;
};

export default function InboxResetPage() {
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [result, setResult] = useState<PurgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchDays, setFetchDays] = useState(7);
  const [autoRepoll, setAutoRepoll] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/inbox/purge");
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handlePurge() {
    if (!confirmed) {
      setError("Please confirm by checking the checkbox");
      return;
    }

    try {
      setPurging(true);
      setError(null);
      setResult(null);

      const response = await fetch("/api/admin/inbox/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: "PURGE_ALL_DATA",
          repoll: autoRepoll,
          fetchDays,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Purge failed");
      }

      setResult(data);
      setConfirmed(false);
      // Refresh stats
      await fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPurging(false);
    }
  }

  const totalRecords =
    (stats?.stats.threads ?? 0) +
    (stats?.stats.messages ?? 0) +
    (stats?.stats.events ?? 0) +
    (stats?.stats.draftGenerations ?? 0) +
    (stats?.stats.customerVerifications ?? 0);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 800 }}>
      <a href="/admin" style={{ color: "#2563eb" }}>
        &larr; Back to Inbox
      </a>

      <h1 style={{ marginTop: 16 }}>Inbox Reset</h1>
      <p style={{ color: "#64748b", marginBottom: 24 }}>
        Purge all inbox data and have Lina reprocess messages from Gmail. Use this
        to start fresh after making changes to Lina&apos;s behavior.
      </p>

      {/* Current Stats */}
      <div
        style={{
          backgroundColor: "#f8fafc",
          padding: 20,
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <h3 style={{ margin: "0 0 16px 0" }}>Current Data</h3>
        {loading ? (
          <p>Loading...</p>
        ) : stats ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {stats.stats.threads}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Threads</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {stats.stats.messages}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Messages</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {stats.stats.draftGenerations}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Drafts</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {stats.stats.customerVerifications}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Verifications</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {stats.stats.events}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Events</div>
            </div>
          </div>
        ) : null}

        {stats?.gmailSync.lastSyncAt && (
          <div style={{ marginTop: 16, fontSize: 14, color: "#64748b" }}>
            Last Gmail sync:{" "}
            {new Date(stats.gmailSync.lastSyncAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Purge Options */}
      <div
        style={{
          backgroundColor: "#fef2f2",
          border: "2px solid #ef4444",
          padding: 20,
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <h3 style={{ margin: "0 0 16px 0", color: "#dc2626" }}>
          Danger Zone
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={autoRepoll}
              onChange={(e) => setAutoRepoll(e.target.checked)}
            />
            <span>Automatically repoll Gmail after purge</span>
          </label>
        </div>

        {autoRepoll && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Fetch emails from the last:
            </label>
            <select
              value={fetchDays}
              onChange={(e) => setFetchDays(parseInt(e.target.value))}
              style={{
                padding: "8px 12px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>
        )}

        <div
          style={{
            backgroundColor: "#fff",
            padding: 16,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span>
              I understand this will permanently delete{" "}
              <strong>{totalRecords.toLocaleString()} records</strong> including
              all threads, messages, drafts, and verifications. This action
              cannot be undone.
            </span>
          </label>
        </div>

        <button
          onClick={handlePurge}
          disabled={purging || !confirmed}
          style={{
            backgroundColor: confirmed ? "#dc2626" : "#9ca3af",
            color: "white",
            padding: "12px 24px",
            borderRadius: 8,
            border: "none",
            fontWeight: 600,
            cursor: confirmed && !purging ? "pointer" : "not-allowed",
            opacity: purging ? 0.7 : 1,
          }}
        >
          {purging
            ? "Purging..."
            : autoRepoll
            ? `Purge & Repoll (${fetchDays} days)`
            : "Purge Inbox"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            backgroundColor: "#fef2f2",
            color: "#dc2626",
            padding: 16,
            borderRadius: 8,
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          style={{
            backgroundColor: result.success ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${result.success ? "#22c55e" : "#ef4444"}`,
            padding: 20,
            borderRadius: 8,
          }}
        >
          <h3
            style={{
              margin: "0 0 12px 0",
              color: result.success ? "#166534" : "#dc2626",
            }}
          >
            {result.success ? "Purge Complete" : "Purge Failed"}
          </h3>

          <p style={{ marginBottom: 16 }}>{result.message}</p>

          <div style={{ fontSize: 14 }}>
            <strong>Deleted:</strong>
            <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
              {Object.entries(result.purged).map(([key, value]) => (
                <li key={key}>
                  {key.replace(/_/g, " ")}: {value}
                </li>
              ))}
            </ul>
          </div>

          {result.repoll && (
            <div style={{ marginTop: 16, fontSize: 14 }}>
              <strong>Repoll Result:</strong>
              {result.repoll.error ? (
                <p style={{ color: "#dc2626" }}>{result.repoll.error}</p>
              ) : result.repoll.stats ? (
                <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
                  <li>Threads checked: {result.repoll.stats.threadsChecked}</li>
                  <li>
                    New messages found: {result.repoll.stats.newMessagesFound}
                  </li>
                  <li>
                    Drafts generated: {result.repoll.stats.draftsGenerated}
                  </li>
                </ul>
              ) : (
                <p>Repoll completed</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div
        style={{
          marginTop: 32,
          padding: 20,
          backgroundColor: "#f8fafc",
          borderRadius: 8,
        }}
      >
        <h3 style={{ margin: "0 0 12px 0" }}>How it works</h3>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>
            All existing inbox data is deleted (threads, messages, drafts,
            verifications, events)
          </li>
          <li>Gmail sync state is reset (history ID cleared)</li>
          <li>
            If auto-repoll is enabled, Lina will fetch emails from the specified
            time range
          </li>
          <li>Each email is reprocessed with current settings and KB</li>
          <li>New drafts are generated with the latest behavior</li>
        </ol>
      </div>
    </div>
  );
}
