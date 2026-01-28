# CLAUDE.md - Support Agent v2 (Lina)

This file provides guidance to Claude Code when working with this codebase.

## Project Overview

**Lina** is an AI-powered customer support agent for SquareWheels Auto, a hardware company selling automotive tuning products (APEX, G-Series, Cluster). The system monitors Gmail for support emails, classifies intents using LLM, retrieves relevant KB articles via hybrid search, and generates draft responses for human review.

**Production URL**: https://support-agent-v2.vercel.app/
**Owner**: Rob (rob@squarewheelsauto.com) - handles escalations and feedback

## Common Commands

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest tests
npm run test:run     # Run tests once (215 tests)

# Database
npx supabase db push --linked    # Push migrations to production

# Data scripts
npm run seed:kb      # Seed knowledge base
npm run embed:kb     # Generate embeddings for KB docs
npm run sync:catalog # Sync Shopify product catalog

# Catalog documentation ingestion (from catalog-refresh project)
npx tsx scripts/ingest-catalog-docs-vision.ts  # Extract installation guides via GPT-4o Vision
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL + pgvector)
- **LLM**: OpenAI GPT-4o-mini (classification, extraction) + Anthropic Claude (drafts)
- **Embeddings**: OpenAI text-embedding-3-small
- **Deployment**: Vercel
- **Integrations**: Gmail API, YouTube Data API, Shopify Admin API, HubSpot CRM

### LLM-First Architecture (Jan 2026)

All inference-based decisions use LLM rather than hardcoded regex patterns. This enables:
- **Multi-language support** - Works in any language the customer writes in
- **Context-aware detection** - Understands nuance and phrasing variations
- **No keyword maintenance** - No need to add new keywords for new query types

**LLM-powered components:**
| Component | File | Purpose |
|-----------|------|---------|
| Intent Classification | `llmClassify.ts` | Classify customer messages into 17+ intents |
| Missing Info Detection | `llmClassify.ts` | Identify what info is needed to help customer |
| Vehicle Extraction | `vehicleDetector.ts` | Extract year/make/model from any phrasing |
| Promise Detection | `promisedActions.ts` | Detect commitments in draft responses |
| **All Email Generation** | `contextualEmailGenerator.ts` | Customer outreach, vendor forwarding, escalations, apologies |

**Pre-LLM filters (still use patterns for efficiency):**
- `checkAutomatedEmail()` in `classify.ts` - Filters platform notifications before LLM call
- `policyGate()` in `policyGate.ts` - Safety rules for draft content (MUST stay deterministic)

### Directory Structure

