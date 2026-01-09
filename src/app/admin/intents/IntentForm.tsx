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
          padding: "10px 20px",
          backgroundColor: "#1e40af",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        + Add New Intent
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{
          backgroundColor: "#fee2e2",
          color: "#991b1b",
          padding: 12,
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            Slug (ID) *
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
              padding: 8,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
              fontFamily: "monospace",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
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
              padding: 8,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
          Description (helps LLM understand when to use this intent)
        </label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          placeholder="Customer asking when a product will be back in stock"
          style={{
            width: "100%",
            padding: 8,
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 14,
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
          Example phrases (one per line)
        </label>
        <textarea
          value={form.examples}
          onChange={(e) => setForm({ ...form, examples: e.target.value })}
          rows={3}
          placeholder="when will it be back in stock&#10;restock date&#10;out of stock"
          style={{
            width: "100%",
            padding: 8,
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "monospace",
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            Category
          </label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            style={{
              padding: 8,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
              minWidth: 150,
            }}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value="general">general</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            Priority
          </label>
          <input
            type="number"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
            style={{
              width: 80,
              padding: 8,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 20 }}>
          <input
            type="checkbox"
            checked={form.requires_verification}
            onChange={(e) => setForm({ ...form, requires_verification: e.target.checked })}
          />
          <span style={{ fontSize: 13 }}>Requires Verification</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 20 }}>
          <input
            type="checkbox"
            checked={form.auto_escalate}
            onChange={(e) => setForm({ ...form, auto_escalate: e.target.checked })}
          />
          <span style={{ fontSize: 13 }}>Auto-Escalate</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "10px 20px",
            backgroundColor: "#1e40af",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {saving ? "Creating..." : "Create Intent"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            padding: "10px 20px",
            backgroundColor: "#f3f4f6",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
