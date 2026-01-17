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
    padding: "8px 12px",
    borderRadius: 4,
    border: "1px solid #cbd6e2",
    fontSize: 14,
    backgroundColor: "#ffffff",
    color: "#33475b",
    cursor: "pointer",
    minWidth: 140,
  };

  const selectActiveStyle = {
    ...selectStyle,
    borderColor: "#0091ae",
    backgroundColor: "#e5f5f8",
  };

  const inputStyle = {
    padding: "8px 12px",
    borderRadius: 4,
    border: "1px solid #cbd6e2",
    fontSize: 14,
    backgroundColor: "#ffffff",
    color: "#33475b",
    width: 160,
  };

  const inputActiveStyle = {
    ...inputStyle,
    borderColor: "#0091ae",
    backgroundColor: "#e5f5f8",
  };

  const labelStyle = {
    fontSize: 12,
    fontWeight: 500 as const,
    color: "#516f90",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "flex-end",
        padding: "16px 20px",
        backgroundColor: "#ffffff",
        border: "1px solid #cbd6e2",
        borderRadius: 4,
        marginBottom: 16,
      }}
    >
      {/* Status Filter */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="state-filter" style={labelStyle}>
          Status
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="escalated-filter" style={labelStyle}>
          Escalated
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="intent-filter" style={labelStyle}>
          Intent
        </label>
        <input
          id="intent-filter"
          type="text"
          placeholder="e.g. TECH_SUPPORT"
          value={currentIntent}
          onChange={(e) => updateFilter("intent", e.target.value)}
          style={currentIntent ? inputActiveStyle : inputStyle}
        />
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Sort */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="sort-select" style={labelStyle}>
          Sort by
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
            padding: "8px 14px",
            borderRadius: 4,
            border: "1px solid #cbd6e2",
            backgroundColor: "#ffffff",
            fontSize: 14,
            color: "#516f90",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
