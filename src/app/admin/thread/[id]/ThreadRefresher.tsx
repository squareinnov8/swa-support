"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ThreadRefresherProps {
  threadId: string;
}

export function ThreadRefresher({ threadId }: ThreadRefresherProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(true);
  const [result, setResult] = useState<{
    newMessages?: number;
    reprocessed?: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    async function refresh() {
      try {
        const res = await fetch(`/api/admin/thread/${threadId}/refresh`, {
          method: "POST",
        });

        const data = await res.json();

        if (!res.ok) {
          setResult({ error: data.error || "Failed to refresh" });
        } else {
          setResult({
            newMessages: data.newMessages,
            reprocessed: data.reprocessed,
          });

          // If we got new messages or reprocessed, refresh the page data
          if (data.newMessages > 0 || data.reprocessed) {
            router.refresh();
          }
        }
      } catch (err) {
        setResult({ error: err instanceof Error ? err.message : "Refresh failed" });
      } finally {
        setRefreshing(false);
      }
    }

    refresh();
  }, [threadId, router]);

  if (refreshing) {
    return (
      <div style={{
        padding: "8px 12px",
        backgroundColor: "#f5f8fa",
        borderRadius: 3,
        fontSize: 12,
        color: "#516f90",
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
      }}>
        <span style={{
          width: 12,
          height: 12,
          border: "2px solid #cbd6e2",
          borderTopColor: "#0091ae",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        Checking for updates...
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (result?.error) {
    return (
      <div style={{
        padding: "8px 12px",
        backgroundColor: "#fde8e9",
        borderRadius: 3,
        fontSize: 12,
        color: "#c93b41",
        marginBottom: 16,
      }}>
        Refresh failed: {result.error}
      </div>
    );
  }

  if (result?.newMessages && result.newMessages > 0) {
    return (
      <div style={{
        padding: "8px 12px",
        backgroundColor: "#e5f5f8",
        borderRadius: 3,
        fontSize: 12,
        color: "#0091ae",
        marginBottom: 16,
      }}>
        Found {result.newMessages} new message{result.newMessages > 1 ? "s" : ""} from Gmail
      </div>
    );
  }

  // No visible indicator when nothing new
  return null;
}
