/**
 * Check thread and admin chat history
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const threadId = "5825d93f-a6f8-463b-a6f9-3b190e353bb0";

async function checkThread() {
  // Get thread details
  console.log("=== THREAD DETAILS ===\n");
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (threadError) {
    console.error("Error fetching thread:", threadError.message);
    return;
  }

  console.log("Subject:", thread.subject);
  console.log("State:", thread.state);
  console.log("Human Handling Mode:", thread.human_handling_mode);
  console.log("Human Handler:", thread.human_handler);
  console.log("Is Archived:", thread.is_archived);
  console.log("Created:", thread.created_at);
  console.log("Updated:", thread.updated_at);
  console.log();

  // Get admin chat conversation
  console.log("=== ADMIN CHAT HISTORY ===\n");
  const { data: conversation, error: convError } = await supabase
    .from("admin_lina_conversations")
    .select("id")
    .eq("thread_id", threadId)
    .single();

  if (convError) {
    console.log("No admin chat conversation found for this thread.");
  } else if (conversation) {
    const { data: chatMessages, error: chatError } = await supabase
      .from("admin_lina_messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });

    if (chatError) {
      console.error("Error fetching chat:", chatError.message);
    } else if (chatMessages && chatMessages.length > 0) {
      for (const msg of chatMessages) {
        console.log(`[${msg.role.toUpperCase()}] ${msg.created_at}`);
        console.log(msg.content);
        console.log();
      }
    } else {
      console.log("No messages in conversation.");
    }
  }

  // Get lina tool actions
  console.log("=== LINA TOOL ACTIONS ===\n");
  const { data: actions, error: actionsError } = await supabase
    .from("lina_tool_actions")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (actionsError) {
    console.error("Error fetching actions:", actionsError.message);
  } else if (actions && actions.length > 0) {
    for (const action of actions) {
      console.log(`[${action.tool_name}] ${action.created_at}`);
      console.log("Input:", JSON.stringify(action.input, null, 2));
      console.log("Result:", JSON.stringify(action.result, null, 2));
      console.log();
    }
  } else {
    console.log("No lina tool actions found for this thread.");
  }

  // Get recent events for this thread
  console.log("=== RECENT EVENTS ===\n");
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (eventsError) {
    console.error("Error fetching events:", eventsError.message);
  } else if (events && events.length > 0) {
    for (const event of events) {
      console.log(`[${event.type}] ${event.created_at}`);
      if (event.payload) {
        console.log("Payload:", JSON.stringify(event.payload, null, 2));
      }
      console.log();
    }
  } else {
    console.log("No events found for this thread.");
  }
}

checkThread().catch(console.error);
