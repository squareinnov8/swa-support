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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {intents.map((intent) => {
        const isExpanded = expandedId === intent.id;
        const isEditing = editingId === intent.id;
        const usage = usageByIntent[intent.id] || 0;

        return (
          <div
            key={intent.id}
            style={{
              border: "1px solid #cbd6e2",
              borderRadius: 4,
              backgroundColor: intent.is_active ? "white" : "#f5f8fa",
              opacity: intent.is_active ? 1 : 0.7,
            }}
          >
            {/* Header Row */}
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
              }}
              onClick={() => setExpandedId(isExpanded ? null : intent.id)}
            >
              <span style={{ color: "#7c98b6", fontSize: 12 }}>{isExpanded ? "▼" : "▶"}</span>

              <code style={{
                fontSize: 12,
                backgroundColor: "#eaf0f6",
                padding: "2px 6px",
                borderRadius: 3,
                fontFamily: "monospace",
                color: "#516f90",
              }}>
                {intent.slug}
              </code>

              <span style={{ fontWeight: 500, flex: 1, color: "#33475b" }}>{intent.name}</span>

              {intent.auto_escalate && (
                <span style={{
                  fontSize: 10,
                  backgroundColor: "#fde8e9",
                  color: "#c93b41",
                  padding: "2px 6px",
                  borderRadius: 3,
                  fontWeight: 600,
                }}>
                  ESCALATE
                </span>
              )}

              {intent.requires_verification && (
                <span style={{
                  fontSize: 10,
                  backgroundColor: "#e5f5f8",
                  color: "#0091ae",
                  padding: "2px 6px",
                  borderRadius: 3,
                  fontWeight: 500,
                }}>
                  VERIFY
                </span>
              )}

              <span style={{
                fontSize: 12,
                color: "#7c98b6",
                minWidth: 60,
                textAlign: "right",
              }}>
                {usage} thread{usage !== 1 ? "s" : ""}
              </span>

              <span style={{
                fontSize: 11,
                color: "#516f90",
                backgroundColor: "#eaf0f6",
                padding: "2px 8px",
                borderRadius: 3,
              }}>
                P{intent.priority}
              </span>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: "0 16px 16px 16px", borderTop: "1px solid #cbd6e2" }}>
                {isEditing ? (
                  /* Edit Form */
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 4, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={editForm.name || ""}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        style={{
                          width: "100%",
                          padding: 8,
                          border: "1px solid #cbd6e2",
                          borderRadius: 4,
                          fontSize: 14,
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 4, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Description (for LLM context)
                      </label>
                      <textarea
                        value={editForm.description || ""}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={2}
                        style={{
                          width: "100%",
                          padding: 8,
                          border: "1px solid #cbd6e2",
                          borderRadius: 4,
                          fontSize: 14,
                          resize: "vertical",
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 4, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Examples (one per line)
                      </label>
                      <textarea
                        value={editForm.examples?.join("\n") || ""}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          examples: e.target.value.split("\n").filter((s) => s.trim()),
                        })}
                        rows={4}
                        style={{
                          width: "100%",
                          padding: 8,
                          border: "1px solid #cbd6e2",
                          borderRadius: 4,
                          fontSize: 13,
                          fontFamily: "monospace",
                          resize: "vertical",
                        }}
                        placeholder="screen is dead&#10;not turning on&#10;display blank"
                      />
                    </div>

                    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 4, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Priority
                        </label>
                        <input
                          type="number"
                          value={editForm.priority ?? 0}
                          onChange={(e) => setEditForm({ ...editForm, priority: parseInt(e.target.value) || 0 })}
                          style={{
                            width: 80,
                            padding: 8,
                            border: "1px solid #cbd6e2",
                            borderRadius: 4,
                            fontSize: 14,
                          }}
                        />
                      </div>

                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={editForm.requires_verification || false}
                          onChange={(e) => setEditForm({ ...editForm, requires_verification: e.target.checked })}
                        />
                        <span style={{ fontSize: 13, color: "#33475b" }}>Requires Verification</span>
                      </label>

                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={editForm.auto_escalate || false}
                          onChange={(e) => setEditForm({ ...editForm, auto_escalate: e.target.checked })}
                        />
                        <span style={{ fontSize: 13, color: "#33475b" }}>Auto-Escalate</span>
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleSave(intent.id)}
                        disabled={saving}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: saving ? "#cbd6e2" : "#00a182",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          cursor: saving ? "not-allowed" : "pointer",
                          fontSize: 14,
                          fontWeight: 500,
                        }}
                      >
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#eaf0f6",
                          color: "#516f90",
                          border: "1px solid #cbd6e2",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <div style={{ marginTop: 12 }}>
                    {intent.description && (
                      <p style={{ fontSize: 14, color: "#516f90", margin: "0 0 12px 0" }}>
                        {intent.description}
                      </p>
                    )}

                    {intent.examples && intent.examples.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6, color: "#7c98b6", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Example phrases:
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {intent.examples.slice(0, 8).map((ex, i) => (
                            <code
                              key={i}
                              style={{
                                fontSize: 11,
                                backgroundColor: "#eaf0f6",
                                padding: "2px 8px",
                                borderRadius: 3,
                                color: "#516f90",
                              }}
                            >
                              {ex}
                            </code>
                          ))}
                          {intent.examples.length > 8 && (
                            <span style={{ fontSize: 11, color: "#7c98b6" }}>
                              +{intent.examples.length - 8} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleEdit(intent)}
                        style={{
                          padding: "6px 14px",
                          backgroundColor: "#0091ae",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(intent)}
                        style={{
                          padding: "6px 14px",
                          backgroundColor: intent.is_active ? "#fef6e7" : "#e5f8f4",
                          color: intent.is_active ? "#b36b00" : "#00a182",
                          border: intent.is_active ? "1px solid #f5c26b" : "1px solid #a8e4d0",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {intent.is_active ? "Deactivate" : "Activate"}
                      </button>
                      {intent.slug !== "UNKNOWN" && (
                        <button
                          onClick={() => handleDelete(intent)}
                          style={{
                            padding: "6px 14px",
                            backgroundColor: "#fde8e9",
                            color: "#c93b41",
                            border: "1px solid #f2545b",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 500,
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
