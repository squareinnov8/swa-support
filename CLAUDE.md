# CLAUDE.md - Support Agent v2 (Lina)

This file provides guidance to Claude Code when working with this codebase.

## Project Overview

**Lina** is an AI-powered customer support agent for SquareWheels Auto, a hardware company selling automotive tuning products (APEX, etc.). The system monitors Gmail for support emails, classifies intents, retrieves relevant KB articles, and generates draft responses for human review.

**Production URL**: https://support-agent-v2.vercel.app/
**Owner**: Rob (rob@squarewheelsauto.com) - handles escalations and feedback

## Common Commands

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest tests
npm run test:run     # Run tests once

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
- **LLM**: OpenAI GPT-4o-mini (chat) + Anthropic Claude (drafts)
- **Embeddings**: OpenAI text-embedding-3-small
- **Deployment**: Vercel
- **Integrations**: Gmail API, Shopify Admin API, HubSpot CRM

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
│   │   ├── taxonomy.ts     # Intent definitions
│   │   └── classify.ts     # Classification logic
│   ├── llm/                # LLM integration
│   │   ├── client.ts       # Anthropic client
│   │   ├── prompts.ts      # System/user prompts
│   │   ├── draftGenerator.ts   # Draft generation
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
│   │   └── archiveThread.ts # Archive/unarchive logic
│   └── responders/         # Policy gate, macros
└── supabase/
    └── migrations/         # Database migrations (001-027)
```

### Key Data Flow

1. **Gmail Poll** (`/api/agent/poll`) → `runGmailMonitor()`
2. **Ingest** → `processIngestRequest()` in `lib/ingest/processRequest.ts`
3. **Classify** → `classifyIntent()` determines intent
4. **Verify** → `verifyCustomer()` for protected intents (orders)
5. **Retrieve** → `hybridSearch()` finds relevant KB docs
6. **Generate** → `generateDraft()` creates response with Claude
7. **Gate** → `policyGate()` checks for banned language
8. **State** → `getNextState()` transitions thread state

### Thread States
- `NEW` → `AWAITING_INFO` → `IN_PROGRESS` → `RESOLVED`
- `ESCALATED` - requires human intervention
- `HUMAN_HANDLING` - agent is observing, human is responding

### Key Database Tables
- `threads` - Support conversations (with archive support)
- `messages` - Individual messages
- `events` - Audit log of all actions
- `kb_docs` / `kb_chunks` - Knowledge base with embeddings
- `agent_instructions` - Dynamic Lina behavior rules
- `gmail_sync_state` - OAuth tokens and sync state
- `customers` / `orders` - Synced from Shopify
- `learning_proposals` - AI-generated KB/instruction proposals
- `resolution_analyses` - Learning extraction from resolved threads
- `lina_tool_actions` - Audit log of Lina's tool actions from admin chat

## Environment Variables

Required in `.env` (and Vercel):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=              # For embeddings
GOOGLE_CLIENT_ID=            # Gmail OAuth + Admin Auth
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=         # Gmail: /api/admin/import/gmail/auth
GOOGLE_ADMIN_REDIRECT_URI=   # Admin: /api/auth/callback
ADMIN_SESSION_SECRET=        # JWT signing (or uses SUPABASE_SERVICE_ROLE_KEY)
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ACCESS_TOKEN=
```

## Recent Changes (Jan 2026)

### Completed
- [x] Gmail monitoring with OAuth and polling
- [x] Intent classification (17 intents)
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
- [x] **Auto-send feature** - Automatic draft sending based on confidence threshold (see `agent_settings`)
- [x] **Message sync fix** - Fixed race condition where synced messages were incorrectly marked as "already processed"
- [x] **Duplicate message fix** - Thread refresh endpoint no longer calls `processIngestRequest()`, preventing duplicate messages on page load
- [x] **Customer thread history** - Previous tickets query now correctly finds all customer threads regardless of recency
- [x] **Dynamic Learning via Admin Chat** - Lina can now take real actions during chat (create KB articles, update instructions, draft relay responses)

### Pending / Outstanding
- [ ] **Gmail re-authentication required** - After inbox purge, need to re-auth at `/admin/gmail-setup`
- [x] Auto-send approved drafts via Gmail (manual: `/api/admin/send-draft`, automatic: in monitor)
- [x] Email response threading (reply-to headers in `sendDraft.ts`)
- [ ] Rate limiting on API endpoints
- [x] Gmail Push Notifications - Real-time email notifications via Pub/Sub (see `docs/gmail-push-setup.md`)

## Tech Debt & Known Issues

### High Priority
1. **Gmail OAuth token in database** - Should be encrypted at rest
2. **Hardcoded support email** - `support@squarewheelsauto.com` is hardcoded in several places

### Medium Priority
3. **Lint warnings** - Several unused `err` variables and React hook dependency warnings
4. **Date.now() in render** - `src/app/admin/page.tsx:42` calls impure function during render
5. **Unescaped entities** - `src/app/admin/gmail-setup/page.tsx:183` has unescaped apostrophe

