# PROJECT_CONTEXT.md
> Maintained by Claude Code. Update this file with every significant change.

## Purpose

SquareWheels Support Agent V2 is a production-adjacent customer support system that replaces a Lindy-based agent with a more controlled, observable, and safe architecture. The core philosophy is **software is the system; the LLM is a component** — meaning deterministic triage happens first, pre-approved macros handle common cases, and LLM assistance is gated behind policy checks.

The system prioritizes customer trust safety: no promises (refunds, shipping timelines, guarantees) can be made without explicit human approval. All decisions are logged for audit. The admin inbox allows humans to review and send responses manually (email send automation is future work).

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INBOUND EMAIL                            │
│                    (webhook/API payload)                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              POST /api/ingest/email                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Validate payload (Zod)                               │   │
│  │ 2. Upsert thread (by external_thread_id)                │   │
│  │ 3. Insert message (direction: inbound)                  │   │
│  │ 4. classifyIntent(subject, body) → {intent, confidence} │   │
│  │ 5. Decide action based on intent                        │   │
│  │ 6. Generate draft (macro) if applicable                 │   │
│  │ 7. policyGate(draft) → block if promises detected       │   │
│  │ 8. Log event (auto_triage)                              │   │
│  │ 9. Update thread state/intent                           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ threads  │ │ messages │ │  events  │ │customers │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐                                      │
│  │ kb_docs  │ │kb_chunks │ (pgvector for future RAG)           │
│  └──────────┘ └──────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ADMIN UI                                   │
│  /admin          → List threads (state, intent, timestamp)      │
│  /admin/thread/X → View messages + proposed draft (copy/paste)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ingest/email` | Ingest inbound email, create/update thread, classify, decide action, generate draft |
| GET | `/admin` | Admin inbox listing threads |
| GET | `/admin/thread/[id]` | Thread detail with messages and draft |
| POST | `/api/process/thread` | (stub) Future: reprocess thread |
| POST | `/api/kb/sync/notion` | (stub) Future: sync KB from Notion |
| POST | `/api/webhooks/shopify` | (stub) Future: Shopify webhooks |

---

## Database Schema

### `customers`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| shopify_customer_id | text | Unique, nullable |
| email | text | |
| name | text | |
| created_at | timestamptz | |

### `threads`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| external_thread_id | text | Email thread ID from provider |
| customer_id | uuid | FK → customers |
| subject | text | |
| state | text | NEW, RESOLVED, etc. |
| last_intent | text | Last classified intent |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `messages`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| thread_id | uuid | FK → threads |
| direction | text | inbound, outbound, internal |
| from_email | text | |
| to_email | text | |
| body_text | text | |
| body_html | text | |
| raw | jsonb | Original payload |
| created_at | timestamptz | |

### `kb_docs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| source | text | notion, manual |
| source_id | text | External ID |
| title | text | |
| body | text | |
| updated_at | timestamptz | |

### `kb_chunks`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| doc_id | uuid | FK → kb_docs |
| chunk_index | int | |
| content | text | |
| embedding | vector(1536) | pgvector |
| created_at | timestamptz | |

### `events`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| thread_id | uuid | FK → threads |
| type | text | auto_triage, shopify_lookup, etc. |
| payload | jsonb | Decision details |
| created_at | timestamptz | |

---

## Intent Taxonomy

| Intent | Implemented | Action |
|--------|-------------|--------|
| FIRMWARE_UPDATE_REQUEST | ✅ | ASK_CLARIFYING_QUESTIONS |
| FIRMWARE_ACCESS_ISSUE | ✅ | ASK_CLARIFYING_QUESTIONS (macro) |
| DOCS_VIDEO_MISMATCH | ✅ | SEND_PREAPPROVED_MACRO |
| INSTALL_GUIDANCE | ❌ | — |
| ORDER_STATUS | ❌ | — |
| ORDER_CHANGE_REQUEST | ❌ | — |
| MISSING_DAMAGED_ITEM | ❌ | — |
| WRONG_ITEM_RECEIVED | ❌ | — |
| FUNCTIONALITY_BUG | ❌ | — |
| COMPATIBILITY_QUESTION | ❌ | — |
| PART_IDENTIFICATION | ✅ | ASK_CLARIFYING_QUESTIONS |
| RETURN_REFUND_REQUEST | ❌ | — |
| CHARGEBACK_THREAT | ✅ | ESCALATE_WITH_DRAFT |
| LEGAL_SAFETY_RISK | ❌ | — |
| THANK_YOU_CLOSE | ✅ | NO_REPLY (→ RESOLVED) |
| FOLLOW_UP_NO_NEW_INFO | ✅ | ASK_CLARIFYING_QUESTIONS |
| UNKNOWN | ✅ | ASK_CLARIFYING_QUESTIONS |

