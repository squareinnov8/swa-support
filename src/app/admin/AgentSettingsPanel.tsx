"use client";

import { useState, useEffect } from "react";

type AgentSettings = {
  autoSendEnabled: boolean;
  autoSendConfidenceThreshold: number;
  requireVerificationForSend: boolean;
};

export default function AgentSettingsPanel() {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = async (key: keyof AgentSettings, value: unknown) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const updated = await res.json();
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 16, backgroundColor: "#f9fafb", borderRadius: 8, marginBottom: 24 }}>
        Loading settings...
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  return (
    <div
      style={{
        padding: 16,
        backgroundColor: "#f9fafb",
        borderRadius: 8,
        marginBottom: 24,
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong style={{ fontSize: 14 }}>Agent Mode</strong>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0 0" }}>
            {settings.autoSendEnabled
              ? "🟢 Auto-send: Agent will send replies automatically"
              : "🟡 Draft only: Agent creates drafts for review"}
          </p>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: saving ? "wait" : "pointer",
          }}
        >
          <span style={{ fontSize: 13, color: "#374151" }}>
            {settings.autoSendEnabled ? "Auto-send ON" : "Drafts only"}
          </span>
          <div
            onClick={() => !saving && updateSetting("autoSendEnabled", !settings.autoSendEnabled)}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              backgroundColor: settings.autoSendEnabled ? "#10b981" : "#d1d5db",
              position: "relative",
              transition: "background-color 0.2s",
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: "white",
                position: "absolute",
                top: 2,
                left: settings.autoSendEnabled ? 22 : 2,
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </div>
        </label>
      </div>

      {settings.autoSendEnabled && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid #e5e7eb",
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={settings.requireVerificationForSend}
                onChange={(e) =>
                  updateSetting("requireVerificationForSend", e.target.checked)
                }
              />
              Require customer verification for order-related auto-sends
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            Confidence threshold: {(settings.autoSendConfidenceThreshold * 100).toFixed(0)}%
          </div>
        </div>
      )}
    </div>
  );
}
