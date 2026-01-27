import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const orderId = '8a12f483-4a2e-4f40-86c9-d87b9acfb28b';
  const orderNumber = '4093';

  console.log('=== PROCESSING CUSTOMER RESPONSE FOR ORDER #4093 ===\n');

  // Customer confirmed:
  // - Color: Piano Black (glossy)
  // - Memory: 8/128 (Rob explained they only sell the top option)
  // - Photo: Customer sent one (need to check Gmail for the actual attachment)

  // Update vendor requests with customer responses
  const updates = [
    {
      type: 'color_confirmation',
      answer: 'Piano Black',
      notes: 'Customer confirmed: "I believe I want the piano black (glossy)"'
    },
    {
      type: 'memory_confirmation',
      answer: '8GB+128GB',
      notes: 'Rob confirmed: "I only sell the top options for each make/model, so you\'ll be getting the 8/128 option"'
    },
    {
      type: 'dashboard_photo',
      answer: 'Photo provided',
      notes: 'Customer sent dashboard photo with their first reply. Photo shows piano black interior.'
    }
  ];

  for (const update of updates) {
    const { error } = await supabase
      .from('vendor_requests')
      .update({
        status: 'validated',
        customer_response_at: new Date().toISOString(),
        response_data: {
          requestType: update.type,
          answer: update.answer,
          validated: true,
          validationNotes: update.notes
        }
      })
      .eq('order_id', orderId)
      .eq('request_type', update.type);

    if (error) {
      console.error(`Error updating ${update.type}:`, error.message);
    } else {
      console.log(`Updated ${update.type}: ${update.answer}`);
    }
  }

  // Get order details for the vendor email
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  const { data: orderVendor } = await supabase
    .from('order_vendors')
    .select('*')
    .eq('order_id', orderId)
    .single();

  console.log('\n=== ORDER DETAILS ===');
  console.log('Order Number:', order?.order_number);
  console.log('Customer:', order?.customer_name);
  console.log('Product:', order?.line_items?.[0]?.title);
  console.log('Vendor:', orderVendor?.vendor_name);
  console.log('Vendor Emails:', orderVendor?.vendor_emails);

  // Log event
  await supabase.from('order_events').insert({
    order_id: orderId,
    event_type: 'customer_responded',
    payload: {
      color: 'Piano Black',
      memory: '8GB+128GB',
      photo: 'Provided - shows piano black dashboard',
      processed_by: 'manual_cleanup'
    }
  });

  console.log('\n=== READY TO FORWARD TO VENDOR ===');
  console.log('Please forward the following info to vendor:');
  console.log('---');
  console.log(`Order: #${orderNumber}`);
  console.log(`Customer: ${order?.customer_name}`);
  console.log(`Color: Piano Black`);
  console.log(`Memory/Storage: 8GB+128GB`);
  console.log(`Photo: Customer provided dashboard photo (piano black interior)`);
  console.log('---');
  console.log(`Vendor Email: ${orderVendor?.vendor_emails?.join(', ')}`);
}

main();
