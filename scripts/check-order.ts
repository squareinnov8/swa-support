import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  // Find order #4093
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('order_number', '4093')
    .single();

  if (orderError) {
    console.log('Order not found:', orderError.message);

    // Try to find related data via thread
    const threadId = 'fcf98a2a-6b5c-4678-84a2-0a4991ff81b3';
    const { data: thread } = await supabase
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .single();

    console.log('\n=== THREAD ===');
    console.log(JSON.stringify(thread, null, 2));
    return;
  }

  console.log('=== ORDER ===');
  console.log(JSON.stringify(order, null, 2));

  // Get vendor requests
  const { data: vendorRequests } = await supabase
    .from('vendor_requests')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true });

  console.log('\n=== VENDOR REQUESTS ===');
  console.log(JSON.stringify(vendorRequests, null, 2));

  // Get order_vendors
  const { data: orderVendors } = await supabase
    .from('order_vendors')
    .select('*')
    .eq('order_id', order.id);

  console.log('\n=== ORDER VENDORS ===');
  console.log(JSON.stringify(orderVendors, null, 2));

  // Get order events
  const { data: orderEvents } = await supabase
    .from('order_events')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true });

  console.log('\n=== ORDER EVENTS ===');
  console.log(JSON.stringify(orderEvents, null, 2));
}

main();
