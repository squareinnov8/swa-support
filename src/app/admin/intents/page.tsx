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
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "#33475b" }}>Intent Management</h1>
          <p style={{ color: "#7c98b6", marginTop: 4, fontSize: 14 }}>
            Define intents for Lina to classify customer messages
          </p>
        </div>
        <a
          href="/admin"
          style={{
            color: "#0091ae",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ← Back to Inbox
        </a>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        <div style={{ padding: 16, backgroundColor: "#ffffff", borderRadius: 4, border: "1px solid #cbd6e2" }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: "#33475b" }}>{intents?.length || 0}</div>
          <div style={{ fontSize: 13, color: "#7c98b6", marginTop: 4 }}>Total Intents</div>
        </div>
        <div style={{ padding: 16, backgroundColor: "#ffffff", borderRadius: 4, border: "1px solid #cbd6e2" }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: "#00a182" }}>
            {intents?.filter((i) => i.is_active).length || 0}
          </div>
          <div style={{ fontSize: 13, color: "#7c98b6", marginTop: 4 }}>Active</div>
        </div>
        <div style={{ padding: 16, backgroundColor: unknownCount > 0 ? "#fef6e7" : "#ffffff", borderRadius: 4, border: unknownCount > 0 ? "1px solid #f5c26b" : "1px solid #cbd6e2" }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: unknownCount > 0 ? "#b36b00" : "#7c98b6" }}>
            {unknownCount}
          </div>
          <div style={{ fontSize: 13, color: unknownCount > 0 ? "#b36b00" : "#7c98b6", marginTop: 4 }}>UNKNOWN Threads</div>
        </div>
        <div style={{ padding: 16, backgroundColor: "#ffffff", borderRadius: 4, border: "1px solid #cbd6e2" }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: "#0091ae" }}>
            {Object.keys(byCategory).length}
          </div>
          <div style={{ fontSize: 13, color: "#7c98b6", marginTop: 4 }}>Categories</div>
        </div>
      </div>

      {/* Add New Intent Form */}
      <div
        style={{
          marginBottom: 32,
          border: "1px solid #cbd6e2",
          borderRadius: 4,
          overflow: "hidden",
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#f5f8fa",
            borderBottom: "1px solid #cbd6e2",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 500,
              color: "#516f90",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Add New Intent
          </h2>
        </div>
        <div style={{ padding: 20 }}>
          <IntentForm categories={[...sortedCategories, ...otherCategories]} />
        </div>
      </div>

      {/* Intent List by Category */}
      {[...sortedCategories, ...otherCategories].map((category) => (
        <div key={category} style={{ marginBottom: 32 }}>
          <h2 style={{
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 12,
            color: category === "escalation" ? "#c93b41" : "#33475b",
          }}>
            {CATEGORY_LABELS[category] || category}
            <span style={{ fontWeight: 400, color: "#7c98b6", marginLeft: 8 }}>
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
