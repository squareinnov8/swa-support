"use client";

/**
 * KB Import Dashboard
 *
 * Main page for managing KB imports from Notion and Gmail.
 */

import { useState, useEffect } from "react";
import Link from "next/link";

type ImportJob = {
  id: string;
  source: string;
  status: string;
  total_items: number;
  processed_items: number;
  approved_items: number;
  rejected_items: number;
  created_at: string;
  completed_at: string | null;
};

type Stats = {
  pendingCount: number;
  autoApprove: number;
  autoReject: number;
  needsReview: number;
  needsAttention: number;
};

export default function ImportDashboard() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [jobsRes, reviewRes] = await Promise.all([
        fetch("/api/admin/import/jobs"),
        fetch("/api/admin/import/review?status=pending&limit=1"),
      ]);

      const jobsData = await jobsRes.json();
      const reviewData = await reviewRes.json();

      setJobs(jobsData.jobs ?? []);
      setStats(reviewData.stats ?? null);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">KB Import</h1>

      {/* Quick stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Pending Review"
            value={stats.pendingCount}
            href="/admin/kb/import/review"
            highlight={stats.pendingCount > 0}
          />
          <StatCard
            label="Auto-Approve Ready"
            value={stats.autoApprove}
            color="green"
          />
          <StatCard
            label="Needs Attention"
            value={stats.needsAttention}
            color="yellow"
          />
          <StatCard
            label="Auto-Reject"
            value={stats.autoReject}
            color="red"
          />
        </div>
      )}

      {/* Import sources */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <ImportSourceCard
          title="Import from Notion"
          description="Import 500+ docs from your Notion workspace. Pages will be analyzed and categorized automatically."
          href="/admin/kb/import/notion"
          icon="📝"
        />
        <ImportSourceCard
          title="Import from Gmail"
          description="Extract knowledge from resolved support threads. Select threads manually for best quality."
          href="/admin/kb/import/gmail"
          icon="📧"
        />
      </div>

      {/* Review queue shortcut */}
      {stats && stats.pendingCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">
            {stats.pendingCount} Documents Pending Review
          </h2>
          <p className="text-blue-700 mb-4">
            Review and approve imported documents before publishing to the knowledge base.
          </p>
          <Link
            href="/admin/kb/import/review"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Go to Review Queue →
          </Link>
        </div>
      )}

      {/* Recent jobs */}
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Recent Import Jobs</h2>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No import jobs yet. Start by importing from Notion or Gmail.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Source</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Progress</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Approved</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Created</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t">
                  <td className="px-4 py-3">
                    <span className="capitalize">{job.source}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3">
                    {job.processed_items} / {job.total_items}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-green-600">{job.approved_items}</span>
                    {" / "}
                    <span className="text-red-600">{job.rejected_items}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/kb/import/review?job_id=${job.id}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      View docs
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  color,
  highlight,
}: {
  label: string;
  value: number;
  href?: string;
  color?: "green" | "yellow" | "red";
  highlight?: boolean;
}) {
  const colorClasses = {
    green: "text-green-600",
    yellow: "text-yellow-600",
    red: "text-red-600",
  };

  const content = (
    <div
      className={`bg-white border rounded-lg p-4 ${
        highlight ? "border-blue-500 ring-1 ring-blue-500" : ""
      }`}
    >
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color ? colorClasses[color] : ""}`}>
        {value}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function ImportSourceCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-white border rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700",
    running: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}
