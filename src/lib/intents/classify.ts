import type { Intent } from "./taxonomy";

const has = (t: string, patterns: RegExp[]) => patterns.some((r) => r.test(t));
const all = (t: string, patterns: RegExp[]) => patterns.every((r) => r.test(t));

/**
 * Strip quoted reply content from email body.
 * This prevents old thread content from polluting intent classification.
 */
function stripQuotedContent(body: string): string {
  // Split on common quote markers
  const lines = body.split('\n');
  const newContent: string[] = [];

  for (const line of lines) {
    // Stop at quoted content markers
    if (
      line.match(/^On .+wrote:$/i) ||           // "On Mon, Jan 12... wrote:"
      line.match(/^On .+<$/i) ||                // "On Mon, Jan 12... <" (email split to next line)
      line.match(/^On [A-Z][a-z]{2},/i) ||      // "On Mon," "On Tue," etc (start of quote header)
      line.match(/^-+\s*Original Message/i) ||  // "--- Original Message ---"
      line.match(/^>/) ||                        // "> quoted line"
      line.match(/^From:.+@/i) ||                // "From: email@..."
      line.match(/^Sent:/i) ||                   // "Sent: date"
      line.match(/^To:/i) ||                     // "To: email"
      line.match(/^Subject:/i)                   // "Subject: ..."
    ) {
      break;
    }
    newContent.push(line);
  }

  return newContent.join('\n').trim();
}

