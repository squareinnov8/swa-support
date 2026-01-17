"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Intent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  priority: number;
  examples: string[];
  is_active: boolean;
  requires_verification: boolean;
  auto_escalate: boolean;
}

interface IntentListProps {
  intents: Intent[];
  usageByIntent: Record<string, number>;
}

export default function IntentList({ intents, usageByIntent }: IntentListProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Intent>>({});
  const [saving, setSaving] = useState(false);

  const handleToggle = async (intent: Intent) => {
    try {
      await fetch(`/api/admin/intents/${intent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !intent.is_active }),
      });
      router.refresh();
    } catch (err) {
      console.error("Failed to toggle intent:", err);
    }
  };

  const handleEdit = (intent: Intent) => {
    setEditingId(intent.id);
    setEditForm({
      name: intent.name,
      description: intent.description || "",
      priority: intent.priority,
      examples: intent.examples,
      requires_verification: intent.requires_verification,
      auto_escalate: intent.auto_escalate,
    });
  };

  const handleSave = async (intentId: string) => {
    setSaving(true);
    try {
      await fetch(`/api/admin/intents/${intentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      console.error("Failed to save intent:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (intent: Intent) => {
    if (!confirm(`Deactivate "${intent.name}"? It will no longer be used for classification.`)) {
      return;
    }
    try {
      await fetch(`/api/admin/intents/${intent.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      console.error("Failed to delete intent:", err);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {intents.map((intent) => {
        const isExpanded = expandedId === intent.id;
        const isEditing = editingId === intent.id;
        const usage = usageByIntent[intent.id] || 0;

        return (
          <div
            key={intent.id}
            style={{
              backgroundColor: intent.is_active ? "#fff" : "#fafbfc",
              borderBottom: "1px solid #eaf0f6",
              opacity: intent.is_active ? 1 : 0.6,
            }}
          >
            {/* Header Row */}
            <div
              style={{
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
              }}
              onClick={() => setExpandedId(isExpanded ? null : intent.id)}
            >
              <span style={{ color: "#99acc2", fontSize: 10 }}>{isExpanded ? "▾" : "▸"}</span>

              <code style={{
                fontSize: 11,
                backgroundColor: "#f5f8fa",
                padding: "2px 5px",
                borderRadius: 2,
                fontFamily: "monospace",
                color: "#516f90",
              }}>
                {intent.slug}
              </code>

              <span style={{ fontWeight: 500, flex: 1, color: "#33475b", fontSize: 14 }}>{intent.name}</span>

              {intent.auto_escalate && (
                <span style={{
                  fontSize: 10,
                  backgroundColor: "#fff0f0",
                  color: "#d63638",
                  padding: "2px 5px",
                  borderRadius: 2,
                  fontWeight: 600,
                }}>
                  ESCALATE
                </span>
              )}

              {intent.requires_verification && (
                <span style={{
                  fontSize: 10,
                  backgroundColor: "#f0f8ff",
                  color: "#0073aa",
                  padding: "2px 5px",
                  borderRadius: 2,
                  fontWeight: 500,
                }}>
                  VERIFY
                </span>
              )}

              <span style={{
                fontSize: 12,
                color: "#99acc2",
                minWidth: 50,
                textAlign: "right",
              }}>
                {usage}
              </span>

              <span style={{
                fontSize: 11,
                color: "#7c98b6",
              }}>
                P{intent.priority}
              </span>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: "8px 12px 12px 32px", backgroundColor: "#fafbfc" }}>
                {isEditing ? (
                  /* Edit Form */
                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 3, color: "#516f90" }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={editForm.name || ""}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          border: "1px solid #dfe3eb",
                          borderRadius: 3,
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 3, color: "#516f90" }}>
                        Description
                      </label>
                      <textarea
                        value={editForm.description || ""}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={2}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          border: "1px solid #dfe3eb",
                          borderRadius: 3,
                          fontSize: 13,
                          resize: "vertical",
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 3, color: "#516f90" }}>
                        Examples (one per line)
                      </label>
                      <textarea
                        value={editForm.examples?.join("\n") || ""}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          examples: e.target.value.split("\n").filter((s) => s.trim()),
                        })}
                        rows={3}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          border: "1px solid #dfe3eb",
                          borderRadius: 3,
                          fontSize: 12,
                          fontFamily: "monospace",
                          resize: "vertical",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 16, marginBottom: 10, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <label style={{ fontSize: 12, color: "#516f90" }}>Priority:</label>
                        <input
                          type="number"
                          value={editForm.priority ?? 0}
                          onChange={(e) => setEditForm({ ...editForm, priority: parseInt(e.target.value) || 0 })}
                          style={{
                            width: 60,
                            padding: "5px 8px",
                            border: "1px solid #dfe3eb",
                            borderRadius: 3,
                            fontSize: 13,
                          }}
                        />
                      </div>

                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={editForm.requires_verification || false}
                          onChange={(e) => setEditForm({ ...editForm, requires_verification: e.target.checked })}
                        />
                        <span style={{ fontSize: 12, color: "#33475b" }}>Verify</span>
                      </label>

                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={editForm.auto_escalate || false}
                          onChange={(e) => setEditForm({ ...editForm, auto_escalate: e.target.checked })}
                        />
                        <span style={{ fontSize: 12, color: "#33475b" }}>Escalate</span>
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleSave(intent.id)}
                        disabled={saving}
                        style={{
                          padding: "5px 12px",
                          backgroundColor: saving ? "#99acc2" : "#00a854",
                          color: "white",
                          border: "none",
                          borderRadius: 3,
                          cursor: saving ? "not-allowed" : "pointer",
                          fontSize: 13,
                        }}
                      >
                        {saving ? "..." : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{
                          padding: "5px 12px",
                          backgroundColor: "transparent",
                          color: "#516f90",
                          border: "1px solid #dfe3eb",
                          borderRadius: 3,
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <div>
                    {intent.description && (
                      <p style={{ fontSize: 13, color: "#516f90", margin: "0 0 8px 0" }}>
                        {intent.description}
                      </p>
                    )}

                    {intent.examples && intent.examples.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {intent.examples.slice(0, 6).map((ex, i) => (
                            <code
                              key={i}
                              style={{
                                fontSize: 11,
                                backgroundColor: "#fff",
                                padding: "2px 6px",
                                borderRadius: 2,
                                color: "#516f90",
                                border: "1px solid #eaf0f6",
                              }}
                            >
                              {ex}
                            </code>
                          ))}
                          {intent.examples.length > 6 && (
                            <span style={{ fontSize: 11, color: "#99acc2" }}>
                              +{intent.examples.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleEdit(intent)}
                        style={{
                          padding: "4px 10px",
                          backgroundColor: "#0073aa",
                          color: "white",
                          border: "none",
                          borderRadius: 3,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(intent)}
                        style={{
                          padding: "4px 10px",
                          backgroundColor: "transparent",
                          color: intent.is_active ? "#bf5600" : "#00a854",
                          border: "1px solid currentColor",
                          borderRadius: 3,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {intent.is_active ? "Disable" : "Enable"}
                      </button>
                      {intent.slug !== "UNKNOWN" && (
                        <button
                          onClick={() => handleDelete(intent)}
                          style={{
                            padding: "4px 10px",
                            backgroundColor: "transparent",
                            color: "#d63638",
                            border: "1px solid currentColor",
                            borderRadius: 3,
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
