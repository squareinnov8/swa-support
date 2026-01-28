import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isVendorEmail } from '../src/lib/gmail/senderResolver';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function debugConversationHistory() {
  const threadId = '65714a1f-f970-4951-b804-d39df85690b8';

  // Simulate what getConversationHistory does now
  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, body_text, created_at, from_email, role')
    .eq('thread_id', threadId)
    .neq('role', 'draft')
    .order('created_at', { ascending: false })
    .limit(21);

  console.log('=== All messages (excluding drafts), newest first ===\n');
  for (const msg of messages || []) {
    console.log(`ID: ${msg.id}`);
    console.log(`Direction: ${msg.direction}, Role: ${msg.role || 'message'}`);
    console.log(`From: ${msg.from_email || '(null)'}`);
    if (msg.from_email) {
      const vendorCheck = await isVendorEmail(msg.from_email);
      console.log(`Is vendor?: ${vendorCheck.isVendor} ${vendorCheck.vendorName || ''}`);
    }
    console.log(`Body: ${(msg.body_text || '').slice(0, 100).replace(/\n/g, ' ')}...`);
    console.log('---\n');
  }

  // Find the customer's message that we'd respond to
  const { data: firstInbound } = await supabase
    .from('messages')
    .select('from_email')
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const originalCustomerEmail = firstInbound?.from_email;
  console.log(`\n=== Original customer email: ${originalCustomerEmail} ===\n`);

  // Get the latest customer message (what we'd respond to)
  const { data: latestCustomerMessage } = await supabase
    .from('messages')
    .select('id, body_text, created_at')
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .eq('from_email', originalCustomerEmail!)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log(`Latest customer message ID: ${latestCustomerMessage?.id}`);
  console.log(`Body: ${latestCustomerMessage?.body_text?.slice(0, 100)}...`);

  // Simulate the conversation history that would be passed
  console.log('\n=== Simulated conversation history (excluding customer message) ===\n');
  const history = (messages || [])
    .filter(msg => msg.id !== latestCustomerMessage?.id)
    .reverse();

  for (const msg of history) {
    let role: string;
    if (msg.direction === 'outbound') {
      role = 'Agent (Lina)';
    } else if (msg.from_email) {
      const vendorCheck = await isVendorEmail(msg.from_email);
      if (vendorCheck.isVendor) {
        role = `Vendor (${vendorCheck.vendorName || 'supplier'})`;
      } else {
        role = 'Customer';
      }
    } else {
      role = 'Customer';
    }
    const body = (msg.body_text || '').slice(0, 150).replace(/\n/g, ' ');
    console.log(`${role}: ${body}...`);
    console.log('');
  }
}

debugConversationHistory().catch(console.error);
