# Lina on Instagram - Integration Plan

> Saved: Jan 2026 | Status: Planning

## Overview

Extend Lina from a support agent to a social media presence that can:
- **Monitor & respond** to comments on posts
- **Handle DMs** from customers and fans
- **Schedule & publish** content (posts, reels, stories)
- **Track engagement** and surface insights

This enables slightly-off-brand marketing, thought leadership, and community engagement through Lina's personality.

---

## Setup Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Instagram Business/Creator account | Needed | Lina's @handle |
| Facebook Page | Needed | Required for API access |
| Meta Developer App | Needed | Create at developers.facebook.com |
| Business Verification | Needed | For advanced permissions |
| App Review | Needed | 1-2 weeks for approval |

### Permissions Needed

| Permission | Description | Access Level |
|------------|-------------|--------------|
| `instagram_basic` | Read profile/media | Standard |
| `instagram_manage_comments` | Reply to comments | **Advanced** |
| `instagram_manage_messages` | Handle DMs | **Advanced** |
| `instagram_content_publish` | Post content | **Advanced** |
| `pages_manage_metadata` | Webhooks | Advanced |

**Note:** Advanced permissions require Meta App Review approval (1-2 weeks).

---

## API Capabilities & Limitations

### What We CAN Do

| Feature | Support |
|---------|---------|
| Read comments on posts | ✅ Full |
| Reply to comments | ✅ Full |
| Delete/hide comments | ✅ Full |
| Publish images, carousels, videos | ✅ Full |
| Publish Reels (up to 90 seconds) | ✅ Full |
| Publish Stories | ✅ Full |
| Read DMs (user-initiated) | ✅ Full |
| Reply to DMs (within 24h window) | ✅ Full |
| Webhook notifications | ✅ Full |
| Analytics/insights | ✅ Full (1000+ followers) |

### Limitations

| Limitation | Details |
|------------|---------|
| 24-hour messaging window | Can only reply within 24h of user's last message |
| No cold DMs | Cannot initiate conversations (no influencer outreach via DM) |
| Rate limits | 200 API calls/hour, 200 DMs/hour, 25 posts/day |
| Personal accounts | Not supported (Business/Creator only) |
| Reel length via API | 90 seconds max |

---

## Feature Breakdown

### 1. Comment Monitoring & Response

Similar to Gmail monitoring - webhook for new comments, classify, respond.

```
New Comment → Webhook → Classify Intent → Generate Response → Approval Queue → Post Reply
```

**Key points:**
- Use webhooks for real-time notifications (no polling needed)
- Same LLM classification pipeline as emails
- Draft approval before posting (like email drafts)
- Can hide/delete toxic comments
- Auto-reply option for simple cases (thanks, questions answered in bio, etc.)

### 2. DM Handling

Handle customer inquiries that come via DM.

```
Incoming DM → Webhook → Create Thread → Classify → Generate Draft → Approval → Send Reply
```

**Key constraints:**
- **24-hour window** - Must reply within 24h of customer's last message
- **7-day window** - Extended with `human_agent` tag for complex issues
- **No cold outreach** - Can't initiate DMs to influencers

### 3. Content Publishing

Schedule and publish posts, reels, stories.

```
Content Queue → Scheduled Time → Upload Media → Create Container → Publish
```

**Capabilities:**
- Images, carousels (up to 10), videos, reels (up to 90s), stories
- Max 25 posts per 24 hours
- Scheduling via our own queue system

**Content sources:**
- Human-created visuals uploaded to queue
- AI-generated images (DALL-E/Midjourney integration)
- Caption generation by Lina
- Hashtag suggestions

### 4. Analytics Dashboard

Surface engagement metrics for Lina's performance.

- Post performance (impressions, reach, saves, shares)
- Comment sentiment analysis
- Response time tracking
- Follower growth
- Best posting times

---

## Proposed Architecture

### Directory Structure

```
src/lib/instagram/
├── auth.ts              # OAuth flow, token refresh
├── client.ts            # Instagram Graph API client
├── webhooks.ts          # Handle incoming webhooks
├── comments/
│   ├── monitor.ts       # Process incoming comments
│   └── respond.ts       # Post comment replies
├── messages/
│   ├── ingest.ts        # Process incoming DMs
│   └── send.ts          # Send DM replies
├── publishing/
│   ├── scheduler.ts     # Content queue management
│   ├── upload.ts        # Media upload handling
│   └── publish.ts       # Container creation + publishing
└── insights/
    └── analytics.ts     # Fetch and store metrics
```

### Database Schema

