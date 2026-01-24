# Production Thread Analysis Report
**Date:** January 24, 2026
**Total Threads:** 103
**Threads with Issues:** 27 (26%)
**Customers Waiting for Response:** 23

---

## Executive Summary

The analysis reveals several systematic issues causing customers to wait without responses:

| Issue Category | Count | Severity |
|----------------|-------|----------|
| Stuck in HUMAN_HANDLING | 11 | **CRITICAL** |
| Customer waiting 5+ days | 12 | **HIGH** |
| Clarification loops | 4 | **MEDIUM** |
| False positives (spam detection) | 5 | **LOW** |
| Policy gate blocking | 1 | **FIXED** |

---

## Critical Issues Requiring Immediate Attention

### 1. Order #4004 - French Customer Threatening PayPal Dispute
**Thread ID:** `790330c2-95be-471d-b4c4-34b9d64685c8`
**Customer:** Tony Goueslain (goueslain.tony@gmail.com)
**Order Date:** November 30, 2025
**Wait Time:** ~55 days

**What Happened:**
1. Customer ordered internationally (France) on Nov 30
2. Lina asked for dashboard photos for compatibility check
3. Manufacturer (Libby) asked for MORE photos
4. Customer sent photos but got asked AGAIN
5. No response since Dec 11, 2025
6. Customer came back Jan 22 asking "Am I supposed to get my order one day?"
7. Lina auto-replied with generic "3-5 business days" message
8. Customer replied: **"I don't want an AI answer... My order was in Nov 30, 2025"**
9. Customer now threatening PayPal dispute

**Root Cause:**
- Thread got stuck waiting for manufacturer response
- No escalation timeout - fell through cracks
- Auto-response was tone-deaf (mentioned "3-5 business days" for 55-day old order)

**Recommended Action:** URGENT - Process refund immediately, apologize personally

---

### 2. order #4044 - Approved Refund Never Processed
**Thread ID:** `a603229f-6d41-41ad-b1e5-41dc9336f01e`
**Customer:** Orlando Del Villar
**Wait Time:** 26 days since refund "approved"

**What Happened:**
1. Customer requested cancellation on Dec 29 (selling car)
2. Lina said refund approved, subject to 10% fee
3. Customer followed up Jan 8: "I haven't received the refund yet"
4. No response
5. Customer followed up Jan 19: "Hello? Haven't heard back... hoping instead of refund if I could use that money on a Tesla screen"
6. Still no response (5+ days)

**Root Cause:**
- Refund was promised but never actually processed
- No system to track promised actions
- Thread stayed IN_PROGRESS with no draft generated

**Recommended Action:** Process refund OR apply credit toward Tesla screen, apologize

---

### 3. HUMAN_HANDLING Threads Abandoned (11 threads)

These threads were taken over by a human but never resolved:

| Thread | Days Stuck | Customer Last Message |
|--------|------------|----------------------|
| Issues with Mk7 Tesla screen | 9 days | "Thanks for the info. The backup cam now works." |
| Re: Order #4068 confirmed | 9 days | "I apologize. I'm not sure why I assumed this had been fixed." |
| Re: Order #4013 confirmed | 9 days | "I only have one problem, the sport mode but..." |
| Re: Complete your return for Order #4002 | 8 days | "Hello, any updates on the return?" |
| G Series MK7 | 6 days | "Does the Voice Recognition button work with the MK7?" |
| Security alert | 5 days | (Google security email - not a customer) |
| I need help digital dashboard apex | 4 days | "If I can't access the website, could you please email me the file directly?" |

**Root Cause:**
- No timeout on HUMAN_HANDLING mode
- No notification when threads are aging
- Easy to forget about threads once taken over

**Recommended Fix:**
1. Add HUMAN_HANDLING timeout (auto-notify after 48 hours, auto-escalate after 5 days)
2. Daily digest of threads in HUMAN_HANDLING state

---

### 4. False Positive: Non-Support Emails Not Auto-Closed

These are NOT customer support requests but were classified as requiring action:

| Thread | Actual Source | Classified As |
|--------|--------------|---------------|
| Security alert | Google security notification | LEGAL_SAFETY_RISK (ESCALATED) |
| Username changed on Instagram | Facebook/Meta | UNKNOWN (IN_PROGRESS) |
| Did you just add an account | Facebook/Meta | UNKNOWN (IN_PROGRESS) |
| You're back on Instagram | Facebook/Meta | UNKNOWN (IN_PROGRESS) |
| 901752 is your Instagram code | Facebook/Meta | UNKNOWN (IN_PROGRESS) |
| TikTok Shop dispute protection | TikTok marketing | CHARGEBACK_THREAT (ESCALATED!) |

**Root Cause:**
- VENDOR_SPAM detection doesn't catch these automated emails
- "Security", "dispute" keywords trigger false escalation
- No pattern to detect `@facebookmail.com`, `noreply@google.com`, etc.

