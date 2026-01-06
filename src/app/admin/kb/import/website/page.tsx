"use client";

/**
 * Website Import Wizard
 *
 * Scrape website pages and import to KB.
 * Supports sitemap parsing or manual URL list.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type UrlPreview = {
  url: string;
  isNew: boolean;
};

type MapResponse = {
  total: number;
  new_count: number;
  existing_count: number;
  urls: string[];
  new_urls: string[];
  existing_urls: string[];
  error?: string;
};

type FetchResponse = {
  job_id: string;
  status: string;
  created: number;
  skipped: number;
  errors: string[];
  error?: string;
};

export default function WebsiteImport() {
  const router = useRouter();

  // Config state
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [manualUrls, setManualUrls] = useState("");
  const [contentSelector, setContentSelector] = useState("");
  const [maxPages, setMaxPages] = useState(100);

  // UI state
  const [step, setStep] = useState<"configure" | "discover" | "select" | "importing" | "done">(
    "configure"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [urls, setUrls] = useState<UrlPreview[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<{
    jobId: string;
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  async function handleDiscover() {
    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        max_pages: maxPages,
      };

      if (sitemapUrl.trim()) {
        body.sitemap_url = sitemapUrl.trim();
      }

      if (manualUrls.trim()) {
        body.urls = manualUrls
          .trim()
          .split("\n")
          .map((u) => u.trim())
          .filter((u) => u.length > 0);
      }

      const res = await fetch("/api/admin/import/website/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: MapResponse = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      // Build URL preview list
      const newSet = new Set(data.new_urls);
      const urlPreviews: UrlPreview[] = data.urls.map((url) => ({
        url,
        isNew: newSet.has(url),
      }));

      setUrls(urlPreviews);
      // Pre-select all new URLs
      setSelectedUrls(new Set(data.new_urls));
      setStep("select");
    } catch (err) {
      console.error("Discovery failed:", err);
      setError("Failed to discover URLs. Check console for details.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (selectedUrls.size === 0) {
      setError("Please select at least one URL to import");
      return;
    }

    setStep("importing");
    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        selected_urls: Array.from(selectedUrls),
        max_pages: maxPages,
      };

      if (sitemapUrl.trim()) {
        body.sitemap_url = sitemapUrl.trim();
      }

      if (contentSelector.trim()) {
        body.content_selector = contentSelector.trim();
      }

      const res = await fetch("/api/admin/import/website/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: FetchResponse = await res.json();

      if (data.error) {
        setError(data.error);
        setStep("select");
        return;
      }

      setImportResult({
        jobId: data.job_id,
        created: data.created,
        skipped: data.skipped,
        errors: data.errors,
      });
      setStep("done");
    } catch (err) {
      console.error("Import failed:", err);
      setError("Import failed. Check console for details.");
      setStep("select");
    } finally {
      setLoading(false);
    }
  }

  function toggleUrl(url: string) {
    const newSelected = new Set(selectedUrls);
    if (newSelected.has(url)) {
      newSelected.delete(url);
    } else {
      newSelected.add(url);
    }
    setSelectedUrls(newSelected);
  }

  function selectAllNew() {
    const newUrls = urls.filter((u) => u.isNew).map((u) => u.url);
    setSelectedUrls(new Set(newUrls));
  }

  function selectAll() {
    setSelectedUrls(new Set(urls.map((u) => u.url)));
  }

  function selectNone() {
    setSelectedUrls(new Set());
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Import from Website</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6">
          Error: {error}
        </div>
      )}

      {/* Step 1: Configure */}
      {step === "configure" && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Configure Import</h2>

          <div className="space-y-6">
            {/* Sitemap URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sitemap URL
              </label>
              <input
                type="url"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                placeholder="https://squarewheelsauto.com/sitemap.xml"
                className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                Enter a sitemap.xml URL to automatically discover pages
              </p>
            </div>

            <div className="text-center text-gray-500">— or —</div>

            {/* Manual URLs */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Manual URL List
              </label>
              <textarea
                value={manualUrls}
                onChange={(e) => setManualUrls(e.target.value)}
                placeholder="https://squarewheelsauto.com/pages/faq&#10;https://squarewheelsauto.com/pages/shipping&#10;https://squarewheelsauto.com/pages/returns"
                rows={5}
                className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
              <p className="text-sm text-gray-500 mt-1">
                One URL per line
              </p>
            </div>

            {/* Advanced options */}
            <details className="border rounded p-4">
              <summary className="font-medium cursor-pointer">Advanced Options</summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Content Selector (CSS)
                  </label>
                  <input
                    type="text"
                    value={contentSelector}
                    onChange={(e) => setContentSelector(e.target.value)}
                    placeholder="main, article, .content"
                    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    CSS selector to extract main content (optional)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Pages
                  </label>
                  <input
                    type="number"
                    value={maxPages}
                    onChange={(e) => setMaxPages(parseInt(e.target.value) || 100)}
                    min={1}
                    max={500}
                    className="w-32 px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Maximum number of pages to import per run
                  </p>
                </div>
              </div>
            </details>

            <button
              onClick={handleDiscover}
              disabled={loading || (!sitemapUrl.trim() && !manualUrls.trim())}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Discovering URLs..." : "Discover URLs"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select URLs */}
      {step === "select" && (
        <div className="bg-white border rounded-lg">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Select URLs to Import</h2>
            <p className="text-sm text-gray-600 mt-1">
              Found {urls.length} URLs ({urls.filter((u) => u.isNew).length} new,{" "}
              {urls.filter((u) => !u.isNew).length} already imported)
            </p>
          </div>

          {/* Selection controls */}
          <div className="p-4 border-b bg-gray-50 flex gap-4 items-center">
            <span className="text-sm text-gray-600">
              {selectedUrls.size} selected
            </span>
            <button
              onClick={selectAllNew}
              className="text-sm text-blue-600 hover:underline"
            >
              Select new only
            </button>
            <button
              onClick={selectAll}
              className="text-sm text-blue-600 hover:underline"
            >
              Select all
            </button>
            <button
              onClick={selectNone}
              className="text-sm text-blue-600 hover:underline"
            >
              Clear selection
            </button>
          </div>

          {/* URL list */}
          <div className="max-h-96 overflow-y-auto">
            {urls.map((item) => (
              <label
                key={item.url}
                className={`flex items-center gap-3 px-4 py-2 border-b cursor-pointer hover:bg-gray-50 ${
                  !item.isNew ? "bg-gray-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedUrls.has(item.url)}
                  onChange={() => toggleUrl(item.url)}
                  className="w-4 h-4"
                />
                <span className="flex-1 text-sm truncate">{item.url}</span>
                {item.isNew ? (
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                    New
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                    Imported
                  </span>
                )}
              </label>
            ))}
          </div>

          {/* Actions */}
          <div className="p-4 border-t bg-gray-50 flex gap-4">
            <button
              onClick={() => setStep("configure")}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={loading || selectedUrls.size === 0}
              className="flex-1 px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Importing..." : `Import ${selectedUrls.size} Pages`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === "importing" && (
        <div className="bg-white border rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">🌐</div>
          <h2 className="text-lg font-semibold mb-2">Importing Website Pages...</h2>
          <p className="text-gray-600">
            Fetching pages, extracting content, and analyzing for the knowledge base.
            This may take a few minutes.
          </p>
          <div className="mt-6">
            <div className="h-2 bg-blue-200 rounded w-64 mx-auto animate-pulse"></div>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Importing {selectedUrls.size} pages with 500ms delay between requests...
          </p>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && importResult && (
        <div className="bg-white border rounded-lg p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-lg font-semibold mb-2">Import Complete!</h2>
            <p className="text-gray-600">
              Created {importResult.created} proposed documents.
              {importResult.skipped > 0 && ` Skipped ${importResult.skipped} pages.`}
            </p>
          </div>

          {importResult.errors.length > 0 && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded p-4">
              <h3 className="font-medium text-yellow-800 mb-2">
                {importResult.errors.length} Errors
              </h3>
              <ul className="text-sm text-yellow-700 space-y-1 max-h-32 overflow-y-auto">
                {importResult.errors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            </div>
          )}

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
