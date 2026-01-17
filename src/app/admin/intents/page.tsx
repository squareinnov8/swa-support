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
    <div style={{ padding: "0 0 24px 0", maxWidth: 1100, margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 20px",
        borderBottom: "1px solid #dfe3eb",
        backgroundColor: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "#33475b", margin: 0 }}>Intents</h1>
          <span style={{ fontSize: 13, color: "#7c98b6" }}>
            {intents?.length || 0} total · {intents?.filter((i) => i.is_active).length || 0} active
          </span>
        </div>
        <a
          href="/admin"
          style={{
            color: "#0073aa",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          ← Tickets
        </a>
      </div>

      <div style={{ padding: "16px 20px" }}>
        {/* Stats Row */}
        <div style={{ display: "flex", gap: 24, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #eaf0f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: "#33475b" }}>
              {intents?.length || 0}
            </span>
            <span style={{ fontSize: 13, color: "#516f90" }}>Total</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: "#00a854" }}>
              {intents?.filter((i) => i.is_active).length || 0}
            </span>
            <span style={{ fontSize: 13, color: "#516f90" }}>Active</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 18,
              fontWeight: 600,
              color: unknownCount > 0 ? "#bf5600" : "#99acc2",
            }}>
              {unknownCount}
            </span>
            <span style={{ fontSize: 13, color: "#516f90" }}>Unclassified</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: "#0073aa" }}>
              {Object.keys(byCategory).length}
            </span>
            <span style={{ fontSize: 13, color: "#516f90" }}>Categories</span>
          </div>
        </div>

        {/* Add New Intent */}
        <div style={{ marginBottom: 24 }}>
          <IntentForm categories={[...sortedCategories, ...otherCategories]} />
        </div>

        {/* Intent List by Category */}
        {[...sortedCategories, ...otherCategories].map((category) => (
          <div key={category} style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
              color: category === "escalation" ? "#d63638" : "#516f90",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              {CATEGORY_LABELS[category] || category}
              <span style={{
                fontWeight: 400,
                color: "#99acc2",
                fontSize: 12,
              }}>
                {byCategory[category]?.length || 0}
              </span>
            </div>
            <IntentList
              intents={byCategory[category] || []}
              usageByIntent={usageByIntent}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
