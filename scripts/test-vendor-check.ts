import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Copy of cleanEmailAddress function from vendorCoordination.ts
function cleanEmailAddress(email: string): string {
  // Remove mailto: prefixes and angle brackets
  let cleaned = email.replace(/<mailto:[^>]+>/gi, "");

  // Extract email from "Name <email>" format
  const angleMatch = cleaned.match(/<([^>]+)>/);
  if (angleMatch) {
    cleaned = angleMatch[1];
  }

  // Remove any remaining angle brackets
  cleaned = cleaned.replace(/[<>]/g, "").trim();

  // Take just the email part if there's still garbage
  const emailMatch = cleaned.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    cleaned = emailMatch[0];
  }

  return cleaned.toLowerCase();
}

async function testIsCustomerResponseToVendorRequest(
  subject: string,
  customerEmail: string
) {
  console.log('=== Testing isCustomerResponseToVendorRequest ===');
  console.log('Subject:', subject);
  console.log('Customer Email:', customerEmail);

  // Check if subject matches our outreach pattern
  const orderMatch = subject.match(/Order #(\d+)/i);
  if (!orderMatch) {
    console.log('FAILED: Subject does not match Order # pattern');
    return { isResponse: false };
  }

  const orderNumber = orderMatch[1];
  const cleanedEmail = cleanEmailAddress(customerEmail);
  console.log('Extracted order number:', orderNumber);
  console.log('Cleaned customer email:', cleanedEmail);

  // Find the order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, customer_email")
    .eq("order_number", orderNumber)
    .single();

  if (orderError || !order) {
    console.log('FAILED: Order not found:', orderError?.message);
    return { isResponse: false };
  }

  console.log('Found order:', order.order_number);
  console.log('Order customer email (raw):', order.customer_email);
  console.log('Order customer email (cleaned):', cleanEmailAddress(order.customer_email));

  // Verify customer email matches
  const orderCustomerEmail = cleanEmailAddress(order.customer_email);
  console.log('Comparing:', orderCustomerEmail, '===', cleanedEmail);
  console.log('Match:', orderCustomerEmail === cleanedEmail);

  if (orderCustomerEmail !== cleanedEmail) {
    console.log('FAILED: Customer email does not match');
    return { isResponse: false };
  }

  // Check for pending vendor requests
  const { data: requests, error: requestsError } = await supabase
    .from("vendor_requests")
    .select("*")
    .eq("order_id", order.id)
    .eq("status", "pending");

  console.log('Pending requests found:', requests?.length || 0);
  if (requestsError) {
    console.log('Request query error:', requestsError.message);
  }

  if (!requests || requests.length === 0) {
    console.log('FAILED: No pending vendor requests');
    return { isResponse: false };
  }

  console.log('SUCCESS: Should be detected as customer response!');
  return {
    isResponse: true,
    orderId: order.id,
    orderNumber: order.order_number,
    pendingRequests: requests,
  };
}

async function main() {
  // Simulate the customer's reply
  const subject = "Action needed for your Order #4093";
  const customerEmail = "dennis.meade@yahoo.com";

  const result = await testIsCustomerResponseToVendorRequest(subject, customerEmail);
  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
}

main();