```
src/
├── app/
│   ├── admin/              # Admin UI (inbox, KB, instructions)
│   │   ├── page.tsx        # Main inbox view (with search & filters)
│   │   ├── thread/[id]/    # Thread detail view
│   │   ├── orders/         # Order management UI
│   │   ├── vendors/        # Vendor management UI
│   │   ├── learning/       # Learning proposals review UI
│   │   ├── kb/             # Knowledge base management
│   │   ├── instructions/   # Agent instruction editor
│   │   └── gmail-setup/    # Gmail OAuth setup
│   └── api/
│       ├── agent/poll/     # Gmail polling endpoint (cron)
│       ├── admin/          # Admin APIs (settings, KB, chat, learning, orders, vendors)
│       ├── ingest/email/   # Email ingestion endpoint
│       ├── gmail/          # Gmail watch management
│       └── webhooks/       # Shopify + Gmail push webhooks
├── lib/
│   ├── ingest/             # Core ingestion pipeline
│   │   └── processRequest.ts   # Main processing logic
│   ├── intents/            # Intent classification
│   │   ├── taxonomy.ts     # Intent definitions (17 intents)
│   │   ├── classify.ts     # Automated email detection only
│   │   ├── llmClassify.ts  # LLM-based classification + missing info
│   │   └── missingInfoPrompt.ts # Generate clarifying question prompts
│   ├── catalog/            # Product catalog
│   │   ├── vehicleDetector.ts  # LLM-based vehicle extraction
│   │   └── lookup.ts       # Product fitment lookup
│   ├── llm/                # LLM integration
│   │   ├── client.ts       # OpenAI client wrapper
│   │   ├── prompts.ts      # System/user prompts
│   │   ├── draftGenerator.ts   # Draft generation with Claude
│   │   ├── contextualEmailGenerator.ts # LLM-generated emails (no templates)
│   │   ├── linaTools.ts    # Admin chat tools (KB, instructions, relay)
│   │   └── linaToolExecutor.ts # Tool execution logic
│   ├── context/            # Unified Lina context
│   │   ├── types.ts        # LinaContext, PendingAction interfaces
│   │   ├── builder.ts      # buildLinaContext() aggregator
│   │   ├── adminDecisions.ts # Extract decisions from lina_tool_actions
│   │   └── pendingActions.ts # Set/clear/get pending actions
│   ├── instructions/       # Dynamic agent instructions
│   │   └── index.ts        # Load from database
│   ├── kb/                 # Knowledge base
│   │   ├── documents.ts    # CRUD operations
│   │   └── embedDocs.ts    # Embedding generation
│   ├── retrieval/          # Hybrid search (vector + keyword)
│   ├── gmail/              # Gmail monitoring
│   │   ├── monitor.ts      # Polling and sync
│   │   ├── watch.ts        # Push notification watch management
│   │   └── sendDraft.ts    # Send approved drafts via Gmail
│   ├── shopify/            # Shopify integration
│   ├── hubspot/            # HubSpot CRM sync
│   ├── verification/       # Customer/order verification
│   ├── collaboration/      # Human-AI collaboration
│   │   ├── observationMode.ts  # Watch human handle tickets
│   │   └── learningGenerator.ts # Generate learning proposals
│   ├── learning/           # Learning extraction from resolved threads
│   │   └── resolutionAnalyzer.ts # Analyze dialogues for learnings
│   ├── threads/            # Thread state machine
│   │   ├── stateMachine.ts # State transitions
│   │   ├── archiveThread.ts # Archive/unarchive logic
│   │   ├── staleHumanHandling.ts # Return stuck threads to Lina
│   │   └── clarificationLoopDetector.ts # Detect repeated questions
│   ├── orders/             # Order management
│   │   ├── types.ts        # Order/vendor types
│   │   ├── ingest.ts       # Parse order emails, DB operations
│   │   ├── processOrder.ts # Main order processing pipeline
│   │   └── vendorCoordination.ts # Vendor-customer communication
│   ├── vendors/            # Vendor lookup
│   │   ├── types.ts        # Vendor types
│   │   └── lookup.ts       # Find vendor for product
│   └── responders/         # Policy gate, macros, promise detection
│       ├── policyGate.ts   # Safety rules (deterministic)
│       ├── promisedActions.ts # LLM-based promise detection
│       └── macros.ts       # Pre-approved response templates
├── scripts/
│   ├── ingest-catalog-docs-vision.ts # Installation guide extraction via GPT-4o Vision
│   ├── ingest-youtube-comments-api.ts # YouTube Q&A extraction
│   ├── seed-vendors.ts     # Seed vendor data
│   └── test-classify.ts    # Test LLM classification
└── supabase/
    └── migrations/         # Database migrations (001-038)
```

### Key Data Flow

1. **Gmail Poll** (`/api/agent/poll`) → `runGmailMonitor()`
2. **Ingest** → `processIngestRequest()` in `lib/ingest/processRequest.ts`
3. **Filter** → `checkAutomatedEmail()` filters platform notifications
4. **Classify** → `classifyWithLLM()` determines intent + missing info
5. **Verify** → `verifyCustomer()` for protected intents (orders)
6. **Retrieve** → `hybridSearch()` finds relevant KB docs + catalog products
7. **Generate** → `generateDraft()` creates response with Claude
8. **Track** → `trackPromisedActions()` detects commitments in draft
9. **Gate** → `policyGate()` checks for banned language
10. **State** → `getNextState()` transitions thread state

