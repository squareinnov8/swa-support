"use client";

import { useState } from "react";

type Vendor = {
  id: string;
  name: string;
  contact_emails: string[];
  product_patterns: string[];
  new_order_instructions: string | null;
  cancel_instructions: string | null;
  escalation_instructions: string | null;
  created_at: string;
  updated_at: string;
};

type VendorFormData = {
  name: string;
  contact_emails: string;
  product_patterns: string;
  new_order_instructions: string;
  cancel_instructions: string;
  escalation_instructions: string;
};

export function VendorList({ initialVendors }: { initialVendors: Vendor[] }) {
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<VendorFormData>({
    name: "",
    contact_emails: "",
    product_patterns: "",
    new_order_instructions: "",
    cancel_instructions: "",
    escalation_instructions: "",
  });

  function startEdit(vendor: Vendor) {
    setEditingId(vendor.id);
    setIsCreating(false);
    setFormData({
      name: vendor.name,
      contact_emails: vendor.contact_emails.join("\n"),
      product_patterns: vendor.product_patterns.join("\n"),
      new_order_instructions: vendor.new_order_instructions || "",
      cancel_instructions: vendor.cancel_instructions || "",
      escalation_instructions: vendor.escalation_instructions || "",
    });
  }

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setFormData({
      name: "",
      contact_emails: "",
      product_patterns: "",
      new_order_instructions: "",
      cancel_instructions: "",
      escalation_instructions: "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setIsCreating(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: formData.name.trim(),
        contact_emails: formData.contact_emails
          .split("\n")
          .map((e) => e.trim())
          .filter(Boolean),
        product_patterns: formData.product_patterns
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean),
        new_order_instructions: formData.new_order_instructions.trim() || null,
        cancel_instructions: formData.cancel_instructions.trim() || null,
        escalation_instructions: formData.escalation_instructions.trim() || null,
      };

      const url = editingId
        ? `/api/admin/vendors/${editingId}`
        : "/api/admin/vendors";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save vendor");
      }

      const { vendor } = await res.json();

      if (editingId) {
        setVendors((prev) =>
          prev.map((v) => (v.id === editingId ? vendor : v))
        );
      } else {
        setVendors((prev) => [...prev, vendor].sort((a, b) => a.name.localeCompare(b.name)));
      }

      setEditingId(null);
      setIsCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this vendor?")) return;

    try {
      const res = await fetch(`/api/admin/vendors/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete vendor");
      }
      setVendors((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Add Vendor Button */}
      {!isCreating && !editingId && (
        <button
          onClick={startCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + Add Vendor
        </button>
      )}

      {/* Create Form */}
      {isCreating && (
        <VendorForm
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onCancel={cancelEdit}
          saving={saving}
          isNew
        />
      )}

      {/* Vendor Cards */}
      <div className="space-y-4">
        {vendors.map((vendor) => (
          <div
            key={vendor.id}
            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
          >
            {editingId === vendor.id ? (
              <div className="p-4">
                <VendorForm
                  formData={formData}
                  setFormData={setFormData}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  saving={saving}
                />
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {vendor.name}
                    </h3>

                    {/* Contact Emails */}
                    <div className="mt-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        Contact Emails
                      </span>
                      <div className="mt-1">
                        {vendor.contact_emails.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {vendor.contact_emails.map((email, i) => (
                              <span
                                key={i}
                                className="inline-flex px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-sm"
                              >
                                {email}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">
                            No contact emails configured
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Product Patterns */}
                    <div className="mt-3">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        Product Patterns
                      </span>
                      <div className="mt-1">
                        {vendor.product_patterns.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {vendor.product_patterns.map((pattern, i) => (
                              <span
                                key={i}
                                className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-sm font-mono"
                              >
                                {pattern}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">
                            No product patterns configured
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Instructions (collapsed) */}
                    {(vendor.new_order_instructions ||
                      vendor.cancel_instructions ||
                      vendor.escalation_instructions) && (
                      <details className="mt-3">
                        <summary className="text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700">
                          Instructions
                        </summary>
                        <div className="mt-2 space-y-2 text-sm">
                          {vendor.new_order_instructions && (
                            <div>
                              <span className="font-medium text-gray-600">
                                New Order:
                              </span>{" "}
                              <span className="text-gray-700">
                                {vendor.new_order_instructions}
                              </span>
                            </div>
                          )}
                          {vendor.cancel_instructions && (
                            <div>
                              <span className="font-medium text-gray-600">
                                Cancel:
                              </span>{" "}
                              <span className="text-gray-700">
                                {vendor.cancel_instructions}
                              </span>
                            </div>
                          )}
                          {vendor.escalation_instructions && (
                            <div>
                              <span className="font-medium text-gray-600">
                                Escalation:
                              </span>{" "}
                              <span className="text-gray-700">
                                {vendor.escalation_instructions}
                              </span>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => startEdit(vendor)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(vendor.id)}
                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {vendors.length === 0 && !isCreating && (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-gray-500 text-lg mb-2">No vendors configured</div>
            <div className="text-gray-400 text-sm">
              Add vendors to enable automated order routing
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VendorForm({
  formData,
  setFormData,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  formData: VendorFormData;
  setFormData: (data: VendorFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        {isNew ? "Add Vendor" : "Edit Vendor"}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Vendor Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., AuCar"
          />
        </div>

        {/* Contact Emails */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contact Emails (one per line)
          </label>
          <textarea
            value={formData.contact_emails}
            onChange={(e) =>
              setFormData({ ...formData, contact_emails: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            rows={2}
            placeholder="email1@vendor.com&#10;email2@vendor.com"
          />
        </div>
      </div>

      {/* Product Patterns */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Product Patterns (one per line)
        </label>
        <textarea
          value={formData.product_patterns}
          onChange={(e) =>
            setFormData({ ...formData, product_patterns: e.target.value })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
          rows={2}
          placeholder="G-Series&#10;APEX Cluster"
        />
        <p className="mt-1 text-xs text-gray-500">
          Product titles containing these patterns will be routed to this vendor
        </p>
      </div>

      {/* Instructions */}
      <details className="border border-gray-200 rounded-lg p-3">
        <summary className="text-sm font-medium text-gray-700 cursor-pointer">
          Optional: Fulfillment Instructions
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              New Order Instructions
            </label>
            <textarea
              value={formData.new_order_instructions}
              onChange={(e) =>
                setFormData({ ...formData, new_order_instructions: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              rows={2}
              placeholder="Special instructions for new orders..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Cancel Instructions
            </label>
            <textarea
              value={formData.cancel_instructions}
              onChange={(e) =>
                setFormData({ ...formData, cancel_instructions: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              rows={2}
              placeholder="How to cancel orders with this vendor..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Escalation Instructions
            </label>
            <textarea
              value={formData.escalation_instructions}
              onChange={(e) =>
                setFormData({ ...formData, escalation_instructions: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              rows={2}
              placeholder="How to escalate issues with this vendor..."
            />
          </div>
        </div>
      </details>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onSave}
          disabled={saving || !formData.name.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
        >
          {saving ? "Saving..." : "Save Vendor"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
