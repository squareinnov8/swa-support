import 'dotenv/config';
import { createGmailClient, refreshTokenIfNeeded } from '../src/lib/import/gmail/auth';
import { fetchThread } from '../src/lib/import/gmail/fetcher';
import { createClient } from '@supabase/supabase-js';
import { processVendorReply } from '../src/lib/orders/vendorCoordination';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function processVendorTrackingEmails() {
  console.log('=== Processing Vendor Tracking Emails ===\n');

  // Get orders 4094 and 4095 vendor records
  const { data: orderVendors, error } = await supabase
    .from('order_vendors')
    .select('*, orders!inner(*)')
    .in('orders.order_number', ['4094', '4095'])
    .not('forward_thread_id', 'is', null);

  if (error) {
    console.error('Error fetching order vendors:', error);
    return;
  }

  if (!orderVendors || orderVendors.length === 0) {
    console.log('No order vendors found for orders 4094/4095 with forward_thread_id');
    return;
  }

  console.log(`Found ${orderVendors.length} vendor records to process:\n`);

  // Get Gmail tokens
  const { data: syncState } = await supabase
    .from('gmail_sync_state')
    .select('refresh_token')
    .eq('email_address', 'support@squarewheelsauto.com')
    .single();

  if (!syncState?.refresh_token) {
    console.error('No refresh token found');
    return;
  }

  const tokens = await refreshTokenIfNeeded({
    access_token: '',
    refresh_token: syncState.refresh_token,
    scope: '',
    token_type: 'Bearer',
    expiry_date: 0,
  });

  const gmail = createGmailClient(tokens);

  for (const ov of orderVendors) {
    const orderNumber = ov.orders.order_number;
    const threadId = ov.forward_thread_id;

    console.log(`\n--- Order #${orderNumber} ---`);
    console.log(`Vendor: ${ov.vendor_name}`);
    console.log(`Forward Thread ID: ${threadId}`);
    console.log(`Current Status: ${ov.status}`);
    console.log(`Current Tracking: ${ov.tracking_number || 'none'}`);

    // Fetch the Gmail thread
    const thread = await fetchThread(tokens, threadId);
    if (!thread || thread.messages.length === 0) {
      console.log('  ❌ Could not fetch thread');
      continue;
    }

    console.log(`  Messages in thread: ${thread.messages.length}`);

    // Find the latest message (should be vendor's reply)
    const latestMsg = thread.messages[thread.messages.length - 1];
    console.log(`  Latest message from: ${latestMsg.from}`);
    console.log(`  Date: ${latestMsg.date}`);
    console.log(`  Preview: ${latestMsg.body.slice(0, 200).replace(/\n/g, ' ')}...`);

    // Process through vendor reply pipeline
    console.log('\n  Processing vendor reply...');
    const result = await processVendorReply({
      gmailThreadId: threadId,
      gmailMessageId: latestMsg.id,
      fromEmail: latestMsg.from,
      subject: thread.subject,
      body: latestMsg.body,
    });

    console.log(`  Processed: ${result.processed}`);
    console.log(`  Has Tracking Update: ${result.hasTrackingUpdate}`);
    console.log(`  Has Requests: ${result.hasRequests}`);
    console.log(`  Request Count: ${result.requestCount}`);
    console.log(`  Customer Contacted: ${result.customerContacted}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  // Verify the updates
  console.log('\n\n=== Verification ===\n');
  const { data: updatedVendors } = await supabase
    .from('order_vendors')
    .select('*, orders!inner(*)')
    .in('orders.order_number', ['4094', '4095']);

  for (const ov of updatedVendors || []) {
    console.log(`Order #${ov.orders.order_number}:`);
    console.log(`  Status: ${ov.status}`);
    console.log(`  Tracking Number: ${ov.tracking_number || 'none'}`);
    console.log(`  Tracking Carrier: ${ov.tracking_carrier || 'none'}`);
    console.log(`  Shipped At: ${ov.shipped_at || 'not yet'}`);
    console.log('');
  }
}

processVendorTrackingEmails().catch(console.error);
