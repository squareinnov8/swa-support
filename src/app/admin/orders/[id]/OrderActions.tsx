"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrderActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const performAction = async (action: string, reason?: string) => {
    setLoading(action);
    setError(null);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Action failed");
      }

      // Refresh the page to show updated status
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(null);
    }
  };

  const handleApprove = () => performAction("approve");

  const handleReject = () => {
    const reason = prompt("Reason for rejection (optional):");
    performAction("reject", reason || undefined);
  };

  const handleBlacklist = () => {
    const reason = prompt("Reason for blacklisting customer:");
    if (reason) {
      performAction("blacklist", reason);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-sm text-red-600 mr-2">{error}</span>
      )}
      <button
        onClick={handleApprove}
        disabled={loading !== null}
        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        {loading === "approve" ? "Approving..." : "Approve"}
      </button>
      <button
        onClick={handleReject}
        disabled={loading !== null}
        className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
      >
        {loading === "reject" ? "Rejecting..." : "Reject"}
      </button>
      <button
        onClick={handleBlacklist}
        disabled={loading !== null}
        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
      >
        {loading === "blacklist" ? "..." : "Blacklist Customer"}
      </button>
    </div>
  );
}
