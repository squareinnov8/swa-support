/**
 * Vendor Coordination Module
 *
 * Handles the bi-directional communication between vendors and customers:
 * 1. Detects vendor replies to order threads
 * 2. Parses vendor requests (photos, confirmations, etc.) using LLM
 * 3. Contacts customers to gather requested information
 * 4. Validates customer responses (especially photos using Vision)
 * 5. Forwards validated responses back to vendors
 */

import { supabase } from "@/lib/db";
import { getClient, isLLMConfigured } from "@/lib/llm/client";
import { replyToVendorThread } from "@/lib/gmail/forwardOrder";
import type {
  VendorRequest,
  VendorRequestType,
  ParsedVendorReply,
  CustomerResponse,
  CustomerAttachment,
  OrderVendor,
} from "./types";
import { logOrderEvent } from "./ingest";

/**
 * Clean up email address - extract just the email from various formats
 * Handles: "Name <email>", "email<mailto:email>", plain "email"
 */
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

/**
 * Check if an email is from a known vendor
 */
export async function isVendorEmail(fromEmail: string): Promise<{
  isVendor: boolean;
  vendorName?: string;
}> {
  const email = cleanEmailAddress(fromEmail);

  const { data: vendors } = await supabase
    .from("vendors")
    .select("name, contact_emails");

  if (!vendors) return { isVendor: false };

  for (const vendor of vendors) {
    const emails = vendor.contact_emails || [];
    if (emails.some((e: string) => e.toLowerCase() === email)) {
      return { isVendor: true, vendorName: vendor.name };
    }
  }

  return { isVendor: false };
}

/**
 * Find order_vendor record by Gmail thread ID
 */
export async function findOrderVendorByThread(
  gmailThreadId: string
): Promise<OrderVendor | null> {
  const { data } = await supabase
    .from("order_vendors")
    .select("*, orders(*)")
    .eq("forward_thread_id", gmailThreadId)
    .maybeSingle();

  return data;
}

/**
 * Find order_vendor by order ID and vendor email
 */
export async function findOrderVendorByEmail(
  fromEmail: string
): Promise<{ orderVendor: OrderVendor; orderId: string } | null> {
  const email = cleanEmailAddress(fromEmail);

  // Find vendor by email
  const { data: vendors } = await supabase
    .from("vendors")
    .select("name, contact_emails");

  let vendorName: string | null = null;
  for (const vendor of vendors || []) {
    const emails = vendor.contact_emails || [];
    if (emails.some((e: string) => e.toLowerCase() === email)) {
      vendorName = vendor.name;
      break;
    }
  }

  if (!vendorName) return null;

  // Find most recent order_vendor for this vendor that's in "forwarded" status
  const { data: orderVendor } = await supabase
    .from("order_vendors")
    .select("*, orders(*)")
    .eq("vendor_name", vendorName)
    .eq("status", "forwarded")
    .order("forwarded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!orderVendor) return null;

  return {
    orderVendor,
    orderId: orderVendor.order_id,
  };
}

/**
 * Parse vendor reply to extract tracking info and requests using LLM
 */
export async function parseVendorReply(
  emailBody: string,
  subject: string
): Promise<ParsedVendorReply> {
  const result: ParsedVendorReply = {
    hasTrackingNumber: false,
    hasRequests: false,
    requests: [],
    rawMessage: emailBody,
  };

  if (!isLLMConfigured()) {
    console.warn("[VendorCoordination] LLM not configured, using fallback parsing");
    return fallbackParseVendorReply(emailBody);
  }

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are parsing an email from a product vendor/supplier to a retailer about a customer order.

Extract the following information:
1. Tracking number and carrier (if provided)
2. Any requests for additional information from the customer

Common vendor requests include:
- Dashboard photos to confirm vehicle fitment
- Color confirmation (piano black, matte black, carbon fiber, etc.)
- Memory/storage confirmation (4GB+64GB, 8GB+128GB, etc.)
- Address validation
- Vehicle year/make/model confirmation

Return a JSON object with this structure:
{
  "hasTrackingNumber": boolean,
  "trackingNumber": string | null,
  "trackingCarrier": string | null,  // USPS, UPS, FedEx, DHL, etc.
  "hasRequests": boolean,
  "requests": [
    {
      "type": "dashboard_photo" | "color_confirmation" | "memory_confirmation" | "address_validation" | "vehicle_confirmation" | "other",
      "description": "Human-readable description of what's needed",
      "options": ["option1", "option2"] | null,  // For confirmations, list the choices
      "required": boolean
    }
  ]
}`,
        },
        {
          role: "user",
          content: `Subject: ${subject}\n\nEmail body:\n${emailBody}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return result;

    const parsed = JSON.parse(content);

    result.hasTrackingNumber = parsed.hasTrackingNumber || false;
    result.trackingNumber = parsed.trackingNumber || undefined;
    result.trackingCarrier = parsed.trackingCarrier || undefined;
    result.hasRequests = parsed.hasRequests || false;
    result.requests = (parsed.requests || []).map((r: any) => ({
      type: r.type as VendorRequestType,
      description: r.description || "",
      options: r.options || undefined,
      required: r.required ?? true,
    }));

    return result;
  } catch (error) {
    console.error("[VendorCoordination] LLM parsing failed:", error);
    return fallbackParseVendorReply(emailBody);
  }
}