### Thread States
- `NEW` → `AWAITING_INFO` → `IN_PROGRESS` → `RESOLVED`
- `ESCALATED` - requires human intervention
- `HUMAN_HANDLING` - agent is observing, human is responding

### Key Database Tables

**Support:**
- `threads` - Support conversations (with archive support)
- `messages` - Individual messages
- `events` - Audit log of all actions
- `intents` - Dynamic intent definitions
- `thread_intents` - Classified intents per thread

**Knowledge & Learning:**
- `kb_docs` / `kb_chunks` - Knowledge base with embeddings
- `agent_instructions` - Dynamic Lina behavior rules
- `learning_proposals` - AI-generated KB/instruction proposals
- `resolution_analyses` - Learning extraction from resolved threads
- `lina_tool_actions` - Audit log of Lina's tool actions from admin chat

**Integrations:**
- `gmail_sync_state` - OAuth tokens and sync state
- `customers` - Customer records synced from Shopify
- `products` / `product_fitment` - Product catalog with vehicle compatibility

**Order Management:**
- `orders` - Order records from Shopify notifications
- `order_vendors` - Per-vendor fulfillment tracking for multi-vendor orders
- `order_events` - Order activity audit log
- `blacklisted_customers` - Customers blocked from fulfillment
- `vendors` - Vendor contacts and product patterns (managed via `/admin/vendors`)
- `vendor_requests` - Tracks vendor requests for customer info (photos, confirmations)

## Environment Variables

Required in `.env` (and Vercel):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=              # For embeddings + classification
GOOGLE_CLIENT_ID=            # Gmail OAuth + Admin Auth
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=         # Gmail: /api/admin/import/gmail/auth
GOOGLE_ADMIN_REDIRECT_URI=   # Admin: /api/auth/callback
ADMIN_SESSION_SECRET=        # JWT signing (or uses SUPABASE_SERVICE_ROLE_KEY)
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ACCESS_TOKEN=
YOUTUBE_API_KEY=             # Optional: for YouTube Q&A ingestion
```

## Recent Changes (Jan 2026)

### Completed
- [x] Gmail monitoring with OAuth and polling
- [x] Intent classification (17 intents via LLM)
- [x] KB-powered draft generation with Claude
- [x] Customer verification via Shopify
- [x] Policy gate for banned language
- [x] Human collaboration mode (observation/learning)
- [x] Dynamic agent instructions from database
- [x] Admin chat with Lina (persisted conversations)
- [x] Thread summaries for CRM syndication
- [x] Unified prompts (single source of truth in database)
- [x] Admin authentication with Google OAuth (JWT sessions)
- [x] Resolve & Archive with auto-learning extraction
- [x] Learning proposals review UI (`/admin/learning`)
- [x] Inbox search (subject + summary) and archive filters
- [x] **Auto-send feature** - Automatic draft sending based on confidence threshold
- [x] **Dynamic Learning via Admin Chat** - Lina takes real actions (create KB, update instructions)
- [x] **HUMAN_HANDLING timeout** - Threads stuck 48+ hours auto-return to Lina
- [x] **Promised Action Tracking** - LLM-based detection of commitments in drafts
- [x] **YouTube Q&A Ingestion** - Extract Q&A pairs from YouTube comments (629 pairs from 14 videos)
- [x] **LLM-First Architecture** - Removed 500+ regex patterns, all inference uses LLM:
  - Intent classification via `classifyWithLLM()` (replaces regex fallback)
  - Missing info detection via LLM (replaces `checkRequiredInfo()` regex)
  - Vehicle extraction via LLM (replaces hardcoded make/model lists)
  - Promise detection via LLM (replaces 30+ regex patterns)
- [x] **Catalog Lookup** - Auto-includes compatible products when customer mentions vehicle
- [x] **Order Management** - Automated order processing and vendor routing:
  - Detects Shopify order confirmation emails (`[squarewheels] Order #XXXX placed by`)
  - Customer blacklist checking with risk assessment
  - Vendor routing via product pattern matching
  - Email forwarding to vendors via Gmail API
  - Separate `/admin/orders` view with status tracking
  - Support for multi-vendor orders (split forwarding)
