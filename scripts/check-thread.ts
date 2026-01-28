import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const threadId = "85ccd857-da8e-4b13-89cc-7c64ff1a6bb0";

async function check() {
  // Get thread state
  const { data: thread } = await supabase
    .from("threads")
    .select("state, subject, customer_id")
    .eq("id", threadId)
    .single();
  
  console.log("Thread state:", thread?.state);
  console.log("Subject:", thread?.subject);

  // Check for vendor_requests
  const { data: vendorRequests } = await supabase
    .from("vendor_requests")
    .select("*")
    .eq("thread_id", threadId);
  
  console.log("\nVendor requests:", vendorRequests?.length || 0);
  if (vendorRequests?.length) {
    for (const vr of vendorRequests) {
      console.log(`  - ${vr.request_type}: ${vr.status}`);
    }
  }

  // Check for orders linked to this thread
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, vendor_status")
    .eq("thread_id", threadId);
  
  console.log("\nOrders linked:", orders?.length || 0);
  if (orders?.length) {
    for (const o of orders) {
      console.log(`  - #${o.order_number}: ${o.status} / vendor: ${o.vendor_status}`);
    }
  }

  // Get recent messages to see current state
  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, from_email, body_text, channel_metadata, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(5);
  
  console.log("\nRecent messages:");
  for (const m of messages || []) {
    const preview = (m.body_text || "").slice(0, 100).replace(/\n/g, " ");
    const meta = m.channel_metadata as any;
    const isDraft = meta?.is_draft;
    console.log(`  [${m.direction}${isDraft ? '/DRAFT' : ''}] ${m.from_email?.slice(0, 30)}`);
    console.log(`    ${preview}...`);
    if (meta?.attachments?.length) {
      console.log(`    Attachments: ${meta.attachments.length}`);
    }
  }

  // Check events for any pending actions
  const { data: events } = await supabase
    .from("events")
    .select("type, payload, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(10);
  
  console.log("\nRecent events:");
  for (const e of events || []) {
    console.log(`  - ${e.type}`);
  }
}

check().catch(console.error);
