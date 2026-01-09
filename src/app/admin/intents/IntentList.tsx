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
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              backgroundColor: intent.is_active ? "white" : "#f9fafb",
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
              <span style={{ color: "#9ca3af" }}>{isExpanded ? "▼" : "▶"}</span>

              <code style={{
                fontSize: 12,
                backgroundColor: "#f3f4f6",
                padding: "2px 6px",
                borderRadius: 4,
                fontFamily: "monospace",
              }}>
                {intent.slug}
              </code>

              <span style={{ fontWeight: 500, flex: 1 }}>{intent.name}</span>

              {intent.auto_escalate && (
                <span style={{
                  fontSize: 10,
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                }}>
                  ESCALATE
                </span>
              )}

              {intent.requires_verification && (
                <span style={{
                  fontSize: 10,
                  backgroundColor: "#dbeafe",
                  color: "#1e40af",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}>
                  VERIFY
                </span>
              )}

              <span style={{
                fontSize: 12,
                color: "#6b7280",
                minWidth: 60,
                textAlign: "right",
              }}>
                {usage} thread{usage !== 1 ? "s" : ""}
              </span>

              <span style={{
                fontSize: 11,
                color: "#9ca3af",
                backgroundColor: "#f3f4f6",
                padding: "2px 8px",
                borderRadius: 4,
              }}>
                P{intent.priority}
              </span>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: "0 16px 16px 16px", borderTop: "1px solid #e5e7eb" }}>
                {isEditing ? (
                  /* Edit Form */
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={editForm.name || ""}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        style={{
                          width: "100%",
                          padding: 8,
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          fontSize: 14,
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                        Description (for LLM context)
                      </label>
                      <textarea
                        value={editForm.description || ""}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={2}
                        style={{
                          width: "100%",
                          padding: 8,
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          fontSize: 14,
                          resize: "vertical",
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
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
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          fontSize: 13,
                          fontFamily: "monospace",
                          resize: "vertical",
                        }}
                        placeholder="screen is dead&#10;not turning on&#10;display blank"
                      />
                    </div>

                    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                          Priority
                        </label>
                        <input
                          type="number"
                          value={editForm.priority ?? 0}
                          onChange={(e) => setEditForm({ ...editForm, priority: parseInt(e.target.value) || 0 })}
                          style={{
                            width: 80,
                            padding: 8,
                            border: "1px solid #d1d5db",
                            borderRadius: 6,
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
                        <span style={{ fontSize: 13 }}>Requires Verification</span>
                      </label>

                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={editForm.auto_escalate || false}
                          onChange={(e) => setEditForm({ ...editForm, auto_escalate: e.target.checked })}
                        />
                        <span style={{ fontSize: 13 }}>Auto-Escalate</span>
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleSave(intent.id)}
                        disabled={saving}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#1e40af",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
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
                          backgroundColor: "#f3f4f6",
                          color: "#374151",
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
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
                      <p style={{ fontSize: 14, color: "#4b5563", margin: "0 0 12px 0" }}>
                        {intent.description}
                      </p>
                    )}

                    {intent.examples && intent.examples.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6b7280" }}>
                          Example phrases:
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {intent.examples.slice(0, 8).map((ex, i) => (
                            <code
                              key={i}
                              style={{
                                fontSize: 11,
                                backgroundColor: "#f3f4f6",
                                padding: "2px 8px",
                                borderRadius: 4,
                                color: "#4b5563",
                              }}
                            >
                              {ex}
                            </code>
                          ))}
                          {intent.examples.length > 8 && (
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>
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
                          padding: "6px 12px",
                          backgroundColor: "#f3f4f6",
                          color: "#374151",
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(intent)}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: intent.is_active ? "#fef3c7" : "#dcfce7",
                          color: intent.is_active ? "#92400e" : "#166534",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        {intent.is_active ? "Deactivate" : "Activate"}
                      </button>
                      {intent.slug !== "UNKNOWN" && (
                        <button
                          onClick={() => handleDelete(intent)}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#fee2e2",
                            color: "#991b1b",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 13,
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
