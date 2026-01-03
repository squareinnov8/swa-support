# PROJECT_CONTEXT.md
> Maintained by Claude Code. Update this file with every significant change.

## Purpose

SquareWheels Support Agent V2 is a production-adjacent customer support system that replaces a Lindy-based agent with a more controlled, observable, and safe architecture. The core philosophy is **software is the system; the LLM is a component** — meaning deterministic triage happens first, pre-approved macros handle common cases, and LLM assistance is gated behind policy checks.

The system prioritizes customer trust safety: no promises (refunds, shipping timelines, guarantees) can be made without explicit human approval. All decisions are logged for audit. The admin inbox allows humans to review and send responses manually (email send automation is future work).

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      INBOUND CHANNELS                            │
├─────────────┬─────────────┬─────────────┬───────────────────────┤
│ Admin Form  │ Email API   │ Chat API    │ Voice API (future)    │
│ /admin/new  │ /api/ingest │ (future)    │                       │
│             │ /email      │             │                       │
└──────┬──────┴──────┬──────┴──────┬──────┴───────────┬───────────┘
       │             │             │                  │
       ▼             ▼             ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                 NORMALIZE TO IngestRequest                       │
│  { channel, subject, body_text, from_identifier, metadata }     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    processIngestRequest()                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Upsert thread (with channel)                         │   │
│  │ 2. Insert message (with channel + metadata)             │   │
│  │ 3. classifyIntent(subject, body) → {intent, confidence} │   │
│  │ 4. Check required info for intent                       │   │
│  │ 5. Decide action + generate draft                       │   │
│  │ 6. policyGate(draft) → block if promises detected       │   │
│  │ 7. Calculate next state (state machine)                 │   │
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
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ kb_docs  │ │kb_chunks │ │kb_import │ │kb_proposed│          │
│  │ (49 docs)│ │(612 vecs)│ │  _jobs   │ │  _docs   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
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
| POST | `/api/ingest/email` | Ingest inbound email (normalizes to IngestRequest) |
| POST | `/api/threads` | Create thread via admin form (channel: web_form) |
| GET | `/admin` | Admin inbox listing threads (sorted by priority) |
| GET | `/admin/new` | Admin form to create new thread manually |
| GET | `/admin/thread/[id]` | Thread detail with messages, draft, and state history |
| **KB Import** | | |
| GET/POST | `/api/admin/import/jobs` | List/create import jobs |
| GET/DELETE | `/api/admin/import/jobs/[id]` | Get job status, cancel job |
| POST | `/api/admin/import/notion/connect` | Initiate Notion OAuth |
| GET | `/api/admin/import/notion/auth` | Notion OAuth callback |
| POST | `/api/admin/import/notion/fetch` | Fetch pages from Notion workspace |
| GET/POST | `/api/admin/import/review` | Review queue operations |
| GET/PUT/POST | `/api/admin/import/review/[id]` | Single doc review actions |
| GET/POST | `/api/admin/import/embed` | Embedding status and batch processing |
| **Admin UI** | | |
| GET | `/admin/kb/import` | KB import dashboard |
| GET | `/admin/kb/import/notion` | Notion import wizard |
| GET | `/admin/kb/import/review` | Review queue for proposed docs |
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
| state | text | NEW, AWAITING_INFO, IN_PROGRESS, ESCALATED, RESOLVED |
| last_intent | text | Last classified intent |
| channel | text | Primary channel: email, web_form, chat, voice |
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
| channel | text | Channel this message came from |
| channel_metadata | jsonb | Channel-specific data (headers, session info, etc.) |
| created_at | timestamptz | |

### `kb_docs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| source | text | notion, manual |
| source_id | text | External ID |
| source_url | text | Original URL |
| title | text | |
| body | text | Full markdown content |
| category_id | uuid | FK → kb_categories |
| intent_tags | text[] | Intent associations |
| vehicle_tags | text[] | Vehicle filtering |
| product_tags | text[] | Product filtering |
| evolution_status | text | draft, published, archived |
| import_job_id | uuid | FK → kb_import_jobs |
| imported_from | uuid | FK → kb_proposed_docs |
| updated_at | timestamptz | |

### `kb_chunks`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| doc_id | uuid | FK → kb_docs |
| chunk_index | int | |
| content | text | Chunk text |
| embedding | vector(1536) | OpenAI text-embedding-3-small |
| created_at | timestamptz | |

### `kb_import_jobs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| source | text | notion, gmail |
| status | text | pending, running, completed, failed |
| total_items | int | Total pages/threads found |
| processed_items | int | Items processed |
| approved_items | int | Items approved to KB |
| config | jsonb | Source-specific config |
| created_at | timestamptz | |

