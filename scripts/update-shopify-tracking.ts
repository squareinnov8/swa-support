import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getShopifyClient } from '../src/lib/shopify/client';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function updateShopifyTracking() {
  console.log('=== Updating Shopify Tracking for Orders 4094 & 4095 ===\n');

  const shopify = getShopifyClient();

  // Get orders with tracking from order_vendors
  const { data: orderVendors, error } = await supabase
    .from('order_vendors')
    .select('*, orders!inner(*)')
    .in('orders.order_number', ['4094', '4095'])
    .not('tracking_number', 'is', null);

  if (error) {
    console.error('Error fetching order vendors:', error);
    return;
  }

  if (!orderVendors || orderVendors.length === 0) {
    console.log('No orders with tracking found');
    return;
  }

  for (const ov of orderVendors) {
    const orderNumber = ov.orders.order_number;
    const trackingNumber = ov.tracking_number;
    const trackingCarrier = ov.tracking_carrier;

    console.log(`\n--- Order #${orderNumber} ---`);
    console.log(`Tracking: ${trackingCarrier} ${trackingNumber}`);

    // First, check if the order has a fulfillment
    const order = await shopify.getOrderByNumber(orderNumber);
    if (!order) {
      console.log(`  ❌ Order not found in Shopify`);
      continue;
    }

    console.log(`  Shopify status: ${order.displayFulfillmentStatus}`);
    console.log(`  Fulfillments: ${order.fulfillments?.length || 0}`);

    if (order.fulfillments && order.fulfillments.length > 0) {
      const fulfillment = order.fulfillments[0];
      console.log(`  Fulfillment ID: ${fulfillment.id}`);
      console.log(`  Current tracking: ${fulfillment.trackingInfo?.map(t => t.number).join(', ') || 'none'}`);

      // Update tracking
      console.log(`\n  Updating Shopify tracking...`);
      const result = await shopify.addTrackingToOrder(
        orderNumber,
        {
          company: trackingCarrier || undefined,
          number: trackingNumber,
        },
        true // notifyCustomer
      );

      if (result.success) {
        console.log(`  ✅ Tracking updated successfully!`);
        console.log(`  Customer will receive tracking notification email.`);

        // Update order status
        await supabase
          .from('orders')
          .update({ status: 'shipped' })
          .eq('id', ov.orders.id);
      } else {
        console.log(`  ❌ Failed: ${result.error}`);
      }
    } else {
      console.log(`  ⚠️ No fulfillment exists - need to create one first`);

      // Create fulfillment with tracking
      console.log(`\n  Creating fulfillment with tracking...`);
      const createResult = await shopify.createFulfillment(orderNumber, {
        notifyCustomer: true, // Notify with tracking
        trackingInfo: {
          company: trackingCarrier || undefined,
          number: trackingNumber,
        },
      });

      if (createResult.success) {
        console.log(`  ✅ Fulfillment created: ${createResult.fulfillmentId}`);
        console.log(`  Customer will receive tracking notification email.`);

        // Update order with fulfillment ID
        await supabase
          .from('orders')
          .update({
            status: 'shipped',
            shopify_fulfillment_id: createResult.fulfillmentId,
          })
          .eq('id', ov.orders.id);
      } else {
        console.log(`  ❌ Failed: ${createResult.error}`);
      }
    }
  }

  console.log('\n\n=== Done ===');
}

updateShopifyTracking().catch(console.error);
