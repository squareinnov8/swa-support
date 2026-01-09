/**
 * Attachment Processor
 *
 * Extracts text and relevant information from email attachments.
 * Supports:
 * - PDF documents (order confirmations, invoices)
 * - Images (screenshots, photos) via Claude Vision
 * - Text files
 * - HTML files
 */

import Anthropic from "@anthropic-ai/sdk";
import type { GmailAttachment } from "@/lib/import/gmail/fetcher";

// PDF parsing will be handled by pdf-parse if available
let pdfParse: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;
try {
  // Dynamic import to avoid build errors if pdf-parse isn't installed
  pdfParse = require("pdf-parse");
} catch {
  console.warn("pdf-parse not installed - PDF extraction will use fallback");
}

/**
 * Extracted content from an attachment
 */
export type ExtractedAttachmentContent = {
  filename: string;
  mimeType: string;
  extractedText: string | null;
  extractedData?: {
    orderNumber?: string;
    orderDate?: string;
    customerName?: string;
    customerEmail?: string;
    items?: Array<{ name: string; quantity?: number; price?: string }>;
    totalAmount?: string;
    trackingNumber?: string;
    shippingAddress?: string;
  };
  error?: string;
};

/**
 * Supported MIME types for text extraction
 */
const TEXT_MIME_TYPES = [
  "text/plain",
  "text/html",
  "text/csv",
  "application/json",
];

const PDF_MIME_TYPES = ["application/pdf"];

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * Process an attachment and extract its content
 */
export async function processAttachment(
  attachment: GmailAttachment,
  content: Buffer
): Promise<ExtractedAttachmentContent> {
  const result: ExtractedAttachmentContent = {
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    extractedText: null,
  };

  try {
    // Handle text-based files
    if (TEXT_MIME_TYPES.some((t) => attachment.mimeType.startsWith(t))) {
      result.extractedText = content.toString("utf-8");
      // Parse out key data if it looks like an order confirmation
      if (looksLikeOrderConfirmation(result.extractedText)) {
        result.extractedData = extractOrderData(result.extractedText);
      }
      return result;
    }

    // Handle PDFs
    if (PDF_MIME_TYPES.includes(attachment.mimeType)) {
      const pdfText = await extractPdfText(content);
      if (pdfText) {
        result.extractedText = pdfText;
        if (looksLikeOrderConfirmation(pdfText)) {
          result.extractedData = extractOrderData(pdfText);
        }
      } else {
        result.error = "Could not extract text from PDF";
      }
      return result;
    }

    // Handle images using Claude Vision
    if (IMAGE_MIME_TYPES.includes(attachment.mimeType)) {
      const visionResult = await extractFromImage(content, attachment.mimeType);
      if (visionResult) {
        result.extractedText = visionResult.text;
        result.extractedData = visionResult.data;
      } else {
        result.error = "Could not analyze image";
      }
      return result;
    }

    // Unsupported file type
    result.error = `Unsupported attachment type: ${attachment.mimeType}`;
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown error";
    return result;
  }
}

/**
 * Extract text from a PDF document
 */
async function extractPdfText(content: Buffer): Promise<string | null> {
  if (!pdfParse) {
    // Fallback: try to extract any readable text
    const text = content.toString("utf-8");
    // PDF files have binary content, but sometimes contain readable text
    const readable = text.replace(/[^\x20-\x7E\n\r]/g, " ").replace(/\s+/g, " ");
    if (readable.length > 50) {
      return readable.trim();
    }
    return null;
  }

  try {
    const data = await pdfParse(content);
    return data.text?.trim() || null;
  } catch (err) {
    console.error("PDF parsing failed:", err);
    return null;
  }
}

/**
 * Extract text and data from an image using Claude Vision
 */
async function extractFromImage(
  content: Buffer,
  mimeType: string
): Promise<{ text: string; data?: ExtractedAttachmentContent["extractedData"] } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not configured - skipping image analysis");
    return null;
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const base64Image = content.toString("base64");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `Analyze this image which appears to be from a customer support email.

If this is an order confirmation, receipt, invoice, or shipping notification, extract:
1. Order number
2. Order date
3. Customer name
4. Items ordered (name, quantity, price)
5. Total amount
6. Tracking number (if shown)
7. Any other relevant order details

If this is a screenshot of an error, product issue, or other support-related content:
1. Describe what you see
2. Note any error messages
3. Identify the product or feature shown

Respond in this format:
TYPE: [order_confirmation | receipt | shipping_notice | error_screenshot | product_photo | other]
SUMMARY: [Brief description of what this shows]

If order/shipping info found:
ORDER_NUMBER: [number or "not found"]
ORDER_DATE: [date or "not found"]
CUSTOMER_NAME: [name or "not found"]
ITEMS: [comma-separated list or "not found"]
TOTAL: [amount or "not found"]
TRACKING: [number or "not found"]

FULL_TEXT: [All readable text from the image]`,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return null;
    }

    const responseText = textContent.text;

    // Parse the structured response
    const data: ExtractedAttachmentContent["extractedData"] = {};

    const orderMatch = responseText.match(/ORDER_NUMBER:\s*(.+)/i);
    if (orderMatch && !orderMatch[1].includes("not found")) {
      data.orderNumber = orderMatch[1].trim();
    }

    const dateMatch = responseText.match(/ORDER_DATE:\s*(.+)/i);
    if (dateMatch && !dateMatch[1].includes("not found")) {
      data.orderDate = dateMatch[1].trim();
    }

    const nameMatch = responseText.match(/CUSTOMER_NAME:\s*(.+)/i);
    if (nameMatch && !nameMatch[1].includes("not found")) {
      data.customerName = nameMatch[1].trim();
    }

    const totalMatch = responseText.match(/TOTAL:\s*(.+)/i);
    if (totalMatch && !totalMatch[1].includes("not found")) {
      data.totalAmount = totalMatch[1].trim();
    }

    const trackingMatch = responseText.match(/TRACKING:\s*(.+)/i);
    if (trackingMatch && !trackingMatch[1].includes("not found")) {
      data.trackingNumber = trackingMatch[1].trim();
    }

    const fullTextMatch = responseText.match(/FULL_TEXT:\s*([\s\S]+)$/i);
    const fullText = fullTextMatch ? fullTextMatch[1].trim() : responseText;

    return {
      text: fullText,
      data: Object.keys(data).length > 0 ? data : undefined,
    };
  } catch (err) {
    console.error("Image analysis failed:", err);
    return null;
  }
}