```sql
-- Instagram account connection
CREATE TABLE instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  access_token TEXT NOT NULL,  -- Should be encrypted
  token_expires_at TIMESTAMPTZ,
  facebook_page_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Comment threads (similar to email threads)
CREATE TABLE instagram_comment_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id TEXT NOT NULL,
  media_url TEXT,
  caption TEXT,
  comment_id TEXT NOT NULL UNIQUE,
  commenter_username TEXT,
  commenter_id TEXT,
  comment_text TEXT,
  our_reply TEXT,
  our_reply_id TEXT,
  status TEXT DEFAULT 'new', -- new, draft_ready, replied, ignored
  classification JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- DM conversations
CREATE TABLE instagram_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL UNIQUE,
  participant_id TEXT NOT NULL,
  participant_username TEXT,
  last_message_at TIMESTAMPTZ,
  window_expires_at TIMESTAMPTZ, -- 24h window tracking
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- DM messages
CREATE TABLE instagram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES instagram_conversations(id),
  ig_message_id TEXT UNIQUE,
  direction TEXT NOT NULL, -- inbound, outbound, draft
  message_text TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scheduled content
CREATE TABLE instagram_content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL, -- image, carousel, reel, story
  media_urls TEXT[] NOT NULL,
  caption TEXT,
  hashtags TEXT[],
  scheduled_for TIMESTAMPTZ,
  status TEXT DEFAULT 'draft', -- draft, scheduled, publishing, published, failed
  ig_media_id TEXT,
  published_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Engagement analytics
CREATE TABLE instagram_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id TEXT,
  metric_date DATE NOT NULL,
  impressions INT,
  reach INT,
  saves INT,
  shares INT,
  comments INT,
  likes INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### API Routes

```
/api/instagram/
├── auth/
│   ├── connect        # Start OAuth flow
│   └── callback       # OAuth callback
├── webhooks/
│   └── instagram      # Receive Meta webhooks (POST)
├── comments/
│   ├── GET            # List pending comments
│   ├── [id]/reply     # Approve and post reply
│   └── [id]/ignore    # Mark as ignored
├── messages/
│   ├── GET            # List DM conversations
│   ├── [id]           # Get conversation messages
│   └── [id]/reply     # Send reply
└── content/
    ├── GET            # List scheduled content
    ├── POST           # Create new content
    ├── [id]/publish   # Publish immediately
    └── [id]/schedule  # Update schedule
```

### Admin UI Pages

```
/admin/instagram/
├── page.tsx           # Dashboard overview
├── comments/
│   └── page.tsx       # Comment queue (like email inbox)
├── messages/
│   └── page.tsx       # DM inbox
├── content/
│   ├── page.tsx       # Content calendar view
│   └── new/page.tsx   # Create new post
└── settings/
    └── page.tsx       # Account connection, preferences
```

---

## Rate Limits & Handling

| Limit | Value | Strategy |
|-------|-------|----------|
| API calls | 200/hour | Cache aggressively, batch requests |
| DMs | 200/hour | Queue with rate limiting |
| Posts | 25/day | Queue with daily limit check |
| Comment replies | Part of 200/hour | Prioritize, queue overflow |

**Optimization strategies:**
- Cache frequently accessed data (70% reduction)
- Use field selection to minimize response size (20% reduction)
- Batch operations where possible (30% reduction)

---

## Influencer Outreach Workarounds

Since we can't initiate DMs via API:

1. **Email first** - Use existing email infrastructure for initial outreach, continue in DM if they respond there
2. **Comment engagement** - Lina comments thoughtfully on their posts (carefully, not spammy)
3. **Mention/tag** - Mention them in stories/posts to get their attention
4. **Manual kickoff** - Rob manually sends first DM, Lina takes over the conversation
5. **Collaborate feature** - Use Instagram's native collab requests

---

## Implementation Phases

### Phase 1: Foundation (1-2 weeks)
- [ ] Create Meta Developer App
- [ ] Instagram OAuth connection flow
- [ ] Webhook endpoint setup
- [ ] Database schema migration
- [ ] Basic admin UI for connection status
- [ ] Token refresh mechanism

### Phase 2: Comment Management (1-2 weeks)
- [ ] Comment webhook processing
- [ ] Intent classification (reuse existing LLM pipeline)
- [ ] Draft generation for replies
- [ ] Approval queue UI (similar to email inbox)
- [ ] Post reply functionality
- [ ] Auto-reply rules for simple cases
- [ ] Hide/delete toxic comments

### Phase 3: DM Handling (1 week)
- [ ] DM webhook processing
- [ ] Conversation threading
- [ ] 24-hour window tracking + alerts
- [ ] Reply functionality
- [ ] Conversation UI

### Phase 4: Content Publishing (1-2 weeks)
- [ ] Media upload handling (images, videos)
- [ ] Content queue management
- [ ] Scheduling system with calendar UI
- [ ] Caption generation with Lina's voice
- [ ] Hashtag suggestions
- [ ] Publishing flow (container → publish)
- [ ] Reel/Story support

### Phase 5: Analytics & Polish (1 week)
- [ ] Insights fetching and storage
- [ ] Dashboard metrics display
- [ ] Performance optimization
- [ ] Error handling and retry logic
- [ ] Notification system for urgent items

---

## MVP Recommendation

Start with **Phase 1 + 2** (OAuth + Comments) as MVP. This gives Lina a presence that:
- Responds to community engagement
- Shows personality through comment replies
- Builds audience organically before needing content publishing
- Lower risk (comments are less prominent than posts)

---

## Dependencies

### NPM Packages
```json
{
  "instagram-graph-api": "^x.x.x"  // Or instagram-graph-sdk
}
```

### Environment Variables
```
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=
```

---

## Open Questions

1. **Lina's Instagram handle** - What's the @username?
2. **Content strategy** - What type of content? Product tips, behind-scenes, memes, thought leadership?
3. **Tone calibration** - How "off-brand" can Lina be? Humor level?
4. **Approval workflow** - Auto-approve simple replies or always require review?
5. **Response time SLA** - How quickly should Lina respond to comments/DMs?

---

## Resources

- [Instagram Graph API Documentation](https://developers.facebook.com/docs/instagram-api/)
- [Instagram Messaging API](https://developers.facebook.com/docs/messenger-platform/instagram/)
- [Meta App Review Guide](https://developers.facebook.com/docs/app-review/)
- [instagram-graph-api npm](https://www.npmjs.com/package/instagram-graph-api)
