"use client";

import { useState } from "react";

type KBDoc = {
  id: string;
  source: string;
  title: string;
  body: string;
  category_id: string | null;
  vehicle_tags: string[];
  product_tags: string[];
  intent_tags: string[];
  evolution_status: string;
  updated_at: string;
  kb_categories?: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

type Props = {
  initialDocs: KBDoc[];
  initialTotal: number;
  categories: Category[];
};

export function KBBrowser({ initialDocs, initialTotal, categories }: Props) {
  const [docs, setDocs] = useState(initialDocs);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<KBDoc | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  async function handleSearch() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category_id", categoryFilter);
      if (sourceFilter) params.set("source", sourceFilter);

      const res = await fetch(`/api/admin/kb?${params}`);
      const data = await res.json();

      if (res.ok) {
        setDocs(data.docs);
        setTotal(data.total);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleViewDoc(docId: string) {
    const res = await fetch(`/api/admin/kb/${docId}`);
    const data = await res.json();
    if (res.ok) {
      setSelectedDoc(data.doc);
      setEditTitle(data.doc.title);
      setEditBody(data.doc.body);
      setIsEditing(false);
    }
  }

  async function handleSaveDoc() {
    if (!selectedDoc) return;

    const res = await fetch(`/api/admin/kb/${selectedDoc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        body: editBody,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setSelectedDoc(data.doc);
      setIsEditing(false);
      // Refresh list
      handleSearch();
      if (data.needs_reembed) {
        alert("Document saved. Note: Body changed - you may want to re-embed this document.");
      }
    } else {
      alert("Failed to save document");
    }
  }

  async function handleDeleteDoc() {
    if (!selectedDoc) return;
    if (!confirm(`Delete "${selectedDoc.title}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/admin/kb/${selectedDoc.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setSelectedDoc(null);
      handleSearch();
    } else {
      alert("Failed to delete document");
    }
  }

  const sourceColors: Record<string, { bg: string; text: string }> = {
    manual: { bg: "#dbeafe", text: "#1e40af" },
    notion: { bg: "#fef3c7", text: "#92400e" },
    thread_evolution: { bg: "#ede9fe", text: "#6b21a8" },
    website: { bg: "#dcfce7", text: "#166534" },
  };

  return (
    <div style={{ display: "flex", gap: 24 }}>
      {/* Left: Document List */}
      <div style={{ flex: 1 }}>
        {/* Search & Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
            }}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            <option value="">All Sources</option>
            <option value="manual">Manual</option>
            <option value="notion">Notion</option>
            <option value="website">Website</option>
            <option value="thread_evolution">Thread Evolution</option>
          </select>
          <button
            onClick={handleSearch}
            disabled={isLoading}
            style={{
              padding: "8px 16px",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {isLoading ? "..." : "Search"}
          </button>
        </div>

        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
          Showing {docs.length} of {total} documents
        </div>

        {/* Document List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docs.map((doc) => {
            const colors = sourceColors[doc.source] || sourceColors.manual;
            return (
              <div
                key={doc.id}
                onClick={() => handleViewDoc(doc.id)}
                style={{
                  padding: 12,
                  border:
                    selectedDoc?.id === doc.id
                      ? "2px solid #3b82f6"
                      : "1px solid #e5e7eb",
                  borderRadius: 8,
                  cursor: "pointer",
                  backgroundColor: selectedDoc?.id === doc.id ? "#eff6ff" : "white",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      backgroundColor: colors.bg,
                      color: colors.text,
                    }}
                  >
                    {doc.source}
                  </span>
                  <span style={{ fontWeight: 500 }}>{doc.title}</span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#6b7280",
                    marginTop: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc.body.slice(0, 100)}...
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                  {doc.kb_categories?.name || "Uncategorized"} •{" "}
                  {new Date(doc.updated_at).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Document Detail/Editor */}
      <div
        style={{
          width: 500,
          borderLeft: "1px solid #e5e7eb",
          paddingLeft: 24,
        }}
      >
        {selectedDoc ? (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0 }}>{isEditing ? "Edit Document" : "Document"}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveDoc}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "#22c55e",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditTitle(selectedDoc.title);
                        setEditBody(selectedDoc.body);
                      }}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "#e5e7eb",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
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
                    <button
                      onClick={handleDeleteDoc}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditing ? (
              <div>
                <label style={{ fontSize: 13, fontWeight: 500 }}>Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    marginTop: 4,
                    marginBottom: 12,
                  }}
                />
                <label style={{ fontSize: 13, fontWeight: 500 }}>Body</label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 400,
                    padding: 8,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    marginTop: 4,
                    fontFamily: "inherit",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                />
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Source</div>
                  <div>{selectedDoc.source}</div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Title</div>
                  <div style={{ fontSize: 18, fontWeight: 500 }}>{selectedDoc.title}</div>
                </div>
                {selectedDoc.kb_categories && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Category</div>
                    <div>{selectedDoc.kb_categories.name}</div>
                  </div>
                )}
                {selectedDoc.intent_tags?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Intent Tags</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {selectedDoc.intent_tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            padding: "2px 8px",
                            backgroundColor: "#f3f4f6",
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Content</div>
                  <div
                    style={{
                      marginTop: 8,
                      padding: 12,
                      backgroundColor: "#f9fafb",
                      borderRadius: 6,
                      whiteSpace: "pre-wrap",
                      fontSize: 14,
                      lineHeight: 1.6,
                      maxHeight: 500,
                      overflow: "auto",
                    }}
                  >
                    {selectedDoc.body}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  Last updated: {new Date(selectedDoc.updated_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 300,
              color: "#9ca3af",
            }}
          >
            Select a document to view
          </div>
        )}
      </div>
    </div>
  );
}