**Classification patterns implemented:** 7 of 17 intents have explicit pattern rules.

---

## Macros

| Macro | Trigger Intent | Description |
|-------|----------------|-------------|
| `macroDocsVideoMismatch(name?)` | DOCS_VIDEO_MISMATCH | Explains video vs actual email discrepancy, asks for unit/order/error |
| `macroFirmwareAccessClarify()` | FIRMWARE_ACCESS_ISSUE | Asks for unit type, error details, order info |

---

## Policy Gate Rules

The `policyGate()` function blocks drafts containing:

| Pattern | Blocks |
|---------|--------|
| `/we guarantee/i` | Guarantee promises |
| `/i guarantee/i` | Guarantee promises |
| `/\bwill refund\b/i` | Refund promises |
| `/\bwe will refund\b/i` | Refund promises |
| `/\bwill replace\b/i` | Replacement promises |
| `/\bwe will replace\b/i` | Replacement promises |
| `/\bwill ship (today\|tomorrow)\b/i` | Shipping timeline promises |
| `/\byou will receive by\b/i` | Delivery date promises |

If any pattern matches, action becomes `ESCALATE_WITH_DRAFT` and reasons are logged.

---

## Thread State Machine

Threads progress through defined states based on actions and intents:

| State | Description | Entry Condition |
|-------|-------------|-----------------|
| `NEW` | Fresh inbound message | Thread created |
| `AWAITING_INFO` | Waiting on customer | Required info missing |
| `IN_PROGRESS` | Draft ready for review | Draft generated successfully |
| `ESCALATED` | Needs human intervention | Chargeback, legal risk, or policy block |
| `RESOLVED` | Issue closed | Thank you message or manual close |

### State Transitions

```
NEW ──────────────────────┬─────────────────────────────────────────────
                          │
    ┌─────────────────────┼─────────────────────────────┐
    │                     │                             │
    ▼                     ▼                             ▼
AWAITING_INFO        IN_PROGRESS                   ESCALATED
(missing info)       (draft ready)              (chargeback/legal)
    │                     │                             │
    │ customer            │                             │
    │ replies             │                             │
    └──────────────► IN_PROGRESS ──────────────────────►│
                          │                             │
                          │ THANK_YOU_CLOSE             │ admin resolves
                          ▼                             ▼
                      RESOLVED ◄────────────────────────┘
```

### Transition Rules

- `THANK_YOU_CLOSE` intent → always `RESOLVED`
- `CHARGEBACK_THREAT` or `LEGAL_SAFETY_RISK` → always `ESCALATED`
- Policy gate blocked → `ESCALATED`
- Missing required info → `AWAITING_INFO`
- Draft generated → `IN_PROGRESS`
- Customer replies to `AWAITING_INFO` → re-evaluate
- `ESCALATED` stays `ESCALATED` until manual resolution

---

## "Do Not Break" Contract (MVP Invariants)

1. **Inbound email ingestion MUST create/update thread and store message**
2. **Intent classification MUST return a valid Intent type**
3. **THANK_YOU_CLOSE MUST result in NO_REPLY and thread state RESOLVED**
4. **Policy gate MUST block drafts with promise language**
5. **All decisions MUST be logged to events table**
6. **Admin UI MUST display threads and messages**
7. **No outbound email sending without human action (copy/paste)**

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server-side only) |
| `SUPABASE_ACCESS_TOKEN` | No | CLI access token for migrations |

---

## Next Milestones (Priority Order)

### Phase 1 (Current Sprint)
1. ✅ MVP ingest + classify + admin UI
2. ✅ Eval harness with regression tests (70 tests across 5 suites)
3. ✅ Required-info gating per intent (wired into ingest route)
4. 🔲 Shopify customer verification (entitlement check)
5. ✅ Thread state machine (NEW, AWAITING_INFO, IN_PROGRESS, ESCALATED, RESOLVED)

### Phase 2
6. 🔲 HubSpot integration (log interactions)
7. 🔲 KB sync from Notion
8. 🔲 Chunk + embed KB docs
9. 🔲 Hybrid retrieval (keyword + vector)
10. 🔲 LLM drafting with citations (gated)

