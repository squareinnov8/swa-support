"use client";

/**
 * Job Details Page
 *
 * Shows details and results for a specific import job.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ImportJob = {
  id: string;
  source: string;
  status: string;
  total_items: number;
  processed_items: number;
  approved_items: number;
  rejected_items: number;
  error_message: string | null;
  config: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type ProposedDoc = {
  id: string;
  source: string;
  source_id: string | null;
  source_url: string | null;
  title: string;
  body: string;
  status: string;
  categorization_confidence: number;
  content_quality_score: number;
  suggested_category_id: string | null;
  suggested_intent_tags: string[];
  review_notes: string | null;
  created_at: string;
};

type Stats = {
  pending: number;
  approved: number;
  rejected: number;
  autoApprove: number;
  autoReject: number;
  needsReview: number;
  needsAttention: number;
};

export default function JobDetailsPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<ImportJob | null>(null);
  const [docs, setDocs] = useState<ProposedDoc[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId]);

  async function fetchJobDetails() {
    try {
      const res = await fetch(`/api/admin/import/jobs/${jobId}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setJob(data.job);
        setDocs(data.docs ?? []);
        setStats(data.stats ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch job:", err);
      setError("Failed to load job details");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">Loading job details...</div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-4">
          {error || "Job not found"}
        </div>
        <Link href="/admin/kb/import" className="text-blue-600 hover:underline">
          ← Back to Import
        </Link>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700",
    running: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  const docStatusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    needs_edit: "bg-orange-100 text-orange-800",
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href="/admin/kb/import"
            className="text-blue-600 hover:underline text-sm"
          >
            ← Back to Import
          </Link>
          <h1 className="text-2xl font-bold mt-2">Import Job Details</h1>
        </div>
        <span
          className={`px-3 py-1 rounded text-sm font-medium ${
            statusColors[job.status] ?? statusColors.pending
          }`}
        >
          {job.status}
        </span>
      </div>

      {/* Job Info Card */}
      <div className="bg-white border rounded-lg p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-600">Source</div>
            <div className="font-medium capitalize">{job.source}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Created</div>
            <div className="font-medium">
              {new Date(job.created_at).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Progress</div>
            <div className="font-medium">
              {job.processed_items} / {job.total_items} processed
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">KB Articles</div>
            <div className="font-medium text-green-600">
              {job.approved_items} approved
            </div>
          </div>
        </div>

        {job.error_message && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            Error: {job.error_message}
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-600">
              {stats.pending}
            </div>
            <div className="text-sm text-gray-600">Pending Review</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">
              {stats.approved}
            </div>
            <div className="text-sm text-gray-600">Approved</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600">
              {stats.rejected}
            </div>
            <div className="text-sm text-gray-600">Rejected</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-600">
              {stats.needsAttention}
            </div>
            <div className="text-sm text-gray-600">Needs Attention</div>
          </div>
        </div>
      )}

      {/* Go to Review Queue */}
      {stats && stats.pending > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-blue-800 mb-2">
            {stats.pending} documents from this job are pending review.
          </p>
          <Link
            href={`/admin/kb/import/review?job_id=${job.id}`}
            className="inline-block bg-blue-600 px-4 py-2 rounded hover:bg-blue-700"
            style={{ color: "#ffffff" }}
          >
            Review Documents →
          </Link>
        </div>
      )}

      {/* Proposed Documents Table */}
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">
            Proposed Documents ({docs.length})
          </h2>
        </div>

        {docs.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No documents have been proposed from this job yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Confidence
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Quality
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900"></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div
                        className="font-medium truncate max-w-xs"
                        title={doc.title}
                      >
                        {doc.title.slice(0, 60)}
                        {doc.title.length > 60 ? "..." : ""}
                      </div>
                      {doc.suggested_intent_tags.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {doc.suggested_intent_tags.slice(0, 2).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          docStatusColors[doc.status] ?? docStatusColors.pending
                        }`}
                      >
                        {doc.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {(doc.categorization_confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {(doc.content_quality_score * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/kb/import/review?doc_id=${doc.id}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        {doc.status === "pending" ? "Review →" : "View →"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
