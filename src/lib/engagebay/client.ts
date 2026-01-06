/**
 * EngageBay API Client
 *
 * REST API wrapper for EngageBay CRM operations.
 * Handles contacts, notes, tags, and deals.
 */

import type {
  EngageBayContact,
  EngageBayContactInput,
  EngageBayNote,
  EngageBayDeal,
  EngageBayResponse,
  EngageBayProperty,
} from "./types";

const BASE_URL = "https://app.engagebay.com";

/**
 * Check if EngageBay API is configured
 */
export function isEngageBayConfigured(): boolean {
  return !!process.env.ENGAGEBAY_API_KEY;
}

/**
 * Make authenticated request to EngageBay API
 */
async function engageBayFetch<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    params?: Record<string, string>;
  } = {}
): Promise<EngageBayResponse<T>> {
  const apiKey = process.env.ENGAGEBAY_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "ENGAGEBAY_API_KEY not configured",
    };
  }

  const { method = "GET", body, params } = options;

  let url = `${BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`EngageBay API error ${response.status}:`, errorText);

      if (response.status === 401) {
        return { success: false, error: "Invalid API key" };
      }
      if (response.status === 429) {
        return { success: false, error: "Rate limit exceeded" };
      }

      return { success: false, error: `API error: ${response.status}` };
    }

    // Some endpoints return empty response
    const text = await response.text();
    if (!text) {
      return { success: true };
    }

    const data = JSON.parse(text) as T;
    return { success: true, data };
  } catch (error) {
    console.error("EngageBay API request failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Build properties array for contact
 */
function buildContactProperties(params: {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  customFields?: Record<string, string>;
}): EngageBayProperty[] {
  const properties: EngageBayProperty[] = [];

  if (params.email) {
    properties.push({
      name: "email",
      value: params.email,
      field_type: "TEXT",
      type: "SYSTEM",
    });
  }

  if (params.firstName) {
    properties.push({
      name: "name",
      value: params.firstName,
      field_type: "TEXT",
      type: "SYSTEM",
    });
  }

  if (params.lastName) {
    properties.push({
      name: "last_name",
      value: params.lastName,
      field_type: "TEXT",
      type: "SYSTEM",
    });
  }

  if (params.phone) {
    properties.push({
      name: "phone",
      value: params.phone,
      field_type: "PHONE",
      type: "SYSTEM",
    });
  }

  // Add custom fields
  if (params.customFields) {
    for (const [name, value] of Object.entries(params.customFields)) {
      properties.push({
        name,
        value,
        field_type: "TEXT",
        type: "CUSTOM",
      });
    }
  }

  return properties;
}

// ============================================
// Contact Operations
// ============================================

/**
 * Create a new contact
 */
export async function createContact(params: {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string[];
  score?: number;
  customFields?: Record<string, string>;
}): Promise<EngageBayResponse<EngageBayContact>> {
  const input: EngageBayContactInput = {
    properties: buildContactProperties(params),
    tags: params.tags,
    score: params.score,
  };

  return engageBayFetch<EngageBayContact>("/dev/api/panel/subscribers/subscriber", {
    method: "POST",
    body: input,
  });
}

/**
 * Get contact by email address
 */
export async function getContactByEmail(
  email: string
): Promise<EngageBayResponse<EngageBayContact>> {
  return engageBayFetch<EngageBayContact>(
    `/dev/api/panel/subscribers/contact-by-email/${encodeURIComponent(email)}`
  );
}

/**
 * Get contact by ID
 */
export async function getContactById(
  id: number
): Promise<EngageBayResponse<EngageBayContact>> {
  return engageBayFetch<EngageBayContact>(`/dev/api/panel/subscribers/${id}`);
}

/**
 * Update contact by ID (partial update)
 */
export async function updateContact(
  id: number,
  params: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    score?: number;
    customFields?: Record<string, string>;
  }
): Promise<EngageBayResponse<EngageBayContact>> {
  const update: Partial<EngageBayContactInput> = {
    properties: buildContactProperties(params),
  };

  if (params.score !== undefined) {
    update.score = params.score;
  }

  return engageBayFetch<EngageBayContact>(`/dev/api/panel/subscribers/subscriber`, {
    method: "PUT",
    body: { id, ...update },
  });
}

/**
 * Create or update contact (upsert by email)
 */
export async function upsertContact(params: {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string[];
  score?: number;
  customFields?: Record<string, string>;
}): Promise<EngageBayResponse<EngageBayContact>> {
  // Check if contact exists
  const existing = await getContactByEmail(params.email);

  if (existing.success && existing.data?.id) {
    // Update existing contact
    const updateResult = await updateContact(existing.data.id, params);

    // Add tags if provided (tags require separate call)
    if (params.tags && params.tags.length > 0) {
      await addTagsToContactByEmail(params.email, params.tags);
    }

    return updateResult;
  }

  // Create new contact
  return createContact(params);
}

/**
 * Search contacts
 */
export async function searchContacts(
  query: string,
  pageSize = 20
): Promise<EngageBayResponse<EngageBayContact[]>> {
  return engageBayFetch<EngageBayContact[]>("/dev/api/panel/subscribers/search", {
    method: "POST",
    body: {
      search_string: query,
      page_size: pageSize,
    },
  });
}

// ============================================
// Tag Operations
// ============================================

/**
 * Add tags to contact by email
 */
export async function addTagsToContactByEmail(
  email: string,
  tags: string[]
): Promise<EngageBayResponse<void>> {
  return engageBayFetch<void>("/dev/api/panel/subscribers/email/tags/add", {
    method: "POST",
    body: {
      email,
      tags,
    },
  });
}

/**
 * Add tags to contact by ID
 */
export async function addTagsToContactById(
  contactId: number,
  tags: string[]
): Promise<EngageBayResponse<void>> {
  return engageBayFetch<void>(`/dev/api/panel/subscribers/${contactId}/tags`, {
    method: "POST",
    body: tags,
  });
}

/**
 * Remove tag from contact by email
 */
export async function removeTagFromContactByEmail(
  email: string,
  tag: string
): Promise<EngageBayResponse<void>> {
  return engageBayFetch<void>("/dev/api/panel/subscribers/email/tags/delete", {
    method: "POST",
    body: {
      email,
      tag,
    },
  });
}

// ============================================
// Note Operations
// ============================================

/**
 * Add note to a contact
 */
export async function addNoteToContact(
  contactId: number,
  subject: string,
  content: string
): Promise<EngageBayResponse<EngageBayNote>> {
  return engageBayFetch<EngageBayNote>("/dev/api/panel/notes", {
    method: "POST",
    body: {
      parentId: contactId,
      subject,
      content,
      type: "CONTACT",
    },
  });
}

/**
 * Get notes for a contact
 */
export async function getContactNotes(
  contactId: number
): Promise<EngageBayResponse<EngageBayNote[]>> {
  return engageBayFetch<EngageBayNote[]>(`/dev/api/panel/notes/contact/${contactId}`);
}

// ============================================
// Deal Operations
// ============================================

/**
 * Create a deal
 */
export async function createDeal(params: {
  name: string;
  description?: string;
  amount?: number;
  contactIds?: number[];
  tags?: string[];
}): Promise<EngageBayResponse<EngageBayDeal>> {
  return engageBayFetch<EngageBayDeal>("/dev/api/panel/deals/deal", {
    method: "POST",
    body: {
      name: params.name,
      description: params.description,
      amount: params.amount,
      contactIds: params.contactIds,
      tags: params.tags,
    },
  });
}

/**
 * Create deal for contact by email
 */
export async function createDealForEmail(
  email: string,
  dealParams: {
    name: string;
    description?: string;
    amount?: number;
    tags?: string[];
  }
): Promise<EngageBayResponse<EngageBayDeal>> {
  return engageBayFetch<EngageBayDeal>("/dev/api/panel/deals/subscriber-deal", {
    method: "POST",
    body: {
      email,
      ...dealParams,
    },
  });
}

// ============================================
// Score Operations
// ============================================

/**
 * Add/update score for contact by email
 */
export async function updateContactScore(
  email: string,
  score: number
): Promise<EngageBayResponse<void>> {
  return engageBayFetch<void>("/dev/api/panel/subscribers/add-score", {
    method: "POST",
    body: {
      email,
      score,
    },
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Extract email from contact properties
 */
export function getEmailFromContact(contact: EngageBayContact): string | undefined {
  if (contact.email) return contact.email;

  const emailProp = contact.properties?.find((p) => p.name === "email");
  return emailProp?.value;
}

/**
 * Extract name from contact properties
 */
export function getNameFromContact(contact: EngageBayContact): string {
  if (contact.fullname) return contact.fullname;
  if (contact.name) return contact.name;

  const firstName = contact.properties?.find((p) => p.name === "name")?.value ?? "";
  const lastName = contact.properties?.find((p) => p.name === "last_name")?.value ?? "";

  return `${firstName} ${lastName}`.trim() || "Unknown";
}
