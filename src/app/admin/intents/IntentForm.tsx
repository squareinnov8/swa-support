"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface IntentFormProps {
  categories: string[];
}

export default function IntentForm({ categories }: IntentFormProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    slug: "",
    name: "",
    description: "",
    category: "general",
    priority: 0,
    examples: "",
    requires_verification: false,
    auto_escalate: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/admin/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          examples: form.examples.split("\n").filter((s) => s.trim()),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create intent");
      }

      // Reset form
      setForm({
        slug: "",
        name: "",
        description: "",
        category: "general",
        priority: 0,
        examples: "",
        requires_verification: false,
        auto_escalate: false,
      });
      setExpanded(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create intent");
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          padding: "6px 12px",
          backgroundColor: "#0073aa",
          color: "white",
          border: "none",
          borderRadius: 3,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        + Add intent
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: "#fafbfc", padding: 16, borderRadius: 3 }}>
      {error && (
        <div style={{
          backgroundColor: "#fff0f0",
          color: "#d63638",
          padding: "8px 12px",
          borderRadius: 3,
          marginBottom: 12,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 3, color: "#516f90" }}>
            Slug *
          </label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm({
              ...form,
              slug: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
            })}
            required
            placeholder="PRODUCT_RESTOCK"
            style={{
              width: "100%",
              padding: "6px 10px",
              border: "1px solid #dfe3eb",
              borderRadius: 3,
              fontSize: 12,
              fontFamily: "monospace",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 3, color: "#516f90" }}>
            Name *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="Product Restock Inquiry"
            style={{
              width: "100%",
              padding: "6px 10px",
              border: "1px solid #dfe3eb",
              borderRadius: 3,
              fontSize: 13,
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 3, color: "#516f90" }}>
          Description
        </label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          placeholder="Customer asking when a product will be back in stock"
          style={{
            width: "100%",
            padding: "6px 10px",
            border: "1px solid #dfe3eb",
            borderRadius: 3,
            fontSize: 13,
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 3, color: "#516f90" }}>
          Examples (one per line)
        </label>
        <textarea
          value={form.examples}
          onChange={(e) => setForm({ ...form, examples: e.target.value })}
          rows={3}
          placeholder="when will it be back in stock&#10;restock date"
          style={{
            width: "100%",
            padding: "6px 10px",
            border: "1px solid #dfe3eb",
            borderRadius: 3,
            fontSize: 12,
            fontFamily: "monospace",
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#516f90" }}>Category:</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            style={{
              padding: "5px 8px",
              border: "1px solid #dfe3eb",
              borderRadius: 3,
              fontSize: 13,
              backgroundColor: "#fff",
            }}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value="general">general</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#516f90" }}>Priority:</label>
          <input
            type="number"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
            style={{
              width: 60,
              padding: "5px 8px",
              border: "1px solid #dfe3eb",
              borderRadius: 3,
              fontSize: 13,
            }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.requires_verification}
            onChange={(e) => setForm({ ...form, requires_verification: e.target.checked })}
          />
          <span style={{ fontSize: 12, color: "#33475b" }}>Verify</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.auto_escalate}
            onChange={(e) => setForm({ ...form, auto_escalate: e.target.checked })}
          />
          <span style={{ fontSize: 12, color: "#33475b" }}>Escalate</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "6px 14px",
            backgroundColor: saving ? "#99acc2" : "#00a854",
            color: "white",
            border: "none",
            borderRadius: 3,
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          {saving ? "..." : "Create"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            padding: "6px 14px",
            backgroundColor: "transparent",
            color: "#516f90",
            border: "1px solid #dfe3eb",
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