### Phase 3
11. 🔲 Email send automation (with human approval flow)
12. 🔲 Analytics dashboard
13. 🔲 Customer health scoring

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── ingest/email/route.ts    # Email ingestion endpoint
│   │   ├── process/thread/route.ts  # (stub)
│   │   ├── kb/sync/notion/route.ts  # (stub)
│   │   └── webhooks/shopify/route.ts # (stub)
│   └── admin/
│       ├── page.tsx                  # Inbox list
│       └── thread/[id]/page.tsx      # Thread detail
├── lib/
│   ├── db.ts                         # Supabase client
│   ├── config.ts                     # (placeholder)
│   ├── shopify.ts                    # (placeholder)
│   ├── intents/
│   │   ├── taxonomy.ts               # Intent types
│   │   ├── classify.ts               # Rule-based classifier
│   │   ├── rules.ts                  # (placeholder)
│   │   └── requiredInfo.ts           # Required info definitions + checker
│   ├── threads/
│   │   └── stateMachine.ts           # Thread state machine + transitions
│   ├── responders/
│   │   ├── macros.ts                 # Pre-approved response templates
│   │   ├── policyGate.ts             # Promise language detector
│   │   └── draft.ts                  # (placeholder)
│   ├── retrieval/
│   │   ├── search.ts                 # (placeholder)
│   │   ├── chunk.ts                  # (placeholder)
│   │   └── embed.ts                  # (placeholder)
│   └── evals/
│       ├── classify.test.ts          # Intent classification tests
│       ├── policyGate.test.ts        # Policy gate tests
│       ├── requiredInfo.test.ts      # Required info tests
│       ├── stateMachine.test.ts      # State machine tests
│       └── triage.test.ts            # Integration triage tests
supabase/
└── migrations/
    └── 001_init.sql                  # DB schema
```

---

## Changelog

### 2025-01-03 — Initial MVP
- Created Next.js App Router project with TypeScript
- Implemented email ingestion API (`/api/ingest/email`)
- Created rule-based intent classifier (7 patterns)
- Added policy gate for promise detection (8 patterns)
- Created 2 pre-approved macros (DOCS_VIDEO_MISMATCH, FIRMWARE_ACCESS_ISSUE)
- Built admin UI (inbox + thread detail)
- Deployed Supabase schema (customers, threads, messages, kb_docs, kb_chunks, events)
- Pushed to GitHub: https://github.com/squareinnov8/swa-support

### 2025-01-03 — Project Context Documentation
- Created PROJECT_CONTEXT.md with architecture, schema, invariants
- Documented intent taxonomy implementation status
- Documented policy gate rules
- Established "Do Not Break" contract

### 2025-01-03 — Eval Harness + Required-Info Gating
- Added Vitest test framework with 43 regression tests
- Test suites: classify.test.ts, policyGate.test.ts, triage.test.ts, requiredInfo.test.ts
- Implemented required-info gating (`src/lib/intents/requiredInfo.ts`)
  - 9 intents have required field definitions
  - `checkRequiredInfo()` validates presence of required fields
  - `generateMissingInfoPrompt()` creates clarifying questions
- Tests run via `npm run test` (watch) or `npm run test:run` (CI)

### 2025-01-03 — Wired Required-Info Gating into Ingest Route
- Ingest route now checks for required info after intent classification
- If required info is missing, generates clarifying question (uses macro if available)
- Event payload now includes `requiredInfo` object with:
  - `allPresent`: boolean
  - `missingFields`: array of field IDs
  - `presentFields`: array of field IDs
- Chargebacks always escalate regardless of required info (safety)

### 2025-01-03 — Thread State Machine
- Created `src/lib/threads/stateMachine.ts` with 5 states:
  - NEW, AWAITING_INFO, IN_PROGRESS, ESCALATED, RESOLVED
- Added 27 state machine tests (`stateMachine.test.ts`)
- Wired state machine into ingest route:
  - `getNextState()` determines next state from context
  - `getTransitionReason()` provides human-readable explanation
  - Event payload includes `stateTransition` object (from, to, reason)
- Updated admin UI with state badges:
  - Color-coded badges in inbox and thread detail
  - Inbox sorted by priority (ESCALATED first)
  - Thread detail shows state history
- Fixed Next.js 16 params bug in thread detail page
- Total test count: 70 tests across 5 suites
