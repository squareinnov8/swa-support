"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "auto_approved", label: "Auto-Approved" },
  { value: "all", label: "All" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "kb_article", label: "KB Articles" },
  { value: "instruction_update", label: "Instructions" },
  { value: "kb_update", label: "KB Updates" },
];

export default function LearningFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get("status") || "pending";
  const currentType = searchParams.get("type") || "";

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/admin/learning?${params.toString()}`);
    },
    [router, searchParams]
  );

  const selectStyle = {
    padding: "6px 10px",
    borderRadius: 3,
    border: "1px solid #dfe3eb",
    fontSize: 13,
    backgroundColor: "#fff",
    color: "#33475b",
    cursor: "pointer",
  };

  const selectActiveStyle = {
    ...selectStyle,
    borderColor: "#0073aa",
    backgroundColor: "#f0f8ff",
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        marginBottom: 16,
      }}
    >
      {/* Status Filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label htmlFor="status-filter" style={{ fontSize: 13, color: "#516f90" }}>
          Status:
        </label>
        <select
          id="status-filter"
          value={currentStatus}
          onChange={(e) => updateFilter("status", e.target.value)}
          style={currentStatus !== "pending" ? selectActiveStyle : selectStyle}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Type Filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label htmlFor="type-filter" style={{ fontSize: 13, color: "#516f90" }}>
          Type:
        </label>
        <select
          id="type-filter"
          value={currentType}
          onChange={(e) => updateFilter("type", e.target.value)}
          style={currentType ? selectActiveStyle : selectStyle}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Help Text */}
      <div style={{ fontSize: 12, color: "#99acc2" }}>
        High confidence (≥85%) proposals auto-approve
      </div>
    </div>
  );
}
