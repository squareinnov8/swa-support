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
  { value: "updated_at:desc", label: "Latest Activity" },
  { value: "updated_at:asc", label: "Oldest Activity" },
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

  const inputStyle = {
    padding: "6px 10px",
    borderRadius: 3,
    border: "1px solid #dfe3eb",
    fontSize: 13,
    backgroundColor: "#fff",
    color: "#33475b",
    width: 130,
  };

  const inputActiveStyle = {
    ...inputStyle,
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
        marginBottom: 12,
      }}
    >
      {/* Status Filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label htmlFor="state-filter" style={{ fontSize: 13, color: "#516f90" }}>
          Status:
        </label>
        <select
          id="state-filter"
          value={currentState}
          onChange={(e) => updateFilter("state", e.target.value)}
          style={currentState ? selectActiveStyle : selectStyle}
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
        <label htmlFor="escalated-filter" style={{ fontSize: 13, color: "#516f90" }}>
          Priority:
        </label>
        <select
          id="escalated-filter"
          value={currentEscalated}
          onChange={(e) => updateFilter("escalated", e.target.value)}
          style={currentEscalated ? selectActiveStyle : selectStyle}
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
        <label htmlFor="intent-filter" style={{ fontSize: 13, color: "#516f90" }}>
          Intent:
        </label>
        <input
          id="intent-filter"
          type="text"
          placeholder="Search..."
          value={currentIntent}
          onChange={(e) => updateFilter("intent", e.target.value)}
          style={currentIntent ? inputActiveStyle : inputStyle}
        />
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Sort */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label htmlFor="sort-select" style={{ fontSize: 13, color: "#516f90" }}>
          Sort:
        </label>
        <select
          id="sort-select"
          value={currentSort}
          onChange={(e) => updateFilter("sort", e.target.value)}
          style={selectStyle}
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
            padding: "5px 10px",
            borderRadius: 3,
            border: "none",
            backgroundColor: "transparent",
            fontSize: 13,
            color: "#0073aa",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