export function classifyIntent(subject: string, body: string): { intent: Intent; confidence: number } {
  // Strip quoted content to focus on the new message
  const strippedBody = stripQuotedContent(body);
  const text = `${subject}\n${strippedBody}`.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Also keep full text for some checks where context matters
  const fullText = `${subject}\n${body}`.toLowerCase();

  // ==== NON-CUSTOMER (check first to filter out) ====

  // Vendor spam / sales pitches
  if (has(text, [
    /partnership opportunity/,
    /business opportunity/,
    /collaborate with/,
    /\bseo\b.*services/,
    /marketing services/,
    /\bpr\b.*agency/,
    /guest post/,
    /link building/,
    /sponsored content/,
    /increase.*traffic/,
    /boost.*sales/,
    /\bB2B\b/,
    /supplier.*inquiry/,
    /vendor.*inquiry/,
    /wholesale.*inquiry/,
    /distribution.*opportunity/,
    /schedule a call/i,
    /book a demo/i,
    /free trial/i,
    /let me know if you're interested/,
    /reaching out.*behalf of/,
    /i represent/,
  ])) {
    return { intent: "VENDOR_SPAM", confidence: 0.85 };
  }

  // ==== ESCALATION TRIGGERS (high priority) ====

  if (has(text, [
    /chargeback/,
    /\bbbb\b/,           // Better Business Bureau
    /better business bureau/,
    /dispute.*charge/,
    /charge.*dispute/,
    /fraud/,
    /credit card company/,
    /paypal.*dispute/,
    /going to.*bank/,
    /contact.*bank/,
    /reverse.*charge/,
  ])) {
    return { intent: "CHARGEBACK_THREAT", confidence: 0.9 };
  }

  // Legal/safety risk - must be genuine safety concern or legal threat
  // Note: Don't use generic "dangerous" - too easily matched in product support context
  if (has(text, [
    /lawyer/,
    /attorney/,
    /legal action/,
    /sue you/,
    /lawsuit/,
    /safety hazard/,
    /fire.*risk/,
    /smoke.*coming/,
    /burning smell/,
    /started.*fire/,
    /caught.*fire/,
    /melting/,
    /electr.*shock/,
    /spark/,
  ]) && !has(text, [
    // Exclude common product support contexts
    /audio.*noise/,
    /screen.*issue/,
    /not.*working/,
    /troubleshoot/,
  ])) {
    return { intent: "LEGAL_SAFETY_RISK", confidence: 0.9 };
  }

  // ==== ORDER RELATED ====

  // Order status - where's my order, tracking
  if (has(text, [
    /where.*order/,
    /where.*my.*package/,
    /order.*status/,
    /tracking.*number/,
    /tracking.*info/,
    /has.*shipped/,
    /when.*ship/,
    /when.*arrive/,
    /when.*receive/,      // "when will I receive" / "when may I receive"
    /when.*get.*order/,   // "when will I get my order"
    /when.*deliver/,      // "when will it be delivered"
    /delivery.*status/,
    /still.*waiting.*order/,
    /order.*\d{4,}/,      // "order 4037" pattern
    /\border\s*#?\s*\d+/, // "order #1234" or "order 1234"
    /haven'?t.*received/,
    /didn'?t.*receive/,
    /package.*lost/,
    /purchased.*when/,    // "I purchased X, when will..."
    /bought.*when/,       // "I bought X, when will..."
  ])) {
    return { intent: "ORDER_STATUS", confidence: 0.8 };
  }

  // Order change request
  if (has(text, [
    /cancel.*order/,
    /change.*order/,
    /modify.*order/,
    /update.*shipping/,
    /different.*address/,
    /wrong.*address/,
  ])) {
    return { intent: "ORDER_CHANGE_REQUEST", confidence: 0.8 };
  }

  // Missing or damaged items
  if (has(text, [
    /missing.*item/,
    /item.*missing/,
    /package.*damaged/,
    /arrived.*damaged/,
    /box.*crushed/,
    /broken.*arrived/,
    /parts.*missing/,
  ])) {
    return { intent: "MISSING_DAMAGED_ITEM", confidence: 0.8 };
  }

  // Wrong item received
  if (has(text, [
    /wrong.*item/,
    /incorrect.*item/,
    /sent.*wrong/,
    /received.*wrong/,
    /not.*what.*ordered/,
    /different.*than.*ordered/,
  ])) {
    return { intent: "WRONG_ITEM_RECEIVED", confidence: 0.8 };
  }

  // Return/refund request
  if (has(text, [
    /\breturn\b/,
    /\brefund\b/,
    /money.*back/,
    /rma/,
    /send.*back/,
  ])) {
    return { intent: "RETURN_REFUND_REQUEST", confidence: 0.8 };
  }

  // ==== FIRMWARE RELATED (more specific patterns) ====

  // Firmware access issues - must mention login/access problems WITH firmware context
  if (has(text, [/firmware/, /download.*portal/, /update.*file/]) && has(text, [
    /can'?t.*log\s?in/,
    /kicking.*off/,
    /login.*loop/,
    /403/,
    /access.*denied/,
    /password.*not.*work/,
    /can'?t.*access/,
    /won'?t.*let.*in/,
  ])) {
    return { intent: "FIRMWARE_ACCESS_ISSUE", confidence: 0.85 };
  }

  // Firmware update request - specifically asking for firmware files
  if (has(text, [
    /need.*firmware/,
    /send.*firmware/,
    /firmware.*download/,
    /firmware.*file/,
    /firmware.*update/,
    /latest.*firmware/,
    /update.*software/,
    /software.*update/,
  ]) && !has(text, [/screen.*dead/, /not.*working/, /stopped.*working/, /broken/])) {
    return { intent: "FIRMWARE_UPDATE_REQUEST", confidence: 0.75 };
  }

  // ==== PRODUCT SUPPORT (general troubleshooting) ====

  // This is the catch-all for product issues - screen problems, audio issues, not working, etc.
  if (has(text, [
    // Screen issues
    /screen.*dead/,
    /screen.*black/,
    /screen.*blank/,
    /screen.*frozen/,
    /screen.*not.*work/,
    /display.*not.*work/,
    /no.*display/,
    /won'?t.*turn.*on/,
    /doesn'?t.*turn.*on/,

    // Audio issues
    /audio.*issue/,
    /audio.*problem/,
    /audio.*noise/,
    /no.*sound/,
    /sound.*issue/,
    /static.*noise/,
    /buzzing/,
    /crackling/,
    /speaker.*not/,

    // General product issues
    /not.*working/,
    /stopped.*working/,
    /issue.*with.*mk\d/i,    // "issue with MK7"
    /issues.*with.*mk\d/i,
    /problem.*with.*screen/,
    /problem.*with.*unit/,
    /product.*defect/,
    /broke/,
    /broken/,
    /malfunction/,
    /doesn'?t.*work/,
    /won'?t.*work/,
    /isn'?t.*working/,
    /acting.*up/,
    /glitch/,
    /keeps.*crash/,
    /keeps.*restart/,
    /keeps.*reboot/,
    /freeze/,
    /freezing/,
    /stuck/,

    // Tesla/car specific issues
    /tesla.*screen/,
    /carplay.*not/,
    /android.*auto.*not/,
    /backup.*camera.*not/,
    /reverse.*camera.*not/,
  ])) {
    return { intent: "PRODUCT_SUPPORT", confidence: 0.8 };
  }

  // ==== DOCUMENTATION / INSTALLATION ====

  if (has(text, [
    /watched.*video/,
    /video.*shows/,
    /instruction.*video/,
    /didn'?t.*get.*email/,
    /email.*shown.*in/,
    /docs.*don'?t.*match/,
    /instructions.*wrong/,
    /tutorial.*different/,
  ])) {
    return { intent: "DOCS_VIDEO_MISMATCH", confidence: 0.8 };
  }

  if (has(text, [
    /how.*install/,
    /install.*help/,
    /installation.*guide/,
    /step.*by.*step/,
    /install.*instructions/,
    /can.*you.*walk.*through/,
  ])) {
    return { intent: "INSTALL_GUIDANCE", confidence: 0.75 };
  }

  // ==== PRE-PURCHASE / COMPATIBILITY ====

  if (has(text, [
    /compatible.*with/,
    /work.*with.*my/,
    /will.*fit/,
    /does.*fit/,
    /support.*my.*car/,
    /before.*i.*buy/,
    /before.*purchase/,
    /thinking.*about.*buying/,
  ])) {
    return { intent: "COMPATIBILITY_QUESTION", confidence: 0.75 };
  }

  if (has(text, [
    /what.*is.*this/,
    /part.*number/,
    /what.*part/,
    /which.*part/,
    /identify.*this/,
    /no.*idea.*what/,
    /\b3760\b/,  // Known part number pattern
  ])) {
    return { intent: "PART_IDENTIFICATION", confidence: 0.7 };
  }

  // ==== FUNCTIONALITY / BUGS ====

  if (has(text, [
    /supposed.*to/,
    /should.*be.*able/,
    /feature.*not.*work/,
    /button.*not.*work/,
    /setting.*not/,
  ])) {
    return { intent: "FUNCTIONALITY_BUG", confidence: 0.7 };
  }

  // ==== LOW PRIORITY ====

  // Follow-up with no new info
  if (has(text, [
    /any.*update/,
    /still.*waiting/,
    /just.*checking/,
    /following.*up/,
    /wanted.*to.*check/,
    /no.*response/,
    /haven'?t.*heard/,
  ]) && text.length < 500) {  // Short messages more likely to be just follow-ups
    return { intent: "FOLLOW_UP_NO_NEW_INFO", confidence: 0.6 };
  }

  // Thank you / closing - check early for short polite closings
  // Use stripped body (lowercase) to check for simple closing phrases
  const strippedBodyLower = strippedBody.toLowerCase().trim();
  const isShortMessage = strippedBody.length < 100;

  // Very short polite closings - check the stripped body directly
  if (has(strippedBodyLower, [
    /^thanks[,!\.\s]*$/,                 // Just "Thanks!" or "Thanks,"
    /^thank\s*you[,!\.\s]*$/,            // Just "Thank you!"
    /^thanks,?\s*you\s*too[!\.\s]*$/,    // "Thanks, you too!"
    /^you\s*too[!\.\s]*$/,               // Just "You too!"
    /^same\s*to\s*you[!\.\s]*$/,         // "Same to you!"
    /^appreciate\s*it[!\.\s]*$/,         // "Appreciate it!"
    /^got\s*it[,!\.\s]*thanks?[!\.\s]*$/,// "Got it, thanks!"
    /^perfect[,!\.\s]*thanks?[!\.\s]*$/, // "Perfect, thanks!"
    /^great[,!\.\s]*thanks?[!\.\s]*$/,   // "Great, thanks!"
    /^awesome[,!\.\s]*thanks?[!\.\s]*$/, // "Awesome, thanks!"
    /^sounds?\s*good[!\.\s]*$/,          // "Sounds good!"
    /^will\s*do[!\.\s]*$/,               // "Will do!"
    /^perfect,?\s*will\s*do[!\.\s]*$/,   // "Perfect, will do!"
    /^ok\s*thanks?[!\.\s]*$/,            // "Ok thanks!"
    /^okay\s*thanks?[!\.\s]*$/,          // "Okay thanks!"
    /^thanks\s*(again|a\s*lot|so\s*much)?[!\.\s]*$/, // "Thanks again!" etc
  ])) {
    return { intent: "THANK_YOU_CLOSE", confidence: 0.95 };
  }

  // Longer thank you messages - check stripped text to avoid quoted content
  if (has(text, [
    /thank.*you/,
    /thanks.*so.*much/,
    /appreciate.*help/,
    /problem.*solved/,
    /issue.*resolved/,
    /works.*now/,
    /working.*now/,
    /all.*good/,
    /happy.*new.*year/,
    /merry.*christmas/,
  ]) && isShortMessage && !has(strippedBodyLower, [/but/, /however/, /still.*not/, /still.*issue/, /still.*problem/])) {
    return { intent: "THANK_YOU_CLOSE", confidence: 0.85 };
  }

  return { intent: "UNKNOWN", confidence: 0.3 };
}
