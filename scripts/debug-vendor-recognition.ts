import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isVendorEmail } from '../src/lib/gmail/senderResolver';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const threadId = '65714a1f-f970-4951-b804-d39df85690b8';

  // Get all messages with from_email
  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, from_email, body_text, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  console.log('=== Messages in thread ===');
  for (const msg of messages || []) {
    console.log('\n---');
    console.log('Direction:', msg.direction);
    console.log('From:', msg.from_email || '(null)');

    // Check if this would be detected as vendor
    if (msg.from_email) {
      const vendorCheck = await isVendorEmail(msg.from_email);
      console.log('Is vendor?:', vendorCheck.isVendor, vendorCheck.vendorName || '');
    }

    console.log('Body preview:', (msg.body_text || '').slice(0, 200).replace(/\n/g, ' '));
  }

  // Check vendors table
  const { data: vendors } = await supabase
    .from('vendors')
    .select('name, contact_emails');

  console.log('\n\n=== Vendors ===');
  for (const v of vendors || []) {
    console.log(v.name + ':', v.contact_emails);
  }
}

check().catch(console.error);