- [x] **Vendor Management** - Admin UI at `/admin/vendors`:
  - CRUD operations for vendor contacts and product patterns
  - No longer requires public Google Sheet
  - Seed script: `npx tsx scripts/seed-vendors.ts`
- [x] **Stale HUMAN_HANDLING on Webhook** - Threads stuck 48+ hours now checked on every Gmail push (not just daily poll)
- [x] **Catalog Documentation Ingestion (Vision)** - Real installation instructions via GPT-4o Vision:
  - 42 installation guides with actual wiring diagrams, steps, tips (~2,500 chars each)
  - Extracts from image-based PDFs using vision API
  - Covers: Audi, Bentley, Cadillac, Chevy, Chrysler, Dodge, Ford, Infiniti, Jeep, Land Rover, Maserati, Nissan, Toyota
  - Script: `npx tsx scripts/ingest-catalog-docs-vision.ts`
- [x] **Admin Chat Tool: return_thread_to_agent** - Lina can now unblock tickets stuck in HUMAN_HANDLING
- [x] **Lina Honesty Requirements** - Explicit rules preventing Lina from claiming actions she didn't take

- [x] **Vendor Coordination (Phase 3 & 4)** - Bi-directional vendor-customer communication:
  - Detects vendor replies to order threads
  - LLM-based parsing of vendor requests (photos, color/memory confirmations)
  - Automatic customer outreach for vendor requests
  - Photo validation using GPT-4o Vision
  - Forwards validated customer responses to vendors
  - Database: `vendor_requests` table tracks request lifecycle
  - Module: `src/lib/orders/vendorCoordination.ts`
- [x] **Internal Email Handling** - Proper handling of admin/internal emails:
  - Emails from internal addresses (rob@, support@) detected via `isInternal` flag
  - Forwarded vendor emails extracted and processed through vendor coordination
  - Order matching by order number in subject (for forwarded emails creating new threads)
  - Internal emails without external sender treated as admin notes (no draft generated)
- [x] **LLM-Generated Emails (No Templates)** - All emails now generated by LLM:
  - Customer outreach (vendor info requests)
  - Vendor forwarding (customer responses with attachments)
  - Escalation notices
  - Stale thread apologies
  - Clarification loop escalations
  - Module: `src/lib/llm/contextualEmailGenerator.ts`
  - Follows agent instructions from database for consistent tone
- [x] **Photo Forwarding to Vendors** - Customer photos/attachments now properly forwarded:
  - Updated `replyToVendorThread` to support MIME multipart attachments
  - Dashboard photos, documents forwarded to vendors for visual confirmation
- [x] **Message Deduplication** - Prevents duplicate message inserts:
  - Unique index on `gmail_message_id` (migration 034)
  - Handles race conditions from concurrent webhook calls
- [x] **Customer Response Routing** - Improved matching for vendor coordination:
  - Gmail thread ID matching against `customer_outreach_thread_id`
  - Better logging for debugging routing failures
  - Migration 035 adds tracking columns to orders table
- [x] **Unified LinaContext System** - Single context aggregator for all Lina operations:
  - `buildLinaContext()` aggregates thread, messages, admin decisions, order data, customer history
  - Admin decisions extracted from `lina_tool_actions` table
  - Used in admin chat for informed tool execution and email generation
  - Module: `src/lib/context/`
- [x] **Auto-Send Vendor Forwards** - Vendor emails sent immediately without manual approval:
  - `draft_relay_response` with `recipient_override` auto-sends via Gmail
  - Low-risk since vendor emails are not customer-facing
  - Sets pending action to track waiting for vendor response
