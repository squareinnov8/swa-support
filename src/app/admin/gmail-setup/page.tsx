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
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <p style={{ color: "#7c98b6" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 600 }}>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "#33475b" }}>
          Gmail Monitor Setup
        </h1>
        <a
          href="/admin"
          style={{
            color: "#0091ae",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ← Back to Admin
        </a>
      </div>

      {error && (
        <div
          style={{
            padding: 16,
            backgroundColor: "#fde8e9",
            color: "#c93b41",
            borderRadius: 4,
            marginBottom: 16,
            border: "1px solid #f2545b",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 16,
            backgroundColor: "#e5f8f4",
            color: "#00a182",
            borderRadius: 4,
            marginBottom: 16,
            border: "1px solid #a8e4d0",
          }}
        >
          {success}
        </div>
      )}

      {/* Status Card */}
      <div
        style={{
          border: "1px solid #cbd6e2",
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 24,
          backgroundColor: "white",
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
            Connection Status
          </h2>
        </div>

        <div style={{ padding: 20 }}>
          {!status?.configured ? (
            <div>
              <p style={{ color: "#c93b41", marginBottom: 16, fontSize: 14 }}>
                Gmail OAuth not configured. Set environment variables:
              </p>
              <ul style={{ color: "#7c98b6", fontSize: 14, marginBottom: 16 }}>
                <li>GOOGLE_CLIENT_ID</li>
                <li>GOOGLE_CLIENT_SECRET</li>
                <li>GOOGLE_REDIRECT_URI</li>
              </ul>
            </div>
          ) : !status.hasRefreshToken ? (
            <div>
              <p style={{ color: "#b36b00", marginBottom: 16, fontSize: 14 }}>
                Gmail OAuth configured but not connected. Click below to authorize.
              </p>
              <p style={{ color: "#7c98b6", fontSize: 14, marginBottom: 16 }}>
                You&apos;ll be redirected to Google to authorize access to{" "}
                <strong style={{ color: "#33475b" }}>support@squarewheelsauto.com</strong>
              </p>
              <button
                onClick={handleConnect}
                disabled={authorizing}
                style={{
                  padding: "10px 20px",
                  backgroundColor: authorizing ? "#cbd6e2" : "#0091ae",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: authorizing ? "not-allowed" : "pointer",
                }}
              >
                {authorizing ? "Redirecting..." : "Connect Gmail Account"}
              </button>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#00a182",
                  marginBottom: 16,
                }}
              >
                <span style={{ fontSize: 18 }}>✓</span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  Connected to support@squarewheelsauto.com
                </span>
              </div>

              {status.monitorStatus && (
                <div style={{ fontSize: 14, color: "#7c98b6" }}>
                  <p style={{ marginBottom: 8 }}>
                    <strong style={{ color: "#516f90" }}>Status:</strong>{" "}
                    {status.monitorStatus.enabled ? (
                      <span style={{ color: "#00a182" }}>Enabled</span>
                    ) : (
                      <span style={{ color: "#b36b00" }}>Disabled</span>
                    )}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong style={{ color: "#516f90" }}>Last Sync:</strong>{" "}
                    {status.monitorStatus.lastSyncAt
                      ? new Date(status.monitorStatus.lastSyncAt).toLocaleString()
                      : "Never"}
                  </p>
                  {status.monitorStatus.errorCount > 0 && (
                    <p style={{ color: "#c93b41" }}>
                      <strong>Errors:</strong> {status.monitorStatus.errorCount}
                      {status.monitorStatus.lastError &&
                        ` - ${status.monitorStatus.lastError}`}
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
                  color: "#c93b41",
                  border: "1px solid #f2545b",
                  borderRadius: 4,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Disconnect Gmail
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div
        style={{
          border: "1px solid #cbd6e2",
          borderRadius: 4,
          overflow: "hidden",
          backgroundColor: "white",
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
            How it works
          </h2>
        </div>

        <div style={{ padding: 20 }}>
          <ol style={{ color: "#7c98b6", fontSize: 14, paddingLeft: 20, marginBottom: 16 }}>
            <li style={{ marginBottom: 10 }}>
              Connect the <strong style={{ color: "#33475b" }}>support@squarewheelsauto.com</strong>{" "}
              Gmail account
            </li>
            <li style={{ marginBottom: 10 }}>
              The system will poll Gmail daily (or manually via the admin panel)
            </li>
            <li style={{ marginBottom: 10 }}>
              New customer emails are processed through the AI agent
            </li>
            <li style={{ marginBottom: 10 }}>
              Draft responses are generated and HubSpot tickets created
            </li>
          </ol>

          <div
            style={{
              padding: 12,
              backgroundColor: "#fef6e7",
              borderRadius: 4,
              border: "1px solid #f5c26b",
              fontSize: 13,
              color: "#b36b00",
            }}
          >
            <strong>Note:</strong> Make sure your Google Cloud Console has the redirect URI set to:{" "}
            <code
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.5)",
                padding: "2px 6px",
                borderRadius: 3,
                fontFamily: "monospace",
              }}
            >
              {typeof window !== "undefined"
                ? `${window.location.origin}/admin/gmail-setup`
                : "https://your-domain.com/admin/gmail-setup"}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
