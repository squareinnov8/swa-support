# LINA Documentation

Lina is an AI-powered customer support agent for SquareWheels Auto, handling support inquiries, order management, and vendor coordination with minimal human intervention.

**Production URL:** https://support-agent-v2.vercel.app/
**Admin Dashboard:** https://support-agent-v2.vercel.app/admin

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
   - [Gmail Integration](#gmail-integration)
   - [LLM Classification](#llm-classification)
   - [Knowledge Base](#knowledge-base)
   - [Draft Generation](#draft-generation)
   - [Auto-Send](#auto-send)
   - [Order Management](#order-management)
   - [Vendor Coordination](#vendor-coordination)
   - [Human Collaboration](#human-collaboration)
   - [Dynamic Instructions](#dynamic-instructions)
   - [Policy Gate](#policy-gate)
   - [Promise Tracking](#promise-tracking)
   - [Thread State Machine](#thread-state-machine)
   - [Vehicle Detection](#vehicle-detection)
3. [Integrations](#integrations)
   - [Shopify](#shopify-integration)
   - [HubSpot](#hubspot-integration)
   - [YouTube](#youtube-integration)
4. [Architecture](#architecture)
5. [Troubleshooting](#troubleshooting)

---

## Overview

Lina monitors the SquareWheels Auto support inbox in real-time, automatically classifying incoming emails, retrieving relevant knowledge base articles, and drafting responses for human review or automatic sending.

### Key Capabilities

- **Real-time email monitoring** via Gmail push notifications
- **Intent classification** using LLM (17 intent categories)
- **Knowledge retrieval** via hybrid vector + keyword search
- **Draft generation** powered by Claude
- **Automatic sending** for high-confidence responses
- **Order processing** with vendor routing
- **Bi-directional vendor coordination** for fulfillment

### Metrics (Placeholder)

| Metric | Value |
|--------|-------|
| Average response time | TBD |
| Auto-send rate | TBD |
| Escalation rate | TBD |
| Customer satisfaction | TBD |

---

## Features

### Gmail Integration

Real-time email monitoring with OAuth authentication and push notifications.

#### How It Works

1. **OAuth Connection** - Admin authorizes Gmail access via `/admin/gmail-setup`
2. **Watch Setup** - System registers for push notifications via Google Cloud Pub/Sub
3. **Real-time Processing** - Incoming emails trigger webhook at `/api/webhooks/gmail`
4. **Fallback Polling** - Daily cron job at 8am UTC ensures no emails are missed

#### Configuration

- **OAuth Scopes:** `gmail.readonly`, `gmail.send`, `gmail.modify`
- **Push Topic:** Configured via `GMAIL_PUBSUB_TOPIC` environment variable
- **Watch Renewal:** Every 6 days via `/api/gmail/renew-watch` cron

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/gmail/monitor.ts` | Polling and message sync |
| `src/lib/gmail/watch.ts` | Push notification management |
| `src/lib/gmail/sendDraft.ts` | Send approved drafts |
| `src/app/api/webhooks/gmail/route.ts` | Webhook handler |

#### Data Flow

```
Gmail → Pub/Sub → Webhook → processIngestRequest() → Thread Created
```

---

### LLM Classification

AI-powered intent classification supporting 17 intent categories with missing information detection.

#### How It Works

1. **Pre-filter** - `checkAutomatedEmail()` filters platform notifications before LLM
2. **Classification** - `classifyWithLLM()` analyzes message content
3. **Missing Info** - LLM identifies what additional information is needed
4. **Verification Check** - Determines if customer identity verification required

#### Intent Categories

**Order Intents:**
- `ORDER_STATUS` - Order tracking and status inquiries
- `ORDER_CHANGE_REQUEST` - Modifications to existing orders
- `RETURN_REFUND_REQUEST` - Return and refund requests
- `MISSING_DAMAGED_ITEM` - Missing or damaged shipments
- `WRONG_ITEM_RECEIVED` - Incorrect items shipped

**Product Intents:**
- `PRODUCT_SUPPORT` - Product usage questions
- `COMPATIBILITY_QUESTION` - Vehicle/product compatibility
- `PART_IDENTIFICATION` - Identifying parts or connectors
- `FUNCTIONALITY_BUG` - Product defects or bugs

**Firmware Intents:**
- `FIRMWARE_UPDATE_REQUEST` - Firmware update assistance
- `FIRMWARE_ACCESS_ISSUE` - Portal/download access issues

**Documentation Intents:**
- `DOCS_VIDEO_MISMATCH` - Documentation discrepancies
- `INSTALL_GUIDANCE` - Installation help

**Escalation Intents:**
- `CHARGEBACK_THREAT` - Chargeback or legal threats
- `LEGAL_SAFETY_RISK` - Safety concerns

**Low Priority:**
- `FOLLOW_UP_NO_NEW_INFO` - Follow-ups without new information
- `THANK_YOU_CLOSE` - Thank you messages
- `VENDOR_SPAM` - Vendor solicitations

#### Classification Response

```typescript
interface ClassificationResult {
  intents: Array<{
    slug: string;
    confidence: number;
    reasoning: string;
  }>;
  primary_intent: string;
  requires_verification: boolean;
  auto_escalate: boolean;
  missing_info: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
  can_proceed: boolean;
}
```

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/intents/llmClassify.ts` | LLM-based classification |
| `src/lib/intents/taxonomy.ts` | Intent definitions |
| `src/lib/intents/classify.ts` | Automated email detection |

---

### Knowledge Base

Hybrid search combining vector embeddings and keyword matching for accurate retrieval.

#### How It Works

1. **Document Storage** - KB articles stored in `kb_docs` table
2. **Chunking** - Long documents split into chunks for better retrieval
3. **Embedding** - OpenAI `text-embedding-3-small` generates vectors
4. **Search** - Hybrid query combines cosine similarity with keyword ranking

#### Content Sources

- **Manual Articles** - Created via admin UI
- **YouTube Q&A** - Extracted from video comments (629 Q&A pairs)
- **Installation Guides** - Extracted from PDFs via GPT-4o Vision (42 guides)
- **Product Catalog** - Synced from Shopify

#### Search Process

```
Query → Embed → Vector Search ∪ Keyword Search → Re-rank → Top K Results
```

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/kb/documents.ts` | CRUD operations |
| `src/lib/kb/embedDocs.ts` | Embedding generation |
| `src/lib/retrieval/index.ts` | Hybrid search |

#### Admin UI

- **Browse:** `/admin/kb`
- **Import:** `/admin/kb/import`
- **Sources:** Gmail, Notion, Website, YouTube

---

### Draft Generation

Claude-powered response generation with context from KB, order history, and conversation thread.

#### How It Works

1. **Context Assembly** - Gather KB results, customer info, order history
2. **Instruction Loading** - Fetch dynamic instructions from database
3. **Prompt Building** - Construct prompt with all context
4. **Generation** - Claude generates draft response
5. **Post-processing** - Policy gate checks + promise detection

#### Context Sources

| Source | Purpose |
|--------|---------|
| KB Articles | Product knowledge, troubleshooting |
| Customer Info | Verified identity, order history |
| Thread History | Conversation context |
| Instructions | Agent behavior rules |
| Products | Compatible items for vehicle |

#### Generation Settings

- **Model:** Claude (Anthropic)
- **Temperature:** 0.7 (balanced creativity/consistency)
- **Max Tokens:** 1024

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/llm/draftGenerator.ts` | Main draft generation |
| `src/lib/llm/prompts.ts` | System prompts |
| `src/lib/llm/contextualEmailGenerator.ts` | Specialized emails |

---

### Auto-Send

Automatic draft sending based on confidence thresholds and verification status.

#### How It Works

1. **Threshold Check** - Compare confidence against intent-specific threshold
2. **Verification Check** - Ensure customer verified for order-related intents
3. **Policy Gate** - Confirm no banned content
4. **Send Decision** - Auto-send if all checks pass

#### Confidence Thresholds

| Intent Type | Threshold | Verification |
|-------------|-----------|--------------|
| Order-related | 0.85+ | Required |
| Product questions | 0.60+ | Not required |
| Greetings/Unknown | 0.40+ | Not required |
| Escalations | Never | N/A |

#### Settings

```typescript
{
  auto_send_enabled: boolean;      // Master toggle
  auto_send_confidence_threshold: number;  // Base threshold (0.85)
  require_verification_for_send: boolean;  // Verify for orders
}
```

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/ingest/processRequest.ts` | Auto-send logic |
| `src/app/api/admin/settings/route.ts` | Settings API |

---

### Order Management

Automated order processing from Shopify notifications with vendor routing.

#### How It Works

1. **Detection** - Identify Shopify order confirmation emails
2. **Parsing** - Extract order details (customer, shipping, products)
3. **Blacklist Check** - Verify customer not blacklisted
4. **High-Value Check** - Flag orders > $3,000 for review
5. **Vendor Matching** - Match products to vendors via patterns
6. **Forwarding** - Send order to vendor(s) via Gmail API

#### Order Statuses

| Status | Description |
|--------|-------------|
| `new` | Just received |
| `pending_review` | Flagged for manual review |
| `processing` | Forwarded to vendor(s) |
| `fulfilled` | Vendor confirmed |
| `shipped` | Tracking number received |
| `delivered` | Delivered to customer |

#### Multi-Vendor Support

Orders with products from multiple vendors are split and forwarded separately to each vendor.

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/orders/processOrder.ts` | Main processing pipeline |
| `src/lib/orders/ingest.ts` | Order email parsing |
| `src/lib/vendors/lookup.ts` | Vendor matching |

#### Admin UI

- **Order List:** `/admin/orders`
- **Order Detail:** `/admin/orders/[id]`
- **Vendor Management:** `/admin/vendors`

---

### Vendor Coordination

Bi-directional communication between vendors and customers for order fulfillment.

#### How It Works

1. **Vendor Reply Detection** - Monitor for replies from vendor emails
2. **Request Parsing** - LLM extracts vendor requests from reply
3. **Customer Outreach** - Automatic email to customer
4. **Response Processing** - Validate customer response (photos, confirmations)
5. **Vendor Forwarding** - Send validated response to vendor

#### Request Types

| Type | Description |
|------|-------------|
| `dashboard_photo` | Photo of vehicle dashboard |
| `color_confirmation` | Color/finish selection |
| `memory_confirmation` | Memory/storage selection |
| `address_validation` | Shipping address confirmation |
| `vehicle_confirmation` | Vehicle details verification |

#### Photo Validation

Dashboard photos validated via GPT-4o Vision to ensure:
- Dashboard/interior is visible
- VIN or identifying features present
- Image quality sufficient

#### Request Lifecycle

```
pending → received → validated → forwarded
```

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/orders/vendorCoordination.ts` | Main coordination logic |
| `src/lib/llm/contextualEmailGenerator.ts` | Email generation |

---

### Human Collaboration

Observation mode enabling Lina to learn from human-handled tickets.

#### How It Works

1. **Observation Mode** - Admin takes over ticket, Lina observes
2. **Resolution Analysis** - When resolved, analyze human's approach
3. **Learning Proposals** - Generate KB/instruction suggestions
4. **Review & Apply** - Admin reviews and approves learnings

#### Modes

| Mode | Lina's Role |
|------|-------------|
| `AGENT_HANDLING` | Lina responds, human reviews |
| `HUMAN_HANDLING` | Human responds, Lina observes |

#### Learning Extraction

After resolution, system analyzes:
- What information was used
- What approach worked
- What could be added to KB/instructions

#### Stale Handling

Threads in HUMAN_HANDLING for 48+ hours automatically return to Lina with an apology to the customer.

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/collaboration/observationMode.ts` | Mode switching |
| `src/lib/collaboration/learningGenerator.ts` | Learning proposals |
| `src/lib/learning/resolutionAnalyzer.ts` | Resolution analysis |
| `src/lib/threads/staleHumanHandling.ts` | Timeout handling |

#### Admin UI

- **Learning Review:** `/admin/learning`

---

### Dynamic Instructions

Live behavior updates via admin chat without code changes.

#### How It Works

1. **Admin Chat** - Rob chats with Lina at `/admin/thread/[id]`
2. **Tool Actions** - Lina uses tools to make real changes
3. **Persistence** - Changes stored in database immediately
4. **Global Effect** - All subsequent responses use updated instructions

#### Available Tools

| Tool | Purpose |
|------|---------|
| `lookup_order` | Look up order from Shopify |
| `associate_thread_customer` | Link thread to customer |
| `return_thread_to_agent` | Return stuck thread to Lina |
| `create_kb_article` | Create new KB article |
| `update_instruction` | Update agent behavior |
| `draft_relay_response` | Draft response relaying Rob's answer |
| `note_feedback` | Acknowledge feedback |

#### Instruction Sections

| Section | Purpose |
|---------|---------|
| `persona` | Who Lina is |
| `truthfulness` | Honesty requirements |
| `core_rules` | Safety rules |
| `tone_style` | Voice and signoff |
| `escalation_context` | When to escalate |

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/llm/linaTools.ts` | Tool definitions |
| `src/lib/llm/linaToolExecutor.ts` | Tool execution |
| `src/lib/instructions/index.ts` | Instruction loading |

#### Admin UI

- **Instructions:** `/admin/instructions`

---

### Policy Gate

Deterministic safety rules ensuring drafts comply with company policy.

#### How It Works

1. **Content Scan** - Check draft against banned patterns
2. **Rule Matching** - Identify any policy violations
3. **Block/Warn** - Prevent send or flag for review

#### Banned Content

- Unauthorized discounts or refunds
- Legal or safety advice
- Competitor mentions
- Personal contact information
- Inappropriate language

#### Key Rules

- Never promise refunds without authorization
- Never guarantee shipping times
- Never provide legal advice
- Never share personal contact info
- Always cite KB sources for claims

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/responders/policyGate.ts` | Policy enforcement |

---

### Promise Tracking

LLM-based detection of commitments made in draft responses.

#### How It Works

1. **Draft Analysis** - After generation, analyze draft content
2. **Promise Detection** - LLM identifies any commitments
3. **Categorization** - Classify promise type
4. **Logging** - Store in events table for auditing

#### Promise Categories

| Category | Examples |
|----------|----------|
| `refund` | "We'll refund you" |
| `shipping` | "Ships within 3 days" |
| `replacement` | "We'll send a replacement" |
| `follow_up` | "I'll get back to you" |
| `confirmation` | "I'll confirm with the team" |
| `timeline` | "Ready by Friday" |

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/responders/promisedActions.ts` | Detection and logging |

---

### Thread State Machine

Status management and automatic state transitions.

#### Thread States

| State | Description |
|-------|-------------|
| `NEW` | New thread, not yet processed |
| `AWAITING_INFO` | Waiting for customer information |
| `IN_PROGRESS` | Being handled |
| `RESOLVED` | Issue resolved |
| `ESCALATED` | Requires human intervention |
| `HUMAN_HANDLING` | Human responding, Lina observing |

#### Transitions

```
NEW → AWAITING_INFO (missing info detected)
NEW → IN_PROGRESS (processing)
AWAITING_INFO → IN_PROGRESS (info received)
IN_PROGRESS → RESOLVED (issue resolved)
IN_PROGRESS → ESCALATED (needs human)
HUMAN_HANDLING → IN_PROGRESS (returned to agent)
```

#### Archive Support

Threads can be archived when resolved and unarchived if customer responds.

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/threads/stateMachine.ts` | State transitions |
| `src/lib/threads/archiveThread.ts` | Archive logic |

---

### Vehicle Detection

LLM-based extraction of year/make/model from natural language.

#### How It Works

1. **Text Analysis** - Scan message for vehicle mentions
2. **LLM Extraction** - Extract structured vehicle data
3. **Confidence Score** - Rate extraction confidence
4. **Product Lookup** - Find compatible products

#### Response Format

```typescript
interface VehicleInfo {
  year: number;
  make: string;
  model: string;
  trim?: string;
  confidence: number;
}
```

#### Examples

| Input | Extracted |
|-------|-----------|
| "I have a 2019 Q50 Red Sport" | { year: 2019, make: "Infiniti", model: "Q50", trim: "Red Sport" } |
| "my 2022 f150" | { year: 2022, make: "Ford", model: "F-150" } |
| "07 Silverado" | { year: 2007, make: "Chevrolet", model: "Silverado" } |

#### Integration

When vehicle detected with high confidence, draft generator automatically includes:
- Compatible products
- Installation guides
- Fitment notes

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/catalog/vehicleDetector.ts` | Vehicle extraction |
| `src/lib/catalog/lookup.ts` | Product fitment lookup |

---

## Integrations

### Shopify Integration

Syncs customer data, orders, and product catalog from Shopify.

#### Capabilities

- **Customer Verification** - Verify customer identity via order lookup
- **Order Details** - Access order history and tracking
- **Product Catalog** - Sync products with fitment data
- **Order Notifications** - Receive new order webhooks

#### Configuration

```
SHOPIFY_STORE_DOMAIN=squarewheelsauto.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
```

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/shopify/client.ts` | Shopify API client |
| `src/lib/verification/index.ts` | Customer verification |

---

### HubSpot Integration

Syncs thread data to HubSpot CRM for customer relationship management.

#### Capabilities

- **Contact Sync** - Create/update contacts from threads
- **Ticket Creation** - Create support tickets
- **Timeline Events** - Log thread activity
- **Property Mapping** - Custom properties for AI metrics

#### Data Synced

| Lina Data | HubSpot Property |
|-----------|------------------|
| Thread summary | Ticket description |
| Intent | Custom property |
| Confidence | Custom property |
| Response time | Timeline event |

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/hubspot/client.ts` | HubSpot API client |
| `src/lib/hubspot/sync.ts` | Data synchronization |

---

### YouTube Integration

Extracts Q&A pairs from YouTube video comments for knowledge base.

#### Capabilities

- **Comment Extraction** - Fetch comments via YouTube Data API
- **Q&A Parsing** - Identify question-answer pairs
- **KB Ingestion** - Add to knowledge base with embeddings

#### Statistics

- **Videos Processed:** 14
- **Q&A Pairs Extracted:** 629
- **KB Chunks Created:** 1,324

#### Ingestion Script

```bash
YOUTUBE_API_KEY=xxx npx tsx scripts/ingest-youtube-comments-api.ts
```

#### Key Files

| File | Purpose |
|------|---------|
| `scripts/ingest-youtube-comments-api.ts` | Comment extraction |

---

## Architecture

### Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 15 (App Router) |
| Database | Supabase (PostgreSQL + pgvector) |
| LLM (Classification) | OpenAI GPT-4o-mini |
| LLM (Generation) | Anthropic Claude |
| Embeddings | OpenAI text-embedding-3-small |
| Deployment | Vercel |

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Gmail     │────▶│   Webhook   │────▶│   Ingest    │
│   Inbox     │     │   Handler   │     │   Pipeline  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
               ┌────▼────┐              ┌──────▼──────┐            ┌──────▼──────┐
               │ Classify │              │   Verify    │            │  Retrieve   │
               │  Intent  │              │  Customer   │            │     KB      │
               └────┬────┘              └──────┬──────┘            └──────┬──────┘
                    │                          │                          │
                    └──────────────────────────┼──────────────────────────┘
                                               │
                                        ┌──────▼──────┐
                                        │   Generate  │
                                        │    Draft    │
                                        └──────┬──────┘
                                               │
                              ┌────────────────┼────────────────┐
                              │                │                │
                       ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
                       │   Policy    │  │   Promise   │  │    State    │
                       │    Gate     │  │   Tracker   │  │   Machine   │
                       └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                              │                │                │
                              └────────────────┼────────────────┘
                                               │
                                        ┌──────▼──────┐
                                        │  Auto-Send  │
                                        │  Decision   │
                                        └─────────────┘
```

### Database Schema

**Core Tables:**
- `threads` - Support conversations
- `messages` - Individual messages
- `events` - Audit log

**Knowledge:**
- `kb_docs` - Knowledge base articles
- `kb_chunks` - Embedded chunks
- `agent_instructions` - Behavior rules

**Orders:**
- `orders` - Order records
- `order_vendors` - Vendor tracking
- `vendors` - Vendor contacts
- `vendor_requests` - Coordination requests

**Learning:**
- `learning_proposals` - AI suggestions
- `resolution_analyses` - Thread analysis
- `lina_tool_actions` - Tool audit log

---

## Troubleshooting

### Gmail Not Syncing

1. Check OAuth tokens in `/admin/gmail-setup`
2. Verify watch is active: Check `gmail_sync_state` table
3. Check Vercel logs for webhook errors
4. Force manual poll: `curl -X POST .../api/agent/poll?force=true`

### Drafts Not Generating

1. Check intent classification in thread detail
2. Verify KB has relevant articles
3. Check Anthropic API key is valid
4. Review thread events for errors

### Orders Not Forwarding

1. Verify vendor patterns match products
2. Check vendor contact emails in `/admin/vendors`
3. Review order events for errors
4. Check Gmail send permissions

### High Escalation Rate

1. Review escalated threads for patterns
2. Update KB with missing information
3. Adjust intent thresholds if needed
4. Add instructions for common cases

### Auto-Send Not Working

1. Verify `auto_send_enabled` in settings
2. Check confidence thresholds
3. Verify customer verification for order intents
4. Review policy gate blocks

### Vendor Coordination Issues

1. Check `vendor_requests` table for stuck requests
2. Verify vendor email patterns
3. Review photo validation logs
4. Check customer outreach thread IDs

---

## Commands Reference

```bash
# Development
npm run dev          # Start dev server
npm run build        # Production build
npm run test:run     # Run tests

# Database
npx supabase db push --linked    # Push migrations

# Data Management
npm run seed:kb      # Seed knowledge base
npm run embed:kb     # Generate embeddings
npm run sync:catalog # Sync Shopify products

# Scripts
npx tsx scripts/seed-vendors.ts                    # Seed vendors
npx tsx scripts/ingest-youtube-comments-api.ts     # YouTube Q&A
npx tsx scripts/ingest-catalog-docs-vision.ts      # Install guides
```

---

## Quick Reference

| What | Where |
|------|-------|
| Login | `/login` |
| Inbox | `/admin` |
| Thread Detail | `/admin/thread/[id]` |
| Orders | `/admin/orders` |
| Vendors | `/admin/vendors` |
| Learning | `/admin/learning` |
| KB Management | `/admin/kb` |
| Instructions | `/admin/instructions` |
| Gmail Setup | `/admin/gmail-setup` |
