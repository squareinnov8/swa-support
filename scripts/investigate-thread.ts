import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function investigate() {
  const threadId = '65714a1f-f970-4951-b804-d39df85690b8';

  // Get thread
  const { data: thread } = await supabase
    .from('threads')
    .select('*')
    .eq('id', threadId)
    .single();

  console.log('=== Thread ===');
  console.log('Subject:', thread?.subject);
  console.log('State:', thread?.state);
  console.log('Gmail Thread ID:', thread?.gmail_thread_id);
  console.log('Customer ID:', thread?.customer_id);
  console.log('From:', thread?.from_identifier);

  // Get all messages
  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, from_email, body_text, role, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  console.log('\n=== Messages (' + (messages?.length || 0) + ') ===');
  for (const msg of messages || []) {
    console.log('\n---');
    console.log('Direction:', msg.direction);
    console.log('From:', msg.from_email);
    console.log('Role:', msg.role);
    console.log('Date:', msg.created_at);
    const bodyPreview = (msg.body_text || '').slice(0, 500).replace(/\n/g, ' ');
    console.log('Body:', bodyPreview);
  }

  // Check admin chat messages
  const { data: adminChat } = await supabase
    .from('admin_chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  console.log('\n=== Admin Chat Messages (' + (adminChat?.length || 0) + ') ===');
  for (const msg of adminChat || []) {
    console.log(`\n[${msg.role}]: ${(msg.content || '').slice(0, 300)}`);
  }
}

investigate().catch(console.error);
