const banned = [
  /we guarantee/i,
  /i guarantee/i,
  /\bwill refund\b/i,
  /\bwe will refund\b/i,
  /\bwill replace\b/i,
  /\bwe will replace\b/i,
  /\bwill ship (today|tomorrow)\b/i,
  /\byou will receive by\b/i,
];

/**
 * Disallowed sign-offs - personal names that should not appear in drafts
 * These are specifically known problematic names
 */
const disallowedSignoffs = [
  /[-–—]\s*Rob\b/i,        // "- Rob", "– Rob", "— Rob"
  /[-–—]\s*Robert\b/i,     // "- Robert", etc.
  /[-–—]\s*The\s+(Team|Support)\b/i, // "- The Team", "- The Support" etc.
];

/**
 * Valid signature pattern - drafts should end with "– Lina" (or variant dashes)
 */
const validSignature = /[-–—]\s*Lina\s*$/i;

export function policyGate(draft: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Check banned phrases
  for (const pattern of banned) {
    if (pattern.test(draft)) {
      reasons.push(pattern.toString());
    }
  }

  // Check for disallowed sign-offs (like "- Rob")
  for (const pattern of disallowedSignoffs) {
    if (pattern.test(draft)) {
      // Skip false positive if it's Lina
      if (!/[-–—]\s*Lina/i.test(draft.match(pattern)?.[0] || "")) {
        reasons.push(`Disallowed sign-off: ${pattern.toString()}`);
      }
    }
  }

  // Verify draft ends with valid Lina signature
  const trimmedDraft = draft.trim();
  if (trimmedDraft.length > 0 && !validSignature.test(trimmedDraft)) {
    // Only flag if draft doesn't end with valid signature
    // This catches cases where signature is missing or wrong
    reasons.push("Draft must end with '– Lina' signature");
  }

  return { ok: reasons.length === 0, reasons };
}
