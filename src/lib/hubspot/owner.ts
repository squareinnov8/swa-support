/**
 * HubSpot Owner Operations
 *
 * Lookup and manage ticket owners for escalation assignment.
 */

import type { HubSpotOwner } from "./types";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_ACCESS_TOKEN environment variable not set");
  }
  return token;
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

// Cache owner ID lookups
const ownerCache: Map<string, string> = new Map();

/**
 * Get all owners from HubSpot
 */
export async function getOwners(): Promise<HubSpotOwner[]> {
  const response = await hubspotFetch<{ results: HubSpotOwner[] }>(
    "/crm/v3/owners"
  );
  return response.results || [];
}

/**
 * Get owner ID by email address
 * Results are cached for performance
 */
export async function getOwnerIdByEmail(email: string): Promise<string | null> {
  const cacheKey = email.toLowerCase();

  // Check cache first
  if (ownerCache.has(cacheKey)) {
    return ownerCache.get(cacheKey)!;
  }

  // Fetch all owners and find match
  const owners = await getOwners();
  const owner = owners.find(
    (o) => o.email.toLowerCase() === cacheKey && !o.archived
  );

  if (owner) {
    ownerCache.set(cacheKey, owner.id);
    return owner.id;
  }

  return null;
}

/**
 * Get Rob's owner ID (primary escalation target)
 * Uses env var if set, otherwise looks up by email
 */
export async function getRobOwnerId(): Promise<string | null> {
  // Check env var first for explicit configuration
  const envOwnerId = process.env.HUBSPOT_ROB_OWNER_ID;
  if (envOwnerId) {
    return envOwnerId;
  }

  // Look up by email
  return getOwnerIdByEmail("rob@squarewheelsauto.com");
}

/**
 * Add note to a ticket
 */
export async function addNoteToTicket(
  ticketId: string,
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
          contactIds: [],
          companyIds: [],
          dealIds: [],
          ticketIds: [parseInt(ticketId, 10)],
        },
        metadata: {
          body: noteBody,
        },
      }),
    }
  ).then((res) => ({ id: res.engagement.id }));
}
