/**
 * Types for HubSpot Email Insights
 */

// Email categories
export type EmailCategory =
  | "customer_question"
  | "rob_instruction"
  | "support_response"
  | "other";

// Instruction types extracted from Rob's emails
export type InstructionType =
  | "policy"        // Refund/return policies, SLAs
  | "routing"       // Who handles what
  | "escalation"    // When to escalate or not
  | "kb_fact"       // Technical facts to add to KB
  | "approval"      // Approved actions
  | "prohibition";  // Things not to do

// Topic categories for customer questions
export type TopicCategory =
  | "carplay_android_auto"
  | "audio_sound"
  | "screen_display"
  | "installation"
  | "firmware_updates"
  | "order_shipping"
  | "compatibility"
  | "intouch_oem"
  | "camera_parking"
  | "return_refund"
  | "headlights"
  | "general"
  | "uncategorized";

// Raw email from HubSpot
export type HubSpotEmailRaw = {
  id: number;
  type: "INCOMING_EMAIL" | "EMAIL";
  createdAt: number;
  from: string;
  to: string[];
  subject: string;
  text: string;
  contactIds: number[];
};

// Processed email for storage
export type ProcessedEmail = {
  hubspot_id: number;
  email_type: string;
  direction: "inbound" | "outbound";
  from_email: string;
  to_emails: string[];
  subject: string;
  body_text: string;
  email_category: EmailCategory;
  topic: TopicCategory | null;
  hubspot_contact_ids: number[];
  email_date: string;
};

// Extracted instruction
export type ExtractedInstruction = {
  email_id?: string;
  instruction_text: string;
  instruction_type: InstructionType;
  applies_to: string[];
  keywords: string[];
};

// KB gap candidate
export type KBGapCandidate = {
  email_id?: string;
  question_text: string;
  topic: TopicCategory;
  subtopic?: string;
  gap_severity: "high" | "medium" | "low";
};

// Escalation pattern
export type EscalationPattern = {
  email_id?: string;
  pattern_type: "should_escalate" | "should_not_escalate" | "takeover";
  trigger_description: string;
  original_escalation_reason?: string;
  rob_feedback: string;
  suggested_rule?: string;
};

// Import run result
export type ImportRunResult = {
  success: boolean;
  run_id?: string;
  stats: {
    emails_fetched: number;
    emails_imported: number;
    instructions_extracted: number;
    kb_gaps_identified: number;
    escalation_patterns_found: number;
  };
  error?: string;
};
