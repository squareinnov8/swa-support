"use client";

/**
 * Notion Import Wizard
 *
 * Connect to Notion and import pages.
 * Supports both internal integration (NOTION_TOKEN) and OAuth flow.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type WorkspaceInfo = {
  id: string;
  name: string;
};

type PreviewPage = {
  id: string;
  title: string;
  url: string;
  wordCount: number;
  suggestedCategory: string | null;
  confidence: number;
  qualityScore: number;
};

type PreviewResponse = {
  pages: PreviewPage[];
  totalAvailable: number;
  note?: string;
};

type ConnectionStatus = {
  connected: boolean;
  method: "internal_integration" | "oauth";
  message?: string;
  authUrl?: string;
  state?: string;
  error?: string;
};

function NotionImportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const connectedParam = searchParams.get("connected") === "true";
  const errorParam = searchParams.get("error");

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [preview, setPreview] = useState<PreviewPage[]>([]);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(errorParam);
  const [connectionMethod, setConnectionMethod] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    jobId: string;
    totalCreated: number;
  } | null>(null);
  const [step, setStep] = useState<"connect" | "preview" | "importing" | "done">(
    connectedParam ? "preview" : "connect"
  );

  useEffect(() => {
    // Check connection status on mount
    checkConnection();

    // Get workspace info from cookie (for OAuth flow)
    const workspaceCookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("notion_workspace="));
    if (workspaceCookie) {
      try {
        setWorkspace(JSON.parse(decodeURIComponent(workspaceCookie.split("=")[1])));
      } catch {
        // ignore
      }
    }
  }, []);

  async function checkConnection() {
    try {
      const res = await fetch("/api/admin/import/notion/connect");
      const data: ConnectionStatus = await res.json();

      if (data.error) {
        setConnectionError(data.error);
        setLoading(false);
        return;
      }

      setConnectionMethod(data.method);

      if (data.connected) {
        // Internal integration is already connected
        setStep("preview");
        if (data.method === "internal_integration") {
          setWorkspace({ id: "internal", name: "Internal Integration" });
        }
      }
    } catch (err) {
      setConnectionError("Failed to check connection status");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    try {
      const res = await fetch("/api/admin/import/notion/connect");
      const data: ConnectionStatus = await res.json();

      if (data.error) {
        setConnectionError(data.error);
        return;
      }

      if (data.connected) {
        // Already connected (internal integration)
        setConnectionMethod(data.method);
        setStep("preview");
        if (data.method === "internal_integration") {
          setWorkspace({ id: "internal", name: "Internal Integration" });
        }
        return;
      }

      if (data.authUrl) {
        // OAuth flow - redirect to Notion
        sessionStorage.setItem("notion_oauth_state", data.state ?? "");
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error("Failed to connect:", err);
      setConnectionError("Failed to connect to Notion");
    }
  }

  async function handlePreview() {
    setImporting(true);
    setConnectionError(null);
    setPreviewNote(null);
    try {
      const res = await fetch("/api/admin/import/notion/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", limit: 10 }),
      });
      const data: PreviewResponse & { error?: string } = await res.json();

      if (data.error) {
        setConnectionError(data.error);
        return;
      }

      setPreview(data.pages ?? []);
      setPreviewNote(data.note ?? null);

      if ((data.pages ?? []).length === 0) {
        setConnectionError(
          "No pages found. Make sure your integration has access to pages in Notion (click '...' menu → Connections → Add your integration)"
        );
      }
    } catch (err) {
      console.error("Preview failed:", err);
      setConnectionError("Preview failed. Check browser console for details.");
    } finally {
      setImporting(false);
    }
  }

  async function handleImport() {
    setStep("importing");
    setImporting(true);
    setConnectionError(null);
    try {
      const res = await fetch("/api/admin/import/notion/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "import" }),
      });
      const data = await res.json();

      if (data.error) {
        setConnectionError(data.error);
        setStep("preview");
        return;
      }

      setImportResult({
        jobId: data.jobId,
        totalCreated: data.totalCreated,
      });
      setStep("done");
    } catch (err) {
      console.error("Import failed:", err);
      setConnectionError("Import failed. Check browser console for details.");
      setStep("preview");
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Import from Notion</h1>
        <div className="bg-white border rounded-lg p-8 text-center">
          <p className="text-gray-600">Checking connection status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Import from Notion</h1>

      {connectionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6">
          Error: {connectionError}
        </div>
      )}

      {/* Step 1: Connect */}
      {step === "connect" && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Connect to Notion</h2>
          {connectionMethod === "oauth" ? (
            <>
              <p className="text-gray-600 mb-6">
                Connect your Notion workspace to import pages. You&apos;ll be redirected to Notion
                to authorize access.
              </p>
              <button
                onClick={handleConnect}
                className="px-6 py-3 bg-black text-white rounded hover:bg-gray-800"
              >
                Connect Notion →
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-600 mb-6">
                Notion is not configured. Add <code className="bg-gray-100 px-1">NOTION_TOKEN</code>{" "}
                to your environment variables with your internal integration token.
              </p>
              <button
                onClick={() => checkConnection()}
                className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Retry Connection
              </button>
            </>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && (
        <div>
          {workspace && (
            <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded mb-6">
              Connected to: {workspace.name}
            </div>
          )}

          {preview.length === 0 ? (
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Preview Import</h2>
              <p className="text-gray-600 mb-6">
                Preview a sample of pages that will be imported and analyzed.
              </p>
              <button
                onClick={handlePreview}
                disabled={importing}
                className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? "Loading..." : "Preview Pages"}
              </button>
            </div>
          ) : (
            <div className="bg-white border rounded-lg">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">Preview ({preview.length} pages)</h2>
                {previewNote && (
                  <p className="text-sm text-amber-600 mt-2">⚠️ {previewNote}</p>
                )}
              </div>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Title</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Words</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Confidence
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((page) => (
                    <tr key={page.id} className="border-t">
                      <td className="px-4 py-3">
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {page.title}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm">{page.wordCount}</td>
                      <td className="px-4 py-3 text-sm">{page.suggestedCategory ?? "—"}</td>
                      <td className="px-4 py-3 text-sm">{Math.round(page.confidence * 100)}%</td>
                      <td className="px-4 py-3 text-sm">{Math.round(page.qualityScore * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-4 border-t bg-gray-50">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {importing ? "Importing..." : "Import All Pages"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Importing */}
      {step === "importing" && (
        <div className="bg-white border rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">📝</div>
          <h2 className="text-lg font-semibold mb-2">Importing from Notion...</h2>
          <p className="text-gray-600">
            Fetching pages, converting to markdown, and analyzing content. This may take a few
            minutes.
          </p>
          <div className="mt-6 animate-pulse">
            <div className="h-2 bg-blue-200 rounded w-64 mx-auto"></div>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && importResult && (
        <div className="bg-white border rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-lg font-semibold mb-2">Import Complete!</h2>
          <p className="text-gray-600 mb-6">
            Created {importResult.totalCreated} proposed documents.
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

export default function NotionImport() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <NotionImportContent />
    </Suspense>
  );
}
