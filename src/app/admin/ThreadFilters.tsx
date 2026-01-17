"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const STATES = [
  { value: "", label: "All States" },
  { value: "NEW", label: "New" },
  { value: "AWAITING_INFO", label: "Awaiting Info" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "HUMAN_HANDLING", label: "Human Handling" },
  { value: "RESOLVED", label: "Resolved" },
];

const ESCALATED_OPTIONS = [
  { value: "", label: "All Threads" },
  { value: "yes", label: "Escalated Only" },
  { value: "no", label: "Not Escalated" },
];

const SORT_OPTIONS = [
  { value: "updated_at:desc", label: "Latest Update" },
  { value: "updated_at:asc", label: "Oldest Update" },
  { value: "created_at:desc", label: "Newest Created" },
  { value: "created_at:asc", label: "Oldest Created" },
];

export default function ThreadFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentState = searchParams.get("state") || "";
  const currentEscalated = searchParams.get("escalated") || "";
  const currentSort = searchParams.get("sort") || "updated_at:desc";
  const currentIntent = searchParams.get("intent") || "";

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/admin?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.push("/admin");
  }, [router]);

  const hasActiveFilters = currentState || currentEscalated || currentIntent;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        padding: 16,
        backgroundColor: "#f9fafb",
        borderRadius: 8,
        marginBottom: 16,
      }}
    >
      {/* State Filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label
          htmlFor="state-filter"
          style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}
        >
          Status:
        </label>
        <select
          id="state-filter"
          value={currentState}
          onChange={(e) => updateFilter("state", e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: currentState ? "2px solid #3b82f6" : "1px solid #d1d5db",
            fontSize: 13,
            backgroundColor: "white",
            cursor: "pointer",
          }}
        >
          {STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Escalated Filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label
          htmlFor="escalated-filter"
          style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}
        >
          Escalated:
        </label>
        <select
          id="escalated-filter"
          value={currentEscalated}
          onChange={(e) => updateFilter("escalated", e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: currentEscalated ? "2px solid #ef4444" : "1px solid #d1d5db",
            fontSize: 13,
            backgroundColor: currentEscalated === "yes" ? "#fef2f2" : "white",
            cursor: "pointer",
          }}
        >
          {ESCALATED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Intent Filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label
          htmlFor="intent-filter"
          style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}
        >
          Intent:
        </label>
        <input
          id="intent-filter"
          type="text"
          placeholder="e.g. TECH_SUPPORT"
          value={currentIntent}
          onChange={(e) => updateFilter("intent", e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: currentIntent ? "2px solid #8b5cf6" : "1px solid #d1d5db",
            fontSize: 13,
            width: 140,
          }}
        />
      </div>

      {/* Sort */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
        <label
          htmlFor="sort-select"
          style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}
        >
          Sort:
        </label>
        <select
          id="sort-select"
          value={currentSort}
          onChange={(e) => updateFilter("sort", e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 13,
            backgroundColor: "white",
            cursor: "pointer",
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            backgroundColor: "white",
            fontSize: 13,
            color: "#6b7280",
            cursor: "pointer",
          }}
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
