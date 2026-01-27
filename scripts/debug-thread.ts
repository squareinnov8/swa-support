import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const threadId = process.argv[2] || '85ccd857-da8e-4b13-89cc-7c64ff1a6bb0';

  // Get thread
  const { data: thread } = await supabase
    .from('threads')
    .select('*')
    .eq('id', threadId)
    .single();

  console.log('=== THREAD ===');
  console.log(JSON.stringify(thread, null, 2));

  // Get all messages including drafts
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n=== RECENT MESSAGES (newest first) ===');
  for (const m of messages || []) {
    console.log('\n---');
    console.log('ID:', m.id);
    console.log('Direction:', m.direction);
    console.log('Role:', m.role);
    console.log('From:', m.from_email);
    console.log('Created:', m.created_at);
    console.log('Body preview:', (m.body_text || '').substring(0, 300));
    console.log('Metadata:', JSON.stringify(m.channel_metadata, null, 2));
  }

  // Get events
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n=== RECENT EVENTS ===');
  for (const e of events || []) {
    console.log('\n---');
    console.log('Type:', e.type);
    console.log('Created:', e.created_at);
    console.log('Payload:', JSON.stringify(e.payload, null, 2));
  }

  // Get draft generations
  const { data: draftGens } = await supabase
    .from('draft_generations')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('\n=== DRAFT GENERATIONS ===');
  for (const d of draftGens || []) {
    console.log('\n---');
    console.log('ID:', d.id);
    console.log('Created:', d.created_at);
    console.log('Intent:', d.intent);
    console.log('Confidence:', d.confidence);
    console.log('Auto-send eligible:', d.auto_send_eligible);
    console.log('Auto-send blocked:', d.auto_send_blocked);
    console.log('Block reason:', d.auto_send_block_reason);
    console.log('Policy gate passed:', d.policy_gate_passed);
    console.log('Policy violations:', d.policy_violations);
  }

  // Check for related orders
  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_vendors(*), vendor_requests(*)')
    .or('order_number.ilike.%4069%,customer_email.ilike.%legoboy%');

  console.log('\n=== RELATED ORDERS ===');
  console.log(JSON.stringify(orders, null, 2));

  // Check verification
  const { data: verification } = await supabase
    .from('customer_verifications')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('\n=== VERIFICATION ===');
  console.log(JSON.stringify(verification, null, 2));
}

main().catch(console.error);