- [x] **Pending Action Tracking** - Track what Lina is waiting for per thread:
  - JSONB `pending_action` column on threads table (migration 036)
  - Types: `awaiting_vendor_response`, `awaiting_customer_photos`, `awaiting_customer_confirmation`, `awaiting_admin_decision`
  - Helper functions in `src/lib/context/pendingActions.ts`
- [x] **Shopify Fulfillment Integration** - Full fulfillment lifecycle:
  - Create fulfillment when forwarding order to vendor (via `createFulfillment`)
  - Update tracking when vendor provides tracking number (via `addTrackingToOrder`)
  - Customer notification with tracking info sent via Shopify
  - Migration 037 adds `shopify_fulfillment_id` to orders table
  - Mutations: `fulfillmentCreate`, `fulfillmentTrackingInfoUpdateV2`
- [x] **Vendor Response Recognition in Drafts** - Lina now treats vendor confirmations as authoritative:
  - Conversation history includes `from_email` to detect vendor messages
  - Vendor messages labeled as "Vendor (name)" instead of "Customer"
  - Prompt guidance tells Lina to trust vendor responses as definitive answers
  - Fixes issue where Lina ignored vendor confirmations and said she needed to check
- [x] **Thread Titles for Inbox** - Brief, scannable titles instead of email subjects:
  - LLM generates 3-6 word titles capturing thread essence
  - Format: "prospect: military discount, jeep compatibility" or "order #4094: tracking"
  - Generated during initial processing, stored in `title` column
  - Inbox displays title with subject as secondary info
  - Backfill script: `npx tsx scripts/backfill-thread-titles.ts`
  - Migration 038 adds title column

### Pending / Outstanding
- [ ] **Phase 2: LLM Risk Assessment** - Use LLM to assess customer risk based on order history
- [ ] Rate limiting on API endpoints

## Tech Debt & Known Issues

### High Priority
1. **Gmail OAuth token in database** - Should be encrypted at rest
2. **Hardcoded support email** - `support@squarewheelsauto.com` in several places

### Medium Priority
3. **Lint warnings** - Several unused `err` variables and React hook dependency warnings
4. **Date.now() in render** - `src/app/admin/page.tsx:42` calls impure function during render

### Low Priority
5. **Error boundaries** - No React error boundaries in admin UI
6. **Mobile responsiveness** - Admin UI not optimized for mobile

## Agent Behavior (Lina)

Instructions are stored in `agent_instructions` table with sections:
- `persona` - Who Lina is
- `truthfulness` - NEVER make up information
- `core_rules` - Safety rules (no promises, no legal advice)
- `tone_style` - Voice and signoff ("– Lina")
- `escalation_context` - When/how to escalate to Rob

**Key rules:**
- Never promise refunds, replacements, or shipping times
- Always cite KB sources when making claims
- Sign off as "– Lina"
- Escalate chargebacks and flagged customers to Rob

## Intent Classification

Classification uses LLM via `classifyWithLLM()` in `llmClassify.ts`. Returns:

```typescript
interface ClassificationResult {
  intents: Array<{ slug: string; confidence: number; reasoning: string }>;
  primary_intent: string;
  requires_verification: boolean;  // Need to verify customer identity?
  auto_escalate: boolean;          // Should escalate to human?
  missing_info: Array<{            // What info do we need?
    id: string;
    label: string;
    required: boolean;
  }>;
  can_proceed: boolean;            // Have enough info to respond?
}
```

**Intent Categories:**
- **Order**: ORDER_STATUS, ORDER_CHANGE_REQUEST, RETURN_REFUND_REQUEST, MISSING_DAMAGED_ITEM, WRONG_ITEM_RECEIVED
- **Product**: PRODUCT_SUPPORT, COMPATIBILITY_QUESTION, PART_IDENTIFICATION, FUNCTIONALITY_BUG
- **Firmware**: FIRMWARE_UPDATE_REQUEST, FIRMWARE_ACCESS_ISSUE
- **Docs**: DOCS_VIDEO_MISMATCH, INSTALL_GUIDANCE
- **Escalation**: CHARGEBACK_THREAT, LEGAL_SAFETY_RISK
- **Low Priority**: FOLLOW_UP_NO_NEW_INFO, THANK_YOU_CLOSE, VENDOR_SPAM

