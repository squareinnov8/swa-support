/**
 * HubSpot CRM API Client
 *
 * Uses HubSpot CRM API v3
 * https://developers.hubspot.com/docs/api/crm
 */

import type {
  HubSpotContact,
  HubSpotContactProperties,
  HubSpotSearchResponse,
  HubSpotTicket,
  HubSpotTicketProperties,
  Pipeline,
} from "./types";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_ACCESS_TOKEN environment variable not set");
  }
  return token;
}

export function isHubSpotConfigured(): boolean {
  return !!process.env.HUBSPOT_ACCESS_TOKEN;
}

async function hubspotFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const response = await fetch(`${HUBSPOT_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HubSpot API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

// ============================================
// Contact Operations
// ============================================

/**
 * Search for a contact by email
 */
export async function getContactByEmail(
  email: string
): Promise<HubSpotContact | null> {
  try {
    const response = await hubspotFetch<HubSpotSearchResponse<HubSpotContact>>(
      "/crm/v3/objects/contacts/search",
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  operator: "EQ",
                  value: email,
                },
              ],
            },
          ],
          properties: [
            "email",
            "firstname",
            "lastname",
            "phone",
            "company",
            "ip__shopify__orders_count",
            "ip__shopify__total_spent",
            "ip__shopify__customer_id",
            "last_support_date",
            "support_thread_count",
            "support_status",
          ],
        }),
      }
    );

    return response.results[0] || null;
  } catch (error) {
    console.error("Error searching HubSpot contact:", error);
    return null;
  }
}

/**
 * Get contact by ID
 */
export async function getContactById(
  contactId: string
): Promise<HubSpotContact | null> {
  try {
    return await hubspotFetch<HubSpotContact>(
      `/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname,phone,company,ip__shopify__orders_count,ip__shopify__total_spent`
    );
  } catch (error) {
    console.error("Error getting HubSpot contact:", error);
    return null;
  }
}

/**
 * Create a new contact
 */
export async function createContact(
  properties: HubSpotContactProperties
): Promise<HubSpotContact> {
  return hubspotFetch<HubSpotContact>("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({ properties }),
  });
}

/**
 * Update an existing contact
 */
export async function updateContact(
  contactId: string,
  properties: Partial<HubSpotContactProperties>
): Promise<HubSpotContact> {
  return hubspotFetch<HubSpotContact>(
    `/crm/v3/objects/contacts/${contactId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    }
  );
}

/**
 * Upsert contact - create if not exists, update if exists
 */
export async function upsertContact(
  email: string,
  properties: Partial<HubSpotContactProperties>
): Promise<HubSpotContact> {
  const existing = await getContactByEmail(email);

  if (existing) {
    return updateContact(existing.id, properties);
  } else {
    return createContact({ email, ...properties });
  }
}

// ============================================
// Engagement/Note Operations
// ============================================

/**
 * Add a note to a contact using the Engagements API
 */
export async function addNoteToContact(
  contactId: string,
  noteBody: string
): Promise<{ id: number }> {
  const timestamp = Date.now();

  return hubspotFetch<{ engagement: { id: number } }>(
    "/engagements/v1/engagements",
    {
      method: "POST",
      body: JSON.stringify({
        engagement: {
          active: true,
          type: "NOTE",
          timestamp,
        },
        associations: {
          contactIds: [parseInt(contactId, 10)],
          companyIds: [],
          dealIds: [],
          ticketIds: [],
        },
        metadata: {
          body: noteBody,
        },
      }),
    }
  ).then((res) => ({ id: res.engagement.id }));
}

// ============================================
// Ticket Operations
// ============================================

/**
 * Create a support ticket
 */
export async function createTicket(
  properties: HubSpotTicketProperties,
  contactId?: string
): Promise<HubSpotTicket> {
  const ticket = await hubspotFetch<HubSpotTicket>("/crm/v3/objects/tickets", {
    method: "POST",
    body: JSON.stringify({ properties }),
  });

  // Associate with contact if provided
  if (contactId) {
    await hubspotFetch(
      `/crm/v3/objects/tickets/${ticket.id}/associations/contacts/${contactId}/ticket_to_contact`,
      { method: "PUT" }
    );
  }

  return ticket;
}

/**
 * Get ticket by ID
 */
export async function getTicketById(
  ticketId: string
): Promise<HubSpotTicket | null> {
  try {
    return await hubspotFetch<HubSpotTicket>(
      `/crm/v3/objects/tickets/${ticketId}?properties=subject,content,hs_pipeline,hs_pipeline_stage,hs_ticket_priority,source_type`
    );
  } catch (error) {
    console.error("Error getting HubSpot ticket:", error);
    return null;
  }
}

/**
 * Update a ticket
 */
export async function updateTicket(
  ticketId: string,
  properties: Partial<HubSpotTicketProperties>
): Promise<HubSpotTicket> {
  return hubspotFetch<HubSpotTicket>(`/crm/v3/objects/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

/**
 * Search for tickets by contact
 */
export async function getTicketsByContact(
  contactId: string,
  limit = 10
): Promise<HubSpotTicket[]> {
  try {
    // First get associated ticket IDs
    const associations = await hubspotFetch<{
      results: Array<{ id: string; type: string }>;
    }>(
      `/crm/v3/objects/contacts/${contactId}/associations/tickets`
    );

    if (!associations.results?.length) {
      return [];
    }

    // Then batch read the tickets
    const ticketIds = associations.results.slice(0, limit).map((r) => r.id);

    const tickets = await hubspotFetch<{ results: HubSpotTicket[] }>(
      "/crm/v3/objects/tickets/batch/read",
      {
        method: "POST",
        body: JSON.stringify({
          properties: [
            "subject",
            "content",
            "hs_pipeline_stage",
            "hs_ticket_priority",
            "source_type",
            "createdate",
          ],
          inputs: ticketIds.map((id) => ({ id })),
        }),
      }
    );

    return tickets.results || [];
  } catch (error) {
    console.error("Error getting tickets by contact:", error);
    return [];
  }
}

// ============================================
// Pipeline Operations
// ============================================

/**
 * Get ticket pipelines and stages
 */
export async function getTicketPipelines(): Promise<Pipeline[]> {
  const response = await hubspotFetch<{ results: Pipeline[] }>(
    "/crm/v3/pipelines/tickets"
  );
  return response.results || [];
}

// ============================================
// Recent Activity
// ============================================

/**
 * Get recent incoming emails for a contact
 */
export async function getContactEmails(
  contactId: string,
  limit = 10
): Promise<
  Array<{
    id: number;
    subject: string;
    from: string;
    date: string;
    snippet: string;
  }>
> {
  try {
    const response = await hubspotFetch<{
      results: Array<{
        engagement: { id: number; type: string; createdAt: number };
        metadata: {
          subject?: string;
          from?: { email?: string };
          text?: string;
        };
      }>;
    }>(`/engagements/v1/engagements/associated/contact/${contactId}/paged?limit=${limit}`);

    return (response.results || [])
      .filter(
        (e) =>
          e.engagement.type === "INCOMING_EMAIL" ||
          e.engagement.type === "EMAIL"
      )
      .map((e) => ({
        id: e.engagement.id,
        subject: e.metadata.subject || "(no subject)",
        from: e.metadata.from?.email || "unknown",
        date: new Date(e.engagement.createdAt).toISOString(),
        snippet: (e.metadata.text || "").slice(0, 200),
      }));
  } catch (error) {
    console.error("Error getting contact emails:", error);
    return [];
  }
}