/**
 * Fallback parsing using regex patterns
 */
function fallbackParseVendorReply(emailBody: string): ParsedVendorReply {
  const result: ParsedVendorReply = {
    hasTrackingNumber: false,
    hasRequests: false,
    requests: [],
    rawMessage: emailBody,
  };

  const lowerBody = emailBody.toLowerCase();

  // Check for tracking numbers
  const trackingPatterns = [
    /tracking\s*(?:#|number|:)?\s*([A-Z0-9]{10,30})/i,
    /1Z[A-Z0-9]{16}/i, // UPS
    /\b\d{20,22}\b/, // USPS
    /\b\d{12,15}\b/, // FedEx
  ];

  for (const pattern of trackingPatterns) {
    const match = emailBody.match(pattern);
    if (match) {
      result.hasTrackingNumber = true;
      result.trackingNumber = match[1] || match[0];
      break;
    }
  }

  // Check for common requests
  if (
    lowerBody.includes("dashboard") &&
    (lowerBody.includes("photo") || lowerBody.includes("picture"))
  ) {
    result.hasRequests = true;
    result.requests.push({
      type: "dashboard_photo",
      description: "Please send a photo of your dashboard to confirm fitment",
      required: true,
    });
  }

  if (lowerBody.includes("confirm") && lowerBody.includes("color")) {
    result.hasRequests = true;
    const colorMatch = lowerBody.match(
      /(?:piano\s*black|matte\s*black|carbon\s*fiber|glossy|silver)/gi
    );
    result.requests.push({
      type: "color_confirmation",
      description: "Please confirm your color preference",
      options: colorMatch ? [...new Set(colorMatch)] : undefined,
      required: true,
    });
  }

  if (
    lowerBody.includes("confirm") &&
    (lowerBody.includes("memory") || lowerBody.includes("storage"))
  ) {
    result.hasRequests = true;
    const memoryMatch = lowerBody.match(/\d+(?:gb)?[\s-]*\+?[\s-]*\d+(?:gb)?/gi);
    result.requests.push({
      type: "memory_confirmation",
      description: "Please confirm your memory/storage preference",
      options: memoryMatch ? [...new Set(memoryMatch)] : undefined,
      required: true,
    });
  }

  if (
    lowerBody.includes("address") &&
    (lowerBody.includes("confirm") || lowerBody.includes("verify"))
  ) {
    result.hasRequests = true;
    result.requests.push({
      type: "address_validation",
      description: "Please confirm your shipping address",
      required: true,
    });
  }

  return result;
}

/**
 * Create vendor request records in database (with deduplication)
 */
export async function createVendorRequests(
  orderId: string,
  orderVendorId: string,
  requests: VendorRequest[]
): Promise<string[]> {
  const createdIds: string[] = [];

  for (const request of requests) {
    // Check if this request type already exists for this order
    const { data: existing } = await supabase
      .from("vendor_requests")
      .select("id")
      .eq("order_id", orderId)
      .eq("request_type", request.type)
      .maybeSingle();

    if (existing) {
      console.log(`[VendorCoordination] Request type ${request.type} already exists for order, skipping`);
      createdIds.push(existing.id);
      continue;
    }

    const { data, error } = await supabase
      .from("vendor_requests")
      .insert({
        order_id: orderId,
        order_vendor_id: orderVendorId,
        request_type: request.type,
        description: request.description,
        options: request.options,
        status: "pending",
      })
      .select("id")
      .single();

    if (data && !error) {
      createdIds.push(data.id);
    } else if (error) {
      console.error("[VendorCoordination] Failed to create request:", error.message);
    }
  }

  return createdIds;
}

/**
 * Generate customer outreach email for vendor requests
 */
export async function generateCustomerOutreachEmail(
  customerName: string,
  orderNumber: string,
  productTitle: string,
  requests: VendorRequest[]
): Promise<{ subject: string; body: string }> {
  const subject = `Action needed for your Order #${orderNumber}`;

  // Build request list
  const requestItems = requests.map((r) => {
    let item = `• ${r.description}`;
    if (r.options && r.options.length > 0) {
      item += `\n  Options: ${r.options.join(", ")}`;
    }
    return item;
  });

  const body = `Hi ${customerName || "there"},

Thank you for your order (#${orderNumber}) for the ${productTitle}.

Our fulfillment team needs a bit more information before they can process your order:

${requestItems.join("\n\n")}

Please reply to this email with the requested information. ${
    requests.some((r) => r.type === "dashboard_photo")
      ? "You can attach photos directly to your reply."
      : ""
  }

If you have any questions, just let us know!

– Lina
SquareWheels Auto Support`;

  return { subject, body };
}

/**
 * Send customer outreach email via Gmail
 */
export async function sendCustomerOutreachEmail(params: {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  productTitle: string;
  requests: VendorRequest[];
  orderId: string;
}): Promise<{
  success: boolean;
  gmailMessageId?: string;
  gmailThreadId?: string;
  error?: string;
}> {
  const { customerEmail, customerName, orderNumber, productTitle, requests, orderId } =
    params;

  const { subject, body } = await generateCustomerOutreachEmail(
    customerName,
    orderNumber,
    productTitle,
    requests
  );

  // Clean up the customer email address
  const cleanedEmail = cleanEmailAddress(customerEmail);

  // Import Gmail sending function
  const { sendEmailToCustomer } = await import("@/lib/gmail/sendDraft");

  try {
    const result = await sendEmailToCustomer({
      to: cleanedEmail,
      subject,
      body,
    });

    if (result.success) {
      // Log the event
      await logOrderEvent(orderId, "customer_contacted", {
        reason: "vendor_request",
        requests: requests.map((r) => ({
          type: r.type,
          description: r.description,
        })),
        gmail_message_id: result.gmailMessageId,
      });

      // Update request statuses
      await supabase
        .from("vendor_requests")
        .update({
          customer_contacted_at: new Date().toISOString(),
          status: "pending",
        })
        .eq("order_id", orderId)
        .in(
          "request_type",
          requests.map((r) => r.type)
        );
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Validate a customer photo attachment using Vision API
 */
export async function validatePhotoAttachment(
  attachmentContent: Buffer,
  mimeType: string,
  expectedType: VendorRequestType
): Promise<{
  isValid: boolean;
  description: string;
  confidence: number;
  issues?: string[];
}> {
  if (!isLLMConfigured()) {
    return {
      isValid: true,
      description: "Validation skipped - LLM not configured",
      confidence: 0,
    };
  }

  try {
    const client = getClient();
    const base64Image = attachmentContent.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    let validationPrompt: string;
    switch (expectedType) {
      case "dashboard_photo":
        validationPrompt = `Analyze this image to determine if it shows a car dashboard/instrument cluster.

Check for:
1. Is this a photo of a car interior/dashboard?
2. Can you see the instrument cluster, speedometer, or infotainment area?
3. Is the image clear enough to identify the vehicle type?
4. Any issues with the photo (too dark, blurry, wrong subject)?

This photo is being used to verify fitment for an aftermarket head unit installation.`;
        break;

      default:
        validationPrompt = `Analyze this image and describe what it shows. Is this a relevant photo for a customer support context?`;
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
            {
              type: "text",
              text: `${validationPrompt}

Respond with JSON:
{
  "isValid": boolean,  // Does this photo meet the requirements?
  "description": "Brief description of what the image shows",
  "confidence": number,  // 0-1 confidence score
  "issues": ["list", "of", "issues"] | null  // Any problems with the photo
}`,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        isValid: false,
        description: "Could not analyze image",
        confidence: 0,
      };
    }

    // Extract JSON from response (might be wrapped in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        isValid: false,
        description: "Could not parse validation response",
        confidence: 0,
      };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("[VendorCoordination] Photo validation failed:", error);
    return {
      isValid: false,
      description: "Validation error occurred",
      confidence: 0,
      issues: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

/**
 * Forward customer response to vendor
 */
export async function forwardCustomerResponseToVendor(params: {
  orderVendorId: string;
  orderId: string;
  responses: CustomerResponse[];
  attachments?: Array<{ filename: string; content: Buffer; mimeType: string }>;
}): Promise<{ success: boolean; error?: string }> {
  const { orderVendorId, orderId, responses, attachments } = params;

  // Get order vendor info
  const { data: orderVendor } = await supabase
    .from("order_vendors")
    .select("*, orders(*)")
    .eq("id", orderVendorId)
    .single();

  if (!orderVendor) {
    return { success: false, error: "Order vendor not found" };
  }

  // Build response message
  const responseLines = responses.map((r) => {
    if (r.answer) {
      return `${r.requestType}: ${r.answer}`;
    }
    if (r.attachments && r.attachments.length > 0) {
      return `${r.requestType}: See attached (${r.attachments.length} file(s))`;
    }
    return `${r.requestType}: Provided`;
  });

  const body = `Hi,

Here is the customer response for Order #${orderVendor.orders.order_number}:

${responseLines.join("\n")}

${
  attachments && attachments.length > 0
    ? `\n${attachments.length} attachment(s) included.`
    : ""
}

Thanks,
SquareWheels Auto`;

  // Reply to the vendor thread
  const result = await replyToVendorThread({
    vendorEmails: orderVendor.vendor_emails,
    vendorThreadId: orderVendor.forward_thread_id,
    subject: `Re: Order #${orderVendor.orders.order_number}`,
    body,
    // Note: For attachments, we'd need to update replyToVendorThread to support them
    // This is a TODO - for now, we mention they're attached but actually need Gmail API update
  });

  if (result.success) {
    // Update request statuses
    await supabase
      .from("vendor_requests")
      .update({
        status: "forwarded",
        forwarded_at: new Date().toISOString(),
      })
      .eq("order_vendor_id", orderVendorId);

    // Log event
    await logOrderEvent(orderId, "info_forwarded_to_vendor", {
      order_vendor_id: orderVendorId,
      vendor_name: orderVendor.vendor_name,
      responses: responses.map((r) => ({
        type: r.requestType,
        hasAttachments: (r.attachments?.length || 0) > 0,
      })),
    });
  }

  return result;
}

/**
 * Check if an email is a customer response to a vendor request outreach
 */
export async function isCustomerResponseToVendorRequest(
  subject: string,
  customerEmail: string
): Promise<{
  isResponse: boolean;
  orderId?: string;
  orderNumber?: string;
  pendingRequests?: VendorRequest[];
}> {
  // Check if subject matches our outreach pattern
  const orderMatch = subject.match(/Order #(\d+)/i);
  if (!orderMatch) {
    return { isResponse: false };
  }

  const orderNumber = orderMatch[1];
  const cleanedEmail = cleanEmailAddress(customerEmail);

  // Find the order
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, customer_email")
    .eq("order_number", orderNumber)
    .single();

  if (!order) {
    return { isResponse: false };
  }

  // Verify customer email matches
  if (cleanEmailAddress(order.customer_email) !== cleanedEmail) {
    return { isResponse: false };
  }

  // Check for pending vendor requests
  const { data: requests } = await supabase
    .from("vendor_requests")
    .select("*")
    .eq("order_id", order.id)
    .eq("status", "pending");

  if (!requests || requests.length === 0) {
    return { isResponse: false };
  }

  return {
    isResponse: true,
    orderId: order.id,
    orderNumber: order.order_number,
    pendingRequests: requests.map((r) => ({
      type: r.request_type as VendorRequestType,
      description: r.description,
      options: r.options,
      required: true,
    })),
  };
}

/**
 * Parse customer response to extract answers using LLM
 */
export async function parseCustomerResponse(
  emailBody: string,
  pendingRequests: VendorRequest[]
): Promise<{
  answers: Partial<Record<VendorRequestType, string>>;
  hasAllAnswers: boolean;
  missingRequests: VendorRequestType[];
}> {
  const answers: Partial<Record<VendorRequestType, string>> = {};
  const missingRequests: VendorRequestType[] = [];

  if (!isLLMConfigured()) {
    // Fallback: simple pattern matching
    const lowerBody = emailBody.toLowerCase();

    for (const request of pendingRequests) {
      if (request.type === "color_confirmation" && request.options) {
        const found = request.options.find((opt) =>
          lowerBody.includes(opt.toLowerCase())
        );
        if (found) answers.color_confirmation = found;
        else missingRequests.push("color_confirmation");
      } else if (request.type === "memory_confirmation" && request.options) {
        const found = request.options.find((opt) =>
          lowerBody.includes(opt.toLowerCase().replace(/\s/g, ""))
        );
        if (found) answers.memory_confirmation = found;
        else missingRequests.push("memory_confirmation");
      } else if (request.type === "dashboard_photo") {
        // Photos handled separately via attachments
        answers.dashboard_photo = "See attached";
      }
    }

    return {
      answers,
      hasAllAnswers: missingRequests.length === 0,
      missingRequests,
    };
  }

  try {
    const client = getClient();
    const requestDetails = pendingRequests.map((r) => ({
      type: r.type,
      description: r.description,
      options: r.options,
    }));

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are parsing a customer's email response to extract their answers to specific questions.

The pending requests are:
${JSON.stringify(requestDetails, null, 2)}

Extract the customer's answers from their email. Return JSON:
{
  "answers": {
    "request_type": "their answer" or null if not provided
  },
  "notes": "any additional context from their email"
}

For photos (dashboard_photo, etc.), just note "See attached" if they mention attaching photos.`,
        },
        {
          role: "user",
          content: emailBody,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from LLM");
    }

    const parsed = JSON.parse(content);

    for (const request of pendingRequests) {
      const answer = parsed.answers?.[request.type];
      if (answer) {
        answers[request.type] = answer;
      } else {
        missingRequests.push(request.type);
      }
    }

    return {
      answers,
      hasAllAnswers: missingRequests.length === 0,
      missingRequests,
    };
  } catch (error) {
    console.error("[VendorCoordination] Failed to parse customer response:", error);
    return {
      answers: {},
      hasAllAnswers: false,
      missingRequests: pendingRequests.map((r) => r.type),
    };
  }
}

/**
 * Process a customer response to vendor requests
 */
export async function processCustomerResponse(params: {
  orderId: string;
  orderNumber: string;
  gmailMessageId: string;
  emailBody: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    content: Buffer;
  }>;
}): Promise<{
  processed: boolean;
  answersExtracted: number;
  photosValidated: number;
  forwardedToVendor: boolean;
  error?: string;
}> {
  const { orderId, orderNumber, gmailMessageId, emailBody, attachments = [] } = params;

  const result = {
    processed: false,
    answersExtracted: 0,
    photosValidated: 0,
    forwardedToVendor: false,
  };

  // Get pending requests
  const { data: requests } = await supabase
    .from("vendor_requests")
    .select("*, order_vendors(*)")
    .eq("order_id", orderId)
    .eq("status", "pending");

  if (!requests || requests.length === 0) {
    return { ...result, error: "No pending requests found" };
  }

  const pendingRequests = requests.map((r) => ({
    type: r.request_type as VendorRequestType,
    description: r.description,
    options: r.options,
    required: true,
  }));

  // Parse customer answers
  const { answers, hasAllAnswers, missingRequests } = await parseCustomerResponse(
    emailBody,
    pendingRequests
  );

  result.answersExtracted = Object.keys(answers).filter((k) => answers[k as VendorRequestType]).length;

  // Validate photo attachments
  const validatedAttachments: Array<{
    filename: string;
    mimeType: string;
    content: Buffer;
    validation: {
      isValid: boolean;
      description: string;
      confidence: number;
      issues?: string[];
    };
  }> = [];

  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith("image/")) {
      // Find the photo request type
      const photoRequest = pendingRequests.find((r) =>
        r.type.includes("photo")
      );

      if (photoRequest) {
        const validation = await validatePhotoAttachment(
          attachment.content,
          attachment.mimeType,
          photoRequest.type
        );

        validatedAttachments.push({
          ...attachment,
          validation,
        });

        if (validation.isValid) {
          result.photosValidated++;
        }
      }
    }
  }

  // Update request records with responses
  for (const request of requests) {
    const requestType = request.request_type as VendorRequestType;
    const answer = answers[requestType];
    const photoValidation = validatedAttachments.find(
      () => requestType.includes("photo")
    );

    const responseData: CustomerResponse = {
      requestType,
      answer: answer || undefined,
      validated: !!answer || (photoValidation?.validation.isValid ?? false),
      validationNotes: photoValidation?.validation.description,
    };

    await supabase
      .from("vendor_requests")
      .update({
        status: responseData.validated ? "validated" : "received",
        customer_response_at: new Date().toISOString(),
        customer_message_id: gmailMessageId,
        response_data: responseData,
      })
      .eq("id", request.id);
  }

  // Log the event
  await logOrderEvent(orderId, "customer_responded", {
    gmail_message_id: gmailMessageId,
    answers_extracted: result.answersExtracted,
    photos_validated: result.photosValidated,
    missing_info: missingRequests,
  });

  // If we have all the answers (or photos validated), forward to vendor
  const allValidated = requests.every((r) => {
    const reqType = r.request_type as VendorRequestType;
    const answer = answers[reqType];
    const hasValidPhoto =
      reqType.includes("photo") &&
      validatedAttachments.some((a) => a.validation.isValid);
    return answer || hasValidPhoto;
  });

  if (allValidated) {
    const orderVendor = requests[0].order_vendors;

    const responses: CustomerResponse[] = requests.map((r) => {
      const reqType = r.request_type as VendorRequestType;
      return {
        requestType: reqType,
        answer: answers[reqType],
        validated: true,
      };
    });

    const forwardResult = await forwardCustomerResponseToVendor({
      orderVendorId: orderVendor.id,
      orderId,
      responses,
      attachments: validatedAttachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        mimeType: a.mimeType,
      })),
    });

    result.forwardedToVendor = forwardResult.success;
  }

  result.processed = true;
  return result;
}

/**
 * Process a vendor reply email
 * Called when we detect an email from a vendor address
 */
export async function processVendorReply(params: {
  gmailThreadId: string;
  gmailMessageId: string;
  fromEmail: string;
  subject: string;
  body: string;
  attachments?: Array<{ filename: string; mimeType: string; attachmentId: string }>;
}): Promise<{
  processed: boolean;
  orderId?: string;
  orderNumber?: string;
  hasTrackingUpdate: boolean;
  hasRequests: boolean;
  requestCount: number;
  customerContacted: boolean;
  error?: string;
}> {
  const { gmailThreadId, gmailMessageId, fromEmail, subject, body } = params;

  const result: {
    processed: boolean;
    orderId?: string;
    orderNumber?: string;
    hasTrackingUpdate: boolean;
    hasRequests: boolean;
    requestCount: number;
    customerContacted: boolean;
    error?: string;
  } = {
    processed: false,
    hasTrackingUpdate: false,
    hasRequests: false,
    requestCount: 0,
    customerContacted: false,
  };

  // Find the order vendor by thread ID
  let orderVendor = await findOrderVendorByThread(gmailThreadId);

  // If not found by thread, try by email (vendor might have started a new thread)
  if (!orderVendor) {
    const byEmail = await findOrderVendorByEmail(fromEmail);
    if (byEmail) {
      orderVendor = byEmail.orderVendor;
    }
  }

  if (!orderVendor) {
    return {
      ...result,
      error: "Could not match vendor email to any order",
    };
  }

  const orderId = orderVendor.order_id;

  // Get full order details
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) {
    return { ...result, error: "Order not found" };
  }

  result.orderId = orderId;
  result.orderNumber = order.order_number;

  // Parse the vendor reply
  const parsed = await parseVendorReply(body, subject);

  // Log the vendor reply event
  await logOrderEvent(orderId, "vendor_replied", {
    vendor_name: orderVendor.vendor_name,
    gmail_message_id: gmailMessageId,
    has_tracking: parsed.hasTrackingNumber,
    has_requests: parsed.hasRequests,
    request_types: parsed.requests.map((r) => r.type),
  });

  // Handle tracking number
  if (parsed.hasTrackingNumber && parsed.trackingNumber) {
    result.hasTrackingUpdate = true;

    await supabase
      .from("order_vendors")
      .update({
        tracking_number: parsed.trackingNumber,
        tracking_carrier: parsed.trackingCarrier,
        shipped_at: new Date().toISOString(),
        status: "shipped",
      })
      .eq("id", orderVendor.id);

    await logOrderEvent(orderId, "tracking_added", {
      vendor_name: orderVendor.vendor_name,
      tracking_number: parsed.trackingNumber,
      tracking_carrier: parsed.trackingCarrier,
    });

    console.log(
      `[VendorCoordination] Tracking added for order #${order.order_number}: ${parsed.trackingNumber}`
    );
  }

  // Handle vendor requests
  if (parsed.hasRequests && parsed.requests.length > 0) {
    result.hasRequests = true;
    result.requestCount = parsed.requests.length;

    // Create request records
    const requestIds = await createVendorRequests(
      orderId,
      orderVendor.id,
      parsed.requests
    );

    console.log(
      `[VendorCoordination] Created ${requestIds.length} vendor request records for order #${order.order_number}`
    );

    // Contact customer automatically
    const outreachResult = await sendCustomerOutreachEmail({
      customerEmail: order.customer_email,
      customerName: order.customer_name || "",
      orderNumber: order.order_number,
      productTitle: order.line_items?.[0]?.title || "your product",
      requests: parsed.requests,
      orderId,
    });

    if (outreachResult.success) {
      result.customerContacted = true;
      console.log(
        `[VendorCoordination] Customer contacted for order #${order.order_number}`
      );
    } else {
      console.error(
        `[VendorCoordination] Failed to contact customer: ${outreachResult.error}`
      );
    }
  }

  result.processed = true;
  return result;
}
