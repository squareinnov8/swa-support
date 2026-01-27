import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const threadId = 'fcf98a2a-6b5c-4678-84a2-0a4991ff81b3';
  
  // Get thread
  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .select('*')
    .eq('id', threadId)
    .single();

  if (threadError) {
    console.error('Thread error:', threadError);
    return;
  }
  
  console.log('=== THREAD ===');
  console.log(JSON.stringify(thread, null, 2));

  // Get all messages for this thread
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('Messages error:', messagesError);
    return;
  }
  
  console.log('\n=== MESSAGES ===');
  for (const msg of messages || []) {
    console.log('---');
    console.log('ID:', msg.id);
    console.log('From:', msg.from_email);
    console.log('Direction:', msg.direction);
    console.log('Created:', msg.created_at);
    console.log('Body:', msg.body_text);
    console.log('Attachments:', msg.attachments);
  }

  // Get events for this thread
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (eventsError) {
    console.error('Events error:', eventsError);
    return;
  }
  
  console.log('\n=== EVENTS ===');
  for (const evt of events || []) {
    console.log('---');
    console.log('Type:', evt.type);
    console.log('Created:', evt.created_at);
    console.log('Details:', JSON.stringify(evt.details, null, 2));
  }

  // Get vendor requests for any related order
  if (thread.order_id) {
    const { data: vendorRequests } = await supabase
      .from('vendor_requests')
      .select('*')
      .eq('order_id', thread.order_id)
      .order('created_at', { ascending: true });
      
    console.log('\n=== VENDOR REQUESTS ===');
    console.log(JSON.stringify(vendorRequests, null, 2));
  }
}

main();
