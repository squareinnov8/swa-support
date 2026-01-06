"use client";

import { useState, useEffect } from "react";

type SetupStatus = {
  configured: boolean;
  hasRefreshToken: boolean;
  error?: string;
  hint?: string;
  monitorStatus?: {
    enabled: boolean;
    lastSyncAt: string | null;
    lastHistoryId: string | null;
    errorCount: number;
    lastError: string | null;
  };
};

export default function GmailSetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();

    // Check for OAuth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (code) {
      handleOAuthCallback(code, state);
    }
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/admin/gmail-setup?status=true");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError("Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setAuthorizing(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/gmail-setup?action=auth");
      const data = await res.json();

      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.error) {
        setError(data.error + (data.hint ? ` (${data.hint})` : ""));
        setAuthorizing(false);
      }
    } catch (err) {
      setError("Failed to start authorization");
      setAuthorizing(false);
    }
  }

  async function handleOAuthCallback(code: string, state: string | null) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/gmail-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(data.message);
        // Clear URL params
        window.history.replaceState({}, "", "/admin/gmail-setup");
        fetchStatus();
      } else {
        setError(data.error + (data.message ? `: ${data.message}` : ""));
      }
    } catch (err) {
      setError("Failed to complete authorization");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    if (!confirm("Are you sure you want to disable Gmail monitoring?")) return;

    try {
      const res = await fetch("/api/admin/gmail-setup", { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        setSuccess("Gmail monitoring disabled");
        fetchStatus();
      }
    } catch (err) {
      setError("Failed to disable monitoring");
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 600 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Gmail Monitor Setup</h1>
        <a href="/admin" style={{ color: "#1e40af", textDecoration: "none" }}>
          ← Back to Admin
        </a>
      </div>

      {error && (
        <div style={{
          padding: 16,
          backgroundColor: "#fee2e2",
          color: "#991b1b",
          borderRadius: 8,
          marginBottom: 16
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: 16,
          backgroundColor: "#dcfce7",
          color: "#166534",
          borderRadius: 8,
          marginBottom: 16
        }}>
          {success}
        </div>
      )}

      {/* Status Card */}
      <div style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 24,
        marginBottom: 24,
        backgroundColor: "white"
      }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: 18 }}>Connection Status</h2>

        {!status?.configured ? (
          <div>
            <p style={{ color: "#dc2626", marginBottom: 16 }}>
              Gmail OAuth not configured. Set environment variables:
            </p>
            <ul style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
              <li>GOOGLE_CLIENT_ID</li>
              <li>GOOGLE_CLIENT_SECRET</li>
              <li>GOOGLE_REDIRECT_URI</li>
            </ul>
          </div>
        ) : !status.hasRefreshToken ? (
          <div>
            <p style={{ color: "#f59e0b", marginBottom: 16 }}>
              Gmail OAuth configured but not connected. Click below to authorize.
            </p>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
              You'll be redirected to Google to authorize access to <strong>support@squarewheelsauto.com</strong>
            </p>
            <button
              onClick={handleConnect}
              disabled={authorizing}
              style={{
                padding: "12px 24px",
                backgroundColor: authorizing ? "#9ca3af" : "#dc2626",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 16,
                fontWeight: 500,
                cursor: authorizing ? "not-allowed" : "pointer",
              }}
            >
              {authorizing ? "Redirecting..." : "Connect Gmail Account"}
            </button>
          </div>
        ) : (
          <div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#16a34a",
              marginBottom: 16
            }}>
              <span style={{ fontSize: 20 }}>✓</span>
              <span style={{ fontWeight: 500 }}>Connected to support@squarewheelsauto.com</span>
            </div>

            {status.monitorStatus && (
              <div style={{ fontSize: 14, color: "#6b7280" }}>
                <p>
                  <strong>Status:</strong>{" "}
                  {status.monitorStatus.enabled ? "Enabled" : "Disabled"}
                </p>
                <p>
                  <strong>Last Sync:</strong>{" "}
                  {status.monitorStatus.lastSyncAt
                    ? new Date(status.monitorStatus.lastSyncAt).toLocaleString()
                    : "Never"
                  }
                </p>
                {status.monitorStatus.errorCount > 0 && (
                  <p style={{ color: "#dc2626" }}>
                    <strong>Errors:</strong> {status.monitorStatus.errorCount}
                    {status.monitorStatus.lastError && ` - ${status.monitorStatus.lastError}`}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleDisable}
              style={{
                marginTop: 16,
                padding: "8px 16px",
                backgroundColor: "white",
                color: "#dc2626",
                border: "1px solid #dc2626",
                borderRadius: 6,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Disconnect Gmail
            </button>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 24,
        backgroundColor: "white"
      }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: 18 }}>How it works</h2>
        <ol style={{ color: "#6b7280", fontSize: 14, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>
            Connect the <strong>support@squarewheelsauto.com</strong> Gmail account
          </li>
          <li style={{ marginBottom: 8 }}>
            The system will poll Gmail daily (or manually via the admin panel)
          </li>
          <li style={{ marginBottom: 8 }}>
            New customer emails are processed through the AI agent
          </li>
          <li style={{ marginBottom: 8 }}>
            Draft responses are generated and HubSpot tickets created
          </li>
        </ol>

        <div style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: "#fef3c7",
          borderRadius: 6,
          fontSize: 13,
          color: "#92400e"
        }}>
          <strong>Note:</strong> Make sure your Google Cloud Console has the redirect URI set to:{" "}
          <code style={{ backgroundColor: "#fef9c3", padding: "2px 4px", borderRadius: 4 }}>
            {typeof window !== "undefined" ? `${window.location.origin}/admin/gmail-setup` : "https://your-domain.com/admin/gmail-setup"}
          </code>
        </div>
      </div>
    </div>
  );
}
