"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type InstructionEditorProps = {
  id: string;
  sectionKey: string;
  title: string;
  content: string;
  version: number;
  updatedAt: string;
};

export function InstructionEditor({
  id,
  sectionKey,
  title,
  content: initialContent,
  version,
  updatedAt,
}: InstructionEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          content,
          change_reason: "Manual edit",
        }),
      });

      if (res.ok) {
        setIsEditing(false);
        router.refresh();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to save"}`);
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setContent(initialContent);
    setIsEditing(false);
  }

  const previewContent = content.length > 200 ? content.slice(0, 200) + "..." : content;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={() => !isEditing && setExpanded(!expanded)}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {sectionKey} • v{version} • Updated {new Date(updatedAt).toLocaleDateString()}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
                setIsEditing(true);
              }}
              style={{
                padding: "6px 12px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Edit
            </button>
          )}
          <span style={{ color: "#9ca3af", fontSize: 18 }}>
            {expanded ? "▼" : "▶"}
          </span>
        </div>
      </div>

      {/* Content */}
      {(expanded || isEditing) && (
        <div style={{ padding: 16 }}>
          {isEditing ? (
            <>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 300,
                  padding: 12,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontFamily: "monospace",
                  fontSize: 13,
                  lineHeight: 1.5,
                  resize: "vertical",
                }}
              />
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={isSaving || content === initialContent}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: isSaving ? "#9ca3af" : "#22c55e",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: isSaving ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#e5e7eb",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "system-ui",
                fontSize: 14,
                lineHeight: 1.6,
                margin: 0,
                color: "#374151",
              }}
            >
              {content}
            </pre>
          )}
        </div>
      )}

      {/* Preview when collapsed */}
      {!expanded && !isEditing && (
        <div style={{ padding: "8px 16px", color: "#6b7280", fontSize: 13 }}>
          {previewContent}
        </div>
      )}
    </div>
  );
}