### Low Priority
6. **Test coverage** - Evals exist but not comprehensive
7. **Error boundaries** - No React error boundaries in admin UI
8. **Mobile responsiveness** - Admin UI not optimized for mobile

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

## Auto-Send Feature

Lina can automatically send drafts without human approval when conditions are met.

**Settings** (in `agent_settings` table):
- `auto_send_enabled` - Master toggle (default: false)
- `auto_send_confidence_threshold` - Minimum confidence to auto-send (default: 0.85)
- `require_verification_for_send` - Require customer verification (default: true)

**Auto-send eligibility criteria:**
1. Auto-send must be enabled in settings
2. Gmail must be configured for sending
3. Confidence must meet or exceed threshold
4. Action must NOT be escalation (`ESCALATE` or `ESCALATE_WITH_DRAFT`)
5. Action must NOT be `NO_REPLY`
6. If verification required, customer must be verified for protected intents

**Never auto-sent:**
- Escalated tickets (requires human review)
- Low-confidence drafts
- Chargebacks or flagged customers

## Dynamic Learning via Admin Chat

Lina can now take real actions during admin chat sessions, making her a truly dynamic learning system.

**Available Tools:**
1. `create_kb_article` - Create new KB articles from information Rob shares
2. `update_instruction` - Update agent behavior rules and instructions
3. `draft_relay_response` - Draft a response to relay Rob's answers to customers
4. `note_feedback` - Acknowledge feedback without permanent changes

**Key Files:**
- `src/lib/llm/linaTools.ts` - Tool definitions (OpenAI function calling format)
- `src/lib/llm/linaToolExecutor.ts` - Tool execution logic
- `supabase/migrations/028_lina_tool_actions.sql` - Audit log table

**Usage Examples:**

When Rob shares product info:
> "The APEX Pro is compatible with 2015+ Q50 navigation systems"
>
> Lina creates a KB article and responds: "I've created a KB article about APEX Pro compatibility with Q50 navigation. I'll use this info for future customer questions."

When Rob provides an escalation answer:
> "Tell the customer we can do a one-time exception for the return"
>
> Lina drafts a relay response: "Great news! I just heard back from Rob and he approved a one-time exception for your return..."

**Relay Response Templates:**
Messages relayed from Rob/team use natural framing like:
- "Great news! I just heard back from Rob and..."
- "Quick update - Rob confirmed that..."
- "The engineering team reviewed this and..."

**Audit Trail:**
All tool actions are logged to `lina_tool_actions` table with:
- Thread ID and conversation ID
- Tool name and input parameters
- Result (success/failure, resource URLs)
- Admin email and timestamp

## Testing

```bash
npm run test              # Watch mode
npm run test:run          # Single run

# Specific test files
npx vitest src/lib/evals/classify.test.ts
```

Test files are in `src/lib/evals/` covering:
- Intent classification
- Required info extraction
- Policy gate
- State machine transitions

## Deployment

Deployed via Vercel with automatic deploys from main branch.

**Cron job**: `/api/agent/poll` runs daily at 8am UTC (configured in `vercel.json`)

To trigger manual poll:
```bash
curl -X POST "https://support-agent-v2.vercel.app/api/agent/poll?force=true"

# Fetch last N days:
curl -X POST "https://support-agent-v2.vercel.app/api/agent/poll?force=true&fetchRecent=true&fetchDays=3"
```

## Database Migrations

Migrations are in `supabase/migrations/` numbered 001-028:
- 001-009: Core schema (threads, messages, KB, catalog)
- 010: Agent instructions
- 011-012: CRM integration
- 013-014: Gmail monitoring
- 015: Agent settings
- 016-017: Human collaboration
- 018: Admin-Lina chat persistence
- 019: Fix agent instructions (truthfulness, Lina signoff)
- 020: Thread summary field for CRM
- 021-026: Various enhancements
- 027: Resolve & archive with learning extraction
- 028: Lina tool actions audit log

To apply migrations:
```bash
npx supabase db push --linked
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
| Auth utilities | `src/lib/auth/index.ts` |
| Middleware | `src/middleware.ts` |
| Poll API | `POST /api/agent/poll` |
| Ingest API | `POST /api/ingest/email` |
| Archive API | `POST /api/admin/threads/[id]/archive` |
| Learning API | `GET /api/admin/learning/proposals` |
| Main processing | `src/lib/ingest/processRequest.ts` |
| Gmail monitor | `src/lib/gmail/monitor.ts` |
| Auto-send logic | `src/lib/gmail/sendDraft.ts` |
| Agent settings | `src/lib/settings/index.ts` |
| Intent taxonomy | `src/lib/intents/taxonomy.ts` |
| Prompts | `src/lib/llm/prompts.ts` |
| Lina tools | `src/lib/llm/linaTools.ts` |
| Tool executor | `src/lib/llm/linaToolExecutor.ts` |
| State machine | `src/lib/threads/stateMachine.ts` |
| Archive logic | `src/lib/threads/archiveThread.ts` |
| Resolution analyzer | `src/lib/learning/resolutionAnalyzer.ts` |
