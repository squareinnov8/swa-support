"use client";

/**
 * Gmail Import - Learning Loop
 *
 * Automated KB backfill from support inbox:
 * 1. Process emails, classify intent, check KB
 * 2. If low confidence, extract resolution from thread
 * 3. Create KB articles from resolutions
 */

import { useState, useEffect, Fragment, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type ExtractedQA = {
  question: string;
  kbTitle: string;
  kbMatchScore: number;
  alreadyInKB: boolean;
  kbArticleId?: string;
  action: "kb_exists" | "kb_extracted" | "skipped";
};

type ProcessResult = {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  threadMessageCount: number;
  threadSummary?: string;
  isResolved: boolean;
  qaPairsFound: number;
  qaPairsExtracted: number;
  qaPairsSkipped: number;
  extractedQAs: ExtractedQA[];
  action: "kb_exists" | "kb_extracted" | "needs_review" | "skipped";
  error?: string;
  reason?: string;
};

type QAPairStats = {
  found: number;
  extracted: number;
  alreadyInKB: number;
};

type Status = {
  inbox: { total: number };
  processed: { total: number };
  kbExtracted: { total: number };
  recentJobs: Array<{
    id: string;
    status: string;
    total_items: number;
    processed_items: number;
    approved_items: number;
    created_at: string;
  }>;
};

function GmailLearningLoopContent() {
  const searchParams = useSearchParams();

  const connected = searchParams.get("connected") === "true";
  const error = searchParams.get("error");

  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ProcessResult[]>([]);
  const [qaPairStats, setQaPairStats] = useState<QAPairStats | null>(null);
  const [batchSize, setBatchSize] = useState(10);
  const [query, setQuery] = useState("in:inbox category:primary");
  const [reprocess, setReprocess] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  useEffect(() => {
    const emailCookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("gmail_email="));
    if (emailCookie) {
      setEmail(decodeURIComponent(emailCookie.split("=")[1]));
    }

    if (connected) {
      fetchStatus();
    }
  }, [connected]);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/import/gmail/learn");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    try {
      const res = await fetch("/api/admin/import/gmail/connect");
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  }

  async function runLearningLoop() {
    setProcessing(true);
    setResults([]);
    setQaPairStats(null);
    setExpandedThreads(new Set());
    try {
      const res = await fetch("/api/admin/import/gmail/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_size: batchSize, query, reprocess }),
      });
      const data = await res.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
      } else {
        setResults(data.results ?? []);
        setQaPairStats(data.qaPairs ?? null);
        fetchStatus(); // Refresh stats
      }
    } catch (err) {
      console.error("Learning loop failed:", err);
    } finally {
      setProcessing(false);
    }
  }

  function toggleThread(threadId: string) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }

  const actionColors: Record<string, string> = {
    kb_exists: "bg-gray-100 text-gray-700",
    kb_extracted: "bg-green-100 text-green-800",
    needs_review: "bg-yellow-100 text-yellow-800",
    skipped: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="p-8 max-w-6xl mx-auto" style={{ color: "#000" }}>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#000" }}>Gmail Learning Loop</h1>
        <a
          href="/admin/kb/import"
          className="hover:underline"
          style={{ color: "#2563eb" }}
        >
          ← Back to Import
        </a>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6">
          Error: {error}
        </div>
      )}

      {/* Not Connected */}
      {!connected && !email && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Connect to Gmail</h2>
          <p className="text-gray-600 mb-6">
            Connect your support inbox to automatically extract KB articles from resolved threads.
          </p>
          <button
            onClick={handleConnect}
            className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Connect Gmail →
          </button>
        </div>
      )}

      {/* Connected */}
      {(connected || email) && (
        <>
          {/* Status Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4">
              <div className="text-3xl font-bold text-gray-900">
                {status?.inbox.total ?? "—"}
              </div>
              <div className="text-sm text-gray-700">Inbox Messages</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-3xl font-bold text-blue-600">
                {status?.processed.total ?? "—"}
              </div>
              <div className="text-sm text-gray-700">Processed</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-3xl font-bold text-green-600">
                {status?.kbExtracted.total ?? "—"}
              </div>
              <div className="text-sm text-gray-700">KB Articles Extracted</div>
            </div>
          </div>

          {/* Connected Banner */}
          {email && (
            <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded mb-6 flex justify-between items-center">
              <span>Connected as: <strong>{email}</strong></span>
              <button
                onClick={fetchStatus}
                disabled={loading}
                className="text-sm underline"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          )}

          {/* Learning Loop Controls */}
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Run Learning Loop</h2>
            <p className="text-gray-600 mb-4">
              Process inbox emails: classify intent, check KB confidence, and extract resolutions from low-confidence threads.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gmail Query
                </label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder="in:inbox category:primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Batch Size
                </label>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full p-2 border rounded"
                >
                  <option value={5}>5 emails</option>
                  <option value={10}>10 emails</option>
                  <option value={25}>25 emails</option>
                  <option value={50}>50 emails</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="reprocess"
                checked={reprocess}
                onChange={(e) => setReprocess(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="reprocess" className="text-sm" style={{ color: "#000" }}>
                Re-process already processed emails
              </label>
            </div>

            <button
              onClick={runLearningLoop}
              disabled={processing}
              className="px-6 py-3 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              style={{ color: "#ffffff" }}
            >
              {processing ? "Processing..." : `Process ${batchSize} Emails`}
            </button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="bg-white border rounded-lg">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">
                  Results ({results.length} threads processed)
                </h2>
                {qaPairStats && (
                  <div className="text-sm mt-1" style={{ color: "#333" }}>
                    <span className="text-green-700 font-medium">{qaPairStats.extracted} Q&A extracted</span> •{" "}
                    <span>{qaPairStats.alreadyInKB} already in KB</span> •{" "}
                    <span>{qaPairStats.found} total Q&A found</span>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 text-left text-xs">
                  <tr>
                    <th className="px-4 py-2 font-semibold" style={{ color: "#000" }}>Thread</th>
                    <th className="px-4 py-2 font-semibold" style={{ color: "#000" }}>Messages</th>
                    <th className="px-4 py-2 font-semibold" style={{ color: "#000" }}>Q&A Pairs</th>
                    <th className="px-4 py-2 font-semibold" style={{ color: "#000" }}>Action</th>
                    <th className="px-4 py-2 font-semibold" style={{ color: "#000" }}>Summary</th>
                    <th className="px-4 py-2 font-semibold" style={{ color: "#000" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <Fragment key={result.messageId}>
                      <tr
                        className={`border-t hover:bg-gray-50 ${result.extractedQAs?.length > 0 ? "cursor-pointer" : ""}`}
                        onClick={() => result.extractedQAs?.length > 0 && toggleThread(result.threadId)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {result.extractedQAs?.length > 0 && (
                              <span className="text-gray-400">
                                {expandedThreads.has(result.threadId) ? "▼" : "▶"}
                              </span>
                            )}
                            <div>
                              <div className="font-medium truncate max-w-xs" style={{ color: "#000" }}>
                                {result.subject?.slice(0, 50) || "(no subject)"}
                              </div>
                              <div className="text-xs truncate max-w-xs" style={{ color: "#666" }}>
                                {result.from?.slice(0, 40)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#000" }}>
                          {result.threadMessageCount} msg{result.threadMessageCount > 1 ? "s" : ""}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#000" }}>
                          {result.qaPairsFound > 0 ? (
                            <span>
                              <span className="text-green-700 font-medium">{result.qaPairsExtracted}</span>
                              {" / "}
                              {result.qaPairsFound}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              actionColors[result.action] ?? "bg-gray-100"
                            }`}
                          >
                            {result.action.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs max-w-xs" style={{ color: "#666" }}>
                          {result.threadSummary?.slice(0, 80) || result.reason}
                          {result.error && (
                            <span className="text-red-600 block">Error: {result.error}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {result.qaPairsExtracted > 0 && (
                            <span className="text-blue-600 text-sm">
                              {result.qaPairsExtracted} KB article{result.qaPairsExtracted > 1 ? "s" : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                      {/* Expanded Q&A pairs */}
                      {expandedThreads.has(result.threadId) && result.extractedQAs?.map((qa, idx) => (
                        <tr key={`${result.threadId}-qa-${idx}`} className="bg-gray-50">
                          <td className="px-4 py-2 pl-12" colSpan={2}>
                            <div className="text-sm" style={{ color: "#000" }}>
                              <span className="font-medium">Q:</span> {qa.question?.slice(0, 60)}...
                            </div>
                            <div className="text-xs" style={{ color: "#666" }}>
                              {qa.kbTitle}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm" style={{ color: "#000" }}>
                            {qa.alreadyInKB ? (
                              <span className="text-gray-500">{(qa.kbMatchScore * 100).toFixed(0)}% match</span>
                            ) : (
                              <span className="text-green-600">New</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                actionColors[qa.action] ?? "bg-gray-100"
                              }`}
                            >
                              {qa.action.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2">
                            {qa.kbArticleId && (
                              <a
                                href={`/admin/kb/import/review?doc_id=${qa.kbArticleId}`}
                                className="text-blue-600 hover:underline text-sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Review →
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Recent Jobs */}
          {status?.recentJobs && status.recentJobs.length > 0 && (
            <div className="bg-white border rounded-lg mt-6">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">Recent Jobs</h2>
              </div>
              <div className="divide-y">
                {status.recentJobs.map((job) => (
                  <div key={job.id} className="p-4 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(job.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-700">
                        {job.processed_items} processed, {job.approved_items} KB extracted
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        job.status === "completed"
                          ? "bg-green-100 text-green-800"
                          : job.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Link to Review Queue */}
          <div className="mt-6 text-center">
            <a
              href="/admin/kb/import/review"
              className="text-blue-600 hover:underline"
            >
              Go to Review Queue →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

export default function GmailLearningLoop() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <GmailLearningLoopContent />
    </Suspense>
  );
}