### `kb_proposed_docs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| import_job_id | uuid | FK → kb_import_jobs |
| source | text | notion, gmail |
| source_id | text | External page/thread ID |
| title | text | |
| body | text | |
| suggested_category_id | uuid | LLM suggestion |
| suggested_intent_tags | text[] | LLM suggestion |
| categorization_confidence | real | 0.0-1.0 |
| content_quality_score | real | 0.0-1.0 |
| status | text | pending, approved, rejected |
| published_doc_id | uuid | FK → kb_docs (if approved) |
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

## Current Status

### KB Stats (as of 2025-01-03)
| Metric | Count |
|--------|-------|
| Published KB docs | 49 |
| KB chunks with embeddings | 612 |
| Docs pending review | ~40 |
| Import jobs completed | 1 (Notion) |

### Support Agent Capabilities
- ✅ Semantic search (pgvector, cosine similarity)
- ✅ Intent-based retrieval (deterministic lookup)
- ✅ Hybrid retrieval (combines intent + semantic + keyword)
- ✅ LLM draft generation with KB citations
- ✅ Policy gate enforcement (no promises)
- ✅ State machine workflow (5 states)

---

## Next Milestones (Priority Order)

### Phase 1 — Core Pipeline ✅ COMPLETE
1. ✅ MVP ingest + classify + admin UI
2. ✅ Eval harness with regression tests (82 tests across 6 suites)
3. ✅ Required-info gating per intent (wired into ingest route)
4. ✅ Thread state machine (NEW, AWAITING_INFO, IN_PROGRESS, ESCALATED, RESOLVED)

### Phase 2 — KB & RAG ✅ COMPLETE
5. ✅ KB import from Notion (LLM-assisted categorization)
6. ✅ Review queue for proposed docs
7. ✅ Chunk + embed KB docs (text-embedding-3-small, 1536 dims)
8. ✅ Hybrid retrieval (intent + semantic + keyword)
9. ✅ LLM drafting with citations (OpenAI gpt-4o-mini)

### Phase 3 — Production Readiness (Current)
10. 🔲 Shopify customer verification (entitlement check)
11. 🔲 Gmail import (historical support threads)
12. 🔲 Finish reviewing remaining ~40 proposed docs
13. 🔲 HubSpot integration (log interactions)

### Phase 4 — Automation
14. 🔲 Email send automation (with human approval flow)
15. 🔲 Analytics dashboard
16. 🔲 Customer health scoring
17. 🔲 Confidence-based auto-approval (>85% threshold)

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── ingest/email/route.ts      # Email ingestion
│   │   ├── threads/route.ts           # Create thread from admin form
│   │   ├── admin/import/
│   │   │   ├── jobs/route.ts          # Import job CRUD
│   │   │   ├── jobs/[id]/route.ts     # Single job operations
│   │   │   ├── notion/
│   │   │   │   ├── connect/route.ts   # OAuth initiation
│   │   │   │   ├── auth/route.ts      # OAuth callback
│   │   │   │   └── fetch/route.ts     # Fetch Notion pages
│   │   │   ├── gmail/                 # Gmail import (similar structure)
│   │   │   ├── review/route.ts        # Review queue operations
│   │   │   ├── review/[id]/route.ts   # Single doc review
│   │   │   └── embed/route.ts         # Chunking & embedding API
│   │   └── webhooks/shopify/route.ts  # (stub)
│   └── admin/
│       ├── page.tsx                   # Inbox list
│       ├── new/page.tsx               # New thread form
│       ├── thread/[id]/page.tsx       # Thread detail
│       └── kb/import/
│           ├── page.tsx               # Import dashboard
│           ├── notion/page.tsx        # Notion wizard
│           ├── gmail/page.tsx         # Gmail wizard
│           └── review/page.tsx        # Review queue UI
├── lib/
│   ├── db.ts                          # Supabase client
│   ├── config.ts                      # App configuration
│   ├── ingest/
│   │   ├── types.ts                   # Channel, IngestRequest, IngestResult
│   │   └── processRequest.ts          # Core processing logic
│   ├── intents/
│   │   ├── taxonomy.ts                # Intent types
│   │   ├── classify.ts                # Rule-based classifier
│   │   └── requiredInfo.ts            # Required info checker
│   ├── threads/
│   │   └── stateMachine.ts            # Thread state machine
│   ├── responders/
│   │   ├── macros.ts                  # Pre-approved templates
│   │   └── policyGate.ts              # Promise language detector
│   ├── retrieval/
│   │   ├── search.ts                  # Hybrid search orchestrator
│   │   ├── semanticSearch.ts          # pgvector similarity search
│   │   ├── intentLookup.ts            # Deterministic intent lookup
│   │   ├── chunk.ts                   # Markdown-aware chunking
│   │   └── embed.ts                   # OpenAI embeddings
│   ├── llm/
│   │   ├── client.ts                  # OpenAI client (gpt-4o-mini)
│   │   ├── prompts.ts                 # System/user prompts
│   │   └── draftGenerator.ts          # Draft with KB retrieval
│   ├── import/
│   │   ├── types.ts                   # ImportJob, ProposedDoc types
│   │   ├── analyze.ts                 # LLM categorization
│   │   ├── confidence.ts              # Confidence scoring
│   │   ├── review.ts                  # Review queue operations
│   │   ├── notion/                    # Notion import modules
│   │   └── gmail/                     # Gmail import modules
│   ├── kb/
│   │   ├── types.ts                   # KBDoc, KBChunk types
│   │   ├── categories.ts              # Category operations
│   │   ├── documents.ts               # Doc CRUD
│   │   └── embedDocs.ts               # CLI embedding script
│   └── evals/
│       ├── classify.test.ts           # Intent tests
│       ├── policyGate.test.ts         # Policy gate tests
│       ├── requiredInfo.test.ts       # Required info tests
│       ├── stateMachine.test.ts       # State machine tests
│       ├── ingest.test.ts             # Multi-channel tests
│       └── confidence.test.ts         # Confidence scoring tests
supabase/
└── migrations/
    ├── 001_init.sql                   # Initial schema
    ├── 002_add_channel.sql            # Channel columns
    ├── 003_kb_enhancement.sql         # KB categories, tags
    ├── 004_draft_tracking.sql         # Draft logging
    ├── 005_vector_search_function.sql # match_kb_chunks RPC
    └── 006_kb_import.sql              # Import jobs, proposed docs
