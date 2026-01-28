/**
 * HubSpot CRM Integration
 *
 * Exports for HubSpot CRM client and sync operations
 */

// Types
export type {
  HubSpotContact,
  HubSpotContactProperties,
  HubSpotTicket,
  HubSpotTicketProperties,
  HubSpotSyncInput,
  HubSpotSyncResult,
  HubSpotNote,
  HubSpotEmailEngagement,
  HubSpotOwner,
  Pipeline,
  PipelineStage,
} from "./types";

// Client operations
export {
  isHubSpotConfigured,
  getContactByEmail,
  getContactById,
  createContact,
  updateContact,
  upsertContact,
  addNoteToContact,
  createTicket,
  getTicketById,
  updateTicket,
  getTicketsByContact,
  getTicketPipelines,
  getContactEmails,
} from "./client";

// Owner operations
export {
  getOwners,
  getOwnerIdByEmail,
  getRobOwnerId,
  addNoteToTicket,
} from "./owner";

// Sync operations
export {
  syncInteractionToHubSpot,
  getHubSpotCustomerContext,
} from "./sync";

// Ticket sync operations
export {
  createTicketForThread,
  updateTicketStage,
  addActivityNote,
  syncExistingThread,
  type TicketActivity,
  type SyncResult,
} from "./ticketSync";
