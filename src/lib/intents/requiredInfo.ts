import type { Intent } from "./taxonomy";

/**
 * Required information checklist per intent.
 *
 * Each intent can require certain pieces of information before we can
 * provide a definitive response. If required info is missing, we should
 * ask for it (via macro or clarifying question) before attempting to answer.
 *
 * This is deterministic gating - no LLM required.
 */

export type RequiredField = {
  id: string;
  label: string;
  patterns: RegExp[]; // Patterns that indicate this info is present
  required: boolean; // If true, MUST have this to proceed
};

export type IntentRequirements = {
  intent: Intent;
  fields: RequiredField[];
  minRequired?: number; // Minimum number of required fields that must be present (default: all required fields)
};

/**
 * Define required info per intent.
 * Only intents that need gating are listed here.
 */
export const INTENT_REQUIREMENTS: IntentRequirements[] = [
  {
    intent: "FIRMWARE_UPDATE_REQUEST",
    fields: [
      {
        id: "unit_type",
        label: "Unit type (Apex/G-Series/Cluster)",
        patterns: [/\bapex\b/i, /\bg-series\b/i, /\bgseries\b/i, /\bcluster\b/i],
        required: true,
      },
      {
        id: "order_info",
        label: "Order number or email",
        patterns: [/order\s*#?\s*\d+/i, /\b[A-Z0-9]{6,}\b/, /@[a-z0-9.-]+\.[a-z]{2,}/i],
        required: false,
      },
    ],
  },
  {
    intent: "FIRMWARE_ACCESS_ISSUE",
    fields: [
      {
        id: "unit_type",
        label: "Unit type (Apex/G-Series/Cluster)",
        patterns: [/\bapex\b/i, /\bg-series\b/i, /\bgseries\b/i, /\bcluster\b/i],
        required: true,
      },
      {
        id: "error_description",
        label: "Error description",
        patterns: [/error/i, /message/i, /says/i, /shows/i, /screen/i, /page/i],
        required: false,
      },
      {
        id: "order_info",
        label: "Order number or email",
        patterns: [/order\s*#?\s*\d+/i, /\b[A-Z0-9]{6,}\b/, /@[a-z0-9.-]+\.[a-z]{2,}/i],
        required: false,
      },
    ],
  },
  {
    intent: "ORDER_STATUS",
    fields: [
      {
        id: "order_number",
        label: "Order number",
        patterns: [/order\s*#?\s*\d+/i, /\b#?\d{4,}\b/, /\b[A-Z0-9]{6,}\b/],
        required: true,
      },
    ],
  },
  {
    intent: "ORDER_CHANGE_REQUEST",
    fields: [
      {
        id: "order_number",
        label: "Order number",
        patterns: [/order\s*#?\s*\d+/i, /\b#?\d{4,}\b/, /\b[A-Z0-9]{6,}\b/],
        required: true,
      },
      {
        id: "change_details",
        label: "What to change",
        patterns: [/change/i, /cancel/i, /modify/i, /address/i, /shipping/i],
        required: true,
      },
    ],
  },
  {
    intent: "MISSING_DAMAGED_ITEM",
    fields: [
      {
        id: "order_number",
        label: "Order number",
        patterns: [/order\s*#?\s*\d+/i, /\b#?\d{4,}\b/, /\b[A-Z0-9]{6,}\b/],
        required: true,
      },
      {
        id: "item_description",
        label: "Which item is missing/damaged",
        patterns: [/missing/i, /damaged/i, /broken/i, /item/i, /part/i, /box/i],
        required: true,
      },
    ],
  },
  {
    intent: "WRONG_ITEM_RECEIVED",
    fields: [
      {
        id: "order_number",
        label: "Order number",
        patterns: [/order\s*#?\s*\d+/i, /\b#?\d{4,}\b/, /\b[A-Z0-9]{6,}\b/],
        required: true,
      },
      {
        id: "wrong_item",
        label: "What was received",
        patterns: [/received/i, /got/i, /sent/i, /wrong/i],
        required: true,
      },
      {
        id: "expected_item",
        label: "What was expected",
        patterns: [/ordered/i, /expected/i, /supposed/i, /should/i],
        required: false,
      },
    ],
  },
  {
    intent: "PART_IDENTIFICATION",
    fields: [
      {
        id: "part_number",
        label: "Part number or description",
        patterns: [/\b\d{3,5}\b/, /part\s*#?\s*\w+/i, /labeled/i, /says/i],
        required: true,
      },
    ],
  },
  {
    intent: "RETURN_REFUND_REQUEST",
    fields: [
      {
        id: "order_number",
        label: "Order number",
        patterns: [/order\s*#?\s*\d+/i, /\b#?\d{4,}\b/, /\b[A-Z0-9]{6,}\b/],
        required: true,
      },
      {
        id: "reason",
        label: "Reason for return/refund",
        patterns: [/because/i, /reason/i, /defective/i, /doesn't work/i, /not working/i, /changed my mind/i],
        required: false,
      },
    ],
  },
  {
    intent: "COMPATIBILITY_QUESTION",
    fields: [
      {
        id: "product",
        label: "Which product",
        patterns: [/\bapex\b/i, /\bg-series\b/i, /\bcluster\b/i, /\bunit\b/i, /\bgauge\b/i],
        required: true,
      },
      {
        id: "vehicle",
        label: "Vehicle info",
        patterns: [/\b\d{4}\b/, /\b(ford|chevy|chevrolet|gmc|dodge|toyota|honda)\b/i, /truck/i, /car/i],
        required: false,
      },
    ],
  },
];

export type CheckResult = {
  allRequiredPresent: boolean;
  missingRequired: RequiredField[];
  presentFields: RequiredField[];
  missingOptional: RequiredField[];
};

/**
 * Check if required information is present in the message.
 */
export function checkRequiredInfo(intent: Intent, text: string): CheckResult {
  const requirements = INTENT_REQUIREMENTS.find((r) => r.intent === intent);

  // If no requirements defined for this intent, assume all good
  if (!requirements) {
    return {
      allRequiredPresent: true,
      missingRequired: [],
      presentFields: [],
      missingOptional: [],
    };
  }

  const presentFields: RequiredField[] = [];
  const missingRequired: RequiredField[] = [];
  const missingOptional: RequiredField[] = [];

  for (const field of requirements.fields) {
    const isPresent = field.patterns.some((p) => p.test(text));

    if (isPresent) {
      presentFields.push(field);
    } else if (field.required) {
      missingRequired.push(field);
    } else {
      missingOptional.push(field);
    }
  }

  const minRequired = requirements.minRequired ?? missingRequired.length === 0;
  const allRequiredPresent =
    typeof requirements.minRequired === "number"
      ? presentFields.filter((f) => f.required).length >= requirements.minRequired
      : missingRequired.length === 0;

  return {
    allRequiredPresent,
    missingRequired,
    presentFields,
    missingOptional,
  };
}

/**
 * Generate a clarifying question asking for missing required info.
 */
export function generateMissingInfoPrompt(missingFields: RequiredField[]): string {
  if (missingFields.length === 0) return "";

  const items = missingFields.map((f, i) => `${i + 1}) ${f.label}`).join("\n");

  return `Hey — I can help, but I need a few details first:

${items}

– Rob`;
}
