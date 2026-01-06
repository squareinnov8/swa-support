/**
 * EngageBay CRM Types
 *
 * Type definitions for EngageBay API entities.
 */

/**
 * Property in EngageBay entities (contacts, companies, etc.)
 */
export type EngageBayProperty = {
  name: string;
  value: string;
  field_type?: "TEXT" | "DATE" | "LIST" | "CHECKBOX" | "TEXTAREA" | "NUMBER" | "URL" | "PHONE";
  type: "SYSTEM" | "CUSTOM";
  subtype?: string;
  is_searchable?: boolean;
};

/**
 * Tag structure in EngageBay
 */
export type EngageBayTag = {
  tag: string;
  assigned_time?: number;
};

/**
 * Contact entity in EngageBay
 */
export type EngageBayContact = {
  id?: number;
  owner_id?: number;
  name?: string;
  firstname?: string;
  lastname?: string;
  fullname?: string;
  email?: string;
  phone?: string;
  score?: number;
  created_time?: number;
  updated_time?: number;
  status?: "CONFIRMED" | "UNCONFIRMED" | "BOUNCED" | "SPAM";
  properties?: EngageBayProperty[];
  tags?: EngageBayTag[] | string[];
  companyIds?: number[];
  listIds?: number[];
};

/**
 * Contact create/update input
 */
export type EngageBayContactInput = {
  score?: number;
  properties: EngageBayProperty[];
  tags?: string[];
  companyIds?: number[];
};

/**
 * Note entity in EngageBay
 */
export type EngageBayNote = {
  id?: number;
  parentId: number;
  subject: string;
  content: string;
  type?: "CONTACT" | "COMPANY" | "DEAL";
};

/**
 * Deal entity in EngageBay
 */
export type EngageBayDeal = {
  id?: number;
  name: string;
  description?: string;
  amount?: number;
  currency_type?: string;
  track_id?: number;
  milestone?: string;
  closed_date?: string;
  owner_id?: number;
  tags?: EngageBayTag[] | string[];
  contactIds?: number[];
};

/**
 * Ticket entity in EngageBay
 */
export type EngageBayTicket = {
  id?: number;
  subject: string;
  html_body?: string;
  type?: number;
  priority?: number;
  status?: number;
  group_id?: number;
  assignee_id?: number;
  tags?: EngageBayTag[] | string[];
  contact_id?: number;
};

/**
 * API response wrapper
 */
export type EngageBayResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Sync result for batch operations
 */
export type SyncResult = {
  created: number;
  updated: number;
  failed: number;
  errors: string[];
};
