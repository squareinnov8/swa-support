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
npm run test:run     # Run tests once (185 tests)

# Database
npx supabase db push --linked    # Push migrations to production

# Data scripts
npm run seed:kb      # Seed knowledge base
npm run embed:kb     # Generate embeddings for KB docs
npm run sync:catalog # Sync Shopify product catalog
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
│   │   ├── learning/       # Learning proposals review UI
│   │   ├── kb/             # Knowledge base management
│   │   ├── instructions/   # Agent instruction editor
│   │   └── gmail-setup/    # Gmail OAuth setup
│   └── api/
│       ├── agent/poll/     # Gmail polling endpoint (cron)
│       ├── admin/          # Admin APIs (settings, KB, chat, learning)
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
│   │   ├── linaTools.ts    # Admin chat tools (KB, instructions, relay)
│   │   └── linaToolExecutor.ts # Tool execution logic
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
│   │   └── clarificationLoopDetector.ts # Detect repeated questions
│   └── responders/         # Policy gate, macros, promise detection
│       ├── policyGate.ts   # Safety rules (deterministic)
│       ├── promisedActions.ts # LLM-based promise detection
│       └── macros.ts       # Pre-approved response templates
├── scripts/
│   ├── ingest-youtube-comments-api.ts # YouTube Q&A extraction
│   └── test-classify.ts    # Test LLM classification
└── supabase/
    └── migrations/         # Database migrations (001-028)
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
- `threads` - Support conversations (with archive support)
- `messages` - Individual messages
- `events` - Audit log of all actions
- `intents` - Dynamic intent definitions
- `thread_intents` - Classified intents per thread
- `kb_docs` / `kb_chunks` - Knowledge base with embeddings
- `agent_instructions` - Dynamic Lina behavior rules
- `gmail_sync_state` - OAuth tokens and sync state
- `customers` / `orders` - Synced from Shopify
- `products` / `product_fitment` - Product catalog with vehicle compatibility
- `learning_proposals` - AI-generated KB/instruction proposals
- `resolution_analyses` - Learning extraction from resolved threads
- `lina_tool_actions` - Audit log of Lina's tool actions from admin chat
- `orders` - Order records from Shopify notifications
- `order_vendors` - Per-vendor fulfillment tracking for multi-vendor orders
- `order_events` - Order activity audit log
- `blacklisted_customers` - Customers blocked from fulfillment
- `vendors` - Vendor contact info cached from Google Sheet

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
  - Vendor routing via Google Sheet mapping
  - Email forwarding to vendors via Gmail API
  - Separate `/admin/orders` view with status tracking
  - Support for multi-vendor orders (split forwarding)

### Pending / Outstanding
- [ ] **Gmail re-authentication required** - After inbox purge, need to re-auth at `/admin/gmail-setup`
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
1. `create_kb_article` - Create new KB articles
2. `update_instruction` - Update agent behavior rules
3. `draft_relay_response` - Draft response to relay Rob's answers
4. `note_feedback` - Acknowledge feedback without changes

**Audit Trail:** All actions logged to `lina_tool_actions` table.

## YouTube Q&A Knowledge Base

Customer questions from YouTube comments are extracted and embedded into the KB.

**Ingestion script:** `scripts/ingest-youtube-comments-api.ts`

```bash
YOUTUBE_API_KEY=xxx npx tsx scripts/ingest-youtube-comments-api.ts
```

**Stats:** 629 Q&A pairs from 14 videos, 1324 embedded chunks

## Testing

```bash
npm run test              # Watch mode
npm run test:run          # Single run (185 tests)

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

**Cron job**: `/api/agent/poll` runs daily at 8am UTC (configured in `vercel.json`)

To trigger manual poll:
```bash
curl -X POST "https://support-agent-v2.vercel.app/api/agent/poll?force=true"

# Fetch last N days:
curl -X POST "https://support-agent-v2.vercel.app/api/agent/poll?force=true&fetchRecent=true&fetchDays=3"
```

## Quick Reference

| What | Where |
|------|-------|
| Login page | `/login` |
| Inbox UI | `/admin` |
| Thread detail | `/admin/thread/[id]` |
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
| Lina tools | `src/lib/llm/linaTools.ts` |
