import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { replyToVendorThread } from '../src/lib/gmail/forwardOrder';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const orderId = '8a12f483-4a2e-4f40-86c9-d87b9acfb28b';

  console.log('=== FORWARDING CUSTOMER RESPONSE TO VENDOR ===\n');

  // Get order vendor details
  const { data: orderVendor } = await supabase
    .from('order_vendors')
    .select('*, orders(*)')
    .eq('order_id', orderId)
    .single();

  if (!orderVendor) {
    console.error('Order vendor not found');
    return;
  }

  console.log('Vendor:', orderVendor.vendor_name);
  console.log('Vendor Emails:', orderVendor.vendor_emails);
  console.log('Vendor Thread ID:', orderVendor.forward_thread_id);

  // Build the response message
  const body = `Hi,

Here is the customer response for Order #${orderVendor.orders.order_number}:

**Color Selection:** Piano Black (glossy)
**Memory/Storage:** 8GB+128GB

**Dashboard Photo:** The customer has sent a dashboard photo confirming the piano black interior matches their selection.

Note: The photo was attached to the customer's email reply. I'll forward it separately if needed.

Thanks,
SquareWheels Auto`;

  console.log('\n=== MESSAGE TO SEND ===');
  console.log(body);

  // Reply to the vendor thread
  console.log('\nSending to vendor...');
  const result = await replyToVendorThread({
    vendorEmails: orderVendor.vendor_emails,
    vendorThreadId: orderVendor.forward_thread_id,
    subject: `Re: Order #${orderVendor.orders.order_number}`,
    body,
  });

  if (result.success) {
    console.log('SUCCESS! Message sent to vendor');
    console.log('Gmail Message ID:', result.gmailMessageId);

    // Update vendor request status to forwarded
    await supabase
      .from('vendor_requests')
      .update({
        status: 'forwarded',
        forwarded_at: new Date().toISOString(),
      })
      .eq('order_vendor_id', orderVendor.id);

    // Log event
    await supabase.from('order_events').insert({
      order_id: orderId,
      event_type: 'info_forwarded_to_vendor',
      payload: {
        vendor_name: orderVendor.vendor_name,
        color: 'Piano Black',
        memory: '8GB+128GB',
        gmail_message_id: result.gmailMessageId,
      }
    });

    console.log('Vendor requests marked as forwarded');
  } else {
    console.error('Failed to send:', result.error);
  }
}

main();