/**
 * Check if text content looks like an order confirmation
 */
function looksLikeOrderConfirmation(text: string): boolean {
  const lowerText = text.toLowerCase();
  const keywords = [
    "order confirmation",
    "order #",
    "order number",
    "your order",
    "purchase confirmation",
    "receipt",
    "invoice",
    "shipping confirmation",
    "tracking number",
    "thank you for your order",
    "order summary",
  ];
  return keywords.some((kw) => lowerText.includes(kw));
}

/**
 * Extract order data from text content
 */
function extractOrderData(text: string): ExtractedAttachmentContent["extractedData"] {
  const data: ExtractedAttachmentContent["extractedData"] = {};

  // Order number patterns (common formats)
  const orderPatterns = [
    /order\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    /order\s+number\s*:?\s*([A-Z0-9-]+)/i,
    /confirmation\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    /#([A-Z0-9]{4,})/i,
  ];

  for (const pattern of orderPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.orderNumber = match[1].trim();
      break;
    }
  }

  // Date patterns
  const datePatterns = [
    /(?:order|placed|date)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(\w+\s+\d{1,2},?\s+\d{4})/i, // January 15, 2024
    /(\d{4}-\d{2}-\d{2})/i, // 2024-01-15
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      data.orderDate = match[1].trim();
      break;
    }
  }

  // Tracking number patterns
  const trackingPatterns = [
    /tracking\s*#?\s*:?\s*([A-Z0-9]+)/i,
    /track(?:ing)?\s+number\s*:?\s*([A-Z0-9]+)/i,
  ];

  for (const pattern of trackingPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.trackingNumber = match[1].trim();
      break;
    }
  }

  // Total amount patterns
  const totalPatterns = [
    /total\s*:?\s*\$?([\d,]+\.?\d*)/i,
    /grand\s+total\s*:?\s*\$?([\d,]+\.?\d*)/i,
    /amount\s+(?:due|paid)\s*:?\s*\$?([\d,]+\.?\d*)/i,
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.totalAmount = "$" + match[1].trim();
      break;
    }
  }

  // Customer name (harder to extract reliably)
  const namePatterns = [
    /(?:ship\s+to|bill\s+to|customer)\s*:?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /dear\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /hello\s+([A-Z][a-z]+)/i,
  ];

  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match) {
      data.customerName = match[1].trim();
      break;
    }
  }

  return Object.keys(data).length > 0 ? data : undefined;
}

/**
 * Process multiple attachments and combine results
 */
export async function processAttachments(
  attachments: Array<{ attachment: GmailAttachment; content: Buffer }>
): Promise<ExtractedAttachmentContent[]> {
  const results: ExtractedAttachmentContent[] = [];

  for (const { attachment, content } of attachments) {
    const extracted = await processAttachment(attachment, content);
    results.push(extracted);
  }

  return results;
}

/**
 * Format extracted attachment content for inclusion in prompts
 */
export function formatAttachmentsForPrompt(
  extractions: ExtractedAttachmentContent[]
): string {
  if (extractions.length === 0) {
    return "";
  }

  const lines: string[] = ["## Attachments Provided by Customer:\n"];

  for (const ext of extractions) {
    lines.push(`### ${ext.filename} (${ext.mimeType})`);

    if (ext.error) {
      lines.push(`*Note: Could not fully process this attachment: ${ext.error}*\n`);
      continue;
    }

    if (ext.extractedData) {
      lines.push("\n**Extracted Information:**");
      if (ext.extractedData.orderNumber) {
        lines.push(`- Order Number: ${ext.extractedData.orderNumber}`);
      }
      if (ext.extractedData.orderDate) {
        lines.push(`- Order Date: ${ext.extractedData.orderDate}`);
      }
      if (ext.extractedData.customerName) {
        lines.push(`- Customer Name: ${ext.extractedData.customerName}`);
      }
      if (ext.extractedData.totalAmount) {
        lines.push(`- Total Amount: ${ext.extractedData.totalAmount}`);
      }
      if (ext.extractedData.trackingNumber) {
        lines.push(`- Tracking Number: ${ext.extractedData.trackingNumber}`);
      }
      if (ext.extractedData.items && ext.extractedData.items.length > 0) {
        lines.push(`- Items: ${ext.extractedData.items.map((i) => i.name).join(", ")}`);
      }
      lines.push("");
    }

    if (ext.extractedText) {
      // Truncate very long text
      const text = ext.extractedText.length > 2000
        ? ext.extractedText.slice(0, 2000) + "...[truncated]"
        : ext.extractedText;
      lines.push("**Full Content:**");
      lines.push("```");
      lines.push(text);
      lines.push("```\n");
    }
  }

  return lines.join("\n");
}
