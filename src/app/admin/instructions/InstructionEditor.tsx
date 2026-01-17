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
        border: "1px solid #cbd6e2",
        borderRadius: 4,
        marginBottom: 16,
        overflow: "hidden",
        backgroundColor: "#ffffff",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "#f5f8fa",
          borderBottom: expanded || isEditing ? "1px solid #cbd6e2" : "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={() => !isEditing && setExpanded(!expanded)}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#33475b" }}>{title}</h3>
          <span style={{ fontSize: 12, color: "#7c98b6" }}>
            {sectionKey} • v{version} • Updated {new Date(updatedAt).toLocaleDateString()}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
                setIsEditing(true);
              }}
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
          )}
          <span style={{ color: "#7c98b6", fontSize: 12 }}>
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
                  border: "1px solid #cbd6e2",
                  borderRadius: 4,
                  fontFamily: "monospace",
                  fontSize: 13,
                  lineHeight: 1.6,
                  resize: "vertical",
                }}
              />
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={isSaving || content === initialContent}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: isSaving ? "#cbd6e2" : "#00a182",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: isSaving ? "not-allowed" : "pointer",
                    fontWeight: 500,
                    fontSize: 14,
                  }}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#eaf0f6",
                    color: "#516f90",
                    border: "1px solid #cbd6e2",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: 14,
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
                fontFamily: "system-ui, sans-serif",
                fontSize: 14,
                lineHeight: 1.6,
                margin: 0,
                color: "#33475b",
              }}
            >
              {content}
            </pre>
          )}
        </div>
      )}

      {/* Preview when collapsed */}
      {!expanded && !isEditing && (
        <div style={{ padding: "10px 16px", color: "#7c98b6", fontSize: 13 }}>
          {previewContent}
        </div>
      )}
    </div>
  );
}
