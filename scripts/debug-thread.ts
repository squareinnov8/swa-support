import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const threadId = process.argv[2] || "65714a1f-f970-4951-b804-d39df85690b8";

async function main() {
  const { data: thread } = await supabase
    .from("threads")
    .select("*")
    .eq("id", threadId)
    .single();

  console.log("=== THREAD ===");
  console.log("Subject:", thread?.subject);
  console.log("State:", thread?.state);
  console.log("Intent:", thread?.last_intent);

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  console.log("\n=== MESSAGES ===");
  for (const m of messages || []) {
    console.log("---");
    console.log("Dir:", m.direction, "| Role:", m.role);
    console.log("From:", m.from_email);
    console.log("Body:", m.body_text?.slice(0, 800));
  }

  const { data: conv } = await supabase
    .from("admin_lina_conversations")
    .select("id")
    .eq("thread_id", threadId)
    .single();

  if (conv) {
    const { data: chatMsgs } = await supabase
      .from("admin_lina_messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    console.log("\n=== ADMIN CHAT ===");
    for (const m of chatMsgs || []) {
      console.log("---");
      console.log(m.role.toUpperCase() + ":");
      console.log(m.content?.slice(0, 1500));
    }
  } else {
    console.log("\n=== ADMIN CHAT ===");
    console.log("No admin chat conversation found");
  }

  const { data: actions } = await supabase
    .from("lina_tool_actions")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (actions?.length) {
    console.log("\n=== TOOL ACTIONS ===");
    for (const a of actions) {
      console.log("---");
      console.log("Tool:", a.tool_name);
      console.log("Input:", JSON.stringify(a.tool_input).slice(0, 600));
    }
  } else {
    console.log("\n=== TOOL ACTIONS ===");
    console.log("No tool actions found");
  }
}

main();
