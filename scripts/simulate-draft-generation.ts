import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isVendorEmail } from '../src/lib/gmail/senderResolver';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function simulate() {
  const threadId = '65714a1f-f970-4951-b804-d39df85690b8';

  // Step 1: Get first inbound to find original customer
  const { data: firstInbound } = await supabase
    .from('messages')
    .select('from_email')
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const originalCustomerEmail = firstInbound?.from_email;
  console.log('Original customer:', originalCustomerEmail);

  // Step 2: Get latest customer message (what we respond to)
  const { data: latestMessage } = await supabase
    .from('messages')
    .select('id, body_text')
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .eq('from_email', originalCustomerEmail!)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('Latest customer message ID:', latestMessage?.id);
  console.log('Message:', latestMessage?.body_text?.slice(0, 100));

  // Step 3: Simulate getConversationHistory with the fix
  const limit = 20;
  const excludeMessageId = latestMessage?.id;

  const { data, error } = await supabase
    .from('messages')
    .select('id, direction, body_text, created_at, from_email, role')
    .eq('thread_id', threadId)
    .or('role.is.null,role.neq.draft')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (error) {
    console.log('Query error:', error);
    return;
  }

  console.log('\nRaw messages from query:', data?.length);

  // Filter and reverse
  let filteredData = data!.filter(msg => msg.id !== excludeMessageId);
  console.log('After excluding customer message:', filteredData.length);

  const conversationMessages = filteredData.reverse().map(msg => ({
    direction: msg.direction as 'inbound' | 'outbound',
    body: msg.body_text || '',
    created_at: msg.created_at,
    from_email: msg.from_email || undefined,
  }));

  // Step 4: Simulate the formatting in generateDraft
  console.log('\n=== Formatted conversation history ===\n');

  for (const msg of conversationMessages) {
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
    const body = msg.body.length > 200 ? msg.body.slice(0, 200) + '...' : msg.body;
    console.log(`${role}: ${body.replace(/\n/g, ' ')}`);
    console.log('');
  }
}

simulate().catch(console.error);
