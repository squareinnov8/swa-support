/**
 * Google Sheets Integration for Vendor Data
 *
 * Fetches vendor mapping from a public Google Sheet.
 */

import type { Vendor } from "./types";

/**
 * Google Sheet ID for vendor mapping
 * Sheet URL: https://docs.google.com/spreadsheets/d/1gpas0Zo498d4kq0dTHQHPEqfE4fiYsZwgVfJZtYeaXQ
 */
const VENDOR_SHEET_ID = "1gpas0Zo498d4kq0dTHQHPEqfE4fiYsZwgVfJZtYeaXQ";

/**
 * Expected columns in the vendor sheet:
 * - Vendor: Vendor name
 * - Applicable Products: Product patterns (comma-separated)
 * - Contact Emails: Email addresses (comma-separated)
 * - New Order Submit: Instructions for new orders
 * - Cancel Behavior: Instructions for cancellations
 * - Support Escalation Behavior: Instructions for escalations
 */
interface SheetRow {
  vendor: string;
  applicableProducts: string;
  contactEmails: string;
  newOrderSubmit: string;
  cancelBehavior: string;
  supportEscalation: string;
}

/**
 * Fetch vendors from Google Sheet (CSV export)
 */
export async function fetchVendorsFromSheet(): Promise<Vendor[]> {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${VENDOR_SHEET_ID}/export?format=csv`;

  try {
    const response = await fetch(csvUrl, {
      headers: {
        Accept: "text/csv",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch vendor sheet: ${response.status}`);
    }

    const csvText = await response.text();
    return parseVendorCsv(csvText);
  } catch (error) {
    console.error("[vendors/googleSheets] Failed to fetch vendors:", error);
    throw error;
  }
}

/**
 * Parse CSV content into vendor records
 */
function parseVendorCsv(csv: string): Vendor[] {
  const lines = csv.split("\n");

  if (lines.length < 2) {
    return [];
  }

  // Parse header row (case-insensitive)
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());

  // Map column indices
  const colMap = {
    vendor: headers.findIndex((h) => h.includes("vendor")),
    products: headers.findIndex(
      (h) => h.includes("product") || h.includes("applicable")
    ),
    emails: headers.findIndex(
      (h) => h.includes("email") || h.includes("contact")
    ),
    newOrder: headers.findIndex(
      (h) => h.includes("new order") || h.includes("submit")
    ),
    cancel: headers.findIndex((h) => h.includes("cancel")),
    escalation: headers.findIndex(
      (h) => h.includes("escalat") || h.includes("support")
    ),
  };

  const vendors: Vendor[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);

    const vendorName = colMap.vendor >= 0 ? values[colMap.vendor]?.trim() : "";
    if (!vendorName) continue;

    const vendor: Vendor = {
      name: vendorName,
      productPatterns: parseCommaSeparated(
        colMap.products >= 0 ? values[colMap.products] : ""
      ),
      contactEmails: parseCommaSeparated(
        colMap.emails >= 0 ? values[colMap.emails] : ""
      ),
      newOrderInstructions:
        colMap.newOrder >= 0 ? values[colMap.newOrder]?.trim() : undefined,
      cancelInstructions:
        colMap.cancel >= 0 ? values[colMap.cancel]?.trim() : undefined,
      escalationInstructions:
        colMap.escalation >= 0 ? values[colMap.escalation]?.trim() : undefined,
    };

    vendors.push(vendor);
  }

  return vendors;
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

/**
 * Parse comma-separated values (handling various formats)
 */
function parseCommaSeparated(value: string): string[] {
  if (!value) return [];

  return value
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Get sheet URL for admin reference
 */
export function getVendorSheetUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${VENDOR_SHEET_ID}/edit`;
}