```

---

## Changelog

### 2025-01-03 — KB Ingestion Pipeline & Semantic Search
- **Notion Import Pipeline**
  - OAuth integration with `@notionhq/client` SDK
  - Markdown conversion via `notion-to-md`
  - LLM-assisted categorization (OpenAI gpt-4o-mini)
  - Confidence scoring for auto-approve threshold
  - Imported 131 pages, 88 processed → 49 published
- **Review Queue**
  - Admin UI for approving/rejecting proposed docs
  - Edit title, body, category, tags before publishing
  - Bulk approve/reject operations
- **Chunking & Embedding**
  - Markdown-aware chunking with section preservation (1000 char max, 200 overlap)
  - Fixed infinite loop bug in chunker that caused OOM
  - OpenAI text-embedding-3-small (1536 dimensions)
  - API endpoint for batch processing (`/api/admin/import/embed`)
  - 612 chunks created from 49 published docs
- **Semantic Search**
  - pgvector extension for cosine similarity
  - `match_kb_chunks` RPC function for vector search
  - Hybrid retrieval combining intent + semantic + keyword
- **LLM Draft Generation**
  - KB-grounded responses with `[KB: Article Title]` citations
  - Policy gate enforcement (no promises)
  - Tested with warranty, troubleshooting, installation queries
- **Database Migrations**
  - `003_kb_enhancement.sql` - Categories, tags, evolution status
  - `004_draft_tracking.sql` - Draft logging for audit
  - `005_vector_search_function.sql` - match_kb_chunks RPC
  - `006_kb_import.sql` - Import jobs, proposed docs tables

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

### 2025-01-03 — Multi-Channel Ingestion System
- Created channel-agnostic ingestion architecture:
  - `src/lib/ingest/types.ts` - Channel, IngestRequest, IngestResult types
  - `src/lib/ingest/processRequest.ts` - Core processing logic
- Added database migration `002_add_channel.sql`:
  - `threads.channel` - Primary channel for thread
  - `messages.channel` - Channel per message
  - `messages.channel_metadata` - JSONB for channel-specific data
- Refactored `/api/ingest/email` to use shared `processIngestRequest()`
- Created admin form for manual thread creation:
  - `/admin/new` - Form page (client component)
  - `POST /api/threads` - API endpoint (channel: web_form)
  - "New Thread" button added to inbox
- Supported channels: email, web_form, chat (future), voice (future)
- Added 12 ingest tests (`ingest.test.ts`)
- Total test count: 82 tests across 6 suites
