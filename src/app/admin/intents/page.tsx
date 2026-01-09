/**
 * Intent Management Page
 *
 * View and manage intent definitions used by Lina for classification.
 */

import { supabase } from "@/lib/db";
import IntentList from "./IntentList";
import IntentForm from "./IntentForm";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  support: "Product Support",
  order: "Order Related",
  presale: "Pre-Sale",
  escalation: "Escalation Triggers",
  closing: "Closing / Low Priority",
  spam: "Non-Customer",
  unknown: "Unknown",
  general: "General",
};

const CATEGORY_ORDER = [
  "escalation",
  "order",
  "support",
  "presale",
  "closing",
  "spam",
  "unknown",
  "general",
];

export default async function IntentsPage() {
  // Fetch all intents
  const { data: intents } = await supabase
    .from("intents")
    .select("*")
    .order("priority", { ascending: false })
    .order("name");

  // Group by category
  const byCategory: Record<string, typeof intents> = {};
  intents?.forEach((intent) => {
    if (!byCategory[intent.category]) {
      byCategory[intent.category] = [];
    }
    byCategory[intent.category]!.push(intent);
  });

  // Sort categories
  const sortedCategories = CATEGORY_ORDER.filter((cat) => byCategory[cat]);
  const otherCategories = Object.keys(byCategory)
    .filter((cat) => !CATEGORY_ORDER.includes(cat))
    .sort();

  // Get usage stats
  const { data: usageStats } = await supabase
    .from("thread_intents")
    .select("intent_id");

  const usageByIntent: Record<string, number> = {};
  usageStats?.forEach((ti) => {
    usageByIntent[ti.intent_id] = (usageByIntent[ti.intent_id] || 0) + 1;
  });

  // Count UNKNOWN intents on threads
  const unknownIntent = intents?.find((i) => i.slug === "UNKNOWN");
  const unknownCount = unknownIntent ? usageByIntent[unknownIntent.id] || 0 : 0;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>Intent Management</h1>
          <p style={{ color: "#6b7280", marginTop: 4 }}>
            Define intents for Lina to classify customer messages
          </p>
        </div>
        <a
          href="/admin"
          style={{
            padding: "8px 16px",
            backgroundColor: "#f3f4f6",
            color: "#374151",
            borderRadius: 6,
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          ← Back to Inbox
        </a>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        <div style={{ padding: 16, backgroundColor: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#166534" }}>{intents?.length || 0}</div>
          <div style={{ fontSize: 13, color: "#166534" }}>Total Intents</div>
        </div>
        <div style={{ padding: 16, backgroundColor: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#1e40af" }}>
            {intents?.filter((i) => i.is_active).length || 0}
          </div>
          <div style={{ fontSize: 13, color: "#1e40af" }}>Active</div>
        </div>
        <div style={{ padding: 16, backgroundColor: unknownCount > 0 ? "#fef3c7" : "#f9fafb", borderRadius: 8, border: unknownCount > 0 ? "1px solid #fcd34d" : "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: unknownCount > 0 ? "#92400e" : "#6b7280" }}>
            {unknownCount}
          </div>
          <div style={{ fontSize: 13, color: unknownCount > 0 ? "#92400e" : "#6b7280" }}>UNKNOWN Threads</div>
        </div>
        <div style={{ padding: 16, backgroundColor: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#6b7280" }}>
            {Object.keys(byCategory).length}
          </div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Categories</div>
        </div>
      </div>

      {/* Add New Intent Form */}
      <div style={{ marginBottom: 32, padding: 20, backgroundColor: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: 16 }}>Add New Intent</h2>
        <IntentForm categories={[...sortedCategories, ...otherCategories]} />
      </div>

      {/* Intent List by Category */}
      {[...sortedCategories, ...otherCategories].map((category) => (
        <div key={category} style={{ marginBottom: 32 }}>
          <h2 style={{
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 12,
            color: category === "escalation" ? "#991b1b" : "#374151",
          }}>
            {CATEGORY_LABELS[category] || category}
            <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
              ({byCategory[category]?.length || 0})
            </span>
          </h2>
          <IntentList
            intents={byCategory[category] || []}
            usageByIntent={usageByIntent}
          />
        </div>
      ))}
    </div>
  );
}
