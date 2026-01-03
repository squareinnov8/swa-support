"use client";

/**
 * Gmail Import Wizard
 *
 * Connect to Gmail and import support threads.
 */

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type Label = { id: string; name: string };

type ThreadCandidate = {
  id: string;
  thread_id: string;
  subject: string;
  snippet: string;
  message_count: number;
  labels: string[];
  last_message_date: string;
  selected: boolean;
};

export default function GmailImport() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const connected = searchParams.get("connected") === "true";
  const error = searchParams.get("error");

  const [email, setEmail] = useState<string | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [candidates, setCandidates] = useState<ThreadCandidate[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    totalCreated: number;
  } | null>(null);
  const [step, setStep] = useState<"connect" | "search" | "select" | "importing" | "done">(
    connected ? "search" : "connect"
  );

  useEffect(() => {
    // Get email from cookie
    const emailCookie = document.cookie.split("; ").find((row) => row.startsWith("gmail_email="));
    if (emailCookie) {
      setEmail(decodeURIComponent(emailCookie.split("=")[1]));
    }

    // Fetch labels if connected
    if (connected) {
      fetchLabels();
    }
  }, [connected]);

  async function fetchLabels() {
    try {
      const res = await fetch("/api/admin/import/gmail/threads");
      const data = await res.json();
      setLabels(data.labels ?? []);
    } catch (err) {
      console.error("Failed to fetch labels:", err);
    }
  }

  async function handleConnect() {
    try {
      const res = await fetch("/api/admin/import/gmail/connect");
      const data = await res.json();

      if (data.authUrl) {
        sessionStorage.setItem("gmail_oauth_state", data.state);
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  }

  async function handleSearch() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/import/gmail/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          labels: selectedLabels,
        }),
      });
      const data = await res.json();
      setCandidates(data.candidates ?? []);
      setJobId(data.jobId);
      setStep("select");
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleCandidate(id: string, selected: boolean) {
    try {
      await fetch("/api/admin/import/gmail/threads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, selected }),
      });
      setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, selected } : c)));
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  }

  async function selectAll(selected: boolean) {
    const ids = candidates.map((c) => c.id);
    try {
      await fetch("/api/admin/import/gmail/threads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, selected }),
      });
      setCandidates((prev) => prev.map((c) => ({ ...c, selected })));
    } catch (err) {
      console.error("Bulk select failed:", err);
    }
  }

  async function handleProcess() {
    if (!jobId) return;
    setStep("importing");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/import/gmail/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json();
      setImportResult({ totalCreated: data.totalCreated });
      setStep("done");
    } catch (err) {
      console.error("Process failed:", err);
    } finally {
      setLoading(false);
    }
  }

  const selectedCount = candidates.filter((c) => c.selected).length;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Import from Gmail</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6">
          Error: {error}
        </div>
      )}

      {/* Step 1: Connect */}
      {step === "connect" && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Connect to Gmail</h2>
          <p className="text-gray-600 mb-6">
            Connect your Gmail account to import resolved support threads. Only read-only access is
            requested.
          </p>
          <button
            onClick={handleConnect}
            className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Connect Gmail →
          </button>
        </div>
      )}

      {/* Step 2: Search */}
      {step === "search" && (
        <div className="bg-white border rounded-lg p-6">
          {email && (
            <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded mb-6">
              Connected as: {email}
            </div>
          )}

          <h2 className="text-lg font-semibold mb-4">Search Threads</h2>
          <p className="text-gray-600 mb-6">
            Search for resolved support threads to extract knowledge base articles.
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Query (Gmail syntax)
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="label:resolved OR in:sent subject:re:"
                className="w-full p-3 border rounded"
              />
            </div>

            {labels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter by Labels
                </label>
                <div className="flex flex-wrap gap-2">
                  {labels.slice(0, 20).map((label) => (
                    <button
                      key={label.id}
                      onClick={() =>
                        setSelectedLabels((prev) =>
                          prev.includes(label.name)
                            ? prev.filter((l) => l !== label.name)
                            : [...prev, label.name]
                        )
                      }
                      className={`px-3 py-1 rounded text-sm ${
                        selectedLabels.includes(label.name)
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {label.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search Threads"}
          </button>
        </div>
      )}

      {/* Step 3: Select */}
      {step === "select" && (
        <div className="bg-white border rounded-lg">
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Select Threads ({candidates.length} found)</h2>
              <p className="text-sm text-gray-600">
                Select threads to extract KB articles from. {selectedCount} selected.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => selectAll(true)}
                className="px-3 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300"
              >
                Select All
              </button>
              <button
                onClick={() => selectAll(false)}
                className="px-3 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300"
              >
                Select None
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-auto">
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                className={`p-4 border-b flex items-start gap-3 ${
                  candidate.selected ? "bg-blue-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={candidate.selected}
                  onChange={(e) => toggleCandidate(candidate.id, e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{candidate.subject || "(no subject)"}</div>
                  <div className="text-sm text-gray-500 truncate">{candidate.snippet}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {candidate.message_count} messages •{" "}
                    {new Date(candidate.last_message_date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t bg-gray-50 flex justify-between">
            <button
              onClick={() => setStep("search")}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              ← Back
            </button>
            <button
              onClick={handleProcess}
              disabled={selectedCount === 0 || loading}
              className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Process {selectedCount} Threads
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === "importing" && (
        <div className="bg-white border rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">📧</div>
          <h2 className="text-lg font-semibold mb-2">Processing Gmail Threads...</h2>
          <p className="text-gray-600">
            Extracting resolutions and creating KB articles. This may take a few minutes.
          </p>
          <div className="mt-6 animate-pulse">
            <div className="h-2 bg-blue-200 rounded w-64 mx-auto"></div>
          </div>
        </div>
      )}

      {/* Step 5: Done */}
      {step === "done" && importResult && (
        <div className="bg-white border rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-lg font-semibold mb-2">Import Complete!</h2>
          <p className="text-gray-600 mb-6">
            Created {importResult.totalCreated} proposed documents from Gmail threads.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push("/admin/kb/import/review")}
              className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Go to Review Queue
            </button>
            <button
              onClick={() => router.push("/admin/kb/import")}
              className="px-6 py-3 bg-gray-200 rounded hover:bg-gray-300"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