## Vehicle Detection

Vehicle extraction uses LLM via `detectVehicle()` in `vehicleDetector.ts`:

```typescript
const vehicle = await detectVehicle("I have a 2019 Q50 Red Sport");
// { year: 2019, make: "Infiniti", model: "Q50", trim: "Red Sport", confidence: 0.95 }
```

When a vehicle is detected with sufficient confidence, the draft generator automatically includes compatible products from the catalog.

## Auto-Send Feature

Lina can automatically send drafts without human approval when conditions are met.

**Settings** (in `agent_settings` table):
- `auto_send_enabled` - Master toggle (default: false)
- `auto_send_confidence_threshold` - Base threshold (default: 0.85)
- `require_verification_for_send` - Require verification for order intents (default: true)

**Intent-based thresholds:**
| Intent Type | Confidence | Verification |
|-------------|------------|--------------|
| Order-related | 0.85+ | Required |
| General product questions | 0.60+ | Not required |
| Greetings/UNKNOWN | 0.40+ | Not required |
| Escalations | Never auto-sent | N/A |

## Promised Action Tracking

Drafts are scanned for commitments using LLM-based detection.

**Categories:** refund, shipping, replacement, follow_up, confirmation, timeline

**How it works:**
1. After draft generation, `trackPromisedActions()` analyzes the draft
2. LLM identifies any commitments/promises made
3. Events logged to `events` table with `type: "promised_action"`
4. Simple keyword fallback when LLM unavailable

**Key files:**
- `src/lib/responders/promisedActions.ts` - Detection + logging
- `src/lib/evals/promisedActions.test.ts` - 21 tests

## Dynamic Learning via Admin Chat

Lina takes real actions during admin chat sessions.

**Available Tools:**
1. `lookup_order` - Look up order details from Shopify by order number
2. `associate_thread_customer` - Link thread to a customer after order lookup
3. `return_thread_to_agent` - Return thread from HUMAN_HANDLING back to agent
4. `create_kb_article` - Create new KB articles
5. `update_instruction` - Update agent behavior rules
6. `draft_relay_response` - Draft response to relay Rob's answers
7. `note_feedback` - Acknowledge feedback without changes

**Audit Trail:** All actions logged to `lina_tool_actions` table.

**Honesty Requirements:** Lina must never claim to have taken an action unless the corresponding tool call succeeded. If she lacks a capability, she'll ask Rob to add it.

## Unified Context System

All Lina operations now use a unified context aggregator for consistent, informed decision-making.

**LinaContext structure:**
```typescript
interface LinaContext {
  thread: ThreadContext;       // Thread ID, subject, state, pending action
  messages: ThreadMessage[];   // Conversation history
  adminDecisions: AdminDecision[]; // Decisions from lina_tool_actions
  customer?: CustomerInfo;     // Name, email, order count
  order?: ShopifyOrderContext; // Order status, tracking, items
  customerHistory?: CustomerHistory; // Previous tickets, orders
}
```

**How it's used:**
1. Admin chat builds context before tool execution via `buildLinaContext()`
2. Context passed to `executeLinaTool()` for informed email generation
3. Formatted context included in system prompt for Lina awareness

**Pending Action Tracking:**
Threads can have a pending action indicating what Lina is waiting for:
- `awaiting_vendor_response` - Sent email to vendor, waiting for reply
- `awaiting_customer_photos` - Asked customer for photos
- `awaiting_customer_confirmation` - Waiting for customer to confirm something
- `awaiting_admin_decision` - Escalated, waiting for Rob

**Key files:**
- `src/lib/context/builder.ts` - Main context aggregator
- `src/lib/context/pendingActions.ts` - Set/clear/get pending actions
- `src/lib/context/adminDecisions.ts` - Extract decisions from audit log

## Order Management