**Recommended Fix:**
1. Add sender domain allowlist for auto-close: `facebookmail.com`, `google.com`, `tiktok.com`, etc.
2. Add subject pattern blocklist: "security alert", "Instagram code", "account center"

---

### 5. Firmware / Software Updates - Stuck in AWAITING_INFO
**Thread ID:** `cc7169d3-2edf-4da9-bb58-37d210217535`
**Wait Time:** 9 days
**Verification:** pending

**What Happened:**
1. Customer asked about firmware updates for their MK unit (purchased "a couple years back")
2. System asked for order number (verification pending)
3. No response... but also NO DRAFT sent asking for order number
4. Customer stuck waiting 9 days

**Root Cause:**
- Verification prompt was generated but never sent?
- Thread shows "Drafts: 0" despite being in AWAITING_INFO
- Possible bug: draft not being saved or auto-sent

**Recommended Fix:** Investigate why draft wasn't created/sent

---

### 6. Clarification Loop: "4G Antenna" Question
**Thread ID:** `b46f75cc-171e-4c54-bb31-ab7fb7135a46`
**Customer Message:** "Do these things come with 4g antenna? the MK7."

**What Happened:**
1. Customer asked simple yes/no question
2. Lina asked for vehicle info
3. Customer provided vehicle
4. Lina asked for MORE clarification
5. Customer provided more
6. Lina STILL asked for clarification
7. Customer: **"THATS WHAT I WAS ASKING. DOES IT COME WITH A 4G ANTENNA FOR DATA YES OR NO"**

**Root Cause:**
- KB doesn't have clear "does MK7 include 4G antenna" answer
- LLM defaulted to asking for more info instead of admitting "I don't know"
- Truthfulness rule not working: should say "I'm not sure" not ask endless questions

**Recommended Fix:**
1. Add KB article: "MK7 4G/LTE Antenna - Included Components"
2. Tune prompt: "If you don't know the answer, say so. Don't ask clarifying questions that won't help."

---

## State Distribution

```
RESOLVED:        68 (66%)
HUMAN_HANDLING:  18 (17%)  ← Many stuck!
IN_PROGRESS:     15 (15%)
ESCALATED:        1 (1%)
AWAITING_INFO:    1 (1%)
```

The high HUMAN_HANDLING count (18) is concerning - these should be temporary states.

---

## Logic Gaps Identified

### 1. No HUMAN_HANDLING Timeout
**Location:** `src/lib/threads/stateMachine.ts`
**Issue:** Once a thread enters HUMAN_HANDLING, it stays there until manually changed
**Impact:** 11 threads stuck, customers waiting up to 9 days
**Fix:** Add 48-hour warning, 5-day auto-escalate

### 2. Vendor/Spam Detection Too Narrow
**Location:** `src/lib/intents/classify.ts`
**Issue:** Only checks for business/vendor patterns, misses automated service emails
**Impact:** 5+ false positives creating work and confusion
**Fix:** Add sender domain blocklist, subject pattern blocklist

### 3. No "Promised Action" Tracking
**Issue:** When Lina says "refund approved" or "will process", no system tracks it
**Impact:** Promises made but never fulfilled (Order #4044)
**Fix:** Add action tracking table, daily digest of unfulfilled promises

### 4. Auto-Response Ignores Thread Age
**Location:** `src/lib/llm/prompts.ts`
**Issue:** LLM doesn't know how long customer has been waiting
**Impact:** Order #4004 got "3-5 business days" response for 55-day old order
**Fix:** Add thread age to context, special handling for aged threads

### 5. Clarification Loop Not Detected
**Issue:** System asks same question multiple times without realizing
**Impact:** Customer frustration (4G antenna thread)
**Fix:** Track questions asked, detect loops, escalate or admit uncertainty

### 6. Missing Draft in AWAITING_INFO
**Thread:** Firmware/Software updates
**Issue:** Thread in AWAITING_INFO but no draft was saved
**Impact:** Customer waiting with no response
**Fix:** Investigate - possible race condition or error in draft saving

---

## Positive Observations

1. **Order #4088** - Policy gate caught "– Rob" signature, escalated properly, then Lina generated correct response with "– Lina" signature and sent it. System working as designed after the fix.

2. **Order #4055** - Customer delighted: "How the hell did you answer this so fast?!?!?! LOL". Fast response times when system works.

3. **68/103 threads (66%) resolved** - Majority of threads do get resolved successfully.

---

## Recommended Priority Actions

### Immediate (Today)
1. ✅ Fix the old "– Rob" signatures (DONE)
2. ⚠️ Manually resolve Order #4004 (PayPal threat)
3. ⚠️ Manually resolve Order #4044 (refund not processed)
4. ⚠️ Review all 11 HUMAN_HANDLING threads

### This Week
5. Add HUMAN_HANDLING timeout (48h warning, 5d auto-escalate)
6. Add automated email detection (Google, Facebook, TikTok sender domains)
7. Add thread age to LLM context

### Next Sprint
8. Build "Promised Actions" tracker
9. Add clarification loop detection
10. Create daily digest of stale threads
