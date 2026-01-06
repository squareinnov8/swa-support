"use client";

/**
 * Review Queue UI
 *
 * Review and approve/reject proposed KB documents.
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type ProposedDoc = {
  id: string;
  source: string;
  source_url: string | null;
  title: string;
  body: string;
  suggested_category_id: string | null;
  suggested_intent_tags: string[];
  suggested_vehicle_tags: string[];
  suggested_product_tags: string[];
  categorization_confidence: number;
  content_quality_score: number;
  status: string;
  created_at: string;
};

type ConfidenceBreakdown = {
  categoryScore: number;
  qualityScore: number;
  intentScore: number;
  tagScore: number;
  totalScore: number;
  recommendation: string;
  reasons: string[];
};

function ReviewQueueContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");

  const [docs, setDocs] = useState<ProposedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<ProposedDoc | null>(null);
  const [breakdown, setBreakdown] = useState<ConfidenceBreakdown | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<Record<string, number>>({});

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const fetchDocs = useCallback(async () => {
    try {
      const url = new URL("/api/admin/import/review", window.location.origin);
      url.searchParams.set("status", "pending");
      if (jobId) url.searchParams.set("job_id", jobId);

      const res = await fetch(url);
      const data = await res.json();

      setDocs(data.docs ?? []);
      setStats(data.stats ?? {});
    } catch (err) {
      console.error("Failed to fetch docs:", err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function selectDoc(doc: ProposedDoc) {
    setSelectedDoc(doc);
    setEditTitle(doc.title);
    setEditBody(doc.body);
    setIsEditing(false);
    setHasChanges(false);
    try {
      const res = await fetch(`/api/admin/import/review/${doc.id}`);
      const data = await res.json();
      setBreakdown(data.confidenceBreakdown);
    } catch (err) {
      console.error("Failed to fetch doc details:", err);
    }
  }

  function handleTitleChange(value: string) {
    setEditTitle(value);
    setHasChanges(value !== selectedDoc?.title || editBody !== selectedDoc?.body);
  }

  function handleBodyChange(value: string) {
    setEditBody(value);
    setHasChanges(editTitle !== selectedDoc?.title || value !== selectedDoc?.body);
  }

  async function saveEdits() {
    if (!selectedDoc) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/import/review/${selectedDoc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          body: editBody,
        }),
      });
      const data = await res.json();
      if (data.error) {
        console.error("Save failed:", data.error);
        alert(`Failed to save: ${data.error}`);
        return;
      }
      if (data.doc) {
        // Update selected doc and edit fields with saved values
        setSelectedDoc(data.doc);
        setEditTitle(data.doc.title);
        setEditBody(data.doc.body);
        setHasChanges(false);
        setIsEditing(false);
        // Update in list
        setDocs((prev) =>
          prev.map((d) => (d.id === data.doc.id ? { ...d, title: data.doc.title, body: data.doc.body } : d))
        );
      }
    } catch (err) {
      console.error("Failed to save:", err);
      alert("Failed to save changes. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  function cancelEdits() {
    if (selectedDoc) {
      setEditTitle(selectedDoc.title);
      setEditBody(selectedDoc.body);
    }
    setIsEditing(false);
    setHasChanges(false);
  }

  async function handleAction(action: "approve" | "reject", docId?: string) {
    setProcessing(true);
    try {
      const ids = docId ? [docId] : Array.from(selectedIds);
      if (ids.length === 0) return;

      // For single doc approval with edits, use the individual endpoint
      if (action === "approve" && docId && docId === selectedDoc?.id && hasChanges) {
        await fetch(`/api/admin/import/review/${docId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve",
            title: editTitle,
            body: editBody,
            reviewed_by: "admin",
          }),
        });
      } else {
        // Bulk action
        await fetch("/api/admin/import/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            doc_ids: ids,
            reviewed_by: "admin",
          }),
        });
      }

      // Refresh
      await fetchDocs();
      setSelectedIds(new Set());
      if (docId === selectedDoc?.id) {
        setSelectedDoc(null);
        setBreakdown(null);
        setIsEditing(false);
        setHasChanges(false);
      }
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setProcessing(false);
    }
  }

  async function handleAutoReview() {
    setProcessing(true);
    try {
      await fetch("/api/admin/import/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_review", import_job_id: jobId }),
      });
      await fetchDocs();
    } catch (err) {
      console.error("Auto-review failed:", err);
    } finally {
      setProcessing(false);
    }
  }

  function toggleSelection(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  function selectAll() {
    setSelectedIds(new Set(docs.map((d) => d.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">Loading review queue...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Left panel - list */}
      <div className="w-1/2 border-r flex flex-col">
        <div className="p-4 border-b bg-gray-50">
          <h1 className="text-xl font-bold mb-3">Review Queue</h1>

          {/* Stats */}
          <div className="flex gap-4 text-sm mb-3 text-gray-900">
            <span className="font-medium">Pending: {stats.pendingCount ?? 0}</span>
            <span className="text-green-700 font-medium">Auto-approve: {stats.autoApprove ?? 0}</span>
            <span className="text-yellow-700 font-medium">Review: {stats.needsReview ?? 0}</span>
            <span className="text-red-700 font-medium">Reject: {stats.autoReject ?? 0}</span>
          </div>

          {/* Bulk actions */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleAutoReview}
              disabled={processing}
              className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
            >
              Auto-Review
            </button>
            <button
              onClick={selectAll}
              className="px-3 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300"
            >
              Select All
            </button>
            <button
              onClick={selectNone}
              className="px-3 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300"
            >
              Select None
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={() => handleAction("approve")}
                  disabled={processing}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Approve ({selectedIds.size})
                </button>
                <button
                  onClick={() => handleAction("reject")}
                  disabled={processing}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Reject ({selectedIds.size})
                </button>
              </>
            )}
          </div>
        </div>

        {/* Doc list */}
        <div className="flex-1 overflow-auto">
          {docs.length === 0 ? (
            <div className="p-8 text-center text-gray-700">
              No documents pending review.
            </div>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                  selectedDoc?.id === doc.id ? "bg-blue-50" : ""
                }`}
                onClick={() => selectDoc(doc)}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(doc.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelection(doc.id);
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{doc.title}</div>
                    <div className="text-sm text-gray-700 flex gap-3 mt-1">
                      <span className="capitalize">{doc.source}</span>
                      <ConfidenceBadge value={doc.categorization_confidence} />
                      <QualityBadge value={doc.content_quality_score} />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel - detail */}
      <div className="w-1/2 flex flex-col">
        {selectedDoc ? (
          <>
            <div className="p-4 border-b bg-gray-50">
              {/* Title - editable or read-only */}
              {isEditing ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full text-lg font-semibold mb-2 px-2 py-1 border rounded"
                />
              ) : (
                <h2 className="text-lg font-semibold mb-2">{selectedDoc.title}</h2>
              )}

              {/* Confidence breakdown */}
              {breakdown && (
                <div className="bg-white border rounded p-3 mb-3">
                  <div className="text-sm font-medium text-gray-900 mb-2">
                    Confidence: {(breakdown.totalScore * 100).toFixed(0)}%
                    <span
                      className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                        breakdown.recommendation === "auto_approve"
                          ? "bg-green-100 text-green-800"
                          : breakdown.recommendation === "auto_reject"
                          ? "bg-red-100 text-red-800"
                          : breakdown.recommendation === "flag_attention"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {breakdown.recommendation.replace("_", " ")}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <div className="text-gray-700 font-medium">Category</div>
                      <div className="text-gray-900">{(breakdown.categoryScore * 100 / 0.4).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-gray-700 font-medium">Quality</div>
                      <div className="text-gray-900">{(breakdown.qualityScore * 100 / 0.4).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-gray-700 font-medium">Intent</div>
                      <div className="text-gray-900">{breakdown.intentScore > 0 ? "✓" : "—"}</div>
                    </div>
                    <div>
                      <div className="text-gray-700 font-medium">Tags</div>
                      <div className="text-gray-900">{breakdown.tagScore > 0 ? "✓" : "—"}</div>
                    </div>
                  </div>
                  {breakdown.reasons.length > 0 && (
                    <div className="mt-2 text-xs text-gray-700">
                      {breakdown.reasons.slice(0, 3).join(" • ")}
                    </div>
                  )}
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedDoc.suggested_intent_tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                    {tag}
                  </span>
                ))}
                {selectedDoc.suggested_vehicle_tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                    {tag}
                  </span>
                ))}
                {selectedDoc.suggested_product_tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={saveEdits}
                      disabled={processing || !hasChanges}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={cancelEdits}
                      disabled={processing}
                      className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleAction("approve", selectedDoc.id)}
                      disabled={processing}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {hasChanges ? "Approve with Edits" : "Approve"}
                    </button>
                    <button
                      onClick={() => handleAction("reject", selectedDoc.id)}
                      disabled={processing}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {selectedDoc.source_url && (
                  <a
                    href={selectedDoc.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    View Source
                  </a>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {isEditing ? (
                <textarea
                  value={editBody}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  className="w-full h-full min-h-[400px] p-3 border rounded font-mono text-sm resize-none"
                  placeholder="Enter KB article content..."
                />
              ) : (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm">{selectedDoc.body}</pre>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-700">
            Select a document to review
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReviewQueue() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <ReviewQueueContent />
    </Suspense>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.85 ? "text-green-700 font-medium" : value >= 0.5 ? "text-yellow-700 font-medium" : "text-red-700 font-medium";
  return <span className={color}>{pct}% conf</span>;
}

function QualityBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.7 ? "text-green-700 font-medium" : value >= 0.4 ? "text-yellow-700 font-medium" : "text-red-700 font-medium";
  return <span className={color}>{pct}% quality</span>;
}