Lina automatically processes Shopify order confirmation emails and routes them to vendors.

### Order Flow
1. **Detection** - Gmail webhook receives email with subject `[squarewheels] Order #XXXX placed by`
2. **Parsing** - Extract order details: customer info, shipping address, products
3. **Blacklist Check** - Check if customer email is blacklisted
4. **High-Value Check** - Flag orders > $3,000 for manual review
5. **Vendor Matching** - Match products to vendors via product patterns
6. **Forwarding** - Forward order email to vendor contact(s) via Gmail API
7. **Tracking** - Create `order_vendors` records for fulfillment tracking

### Vendor Management
Vendors are managed at `/admin/vendors`. Each vendor has:
- **Contact Emails** - Where to forward orders
- **Product Patterns** - Text patterns to match products (e.g., "G-Series", "Hawkeye")
- **Instructions** - Optional notes for new orders, cancellations, escalations

### Order Statuses
- `new` - Just received
- `pending_review` - Flagged for manual review (blacklist, high value)
- `processing` - Forwarded to vendor(s)
- `fulfilled` - Vendor confirmed
- `shipped` - Tracking number received
- `delivered` - Delivered to customer

### Vendor Coordination Flow
When vendors need additional information from customers (photos, confirmations), the system handles bi-directional communication:

1. **Vendor Reply Detection** - Gmail monitor detects replies from known vendor emails
2. **Request Parsing** - LLM extracts request types: `dashboard_photo`, `color_confirmation`, `memory_confirmation`, `address_validation`, `vehicle_confirmation`
3. **Customer Outreach** - Automatic email sent to customer requesting the information
4. **Response Processing** - When customer replies:
   - Attachments downloaded and stored
   - Photos validated via GPT-4o Vision (checks for dashboard visibility)
   - Text responses parsed for confirmation answers
5. **Vendor Forwarding** - Validated responses forwarded to vendor with attachments

**Database:** `vendor_requests` table tracks each request through its lifecycle:
- `pending` → `received` → `validated` → `forwarded`

## YouTube Q&A Knowledge Base

Customer questions from YouTube comments are extracted and embedded into the KB.

**Ingestion script:** `scripts/ingest-youtube-comments-api.ts`

```bash
YOUTUBE_API_KEY=xxx npx tsx scripts/ingest-youtube-comments-api.ts
```

**Stats:** 629 Q&A pairs from 14 videos, 1324 embedded chunks

## Catalog Documentation Ingestion

Installation guides and product documentation from the `catalog-refresh` project are ingested into the KB using GPT-4o Vision to extract actual instructions from image-based PDFs.

**Ingestion script:** `scripts/ingest-catalog-docs-vision.ts`

```bash
npx tsx scripts/ingest-catalog-docs-vision.ts
npm run embed:kb  # Generate embeddings after ingestion
```

**How it works:**
1. Converts PDF pages to images using `pdf-to-img`
2. Sends images to GPT-4o Vision API
3. Extracts structured installation instructions
4. Creates KB articles with real content

**What each guide contains:**
- Tools required
- Pre-installation notes and warnings
- Removal steps for factory units
- Detailed installation steps
- Wiring/connection diagrams (Type 1, 2, 3 connector mappings)
- Component lists (harnesses, antennas, adapters)
- Post-installation testing steps
- Tips and common issues

**Source:** `/Users/robertramsay/projects/catalog-refresh/data/assets/`

**Stats:** 42 installation guides with ~2,500 chars each, 23 product articles, ~850 embedded chunks

**Covered vehicles:**
- Audi R8, Bentley Continental GT
- Cadillac ATS/XTS/SRX/CTS, Escalade
- Chevrolet Colorado, Silverado, Tahoe
- Chrysler 300C, Dodge Challenger/Durango/RAM
- Ford F150/F250/F350, Expedition, Explorer, Mustang, Mondeo
- Infiniti G37, Q50/Q60
- Jeep Cherokee, Grand Cherokee, Wrangler/Gladiator
- Land Rover Discovery 4
- Maserati Gran Turismo
- Nissan 350Z, 370Z, GTR, Titan
- Toyota Tacoma, Tundra

