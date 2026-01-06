/**
 * HubSpot CRM Types
 *
 * Based on HubSpot CRM API v3
 * https://developers.hubspot.com/docs/api/crm
 */

// Contact properties
export type HubSpotContactProperties = {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
  // Shopify integration properties
  ip__shopify__orders_count?: string;
  ip__shopify__total_spent?: string;
  ip__shopify__customer_id?: string;
  // Support tracking properties (custom)
  last_support_date?: string;
  support_thread_count?: string;
  support_status?: string;
  // Any other properties
  [key: string]: string | undefined;
};

export type HubSpotContact = {
  id: string;
  properties: HubSpotContactProperties;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

// Note (engagement)
export type HubSpotNote = {
  engagement: {
    id?: number;
    portalId?: number;
    active?: boolean;
    type: "NOTE";
    timestamp?: number;
  };
  associations: {
    contactIds?: number[];
    companyIds?: number[];
    dealIds?: number[];
    ticketIds?: number[];
  };
  metadata: {
    body: string;
  };
};

// Email engagement
export type HubSpotEmailEngagement = {
  engagement: {
    id: number;
    type: "INCOMING_EMAIL" | "EMAIL";
    createdAt: number;
    lastUpdated: number;
  };
  associations: {
    contactIds?: number[];
    companyIds?: number[];
    dealIds?: number[];
    ticketIds?: number[];
  };
  metadata: {
    from?: { email?: string; firstName?: string };
    to?: Array<{ email?: string }>;
    subject?: string;
    text?: string;
    html?: string;
  };
};

// Ticket
export type HubSpotTicketProperties = {
  subject?: string;
  content?: string;
  hs_pipeline?: string;
  hs_pipeline_stage?: string;
  hs_ticket_priority?: string;
  source_type?: string;
  createdate?: string;
  hs_lastmodifieddate?: string;
  hubspot_owner_id?: string;  // Owner assignment for escalations
  [key: string]: string | undefined;
};

// Owner
export type HubSpotOwner = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userId: number;
  archived: boolean;
};

export type HubSpotTicket = {
  id: string;
  properties: HubSpotTicketProperties;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  associations?: {
    contacts?: { results: Array<{ id: string; type: string }> };
  };
};

// API response types
export type HubSpotSearchResponse<T> = {
  total: number;
  results: T[];
  paging?: {
    next?: {
      after: string;
      link: string;
    };
  };
};

export type HubSpotBatchReadResponse<T> = {
  status: string;
  results: T[];
  requestedCount: number;
};

// Sync input types
export type HubSpotSyncInput = {
  email: string;
  threadId: string;
  intent: string;
  customerName?: string;
  subject?: string;
  messageSnippet?: string;
  state?: string;
  verificationStatus?: "verified" | "flagged" | "pending" | null;
  shopifyCustomerId?: string;
};

export type HubSpotSyncResult = {
  success: boolean;
  contactId?: string;
  noteCreated?: boolean;
  ticketCreated?: boolean;
  error?: string;
};

// Pipeline stage mapping
export type PipelineStage = {
  id: string;
  label: string;
};

export type Pipeline = {
  id: string;
  label: string;
  stages: PipelineStage[];
};