**Example content** (Ford F150 wiring):
```
## Wiring/Connections
- **Type 1 Connection:** Connectors A-a, B-b, C-2, D-3, E-5
- **Type 2 Connection:** Connectors A-5, B-3, C-2, D-b, E-a, d-6
- **Type 3 Connection:** Connectors A-5, B-3, C-9, D-2, E-7, a-11
```

**Cost note:** Vision extraction uses GPT-4o API calls (~$0.01-0.03 per PDF). Run selectively for new guides.

## Testing

```bash
npm run test              # Watch mode
npm run test:run          # Single run (215 tests)

# Specific test files
npx vitest src/lib/evals/promisedActions.test.ts
```

Test files in `src/lib/evals/`:
- `classify.test.ts` - Automated email detection (26 tests)
- `promisedActions.test.ts` - Promise detection fallback (21 tests)
- `policyGate.test.ts` - Safety rules (19 tests)
- `stateMachine.test.ts` - Thread state transitions (27 tests)
- `clarificationLoop.test.ts` - Loop detection (43 tests)
- `triage.test.ts` - Policy gate + macros (6 tests)
- `requiredInfo.test.ts` - Missing info prompts (6 tests)
- And more...

## Deployment

Deployed via Vercel with automatic deploys from main branch.

**Cron jobs** (configured in `vercel.json`):
- `/api/agent/poll` - Daily at 8am UTC (fallback polling)
- `/api/gmail/renew-watch` - Every 6 days (keep Gmail push active)

**Gmail Push Notifications**: Real-time email processing via Google Cloud Pub/Sub. Requires `GMAIL_PUBSUB_TOPIC` env var.

To trigger manual poll:
```bash
curl -X POST "https://support-agent-v2.vercel.app/api/agent/poll?force=true"

# Fetch last N days:
curl -X POST "https://support-agent-v2.vercel.app/api/agent/poll?force=true&fetchRecent=true&fetchDays=3"
```

To seed vendors (one-time setup):
```bash
npx tsx scripts/seed-vendors.ts
```

## Quick Reference

| What | Where |
|------|-------|
| Login page | `/login` |
| Inbox UI | `/admin` |
| Thread detail | `/admin/thread/[id]` |
| Orders | `/admin/orders` |
| Order detail | `/admin/orders/[id]` |
| Vendors | `/admin/vendors` |
| Learning proposals | `/admin/learning` |
| KB management | `/admin/kb` |
| Agent instructions | `/admin/instructions` |
| Gmail setup | `/admin/gmail-setup` |
| Main processing | `src/lib/ingest/processRequest.ts` |
| LLM classification | `src/lib/intents/llmClassify.ts` |
| Vehicle detection | `src/lib/catalog/vehicleDetector.ts` |
| Promise detection | `src/lib/responders/promisedActions.ts` |
| Policy gate | `src/lib/responders/policyGate.ts` |
| Gmail monitor | `src/lib/gmail/monitor.ts` |
| Draft generator | `src/lib/llm/draftGenerator.ts` |
| State machine | `src/lib/threads/stateMachine.ts` |
| Order processing | `src/lib/orders/processOrder.ts` |
| Vendor lookup | `src/lib/vendors/lookup.ts` |
| Vendor coordination | `src/lib/orders/vendorCoordination.ts` |
| Contextual emails | `src/lib/llm/contextualEmailGenerator.ts` |
| Stale handling | `src/lib/threads/staleHumanHandling.ts` |
| Lina tools | `src/lib/llm/linaTools.ts` |
| Lina tool executor | `src/lib/llm/linaToolExecutor.ts` |
| Unified context | `src/lib/context/builder.ts` |
| Pending actions | `src/lib/context/pendingActions.ts` |
| Catalog doc ingestion | `scripts/ingest-catalog-docs-vision.ts` |
